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

interface RoundSignal {
  mtid: number;
  minuteBucket: string;
  favoriteOdds: number;
  isWin: boolean;
  amountOut: number;
}

const signals: RoundSignal[] = [];

for (const round of sortedResults) {
  // Tìm entry chạm 85-90%
  const roundEntries = entries
    .filter(e => e.mtid === round.mtid && e.favoriteOdds >= 0.85 && e.favoriteOdds < 0.90)
    .sort((a, b) => a.ts - b.ts);

  if (roundEntries.length > 0) {
    const e = roundEntries[0];
    const isWin = e.favoriteSide === round.winner;
    const feeRate = 0.02;
    const amountOut = (1 - feeRate) / e.favoriteOdds;

    signals.push({
      mtid: round.mtid,
      minuteBucket: e.minuteBucket,
      favoriteOdds: e.favoriteOdds,
      isWin,
      amountOut,
    });
  }
}

// Thử nghiệm các biến thể chiến lược:
// Biến thể A: Đánh ở mọi phút
// Biến thể B: Chỉ đánh ở phút có EV cao (phút 5-4m, 2-1m, 1-0m)
console.log('--- TEST VỚI BỘ LỌC PHÚT CHO MỐC 85-90% ---');
for (const mb of ['ALL', 'SAFE_MINUTES']) {
  const filtered = mb === 'ALL' 
    ? signals 
    : signals.filter(s => s.minuteBucket === '5-4m' || s.minuteBucket === '2-1m' || s.minuteBucket === '1-0m');

  for (const mult of [2.0, 3.0, 4.0]) {
    let balance = 1000;
    const initial = balance;
    let stake = 10;
    const baseStake = 10;
    let cooldown = 0;
    let step = 1;
    const maxSteps = 2; // Tối đa gấp 2 bước: 10$ -> thua -> cooldown 2 -> 10$ * mult. Nếu thua tiếp -> Cắt lỗ reset về 10$
    let wins = 0;
    let losses = 0;
    let cutLossCount = 0;
    let maxDd = 0;
    let peak = balance;

    for (let i = 0; i < filtered.length; i++) {
      const s = filtered[i];
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
          stake = baseStake * mult;
          cooldown = 2; // Cooldown 2 trận
        } else {
          // Đã thua ở bước 2 -> Cắt lỗ, reset về bước 1
          cutLossCount++;
          step = 1;
          stake = baseStake;
          cooldown = 2; // Vẫn cooldown 2 trận để hồi tâm lý
        }
      }

      if (balance > peak) peak = balance;
      const dd = peak - balance;
      if (dd > maxDd) maxDd = dd;
    }

    console.log(`[${mb}] Multiplier: ${mult}x | Trades: ${wins+losses} | Wins: ${wins} (${(wins/(wins+losses)*100).toFixed(1)}%) | Losses: ${losses} | CutLoss: ${cutLossCount} | Net PnL: $${(balance - initial).toFixed(2)} | MaxDD: $${maxDd.toFixed(2)}`);
  }
}
