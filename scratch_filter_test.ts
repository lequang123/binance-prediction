import * as fs from 'fs';
import * as path from 'path';
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

const sortedResults = [...results].sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

console.log('\n======================================================');
console.log('🔍 PHÂN TÍCH HIỆU SUẤT MỐC 85-90% THEO TỪNG KHUNG PHÚT');
console.log('======================================================');

const minuteBuckets = ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'];

for (const mb of minuteBuckets) {
  let total = 0;
  let wins = 0;
  let closeCallLosses = 0; // Thua sát nút < $15

  for (const round of sortedResults) {
    const mbEntries = entries.filter(
      e => e.mtid === round.mtid && 
           e.minuteBucket === mb && 
           e.favoriteOdds >= 0.85 && 
           e.favoriteOdds < 0.90
    );

    if (mbEntries.length > 0) {
      total++;
      const e = mbEntries[0];
      const isWin = e.favoriteSide === round.winner;
      if (isWin) {
        wins++;
      } else {
        const shortfall = e.favoriteSide === 'Up' 
          ? round.startPrice - round.endPrice 
          : round.endPrice - round.startPrice;
        if (shortfall < 15) {
          closeCallLosses++;
        }
      }
    }
  }

  const winRate = total > 0 ? (wins / total * 100).toFixed(1) : '0';
  const closePct = (total - wins) > 0 ? (closeCallLosses / (total - wins) * 100).toFixed(1) : '0';
  console.log(`Phút [${mb}]: Mẫu ${String(total).padStart(3)} kỳ | Thắng: ${String(wins).padStart(3)} (${winRate}%) | Thua: ${String(total - wins).padStart(2)} | Trong đó thua sát nút < $15: ${closeCallLosses} (${closePct}%)`);
}

// Thử nghiệm các bộ lọc:
// Bộ lọc 1: Loại bỏ phút 1-0m (loại bỏ sát nút ở phút cuối)
// Bộ lọc 2: Loại bỏ phút 5-4m (loại bỏ vào quá sớm khi giá chưa bứt phá)
// Bộ lọc 3: Chỉ đánh ở "VÙNG VÀNG ỔN ĐỊNH": Phút 4-3m, 3-2m, 2-1m

console.log('\n======================================================');
console.log('🧪 BACKTEST GẤP THẾP VỚI CÁC BỘ LỌC THỜI GIAN');
console.log('======================================================');

interface FilterConfig {
  name: string;
  allowedMinutes: string[];
}

const filterConfigs: FilterConfig[] = [
  { name: '1. Không lọc (Tất cả phút 5-4m -> 1-0m)', allowedMinutes: ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'] },
  { name: '2. Loại bỏ sát nút (Bỏ 1-0m)', allowedMinutes: ['5-4m', '4-3m', '3-2m', '2-1m'] },
  { name: '3. Loại bỏ vào quá sớm (Bỏ 5-4m)', allowedMinutes: ['4-3m', '3-2m', '2-1m', '1-0m'] },
  { name: '4. TỐI ƯU CẢ HAI: Bỏ cả 5-4m và 1-0m (Chỉ đánh 4-3m, 3-2m, 2-1m)', allowedMinutes: ['4-3m', '3-2m', '2-1m'] },
];

for (const cfg of filterConfigs) {
  // Lọc signals
  const signals: { isWin: boolean; amountOut: number }[] = [];

  for (const round of sortedResults) {
    const validEntries = entries
      .filter(e => e.mtid === round.mtid && 
                   cfg.allowedMinutes.includes(e.minuteBucket) &&
                   e.favoriteOdds >= 0.85 && 
                   e.favoriteOdds < 0.90)
      .sort((a, b) => a.ts - b.ts);

    if (validEntries.length > 0) {
      const e = validEntries[0];
      const isWin = e.favoriteSide === round.winner;
      const amountOut = 0.98 / e.favoriteOdds;
      signals.push({ isWin, amountOut });
    }
  }

  // Chạy giả lập Martingale với Multiplier 4x, Cooldown 2 trận, Base $10, Vốn $1000
  let balance = 1000;
  const initial = balance;
  let stake = 10;
  const baseStake = 10;
  let cooldown = 0;
  let step = 1;
  const maxSteps = 2;
  let wins = 0;
  let losses = 0;
  let cutLossCount = 0;
  let maxDd = 0;
  let peak = balance;

  for (const s of signals) {
    if (cooldown > 0) {
      cooldown--;
      continue;
    }

    const bet = stake;
    if (s.isWin) {
      wins++;
      balance += bet * (s.amountOut - 1);
      stake = baseStake;
      step = 1;
    } else {
      losses++;
      balance -= bet;
      if (step < maxSteps) {
        step++;
        stake = baseStake * 4.0;
        cooldown = 2; // Cooldown 2 trận
      } else {
        cutLossCount++;
        step = 1;
        stake = baseStake;
        cooldown = 2;
      }
    }

    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDd) maxDd = dd;
  }

  const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100).toFixed(1) : '0';
  console.log(`\n📌 ${cfg.name}:`);
  console.log(`- Số lệnh đánh:   ${wins + losses} (Thắng: ${wins}, Thua: ${losses} | WinRate: ${winRate}%)`);
  console.log(`- Số lần Cắt Lỗ:  ${cutLossCount} lần`);
  console.log(`- Lãi ròng (PnL): $${(balance - initial).toFixed(2)}`);
  console.log(`- Max Drawdown:   $${maxDd.toFixed(2)}`);
}
