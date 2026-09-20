import * as fs from 'fs';
import * as path from 'path';
import { computeOddsStats } from './src/lib/odds-stats';
import type { RoundOddsBucketEntry, RoundResult } from './src/lib/types';

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch (e) {
        return null;
      }
    })
    .filter((x): x is T => x !== null);
}

const logDir = path.join(process.cwd(), 'logs');
const results = readJsonl<RoundResult>(path.join(logDir, 'round_results.jsonl'));
const entries = readJsonl<RoundOddsBucketEntry>(path.join(logDir, 'odds_bucket_entries.jsonl'));

console.log(`Loaded ${results.length} results, ${entries.length} bucket entries.`);

const stats = computeOddsStats(entries, results, entries.length, null, 'all');

console.log('\n======================================================');
console.log(`📊 TỔNG QUAN TOÀN BỘ DỮ LIỆU (${stats.resolvedRounds} KỲ RESOLVED)`);
console.log('======================================================');
console.log(`- Tỉ lệ UP thắng chung:   ${(stats.overallUpWinRate * 100).toFixed(2)}%`);
console.log(`- Tỉ lệ DOWN thắng chung: ${(stats.overallDownWinRate * 100).toFixed(2)}%`);

if (stats.lossSummary) {
  const ls = stats.lossSummary;
  console.log(`\n--- PHÂN TÍCH ${ls.totalLosses} CA THUA CỬA TRÊN (LẬT KÈO) ---`);
  console.log(`- Độ lệch giá thiếu trung bình: $${ls.avgShortfall.toFixed(2)}`);
  console.log(`- Ca thua sát nút (< $15, giật giây cuối): ${ls.closeCallCount} ca (${ls.closeCallPct.toFixed(2)}%)`);
  console.log(`- Ca đảo chiều vừa ($15 - $50):           ${ls.moderateCount} ca (${ls.moderatePct.toFixed(2)}%)`);
  console.log(`- Ca đảo chiều mạnh (>= $50):              ${ls.strongCount} ca (${ls.strongPct.toFixed(2)}%)`);
}

console.log('\n======================================================');
console.log('📊 THỐNG KÊ THEO MỐC ODDS (ROW SUMMARIES)');
console.log('======================================================');
console.log('Odds% | Rounds | Fav Win% | Rev% | EV Fav ($1) | EV Und ($1) | MaxLoss | CurLoss');
console.log('-----------------------------------------------------------------------------');
for (const r of stats.rowSummaries) {
  if (r.totalRounds > 0) {
    const fWin = (r.favoriteWinRate * 100).toFixed(1).padStart(5);
    const rev = (r.reversalRate * 100).toFixed(1).padStart(5);
    const evF = (r.evFavorite >= 0 ? '+' : '') + r.evFavorite.toFixed(3).padStart(6);
    const evU = (r.evUnderdog >= 0 ? '+' : '') + r.evUnderdog.toFixed(3).padStart(6);
    console.log(`${r.oddsBucket.padEnd(5)} | ${String(r.totalRounds).padStart(6)} | ${fWin}% | ${rev}% | ${evF} | ${evU} | ${String(r.maxConsecutiveLosses).padStart(7)} | ${String(r.currentLossStreak).padStart(7)}`);
  }
}

console.log('\n======================================================');
console.log('🏆 TOP CÁC Ô CÓ EV CỬA TRÊN DƯƠNG (EV_FAV > 0, MẪU >= 10 KỲ)');
console.log('======================================================');
const favCells = stats.winRateTable
  .filter(c => c.totalRounds >= 10 && c.evFavorite > 0)
  .sort((a, b) => b.evFavorite - a.evFavorite);

if (favCells.length === 0) {
  console.log('Không có ô nào có EV_FAV > 0 với mẫu >= 10 kỳ!');
} else {
  for (const c of favCells) {
    console.log(`- Ô [Odds ${c.oddsBucket}% | Phút ${c.minuteBucket}]: Mẫu ${c.totalRounds} kỳ | WinRate: ${(c.favoriteWinRate * 100).toFixed(1)}% | EV: +$${c.evFavorite.toFixed(3)} | MaxLoss: ${c.maxConsecutiveLosses}`);
  }
}

console.log('\n======================================================');
console.log('🎯 TOP CÁC Ô BẮT ĐẢO CHIỀU DƯƠNG (EV_UNDERDOG > 0, MẪU >= 10 KỲ)');
console.log('======================================================');
const undCells = stats.winRateTable
  .filter(c => c.totalRounds >= 10 && c.evUnderdog > 0)
  .sort((a, b) => b.evUnderdog - a.evUnderdog);

if (undCells.length === 0) {
  console.log('Không có ô nào có EV_UNDERDOG > 0 với mẫu >= 10 kỳ!');
} else {
  for (const c of undCells) {
    console.log(`- Ô [Odds ${c.oddsBucket}% | Phút ${c.minuteBucket}]: Mẫu ${c.totalRounds} kỳ | Tỉ lệ lật: ${(c.reversalRate * 100).toFixed(1)}% | EV Đảo chiều: +$${c.evUnderdog.toFixed(3)} | MaxLoss: ${c.maxConsecutiveLosses}`);
  }
}

// Phân tích theo phiên
const sessions = ['asia', 'europe', 'us', 'night'] as const;
console.log('\n======================================================');
console.log('🌏 PHÂN TÍCH THEO PHIÊN GIAO DỊCH');
console.log('======================================================');
for (const s of sessions) {
  const sStats = computeOddsStats(entries, results, entries.length, null, s);
  console.log(`[Phiên ${s.toUpperCase()}]: ${sStats.resolvedRounds} kỳ | Up: ${(sStats.overallUpWinRate * 100).toFixed(1)}% | Down: ${(sStats.overallDownWinRate * 100).toFixed(1)}% | Thua sát nút < $15: ${(sStats.lossSummary?.closeCallPct ?? 0).toFixed(1)}%`);
}
