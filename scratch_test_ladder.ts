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

// Lọc signals ở mốc 85-90%, áp dụng bộ lọc (bỏ phút đầu 5-4m, bỏ 35s cuối)
const signals: { mtid: number; isWin: boolean; amountOut: number; minuteBucket: string }[] = [];

for (const round of sortedResults) {
  const validEntries = entries
    .filter(e => e.mtid === round.mtid &&
      e.favoriteOdds >= 0.85 &&
      e.favoriteOdds < 0.90 &&
      e.minuteBucket !== '5-4m')
    .sort((a, b) => a.ts - b.ts);

  if (validEntries.length > 0) {
    const e = validEntries[0];
    const isWin = e.favoriteSide === round.winner;
    const amountOut = 0.98 / e.favoriteOdds; // ~ 1.126
    signals.push({ mtid: round.mtid, isWin, amountOut, minuteBucket: e.minuteBucket });
  }
}

console.log(`Tổng số round có tín hiệu thỏa mãn bộ lọc: ${signals.length}`);

// Test chuỗi bậc thang (Ladder Staking)
function testLadder(ladder: number[], cooldownRounds: number = 2) {
  let balance = 1000;
  const initial = balance;
  let step = 0; // index in ladder
  let cooldown = 0;
  let wins = 0;
  let losses = 0;
  let cutLosses = 0;
  let maxDd = 0;
  let peak = balance;
  const stepCounts = new Array(ladder.length).fill(0);
  const stepWins = new Array(ladder.length).fill(0);

  for (const s of signals) {
    if (cooldown > 0) {
      cooldown--;
      continue;
    }

    const bet = ladder[step];
    stepCounts[step]++;

    if (s.isWin) {
      wins++;
      stepWins[step]++;
      const profit = bet * (s.amountOut - 1);
      balance += profit;
      step = 0; // Reset về bậc 1
    } else {
      losses++;
      balance -= bet;
      if (step < ladder.length - 1) {
        step++;
        cooldown = cooldownRounds;
      } else {
        // Cắt lỗ ở bậc cuối cùng
        cutLosses++;
        step = 0;
        cooldown = cooldownRounds;
      }
    }

    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    ladder: ladder.join(' -> '),
    trades: wins + losses,
    wins,
    losses,
    winRate: ((wins / (wins + losses)) * 100).toFixed(1) + '%',
    netPnl: (balance - initial).toFixed(2),
    maxDd: maxDd.toFixed(2),
    cutLosses,
    stepCounts,
    stepWins,
  };
}

console.log('\n--- SO SÁNH CÁC CHUỖI TIỀN CƯỢC TRÊN 765 KỲ LOGS ---');

const laddersToTest = [
  [1, 6, 15, 40],       // Chuỗi bạn đề xuất
  [1, 4, 16],           // Hệ số x4.0 (3 bước)
  [1, 4],               // Hệ số x4.0 (2 bước)
  [1, 5, 20],           // Bậc tăng dần
  [1, 8],               // Bước 2 gỡ trọn vẹn
  [2, 8, 30],           // Khởi điểm 2$
];

for (const lad of laddersToTest) {
  const r = testLadder(lad, 2);
  console.log(`\nChuỗi [${r.ladder}]:`);
  console.log(`- Tổng lệnh: ${r.trades} | Thắng: ${r.wins} (${r.winRate}) | Thua: ${r.losses}`);
  console.log(`- Lãi ròng (Net PnL): $${r.netPnl} | Max Drawdown: $${r.maxDd}`);
  console.log(`- Số lần chạm cắt lỗ bậc cuối: ${r.cutLosses} lần`);
  for (let i = 0; i < lad.length; i++) {
    const w = r.stepWins[i];
    const t = r.stepCounts[i];
    const pct = t > 0 ? ((w / t) * 100).toFixed(1) : '0';
    console.log(`  + Bậc ${i + 1} ($${lad[i]}): Đánh ${t} lần | Thắng ${w} lần (${pct}%)`);
  }
}
