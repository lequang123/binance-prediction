// ============================================================
// Odds Statistics Engine — Compute win rates from collected data
// ============================================================

import type {
  RoundResult,
  RoundOddsBucketEntry,
  OddsBucketWinRate,
  OddsStatsResult,
} from './types';

const ODDS_BUCKETS = ['50-60', '60-70', '70-80', '80-90', '90+'];
const MINUTE_BUCKETS = ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'];

/**
 * Compute win rate table from bucket entries + round results.
 * 
 * KEY RULE: Each round is counted ONLY ONCE per (oddsBucket × minuteBucket).
 * This is already guaranteed by the first-touch dedup in odds-collector.
 * The entries array only contains the first time odds entered each bucket.
 */
export function computeOddsStats(
  entries: RoundOddsBucketEntry[],
  results: RoundResult[],
  totalSnapshots: number,
  collectingSince: number | null
): OddsStatsResult {
  // Build result lookup: mtid → winner
  const resultMap = new Map<number, 'Up' | 'Down'>();
  for (const r of results) {
    resultMap.set(r.mtid, r.winner);
  }

  // Count overall wins
  let upWins = 0;
  let downWins = 0;
  for (const r of results) {
    if (r.winner === 'Up') upWins++;
    else downWins++;
  }

  // Aggregate by (oddsBucket × minuteBucket)
  const aggMap = new Map<
    string,
    {
      totalRounds: number;
      favoriteWins: number;
      reversals: number;
      totalFavoriteOdds: number;
      roundIds: Set<number>;
    }
  >();

  // Initialize all buckets
  for (const ob of ODDS_BUCKETS) {
    for (const mb of MINUTE_BUCKETS) {
      aggMap.set(`${ob}:${mb}`, {
        totalRounds: 0,
        favoriteWins: 0,
        reversals: 0,
        totalFavoriteOdds: 0,
        roundIds: new Set(),
      });
    }
  }

  // Process entries (already deduped: 1 per round × bucket)
  for (const entry of entries) {
    const winner = resultMap.get(entry.mtid);
    if (!winner) continue; // Round not yet resolved

    const key = `${entry.oddsBucket}:${entry.minuteBucket}`;
    const agg = aggMap.get(key);
    if (!agg) continue;

    // Extra safety: don't double-count same round in same bucket
    if (agg.roundIds.has(entry.mtid)) continue;
    agg.roundIds.add(entry.mtid);

    agg.totalRounds++;
    agg.totalFavoriteOdds += entry.favoriteOdds;

    if (entry.favoriteSide === winner) {
      agg.favoriteWins++;
    } else {
      agg.reversals++;
    }
  }

  // Build output table
  const winRateTable: OddsBucketWinRate[] = [];

  for (const ob of ODDS_BUCKETS) {
    for (const mb of MINUTE_BUCKETS) {
      const agg = aggMap.get(`${ob}:${mb}`)!;

      const favoriteWinRate =
        agg.totalRounds > 0 ? agg.favoriteWins / agg.totalRounds : 0;
      const reversalRate =
        agg.totalRounds > 0 ? agg.reversals / agg.totalRounds : 0;
      const avgFavoriteOdds =
        agg.totalRounds > 0 ? agg.totalFavoriteOdds / agg.totalRounds : 0;

      // EV calculation:
      // Buying favorite at odds price `p`:
      //   Win: payout = 1/p shares per $1 invested → profit = (1/p - 1) per $1
      //   Lose: lose $1
      //   EV = winRate × (1/p - 1) - (1 - winRate) × 1
      //   Subtract 2% fee
      const feeRate = 0.02;
      const evFavorite =
        avgFavoriteOdds > 0
          ? favoriteWinRate * (1 / avgFavoriteOdds - 1) * (1 - feeRate) -
            (1 - favoriteWinRate) * 1
          : 0;

      // Buying underdog at odds (1 - avgFavoriteOdds):
      const underdogOdds = 1 - avgFavoriteOdds;
      const evUnderdog =
        underdogOdds > 0
          ? reversalRate * (1 / underdogOdds - 1) * (1 - feeRate) -
            (1 - reversalRate) * 1
          : 0;

      winRateTable.push({
        oddsBucket: ob,
        minuteBucket: mb,
        totalRounds: agg.totalRounds,
        favoriteWins: agg.favoriteWins,
        favoriteWinRate,
        reversals: agg.reversals,
        reversalRate,
        avgFavoriteOdds,
        evFavorite,
        evUnderdog,
      });
    }
  }

  const totalRoundIds = new Set<number>();
  for (const entry of entries) {
    totalRoundIds.add(entry.mtid);
  }

  return {
    totalSnapshots,
    totalRounds: totalRoundIds.size,
    resolvedRounds: results.length,
    collectingSince,
    winRateTable,
    overallUpWinRate: results.length > 0 ? upWins / results.length : 0,
    overallDownWinRate: results.length > 0 ? downWins / results.length : 0,
  };
}
