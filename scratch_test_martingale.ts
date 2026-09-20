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

const resultMap = new Map<number, RoundResult>();
for (const r of results) {
  resultMap.set(r.mtid, r);
}

// Lọc các kỳ có xuất hiện mốc 85-90%
// Sắp xếp các round theo thứ tự thời gian
const sortedResults = [...results].sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

// Tìm xem mỗi round có entry 85-90% không (lấy entry đầu tiên chạm 85-90% trong round đó)
interface RoundSignal {
  mtid: number;
  startDate: number;
  favoriteSide: 'Up' | 'Down';
  favoriteOdds: number;
  winner: 'Up' | 'Down';
  isWin: boolean;
  amountOut: number;
}

const roundSignals: RoundSignal[] = [];

for (const round of sortedResults) {
  const roundEntries = entries
    .filter(e => e.mtid === round.mtid && e.favoriteOdds >= 0.85 && e.favoriteOdds < 0.90)
    .sort((a, b) => a.ts - b.ts);

  if (roundEntries.length > 0) {
    const firstEntry = roundEntries[0];
    const isWin = firstEntry.favoriteSide === round.winner;
    const feeRate = 0.02;
    const amountOut = (1 - feeRate) / firstEntry.favoriteOdds; // ~ 0.98 / 0.875 = 1.12

    roundSignals.push({
      mtid: round.mtid,
      startDate: round.startDate,
      favoriteSide: firstEntry.favoriteSide,
      favoriteOdds: firstEntry.favoriteOdds,
      winner: round.winner,
      isWin,
      amountOut,
    });
  }
}

console.log(`Tìm thấy ${roundSignals.length} rounds chạm mốc Odds 85-90% (trên tổng số ${sortedResults.length} rounds)`);
const totalWins = roundSignals.filter(s => s.isWin).length;
console.log(`Winrate mốc 85-90%: ${(totalWins / roundSignals.length * 100).toFixed(2)}% (${totalWins}/${roundSignals.length})`);

// Mô phỏng chiến lược:
// Base Stake = $10
// Nếu THUA: Cooldown 2 trận (bỏ qua 2 round kế tiếp có tín hiệu), sau đó cược gấp thếp ở round thứ 3.
// Nếu THẮNG: Reset về Base Stake.

function simulateStrategy(baseStake: number, martingaleMultiplier: number) {
  let balance = 1000;
  const initialBalance = balance;
  let currentStake = baseStake;
  let cooldownCounter = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakBalance = balance;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;

  for (let i = 0; i < roundSignals.length; i++) {
    const sig = roundSignals[i];

    if (cooldownCounter > 0) {
      cooldownCounter--;
      continue; // Bỏ qua do đang cooldown
    }

    trades++;
    const betAmount = currentStake;

    if (sig.isWin) {
      wins++;
      const profit = betAmount * (sig.amountOut - 1);
      balance += profit;
      currentStake = baseStake; // Reset về ban đầu
      consecutiveLosses = 0;
    } else {
      losses++;
      balance -= betAmount;
      consecutiveLosses++;
      if (consecutiveLosses > maxConsecutiveLosses) {
        maxConsecutiveLosses = consecutiveLosses;
      }
      currentStake = betAmount * martingaleMultiplier; // Gấp thếp
      cooldownCounter = 2; // Cooldown 2 trận tiếp theo
    }

    if (balance > peakBalance) {
      peakBalance = balance;
    }
    const dd = peakBalance - balance;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }
  }

  return {
    baseStake,
    multiplier: martingaleMultiplier,
    trades,
    wins,
    losses,
    winRate: (wins / trades * 100).toFixed(1) + '%',
    finalBalance: balance.toFixed(2),
    netProfit: (balance - initialBalance).toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    maxConsecutiveLosses,
  };
}

console.log('\n--- KẾT QUẢ BACKTEST VỚI CÁC HỆ SỐ GẤP THẾP (BASE $10, VỐN $1000) ---');
console.log('Multiplier | Trades | Wins | Losses | WinRate | Net PnL | Max Drawdown | Max Loss Streak');
console.log('--------------------------------------------------------------------------------------');

for (const mult of [1.5, 2.0, 2.5, 3.0, 4.0, 5.0]) {
  const res = simulateStrategy(10, mult);
  console.log(`${mult.toFixed(1).padStart(10)} | ${String(res.trades).padStart(6)} | ${String(res.wins).padStart(4)} | ${String(res.losses).padStart(6)} | ${res.winRate.padStart(7)} | $${res.netProfit.padStart(7)} | $${res.maxDrawdown.padStart(12)} | ${String(res.maxConsecutiveLosses).padStart(15)}`);
}

// Phân tích các ca thua sau cooldown:
console.log('\n--- KIỂM TRA: SAU KHI THUA VÀ COOLDOWN 2 TRẬN, TRẬN TIẾP THEO KẾT QUẢ RA SAO? ---');
let afterCooldownTotal = 0;
let afterCooldownWins = 0;

for (let i = 0; i < roundSignals.length; i++) {
  if (!roundSignals[i].isWin) {
    // Round i bị THUA. Cooldown 2 round tiếp theo (i+1, i+2).
    // Round sau cooldown là i+3:
    if (i + 3 < roundSignals.length) {
      afterCooldownTotal++;
      if (roundSignals[i + 3].isWin) {
        afterCooldownWins++;
      }
    }
  }
}

console.log(`Số lần kích hoạt cược sau cooldown: ${afterCooldownTotal}`);
console.log(`Số lần THẮNG ngay sau cooldown: ${afterCooldownWins} (${(afterCooldownWins / afterCooldownTotal * 100).toFixed(1)}%)`);
console.log(`Số lần THUA tiếp sau cooldown: ${afterCooldownTotal - afterCooldownWins} (${((afterCooldownTotal - afterCooldownWins) / afterCooldownTotal * 100).toFixed(1)}%)`);
