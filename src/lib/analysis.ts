// ============================================================
// Pattern Analysis — Derive insights from detected trades
// ============================================================

import type {
  DetectedTrade,
  HistoricalResult,
  GroupedHistoricalResult,
  BinancePosition,
  WinLossSummary,
} from './types';

/**
 * Analyze hedging pattern from a list of detected trades.
 */
export function analyzeHedging(trades: DetectedTrade[]) {
  if (trades.length === 0) {
    return {
      profile: 'NO_DATA',
      primaryBias: 'NEUTRAL' as const,
      avgHedgeRatio: 0.5,
      upTradeCount: 0,
      downTradeCount: 0,
      totalUpInvested: 0,
      totalDownInvested: 0,
      avgUpFillPrice: 0,
      avgDownFillPrice: 0,
      avgUpMarketOdds: 0,
      avgDownMarketOdds: 0,
      upEdge: 0,
      downEdge: 0,
      tradeFrequency: 0,
      strategyBreakdown: {} as Record<string, number>,
      entryPatterns: [] as string[],
    };
  }

  const buyTrades = trades.filter((t) => t.action === 'BUY');
  const upTrades = buyTrades.filter((t) => t.side === 'Up');
  const downTrades = buyTrades.filter((t) => t.side === 'Down');

  const totalUpInvested = upTrades.reduce((s, t) => s + t.amountChange, 0);
  const totalDownInvested = downTrades.reduce((s, t) => s + t.amountChange, 0);

  const avgUpFillPrice =
    upTrades.length > 0
      ? upTrades.reduce((s, t) => s + t.fillPrice, 0) / upTrades.length
      : 0;
  const avgDownFillPrice =
    downTrades.length > 0
      ? downTrades.reduce((s, t) => s + t.fillPrice, 0) / downTrades.length
      : 0;

  const avgUpMarketOdds =
    upTrades.length > 0
      ? upTrades.reduce((s, t) => s + t.marketOddsUp, 0) / upTrades.length
      : 0;
  const avgDownMarketOdds =
    downTrades.length > 0
      ? downTrades.reduce((s, t) => s + t.marketOddsDown, 0) / downTrades.length
      : 0;

  // Edge = market odds - fill price (positive = got better price)
  const upEdge = avgUpMarketOdds - avgUpFillPrice;
  const downEdge = avgDownMarketOdds - avgDownFillPrice;

  const avgHedgeRatio =
    trades.reduce((s, t) => s + t.hedgeRatio, 0) / trades.length;

  // Strategy breakdown
  const strategyBreakdown: Record<string, number> = {};
  for (const t of buyTrades) {
    strategyBreakdown[t.strategyTag] =
      (strategyBreakdown[t.strategyTag] || 0) + 1;
  }

  // Trade frequency (trades per minute)
  const timespan =
    trades.length > 1
      ? trades[trades.length - 1].timestamp - trades[0].timestamp
      : 60;
  const tradeFrequency =
    timespan > 0 ? (buyTrades.length / timespan) * 60 : 0;

  // Determine primary bias
  const primaryBias: 'UP' | 'DOWN' | 'NEUTRAL' =
    avgHedgeRatio > 0.55 ? 'UP' : avgHedgeRatio < 0.45 ? 'DOWN' : 'NEUTRAL';

  // Determine profile
  let profile = 'BALANCED_HEDGE';
  if (primaryBias !== 'NEUTRAL' && Object.keys(strategyBreakdown).includes('HEDGE')) {
    profile = 'ASYMMETRIC_HEDGE';
  } else if (
    Object.keys(strategyBreakdown).includes('CONTRARIAN') &&
    (strategyBreakdown['CONTRARIAN'] || 0) > buyTrades.length * 0.3
  ) {
    profile = 'CONTRARIAN_TRADER';
  } else if (primaryBias !== 'NEUTRAL') {
    profile = 'DIRECTIONAL';
  }

  // Entry patterns
  const entryPatterns: string[] = [];
  if (downTrades.length > upTrades.length) {
    entryPatterns.push(`Ưu tiên DOWN (${downTrades.length} vs ${upTrades.length} lệnh UP)`);
  } else if (upTrades.length > downTrades.length) {
    entryPatterns.push(`Ưu tiên UP (${upTrades.length} vs ${downTrades.length} lệnh DOWN)`);
  }
  if (totalDownInvested > totalUpInvested * 1.2) {
    entryPatterns.push(`Vốn DOWN lớn hơn ($${totalDownInvested.toFixed(0)} vs $${totalUpInvested.toFixed(0)})`);
  }
  if (upEdge > 0.02) {
    entryPatterns.push(`Mua UP giá tốt hơn thị trường (edge +${(upEdge * 100).toFixed(1)}%)`);
  }
  if (downEdge > 0.02) {
    entryPatterns.push(`Mua DOWN giá tốt hơn thị trường (edge +${(downEdge * 100).toFixed(1)}%)`);
  }
  if (strategyBreakdown['CONTRARIAN']) {
    entryPatterns.push(`Có ${strategyBreakdown['CONTRARIAN']} lệnh contrarian (mua bên odds thấp)`);
  }

  return {
    profile,
    primaryBias,
    avgHedgeRatio,
    upTradeCount: upTrades.length,
    downTradeCount: downTrades.length,
    totalUpInvested,
    totalDownInvested,
    avgUpFillPrice,
    avgDownFillPrice,
    avgUpMarketOdds,
    avgDownMarketOdds,
    upEdge,
    downEdge,
    tradeFrequency,
    strategyBreakdown,
    entryPatterns,
  };
}

/**
 * Convert closed positions to historical results and compute win/loss summary.
 */
export function processClosedPositions(
  positions: BinancePosition[]
): { results: GroupedHistoricalResult[]; summary: WinLossSummary } {
  // Group by marketTopicId
  const byMarket = new Map<number, BinancePosition[]>();
  for (const pos of positions) {
    const existing = byMarket.get(pos.marketTopicId) || [];
    existing.push(pos);
    byMarket.set(pos.marketTopicId, existing);
  }

  const results: GroupedHistoricalResult[] = [];

  for (const [marketTopicId, marketPositions] of byMarket) {
    let up: HistoricalResult | null = null;
    let down: HistoricalResult | null = null;
    let totalPnl = 0;
    let marketTitle = '';

    for (const pos of marketPositions) {
      marketTitle = pos.marketTitle;
      const isWin = pos.outcomeWinner === true;
      const pnl = pos.realizedPnlFromSettle ?? pos.pnl ?? 0;
      totalPnl += pnl;

      const res: HistoricalResult = {
        marketId: pos.marketId,
        marketTitle: pos.marketTitle,
        side: pos.outcomeName as 'Up' | 'Down',
        outcomeWinner: pos.outcomeWinner,
        result: pos.result,
        avgPrice: pos.avgPrice,
        shares: pos.shares,
        totalBoughtAmount: pos.totalBoughtAmount,
        settleAmount: pos.settleAmount,
        realizedPnlFromSettle: pos.realizedPnlFromSettle,
        settleRoi: pos.settleRoi,
        isWin,
        pnl,
      };

      if (pos.outcomeName === 'Up') up = res;
      if (pos.outcomeName === 'Down') down = res;
    }

    results.push({
      marketTopicId,
      marketTitle,
      up,
      down,
      totalPnl,
      isWin: totalPnl > 0,
    });
  }

  // Compute summary — group by marketId for round-level analysis
  // Compute summary — using grouped totalPnl
  const pnlValues = results.map(r => r.totalPnl);
  const wins = pnlValues.filter((p) => p > 0);
  const losses = pnlValues.filter((p) => p <= 0);

  const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
  const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

  const summary: WinLossSummary = {
    totalRounds: results.length,
    wins: wins.length,
    losses: losses.length,
    winRate: results.length > 0 ? wins.length / results.length : 0,
    totalProfit: wins.reduce((s, p) => s + p, 0),
    totalLoss: losses.reduce((s, p) => s + p, 0),
    netPnl: pnlValues.reduce((s, p) => s + p, 0),
    avgWin: wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0,
    avgLoss:
      losses.length > 0
        ? losses.reduce((s, p) => s + p, 0) / losses.length
        : 0,
    bestTrade,
    worstTrade,
    maxWin: bestTrade,
    maxLoss: worstTrade,
  };

  return { results, summary };
}
