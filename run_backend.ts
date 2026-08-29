import { startPoller } from './src/lib/poller';

console.log("==========================================");
console.log("🚀 KHỞI ĐỘNG STANDALONE BACKEND (NO UI)");
console.log("==========================================");
console.log("Đang theo dõi ví của Trader...");
console.log("Khi Trader vào lệnh, hệ thống sẽ tự động:");
console.log("  1. Copy lệnh (MUA 1$)");
console.log("  2. Chờ 3 giây");
console.log("  3. Tự động BÁN toàn bộ để test");
console.log("Nhấn Ctrl+C để dừng.");
console.log("==========================================\n");

// Khởi động poller (y hệt như khi Next.js khởi động)
startPoller();

// Giữ cho process Node.js không bị tắt
setInterval(() => {}, 1000 * 60 * 60);
