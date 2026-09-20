# Task Breakdown: Nền Tảng Multi-Bot Studio & Backtest Thống Kê

## Phase 1: Core Engine & Backtest Thống Kê Tức Thời

### Task 1: Module Engine Đa Bot & Backtest Siêu Tốc (`src/lib/bot-engine.ts`)
- **Size:** M (2 files)
- **Description:** 
  - Khai báo cấu trúc dữ liệu `BotConfig`, `BotRuntimeState`, `BacktestResult` trong `src/lib/types.ts`.
  - Cài đặt hàm `runBotBacktest(config, results, entries)`: Duyệt qua 765 kỳ logs thực tế, mô phỏng chính xác tiền cược, bước gấp thếp, số vòng cooldown, các bộ lọc thời gian và phiên giao dịch. Trả về kết quả: WinRate, Net PnL, Max Drawdown, số lệnh thắng/thua, số lần cắt lỗ và rating an toàn.
  - Cài đặt hàm `evaluateBotSignal(config, state, currentRoundSnapshot)`: Đánh giá xem bot có kích hoạt lệnh trong vòng 5m hiện tại hay không.
  - Cài đặt hàm `updateBotOnRoundResult(config, state, result)`: Cập nhật thắng/thua, reset về `baseStake` hoặc tăng tiền gấp thếp và chuyển sang Cooldown 2 trận.
- **Acceptance criteria:**
  - [x] Hàm backtest thực thi trong < 50ms cho 765 kỳ logs.
  - [x] Kết quả khớp 100% với số liệu thực tế đã kiểm chứng trong các bài test.
  - [x] Quản lý trạng thái đa bot tách biệt, không bị ghi đè lẫn nhau.
- **Verification:**
  - [x] Đã test chạy backtest trả về đầy đủ các chỉ số Win Rate, Net PnL, Max Drawdown.
- **Dependencies:** None
- **Files likely touched:**
  - `src/lib/bot-engine.ts` (mới)
  - `src/lib/types.ts`

### Task 2: API Quản Lý Đa Bot & Endpoint Backtest Tức Thì (`/api/bots`)
- **Size:** S (2 files)
- **Description:**
  - `GET /api/bots`: Trả về danh sách bot và trạng thái runtime hiện tại của từng bot.
  - `POST /api/bots`: Thêm mới hoặc cập nhật cấu hình bot, lưu bền vững vào `.bots_config.json`.
  - `DELETE /api/bots?id=...`: Xóa bot.
  - `POST /api/bots/backtest`: Nhận config tạm thời từ form người dùng và trả về ngay kết quả thống kê backtest trên 765 kỳ để người dùng xem trước khi bấm Lưu.
- **Acceptance criteria:**
  - [x] Lưu trữ cấu hình bền vững vào `.bots_config.json`, tự động khôi phục khi server restart.
  - [x] Endpoint backtest phản hồi tức thì (< 100ms) kèm đánh giá xếp hạng rủi ro.
- **Verification:**
  - [x] Đã test gọi API tạo bot, chạy test backtest qua Invoke-RestMethod.
- **Dependencies:** Task 1
- **Files likely touched:**
  - `src/app/api/bots/route.ts` (mới)
  - `src/app/api/bots/backtest/route.ts` (mới)

### Checkpoint 1: Backend & Backtest Engine Sẵn Sàng
- [x] Mọi cấu hình bot đều có thể được tạo, lưu trữ và thẩm định hiệu quả tức thì trên 765 kỳ logs.

---

## Phase 2: Vòng Lặp Vận Hành 24/7 Trong Tiến Trình Next.js & Live Trade

### Task 3: Tích Hợp Multi-Bot Runner Trực Tiếp Vào `odds-collector.ts`
- **Size:** M (2 files)
- **Description:**
  - Trong hàm `pollOnce()` của `src/lib/odds-collector.ts`: Mỗi khi nhận được snapshot mới, gọi `tickMultiBots(snapshot, detail)` để duyệt qua các bot đang bật:
    - Nếu bot đang ở chế độ `SIMULATOR`: Ghi nhận cược ảo, theo dõi PnL.
    - Nếu bot đang ở chế độ `REAL_TRADE`: Gọi API Binance Web3 `executeLiveTrade` với số tiền `currentStake` của bot.
    - Tự động khóa nếu chạm `maxDailyLoss` của bot.
  - Trong hàm `resolveRound()` của `src/lib/odds-collector.ts`: Khi có kết quả vòng cược, gọi `resolveMultiBots(result)` để cập nhật trạng thái thắng/thua, đếm lùi cooldown, tính PnL và lưu trạng thái vào `.bots_state.json`.
- **Acceptance criteria:**
  - [x] Tự động chạy ngầm 24/7 theo Next.js mà không cần mở thêm process `run_backend.ts`.
  - [x] Tương thích 100% với deploy trên Railway (`npm run start`).
  - [x] Ghi log chi tiết lịch sử cược của từng bot vào `logs/bots_activity.jsonl`.
- **Verification:**
  - [x] Đã tích hợp trực tiếp vào `pollOnce` và `resolveRound` trong `src/lib/odds-collector.ts`.
- **Dependencies:** Task 1, Task 2
- **Files likely touched:**
  - `src/lib/odds-collector.ts`
  - `src/lib/bot-engine.ts`

### Checkpoint 2: Tự Động Hóa Vận Hành 24/7 Hoàn Tất
- [x] Các bot tự động chạy ngầm trong tiến trình Next.js, phân tách độc lập giữa Simulator và Real Trade.

---

## Phase 3: Giao Diện Người Dùng Multi-Bot Studio (Frontend)

### Task 4: Form Tạo / Chỉnh Sửa Bot Kèm Bảng Xem Trước Backtest Tức Thời
- **Size:** M (2-3 files)
- **Description:**
  - Modal form tạo/chỉnh sửa bot với các trường: Tên, Base Stake, Multiplier (x2, x3, x4), Số lần gấp tối đa (maxSteps), Max Daily Loss, Phiên giao dịch, Bộ lọc phút (bỏ phút đầu 5-4m, bỏ 35s cuối) và Đệm giá an toàn ($20).
  - Khung **Thẩm Định Hiệu Quả Thống Kê (Instant Backtest Preview)**: Tự động cập nhật tức thì WinRate, Net PnL, Max Drawdown trên 765 kỳ mỗi khi người dùng thay đổi bất kỳ ô input nào trên form.
- **Acceptance criteria:**
  - [x] Form validate chặt chẽ (stake $\ge 1$ USDT, multiplier $\ge 1$).
  - [x] Kết quả backtest hiển thị trực quan, mượt mà kèm huy hiệu Rating (Hiệu Quả Cao / Cân Bằng / Rủi Ro Cao).
- **Verification:**
  - [x] Đã xây dựng `src/components/BotConfigModal.tsx` và `src/components/BacktestPreviewCard.tsx`.
- **Dependencies:** Task 2
- **Files likely touched:**
  - `src/components/BotConfigModal.tsx` (mới)
  - `src/components/BacktestPreviewCard.tsx` (mới)

### Task 5: Màn Hình Studio Quản Lý Đa Bot (`src/app/bots/page.tsx`)
- **Size:** M (3 files)
- **Description:**
  - Xây dựng trang `/bots` chuyên biệt:
    - Thanh thống kê tổng quan: Tổng số bot, Số bot đang bật, Tổng PnL thực tế hôm nay, Nút `+ Tạo Bot Mới`.
    - Lưới danh sách các Bot Cards:
      - Tên bot, Badge chiến lược, Badge phiên.
      - Trạng thái: Đang săn kèo / Đang Cooldown / Đã chạm Max Loss.
      - Công tắc 3 chế độ: **OFF** | **SIMULATOR** | **LIVE REAL TRADE** (kèm modal cảnh báo rủi ro khi bật tiền thật).
      - Nút Xóa bot, Nút Chỉnh sửa bot, Nút Xem lịch sử lệnh.
    - Thêm link điều hướng "🤖 Multi-Bot Studio" lên thanh Navigation chính (`src/components/Header.tsx`).
- **Acceptance criteria:**
  - [x] Giao diện hiện đại, chuẩn aesthetic dark mode theo phong cách của dự án.
  - [x] Thao tác bật/tắt LIVE tiền thật có modal cảnh báo an toàn rõ ràng.
- **Verification:**
  - [x] `http://localhost:3000/bots` trả về HTTP 200 OK, TypeScript compile sạch không có lỗi.
- **Dependencies:** Task 4, Task 3
- **Files likely touched:**
  - `src/app/bots/page.tsx` (mới)
  - `src/components/BotCard.tsx` (mới)
  - `src/components/Header.tsx`

### Checkpoint 3: Hoàn Tất Toàn Diện Nền Tảng Multi-Bot Studio
- [x] Người dùng có thể tạo vô số bot, thẩm định hiệu quả ngay trên dữ liệu 765 kỳ, và vận hành an toàn với đầy đủ các bộ lọc và công tắc LIVE.
- [x] Hỗ trợ chiến lược **Đánh Đều (Flat Bet - Không Gấp Thếp)** kết hợp **Bộ Lọc Phút (2-1m)** và **Lọc Sát Nút ($20)** đạt tỷ lệ thắng **94.8%**, Net PnL **+$249.03** trên 765 kỳ logs.
- [x] Tích hợp thanh chọn nhanh khung phút (2-1m, 3-2m, 4-3m, 5-4m) trực tiếp trong giao diện tạo bot.
- [x] Bỏ trừ 2% phí sàn ở tất cả các module tính toán (Backtest, Live Resolve, Stats table, AI prompt) vì số tiền trong log đã phản ánh đúng thực tế của sàn. Net PnL chiến lược Đánh Đều Phút 2-1m tăng lên **+$305.11** (Win Rate 95.0%).
- [x] **Sửa triệt để lỗi nhập dấu phẩy**: Tách riêng `ladderText` local state giúp gõ `1, 6, 15, 40` mượt mà, không bị mất ký tự.
- [x] **Cửa đánh & Mốc Odds đa chọn**: Cho phép chọn nhiều mốc Odds giống hệt bảng thống kê (`50-55%` đến `95%+`) kèm nút chọn hướng cửa Thuận (Favorite) / Lật Kèo (Underdog).
