import { startPoller } from '../src/lib/poller';

console.log('🚀 Đang khởi động Live Data Puller...');
console.log('Đang lấy dữ liệu từ Binance mỗi 500ms để ghi vào log (chạy ngầm).');
console.log('Nhấn Ctrl+C để dừng.\n');

// Khởi chạy vòng lặp lấy data liên tục
startPoller();
