// ============================================================
// Odds Statistics Engine — Compute win rates from collected data
// ============================================================

import type {
  RoundResult,
  RoundOddsBucketEntry,
  OddsBucketWinRate,
  OddsRowSummary,
  OddsStatsResult,
  TradingSession,
  LossRecordDetail,
  LossAnalysisSummary,
} from './types';
import { getOddsBucket } from './odds-collector';

export const ODDS_BUCKETS = [
  '50-55',
  '55-60',
  '60-65',
  '65-70',
  '70-75',
  '75-80',
  '80-85',
  '85-90',
  '90-95',
  '95+',
];
export const MINUTE_BUCKETS = ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'];

/**
 * Determine trading session from timestamp based on Vietnam Time (GMT+7):
 * - Phiên Á: 07:00 - 14:00 VN
 * - Phiên Âu: 14:00 - 19:00 VN
 * - Phiên Mỹ: 19:00 - 23:00 VN
 * - Phiên Đêm: 23:00 - 07:00 sáng hôm sau VN
 */
export function getTradingSession(timestamp: number): TradingSession {
  const date = new Date(timestamp);
  // UTC hour + 7 hours = Vietnam hour (0-23)
  const vnHour = (date.getUTCHours() + 7) % 24;

  if (vnHour >= 7 && vnHour < 14) return 'asia';
  if (vnHour >= 14 && vnHour < 19) return 'europe';
  if (vnHour >= 19 && vnHour < 23) return 'us';
  return 'night';
}

interface BucketRoundItem {
  mtid: number;
  ts: number;
  favoriteSide: 'Up' | 'Down';
  favoriteOdds: number;
  winner: 'Up' | 'Down';
  isLoss: boolean;
  favAmountOut?: number;
  undAmountOut?: number;
}

/**
 * Calculate max consecutive losses and current loss streak from chronological items.
 */
function calculateLossStreaks(items: BucketRoundItem[]): {
  maxConsecutiveLosses: number;
  currentLossStreak: number;
} {
  let maxConsecutiveLosses = 0;
  let currentLossStreak = 0;

  for (const item of items) {
    if (item.isLoss) {
      currentLossStreak++;
      if (currentLossStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentLossStreak;
      }
    } else {
      currentLossStreak = 0;
    }
  }

  return { maxConsecutiveLosses, currentLossStreak };
}

/**
 * Compute win rate table from bucket entries + round results.
 * 
 * KEY RULE: Each round is counted ONLY ONCE per (oddsBucket × minuteBucket).
 * Filterable by trading session.
 */
export function computeOddsStats(
  entries: RoundOddsBucketEntry[],
  results: RoundResult[],
  totalSnapshots: number,
  collectingSince: number | null,
  sessionFilter: TradingSession = 'all'
): OddsStatsResult {
  // Build result lookup: mtid → RoundResult
  const resultMap = new Map<number, RoundResult>();
  for (const r of results) {
    resultMap.set(r.mtid, r);
  }

  // Filter results by session if needed
  const filteredResults = results.filter((r) => {
    if (sessionFilter === 'all') return true;
    const session = getTradingSession(r.startDate || r.endDate);
    return session === sessionFilter;
  });

  // Count overall wins in filtered results
  let upWins = 0;
  let downWins = 0;
  for (const r of filteredResults) {
    if (r.winner === 'Up') upWins++;
    else downWins++;
  }

  // Filter entries by session
  const filteredEntries = entries.filter((entry) => {
    if (sessionFilter === 'all') return true;
    const session = getTradingSession(entry.ts);
    return session === sessionFilter;
  });

  // Aggregation per (oddsBucket × minuteBucket)
  const cellMap = new Map<
    string,
    {
      items: BucketRoundItem[];
      roundIds: Set<number>;
    }
  >();

  // Aggregation per oddsBucket across all minutes (Row Summary)
  const rowMap = new Map<
    string,
    {
      items: BucketRoundItem[];
      roundIds: Set<number>;
    }
  >();

  for (const ob of ODDS_BUCKETS) {
    rowMap.set(ob, { items: [], roundIds: new Set() });
    for (const mb of MINUTE_BUCKETS) {
      cellMap.set(`${ob}:${mb}`, { items: [], roundIds: new Set() });
    }
  }

  const lossDetails: LossRecordDetail[] = [];

  // Process entries (sorted by ts ascending for streak accuracy)
  const sortedEntries = [...filteredEntries].sort((a, b) => a.ts - b.ts);

  for (const entry of sortedEntries) {
    const roundResult = resultMap.get(entry.mtid);
    if (!roundResult) continue; // Round not yet resolved
    const winner = roundResult.winner;

    const bucket = entry.favoriteOdds ? getOddsBucket(entry.favoriteOdds) : entry.oddsBucket;
    const isLoss = entry.favoriteSide !== winner;
    const item: BucketRoundItem = {
      mtid: entry.mtid,
      ts: entry.ts,
      favoriteSide: entry.favoriteSide,
      favoriteOdds: entry.favoriteOdds,
      winner,
      isLoss,
      favAmountOut: entry.favAmountOut,
      undAmountOut: entry.undAmountOut,
    };

    // 1. Add to cell
    const cellKey = `${bucket}:${entry.minuteBucket}`;
    const cellAgg = cellMap.get(cellKey);
    if (cellAgg && !cellAgg.roundIds.has(entry.mtid)) {
      cellAgg.roundIds.add(entry.mtid);
      cellAgg.items.push(item);

      if (isLoss) {
        const shortfall =
          entry.favoriteSide === 'Up'
            ? roundResult.startPrice - roundResult.endPrice
            : roundResult.endPrice - roundResult.startPrice;
        const shortfallPct =
          roundResult.startPrice > 0 ? (shortfall / roundResult.startPrice) * 100 : 0;

        let category: 'close_call' | 'moderate_reversal' | 'strong_reversal' = 'moderate_reversal';
        if (shortfall < 15) {
          category = 'close_call';
        } else if (shortfall >= 50) {
          category = 'strong_reversal';
        }

        lossDetails.push({
          mtid: entry.mtid,
          ts: entry.ts,
          oddsBucket: bucket,
          minuteBucket: entry.minuteBucket,
          favoriteSide: entry.favoriteSide,
          favoriteOdds: entry.favoriteOdds,
          winner,
          startPrice: roundResult.startPrice,
          endPrice: roundResult.endPrice,
          shortfall: Math.max(0, shortfall),
          shortfallPct: Math.max(0, shortfallPct),
          category,
        });
      }
    }

    // 2. Add to row (first-touch in that round for the entire odds row)
    const rowAgg = rowMap.get(bucket);
    if (rowAgg && !rowAgg.roundIds.has(entry.mtid)) {
      rowAgg.roundIds.add(entry.mtid);
      rowAgg.items.push(item);
    }
  }

  const feeRate = 0.02;

  // Build cell table
  const winRateTable: OddsBucketWinRate[] = [];

  for (const ob of ODDS_BUCKETS) {
    for (const mb of MINUTE_BUCKETS) {
      const cellAgg = cellMap.get(`${ob}:${mb}`)!;
      const items = cellAgg.items;
      const totalRounds = items.length;
      const favoriteWins = items.filter((i) => !i.isLoss).length;
      const reversals = items.filter((i) => i.isLoss).length;

      const favoriteWinRate = totalRounds > 0 ? favoriteWins / totalRounds : 0;
      const reversalRate = totalRounds > 0 ? reversals / totalRounds : 0;
      const totalFavoriteOdds = items.reduce((sum, i) => sum + i.favoriteOdds, 0);
      const avgFavoriteOdds = totalRounds > 0 ? totalFavoriteOdds / totalRounds : 0;

      // Binance get-quote: lấy amountOut thực tế từ API get-quote thời gian thực (hoặc fallback công thức nếu chưa có quote)
      const favAmountOutItems = items.map((i) => i.favAmountOut ?? (i.favoriteOdds > 0 ? (1 - feeRate) / i.favoriteOdds : 0));
      const avgFavAmountOut = totalRounds > 0 ? favAmountOutItems.reduce((a, b) => a + b, 0) / totalRounds : 0;

      const undAmountOutItems = items.map((i) => i.undAmountOut ?? (1 - i.favoriteOdds > 0 ? (1 - feeRate) / (1 - i.favoriteOdds) : 0));
      const avgUndAmountOut = totalRounds > 0 ? undAmountOutItems.reduce((a, b) => a + b, 0) / totalRounds : 0;

      const evFavorite = avgFavAmountOut > 0 ? favoriteWinRate * avgFavAmountOut - 1 : 0;
      const evUnderdog = avgUndAmountOut > 0 ? reversalRate * avgUndAmountOut - 1 : 0;

      const { maxConsecutiveLosses, currentLossStreak } = calculateLossStreaks(items);

      winRateTable.push({
        oddsBucket: ob,
        minuteBucket: mb,
        totalRounds,
        favoriteWins,
        favoriteWinRate,
        reversals,
        reversalRate,
        avgFavoriteOdds,
        avgFavAmountOut,
        avgUndAmountOut,
        evFavorite,
        evUnderdog,
        maxConsecutiveLosses,
        currentLossStreak,
      });
    }
  }

  // Build row summaries (all minutes aggregated per odds bucket)
  const rowSummaries: OddsRowSummary[] = [];

  for (const ob of ODDS_BUCKETS) {
    const rowAgg = rowMap.get(ob)!;
    const items = rowAgg.items;
    const totalRounds = items.length;
    const favoriteWins = items.filter((i) => !i.isLoss).length;
    const reversals = items.filter((i) => i.isLoss).length;

    const favoriteWinRate = totalRounds > 0 ? favoriteWins / totalRounds : 0;
    const reversalRate = totalRounds > 0 ? reversals / totalRounds : 0;
    const totalFavoriteOdds = items.reduce((sum, i) => sum + i.favoriteOdds, 0);
    const avgFavoriteOdds = totalRounds > 0 ? totalFavoriteOdds / totalRounds : 0;

    const favAmountOutItems = items.map((i) => i.favAmountOut ?? (i.favoriteOdds > 0 ? (1 - feeRate) / i.favoriteOdds : 0));
    const avgFavAmountOut = totalRounds > 0 ? favAmountOutItems.reduce((a, b) => a + b, 0) / totalRounds : 0;

    const undAmountOutItems = items.map((i) => i.undAmountOut ?? (1 - i.favoriteOdds > 0 ? (1 - feeRate) / (1 - i.favoriteOdds) : 0));
    const avgUndAmountOut = totalRounds > 0 ? undAmountOutItems.reduce((a, b) => a + b, 0) / totalRounds : 0;

    const evFavorite = avgFavAmountOut > 0 ? favoriteWinRate * avgFavAmountOut - 1 : 0;
    const evUnderdog = avgUndAmountOut > 0 ? reversalRate * avgUndAmountOut - 1 : 0;

    const { maxConsecutiveLosses, currentLossStreak } = calculateLossStreaks(items);

    rowSummaries.push({
      oddsBucket: ob,
      totalRounds,
      favoriteWins,
      favoriteWinRate,
      reversals,
      reversalRate,
      avgFavoriteOdds,
      avgFavAmountOut,
      avgUndAmountOut,
      evFavorite,
      evUnderdog,
      maxConsecutiveLosses,
      currentLossStreak,
    });
  }

  const totalRoundIds = new Set<number>();
  for (const entry of filteredEntries) {
    totalRoundIds.add(entry.mtid);
  }

  // Sort loss details newest first
  lossDetails.sort((a, b) => b.ts - a.ts);

  const totalLosses = lossDetails.length;
  const avgShortfall =
    totalLosses > 0 ? lossDetails.reduce((sum, l) => sum + l.shortfall, 0) / totalLosses : 0;
  const closeCallCount = lossDetails.filter((l) => l.category === 'close_call').length;
  const moderateCount = lossDetails.filter((l) => l.category === 'moderate_reversal').length;
  const strongCount = lossDetails.filter((l) => l.category === 'strong_reversal').length;

  const lossSummary: LossAnalysisSummary = {
    totalLosses,
    avgShortfall,
    closeCallCount,
    closeCallPct: totalLosses > 0 ? (closeCallCount / totalLosses) * 100 : 0,
    moderateCount,
    moderatePct: totalLosses > 0 ? (moderateCount / totalLosses) * 100 : 0,
    strongCount,
    strongPct: totalLosses > 0 ? (strongCount / totalLosses) * 100 : 0,
  };

  return {
    totalSnapshots,
    totalRounds: totalRoundIds.size,
    resolvedRounds: filteredResults.length,
    collectingSince,
    session: sessionFilter,
    winRateTable,
    rowSummaries,
    overallUpWinRate: filteredResults.length > 0 ? upWins / filteredResults.length : 0,
    overallDownWinRate: filteredResults.length > 0 ? downWins / filteredResults.length : 0,
    lossDetails,
    lossSummary,
  };
}

