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
  // Đọc cấu hình từ file (để lấy cập nhật từ frontend)
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), '.backend_config.json');
    if (fs.existsSync(configPath)) {
      const configStr = fs.readFileSync(configPath, 'utf8');
      const configObj = JSON.parse(configStr);
      if (typeof configObj.realTrade === 'boolean') {
        isRealTradeEnabled = configObj.realTrade;
      }
    }
  } catch (e) {
    // ignore
  }

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

        // GỌI API TRADE THẬT TRÊN BINANCE HOẶC SIMULATOR
        if (trade.action === 'BUY' && trade.tokenId) {
          // Tính toán số tiền đầu tư: 1/10 lệnh của trader, tối thiểu 1$
          let investAmount = trade.amountChange / 10;
          if (investAmount < 1) {
            investAmount = 1;
          }

          // Gắn metadata vào trade để frontend có thể hiển thị
          trade.copyTradeAmount = investAmount;
          trade.copyTradeMode = isRealTradeEnabled ? 'REAL_TRADE' : 'SIMULATOR';

          // Chuyển sang chuỗi wei (1 USDT = 10^18 WEI). Dùng cách này để tránh lỗi làm tròn precision của JS với số > 9e15
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

      cachedSnapshot = snapshot;
      cachedTimestamp = timestamp;
    } else {
      // Nếu không có vị thế nào, vẫn cập nhật timestamp để frontend biết backend vẫn đang sống
      cachedSnapshot = null;
      cachedTimestamp = timestamp;
    }

    // Luôn luôn lưu state ra file để frontend đọc, kể cả khi không có lệnh nào (snapshot = null)
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), '.backend_state.json');
      fs.writeFileSync(filePath, JSON.stringify(getCachedData()));
    } catch (e) {
      console.error('[POLLER] Lỗi khi ghi file state:', e);
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

let isRealTradeEnabled = false;

/**
 * Start the background polling loop.
 * Safe to call multiple times — only starts once.
 */
export function startPoller(config?: { enableRealTrade?: boolean }): void {
  if (config?.enableRealTrade !== undefined) {
    isRealTradeEnabled = config.enableRealTrade;
  }

  if (isPolling) return;
  isPolling = true;

  console.log(`[POLLER] Starting background poller (${POLL_INTERVAL_MS}ms interval). Mode: ${isRealTradeEnabled ? 'REAL TRADE (⚠️ Sẽ trừ tiền thật)' : 'SIMULATOR (Không mất tiền)'}`);

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
