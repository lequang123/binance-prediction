// ============================================================
// AI Context Builder — Prepare statistical data for Gemini AI
// ============================================================

import type { OddsStatsResult } from './types';

export const AI_SYSTEM_INSTRUCTION = `
Bạn là "Binance Prediction AI Advisor" — Cố vấn chiến lược cược chuyên nghiệp cho thị trường dự đoán giá Bitcoin (BTC Up/Down 5 phút) trên sàn Binance Web3 (Predict.fun).

Vai trò của bạn:
1. Đọc và phân tích số liệu thống kê thực tế được cung cấp trong phần DỮ LIỆU THỊ TRƯỜNG bên dưới (dữ liệu thu thập theo thời gian thực từ sàn Binance).
2. Trả lời các câu hỏi về tỉ lệ thắng (Win Rate), giá trị kỳ vọng (EV), lợi nhuận thật (PnL), chuỗi thua liên tiếp (Max Loss Streak), và chiến lược bắt đảo chiều (Underdog).
3. Đưa ra lời khuyên quản lý vốn (Money Management) cụ thể, thực tế, phòng tránh rủi ro cháy tài khoản do chuỗi thua bất ngờ hoặc giật giá giây cuối.
4. Trình bày câu trả lời ngắn gọn, rành mạch, dùng các gạch đầu dòng, bảng số liệu hoặc số liệu phần trăm rõ ràng, bằng tiếng Việt.
5. KHÔNG bịa đặt số liệu. Chỉ dựa vào bảng số liệu được cung cấp. Nếu dữ liệu của một mốc còn ít mẫu (sample size nhỏ, < 5 kỳ), hãy cảnh báo người dùng về độ tin cậy.

Quy tắc cơ bản của thị trường:
- Mỗi kỳ diễn ra trong 5 phút. BTC chốt giá cao hơn giá mở = Up thắng, ngược lại = Down thắng.
- Số tiền trong log là thực tế sàn ghi nhận. Khi cược $1:
  - amountOut = 1 / Odds.
  - Khi thắng: nhận về amountOut (lãi ròng = amountOut - 1).
  - Khi thua: mất toàn bộ $1 cược.
- Cửa Thuận (Favorite): Cửa có odds > 50%.
- Cửa Đảo Chiều (Underdog): Cửa có odds < 50% (lật kèo).
- Close-call (< $15): Thua do giật giá sát nút ở những giây cuối cùng.
`.trim();

export function buildStatsContext(stats: OddsStatsResult): string {
  const lines: string[] = [];

  lines.push(`=== DỮ LIỆU THỐNG KÊ THỰC TẾ HIỆN TẠI (Phiên: ${stats.session.toUpperCase()}) ===`);
  lines.push(`- Tổng số kỳ đã hoàn tất (Resolved): ${stats.resolvedRounds} kỳ`);
  lines.push(`- Tổng số kỳ có odds chạm mốc: ${stats.totalRounds} kỳ`);
  lines.push(`- Tỉ lệ Up thắng chung: ${(stats.overallUpWinRate * 100).toFixed(1)}%`);
  lines.push(`- Tỉ lệ Down thắng chung: ${(stats.overallDownWinRate * 100).toFixed(1)}%`);

  // Phân tích ca thua
  if (stats.lossSummary && stats.lossSummary.totalLosses > 0) {
    const ls = stats.lossSummary;
    lines.push(`\n--- PHÂN TÍCH CÁC CA THUA / LẬT KÈO (Tổng: ${ls.totalLosses} ca) ---`);
    lines.push(`- Độ lệch giá trung bình khi thua: $${ls.avgShortfall.toFixed(2)}`);
    lines.push(`- Ca thua sát nút (< $15, giật giây cuối): ${ls.closeCallCount} ca (${ls.closeCallPct.toFixed(1)}%)`);
    lines.push(`- Ca đảo chiều vừa ($15 - $50): ${ls.moderateCount} ca (${ls.moderatePct.toFixed(1)}%)`);
    lines.push(`- Ca đảo chiều mạnh (>= $50): ${ls.strongCount} ca (${ls.strongPct.toFixed(1)}%)`);
  }

  // Bảng tóm tắt theo hàng Odds
  if (stats.rowSummaries && stats.rowSummaries.length > 0) {
    lines.push(`\n--- TỔNG KẾT THEO MỐC ODDS (Row Summaries) ---`);
    lines.push(`| Mốc Odds | Số mẫu (kỳ) | Win Rate Thuận | Đảo chiều | EV Thuận ($1) | EV Đảo chiều ($1) | Max Chuỗi Thua | Chuỗi thua hiện tại |`);
    lines.push(`|---|---|---|---|---|---|---|---|`);
    for (const r of stats.rowSummaries) {
      if (r.totalRounds > 0) {
        const wrFav = (r.favoriteWinRate * 100).toFixed(1) + '%';
        const rev = (r.reversalRate * 100).toFixed(1) + '%';
        const evFav = (r.evFavorite >= 0 ? '+' : '') + `$${r.evFavorite.toFixed(2)}`;
        const evUnd = (r.evUnderdog >= 0 ? '+' : '') + `$${r.evUnderdog.toFixed(2)}`;
        lines.push(`| ${r.oddsBucket}% | ${r.totalRounds} | ${wrFav} | ${rev} | ${evFav} | ${evUnd} | ${r.maxConsecutiveLosses} | ${r.currentLossStreak} |`);
      }
    }
  }

  // Các ô nổi bật (Best EV, Highest Winrate, hoặc High Reversal)
  const activeCells = stats.winRateTable.filter((c) => c.totalRounds > 0);
  if (activeCells.length > 0) {
    // Sắp xếp tìm top 5 ô EV thuận cao nhất
    const bestFavEv = [...activeCells]
      .filter((c) => c.totalRounds >= 2)
      .sort((a, b) => b.evFavorite - a.evFavorite)
      .slice(0, 5);

    if (bestFavEv.length > 0) {
      lines.push(`\n--- TOP 5 Ô CÓ EV CỬA THUẬN CAO NHẤT (Mẫu >= 2 kỳ) ---`);
      for (const c of bestFavEv) {
        lines.push(`- Mốc ${c.oddsBucket}% lúc ${c.minuteBucket}: Mẫu ${c.totalRounds} kỳ, WinRate ${(c.favoriteWinRate * 100).toFixed(1)}%, EV: +$${c.evFavorite.toFixed(2)}/1$, MaxLoss: ${c.maxConsecutiveLosses}`);
      }
    }

    // Sắp xếp tìm top 5 ô có EV đảo chiều (underdog) cao nhất
    const bestUndEv = [...activeCells]
      .filter((c) => c.totalRounds >= 2 && c.evUnderdog > 0)
      .sort((a, b) => b.evUnderdog - a.evUnderdog)
      .slice(0, 5);

    if (bestUndEv.length > 0) {
      lines.push(`\n--- TOP Ô CÓ LỢI THẾ ĐẢO CHIỀU (Bắt Underdog có EV dương) ---`);
      for (const c of bestUndEv) {
        lines.push(`- Mốc ${c.oddsBucket}% lúc ${c.minuteBucket}: Tỉ lệ lật kèo ${(c.reversalRate * 100).toFixed(1)}%, EV Underdog: +$${c.evUnderdog.toFixed(2)}/1$, Mẫu: ${c.totalRounds} kỳ`);
      }
    }
  }

  return lines.join('\n');
}
