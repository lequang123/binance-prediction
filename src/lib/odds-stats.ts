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
  // Build result lookup: mtid → winner
  const resultMap = new Map<number, 'Up' | 'Down'>();
  for (const r of results) {
    resultMap.set(r.mtid, r.winner);
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

  // Process entries (sorted by ts ascending for streak accuracy)
  const sortedEntries = [...filteredEntries].sort((a, b) => a.ts - b.ts);

  for (const entry of sortedEntries) {
    const winner = resultMap.get(entry.mtid);
    if (!winner) continue; // Round not yet resolved

    const bucket = entry.favoriteOdds ? getOddsBucket(entry.favoriteOdds) : entry.oddsBucket;
    const isLoss = entry.favoriteSide !== winner;
    const item: BucketRoundItem = {
      mtid: entry.mtid,
      ts: entry.ts,
      favoriteSide: entry.favoriteSide,
      favoriteOdds: entry.favoriteOdds,
      winner,
      isLoss,
    };

    // 1. Add to cell
    const cellKey = `${bucket}:${entry.minuteBucket}`;
    const cellAgg = cellMap.get(cellKey);
    if (cellAgg && !cellAgg.roundIds.has(entry.mtid)) {
      cellAgg.roundIds.add(entry.mtid);
      cellAgg.items.push(item);
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

      const evFavorite =
        avgFavoriteOdds > 0
          ? favoriteWinRate * (1 / avgFavoriteOdds - 1) * (1 - feeRate) -
            (1 - favoriteWinRate) * 1
          : 0;

      const underdogOdds = 1 - avgFavoriteOdds;
      const evUnderdog =
        underdogOdds > 0
          ? reversalRate * (1 / underdogOdds - 1) * (1 - feeRate) -
            (1 - reversalRate) * 1
          : 0;

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

    const evFavorite =
      avgFavoriteOdds > 0
        ? favoriteWinRate * (1 / avgFavoriteOdds - 1) * (1 - feeRate) -
          (1 - favoriteWinRate) * 1
        : 0;

    const underdogOdds = 1 - avgFavoriteOdds;
    const evUnderdog =
      underdogOdds > 0
        ? reversalRate * (1 / underdogOdds - 1) * (1 - feeRate) -
          (1 - reversalRate) * 1
        : 0;

    const { maxConsecutiveLosses, currentLossStreak } = calculateLossStreaks(items);

    rowSummaries.push({
      oddsBucket: ob,
      totalRounds,
      favoriteWins,
      favoriteWinRate,
      reversals,
      reversalRate,
      avgFavoriteOdds,
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
  };
}

