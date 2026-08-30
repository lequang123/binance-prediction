// ============================================================
// Diff Engine — Detect trades by comparing consecutive snapshots
// ============================================================

import type {
  BinancePosition,
  MarketSnapshot,
  SidePosition,
  DetectedTrade,
  StrategyTag,
} from './types';

/** In-memory store for previous snapshot (per marketId) */
const previousSnapshots = new Map<number, MarketSnapshot>();

/** In-memory store for all detected trades (current session) */
const detectedTrades: DetectedTrade[] = [];

/**
 * Normalize raw Binance positions into a MarketSnapshot.
 * Groups Up and Down positions for the same market.
 */
export function normalizeToSnapshot(
  positions: BinancePosition[],
  timestamp?: number
): MarketSnapshot | null {
  if (positions.length === 0) return null;

  const ts = timestamp || Math.floor(Date.now() / 1000);
  const first = positions[0];

  let up: SidePosition | null = null;
  let down: SidePosition | null = null;

  for (const pos of positions) {
    const side: SidePosition = {
      side: pos.outcomeName as 'Up' | 'Down',
      tokenId: pos.tokenId,
      shares: pos.shares,
      value: pos.value,
      avgPrice: pos.avgPrice,
      currentPrice: pos.currentPrice,
      pnl: pos.pnl,
      pnlPct: pos.pnlPct,
      toWin: pos.toWin,
      payoutMultiplier: pos.avgPrice > 0 ? 1 / pos.avgPrice : 0,
    };

    if (pos.outcomeIndex === 0) {
      up = side;
    } else {
      down = side;
    }
  }

  const upValue = up?.value ?? 0;
  const downValue = down?.value ?? 0;
  const upCost = up ? up.shares * up.avgPrice : 0;
  const downCost = down ? down.shares * down.avgPrice : 0;
  const totalInvested = upCost + downCost;
  const hedgeRatio = totalInvested > 0 ? upCost / totalInvested : 0.5;

  return {
    timestamp: ts,
    marketId: first.marketId,
    marketTitle: first.marketTitle,
    eventSlug: first.eventSlug,
    marketStatus: first.marketStatus,
    up,
    down,
    hedgeRatio,
    totalInvested,
    netPnl: (up?.pnl ?? 0) + (down?.pnl ?? 0),
  };
}

/**
 * Determine strategy tag based on trade context.
 */
function detectStrategy(
  side: 'Up' | 'Down',
  action: 'BUY' | 'SELL',
  fillPrice: number,
  currentSnapshot: MarketSnapshot,
  prevSnapshot: MarketSnapshot | undefined,
  prevHedgeRatio: number
): { tag: StrategyTag; note: string } {
  if (action === 'SELL') {
    return { tag: 'SELL', note: `Bán ${side} shares` };
  }

  // No previous snapshot — initial entry
  if (!prevSnapshot) {
    return { tag: 'INITIAL', note: 'Lệnh đầu tiên trong kỳ' };
  }

  const prevUp = prevSnapshot.up;
  const prevDown = prevSnapshot.down;
  const curUp = currentSnapshot.up;
  const curDown = currentSnapshot.down;

  // Check if this is the opposite side of the dominant position
  const upValue = curUp?.value ?? 0;
  const downValue = curDown?.value ?? 0;
  const dominantSide = upValue > downValue ? 'Up' : 'Down';
  const isBuyingMinoritySide = side !== dominantSide;

  // Check if odds changed significantly (>5%)
  const prevOdds =
    side === 'Up'
      ? (prevUp?.currentPrice ?? 0.5)
      : (prevDown?.currentPrice ?? 0.5);
  const curOdds =
    side === 'Up'
      ? (curUp?.currentPrice ?? 0.5)
      : (curDown?.currentPrice ?? 0.5);
  const oddsShift = Math.abs(curOdds - prevOdds);

  // Check hedge ratio change
  const hedgeRatioChange = Math.abs(currentSnapshot.hedgeRatio - prevHedgeRatio);

  // Contrarian: buying at low odds (< 0.35)
  if (curOdds < 0.35) {
    return {
      tag: 'CONTRARIAN',
      note: `Mua ${side} khi odds thấp (${(curOdds * 100).toFixed(0)}%) — payout cao ${(1 / fillPrice).toFixed(1)}x`,
    };
  }

  // Rebalance: hedge ratio moving toward 50/50
  if (
    hedgeRatioChange > 0.03 &&
    Math.abs(currentSnapshot.hedgeRatio - 0.5) <
      Math.abs(prevHedgeRatio - 0.5)
  ) {
    return {
      tag: 'REBALANCE',
      note: `Cân bằng lại: hedge ${(prevHedgeRatio * 100).toFixed(0)}/${((1 - prevHedgeRatio) * 100).toFixed(0)} → ${(currentSnapshot.hedgeRatio * 100).toFixed(0)}/${((1 - currentSnapshot.hedgeRatio) * 100).toFixed(0)}`,
    };
  }

  // Hedge: buying the minority side
  if (isBuyingMinoritySide) {
    return {
      tag: 'HEDGE',
      note: `Hedge bên ${side} (minority) — giảm rủi ro`,
    };
  }

  // Odds shift: entered right after odds changed >5%
  if (oddsShift > 0.05) {
    return {
      tag: 'ODDS_SHIFT',
      note: `Vào lệnh sau odds thay đổi ${(oddsShift * 100).toFixed(1)}%`,
    };
  }

  // Scale in: buying more on the same side at better price
  const prevAvg =
    side === 'Up'
      ? (prevUp?.avgPrice ?? 0)
      : (prevDown?.avgPrice ?? 0);
  if (fillPrice < prevAvg) {
    return {
      tag: 'SCALE_IN',
      note: `Trung bình giá xuống: fill ${fillPrice.toFixed(3)} < avg ${prevAvg.toFixed(3)}`,
    };
  }

  // Double down: buying more at worse price
  return {
    tag: 'DOUBLE_DOWN',
    note: `Tăng vị thế ${side} — fill ${fillPrice.toFixed(3)}`,
  };
}

/**
 * Core diff function: compare current snapshot with previous.
 * Returns detected trades (if any).
 */
export function diffSnapshots(
  current: MarketSnapshot,
  options?: { isRealTradeEnabled?: boolean }
): DetectedTrade[] {
  const prev = previousSnapshots.get(current.marketId);
  const trades: DetectedTrade[] = [];
  const prevHedgeRatio = prev?.hedgeRatio ?? 0.5;

  // Check each side for changes
  for (const side of ['Up', 'Down'] as const) {
    const curSide = side === 'Up' ? current.up : current.down;
    const prevSide = prev
      ? side === 'Up'
        ? prev.up
        : prev.down
      : null;

    if (!curSide) continue;

    const prevShares = prevSide?.shares ?? 0;
    const prevAvgPrice = prevSide?.avgPrice ?? 0;
    const sharesChange = curSide.shares - prevShares;

    // Threshold: ignore tiny floating point differences
    if (Math.abs(sharesChange) < 0.01) continue;

    // Cost basis diff: actual money spent/received
    const prevCost = prevShares * prevAvgPrice;
    const curCost = curSide.shares * curSide.avgPrice;
    const costChange = curCost - prevCost;

    const action: 'BUY' | 'SELL' = sharesChange > 0 ? 'BUY' : 'SELL';
    const absSharesChange = Math.abs(sharesChange);
    const absCostChange = Math.abs(costChange);
    const fillPrice =
      absSharesChange > 0 ? absCostChange / absSharesChange : 0;

    const { tag, note } = detectStrategy(
      side,
      action,
      fillPrice,
      current,
      prev,
      prevHedgeRatio
    );

    // Potential win if this side wins: each share pays $1
    const potentialWin = action === 'BUY'
      ? absSharesChange - absCostChange  // profit = payout - cost
      : 0;

    const upCostBasis = current.up ? current.up.shares * current.up.avgPrice : 0;
    const downCostBasis = current.down ? current.down.shares * current.down.avgPrice : 0;

    const trade: DetectedTrade = {
      timestamp: current.timestamp,
      marketId: current.marketId,
      marketTitle: current.marketTitle,
      side,
      tokenId: curSide.tokenId,
      action,
      sharesChange: absSharesChange,
      amountChange: absCostChange,
      fillPrice,
      marketOddsUp: current.up?.currentPrice ?? 0,
      marketOddsDown: current.down?.currentPrice ?? 0,
      payoutMultiplier: fillPrice > 0 ? 1 / fillPrice : 0,
      potentialWin,
      cumUp: current.up
        ? { shares: current.up.shares, value: current.up.value, pnl: current.up.pnl, costBasis: upCostBasis }
        : null,
      cumDown: current.down
        ? {
            shares: current.down.shares,
            value: current.down.value,
            pnl: current.down.pnl,
            costBasis: downCostBasis,
          }
        : null,
      hedgeRatio: current.hedgeRatio,
      totalInvested: current.totalInvested,
      netPnl: current.netPnl,
      strategyTag: tag,
      strategyNote: note,
      prevHedgeRatio,
    };

    trades.push(trade);
    detectedTrades.push(trade);

    // ==========================================
    // Thực hiện Copy Trade khi phát hiện BUY
    // ==========================================
    if (trade.action === 'BUY' && trade.tokenId) {
      // Đọc trạng thái config từ options
      let isRealTradeEnabled = options?.isRealTradeEnabled ?? false;

      let investAmount = trade.amountChange / 10;
      if (investAmount < 1) investAmount = 1;

      trade.copyTradeAmount = investAmount;
      trade.copyTradeMode = isRealTradeEnabled ? 'REAL_TRADE' : 'SIMULATOR';

      const amountInWei = (BigInt(Math.floor(investAmount * 1e6)) * BigInt("1000000000000")).toString();

      if (isRealTradeEnabled) {
        console.log(`[LIVE TRADE] 🚀 ĐANG VÀO LỆNH THẬT cho TokenID: ${trade.tokenId} với số tiền: $${investAmount.toFixed(2)} (${amountInWei} WEI)`);
        import('./trade-api').then(({ executeLiveTrade }) => {
          executeLiveTrade(trade.tokenId!, 'BUY', amountInWei, trade.fillPrice).catch(err => {
            console.error(`[LIVE TRADE ERROR] Cảnh báo, lệnh thật bị lỗi:`, err.message || err);
          });
        });
      } else {
        console.log(`[SIMULATOR] 🎯 Đã giả lập copy lệnh BUY cho TokenID: ${trade.tokenId} với số tiền dự kiến: $${investAmount.toFixed(2)} (Không tốn tiền thật)`);
      }
    }
  }



  // Save current as previous for next diff
  previousSnapshots.set(current.marketId, current);

  return trades;
}

/**
 * Get all detected trades in the current session.
 */
export function getAllTrades(): DetectedTrade[] {
  return [...detectedTrades];
}

/**
 * Get the previous snapshot for a given marketId.
 */
export function getPreviousSnapshot(
  marketId: number
): MarketSnapshot | undefined {
  return previousSnapshots.get(marketId);
}

/**
 * Clear session data (for testing or reset).
 */
export function clearSession(): void {
  previousSnapshots.clear();
  detectedTrades.length = 0;
}
