// ============================================================
// Server-side Poller — Polls Binance every 200ms in background
// Singleton: starts on first import, caches latest state
// ============================================================

import { fetchActivePositions } from './binance';
import { normalizeToSnapshot, diffSnapshots, getAllTrades } from './diff-engine';
import { logTrade, logSnapshot } from './logger';
import type { DashboardData, MarketSnapshot, DetectedTrade } from './types';

const POLL_INTERVAL_MS = 500;

/** Cached state */
let cachedSnapshot: MarketSnapshot | null = null;
let cachedTimestamp: number = 0;
let isPolling = false;
let pollCount = 0;
let errorCount = 0;
let lastError: string | null = null;

/**
 * Single poll cycle: fetch → normalize → diff → log
 */
async function pollOnce(): Promise<void> {
  try {
    const activePositions = await fetchActivePositions();
    const timestamp = Math.floor(Date.now() / 1000);

    const snapshot = normalizeToSnapshot(activePositions, timestamp);

    if (snapshot) {
      const newTrades = diffSnapshots(snapshot);

      // Log snapshot (throttle to avoid excessive disk I/O)
      if (pollCount % 10 === 0) {
        logSnapshot(snapshot);
      }

      // Log new trades immediately
      for (const trade of newTrades) {
        logTrade(trade);
        console.log(
          `[POLLER] Trade detected: ${trade.action} ${trade.side} | ` +
          `Cost: $${trade.amountChange.toFixed(2)} | ` +
          `Fill: ${trade.fillPrice.toFixed(4)} | ` +
          `Payout: ${trade.payoutMultiplier.toFixed(2)}x | ` +
          `If Win: +$${trade.potentialWin.toFixed(2)}`
        );
      }

      cachedSnapshot = snapshot;
      cachedTimestamp = timestamp;
    }

    pollCount++;
    errorCount = 0;
    lastError = null;
  } catch (err) {
    errorCount++;
    lastError = err instanceof Error ? err.message : 'Unknown error';

    // Only log every 10th consecutive error to avoid spam
    if (errorCount % 10 === 1) {
      console.error(`[POLLER] Error (count: ${errorCount}):`, lastError);
    }

    // Back off if too many errors
    if (errorCount > 50) {
      console.error('[POLLER] Too many errors, pausing for 5s...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Start the background polling loop.
 * Safe to call multiple times — only starts once.
 */
export function startPoller(): void {
  if (isPolling) return;
  isPolling = true;

  console.log(`[POLLER] Starting background poller (${POLL_INTERVAL_MS}ms interval)`);

  const loop = async () => {
    while (isPolling) {
      const start = Date.now();
      await pollOnce();
      const elapsed = Date.now() - start;

      // Wait remaining time to maintain consistent interval
      // If poll took longer than interval, start next one immediately
      const waitTime = Math.max(0, POLL_INTERVAL_MS - elapsed);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  };

  loop();
}

/**
 * Stop the polling loop.
 */
export function stopPoller(): void {
  isPolling = false;
  console.log('[POLLER] Stopped');
}

/**
 * Reset the poller state (e.g. when changing wallet).
 */
export function resetPoller(): void {
  cachedSnapshot = null;
  cachedTimestamp = 0;
  pollCount = 0;
  errorCount = 0;
  lastError = null;
}

/**
 * Get cached dashboard data (instant, no API call).
 */
export function getCachedData(): DashboardData {
  return {
    active: cachedSnapshot,
    trades: getAllTrades(),
    timestamp: cachedTimestamp,
  };
}

/**
 * Get poller health stats.
 */
export function getPollerStats() {
  return {
    isPolling,
    pollCount,
    errorCount,
    lastError,
    intervalMs: POLL_INTERVAL_MS,
  };
}
