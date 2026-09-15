// ============================================================
// Standalone Odds Puller — Chạy ngầm thu thập dữ liệu Odds 1s/lần
// ============================================================

import { startOddsCollector, loadSavedData, getCollectorStatus } from '../src/lib/odds-collector';

console.log('====================================================');
console.log('🚀 KHỞI ĐỘNG STANDALONE ODDS COLLECTOR (1s / LẦN)');
console.log('====================================================');

const saved = loadSavedData();
console.log(
  `[DISK SYNC] Đã nạp từ logs: ${saved.snapshots} snapshots, ${saved.results} round results, ${saved.entries} bucket entries`
);

startOddsCollector();

console.log('Đang chạy vòng lặp lấy dữ liệu odds từ Binance mỗi 1000ms...');
console.log('Nhấn Ctrl+C để dừng.\n');

// In log định kỳ mỗi 60 giây để theo dõi tiến độ
setInterval(() => {
  const status = getCollectorStatus();
  console.log(
    `[STATUS ${new Date().toLocaleTimeString()}] Snapshots: ${status.snapshotCount} | Rounds: ${status.roundCount} | Resolved: ${status.resolvedCount} | Errors: ${status.errorCount}`
  );
}, 60000);

// Giữ process luôn sống
setInterval(() => {}, 1000 * 60 * 60);
