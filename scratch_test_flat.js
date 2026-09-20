const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(process.cwd(), 'logs');
const resultsPath = path.join(LOGS_DIR, 'round_results.jsonl');
const entriesPath = path.join(LOGS_DIR, 'odds_bucket_entries.jsonl');

const results = [];
for (const line of fs.readFileSync(resultsPath, 'utf8').trim().split('\n')) {
  if (line.trim()) results.push(JSON.parse(line));
}

const entries = [];
for (const line of fs.readFileSync(entriesPath, 'utf8').trim().split('\n')) {
  if (line.trim()) entries.push(JSON.parse(line));
}

const entriesByRound = new Map();
for (const e of entries) {
  const list = entriesByRound.get(e.mtid) || [];
  list.push(e);
  entriesByRound.set(e.mtid, list);
}

const sortedResults = results.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

function runFlatTest(opts) {
  const {
    name,
    minTimeRemaining = 60, // e.g. 2-1m = 60s
    maxTimeRemaining = 120, // e.g. 2-1m = 120s
    oddsMin = 0.85,
    oddsMax = 0.90,
    minPriceBuffer = 0, // e.g. 15, 20
    targetMinutes = null, // e.g. ['2-1m']
    stake = 10,
    cooldownRounds = 0,
  } = opts;

  let balance = 1000;
  const initialBalance = balance;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakBalance = balance;
  let cooldown = 0;

  for (const round of sortedResults) {
    if (cooldown > 0) {
      cooldown--;
      continue;
    }

    const rEntries = entriesByRound.get(round.mtid) || [];
    if (rEntries.length === 0) continue;

    let matched = null;
    for (const e of rEntries) {
      if (targetMinutes && !targetMinutes.includes(e.minuteBucket)) continue;

      const timeRemaining = e.minuteBucket === '5-4m' ? 270 :
                            e.minuteBucket === '4-3m' ? 210 :
                            e.minuteBucket === '3-2m' ? 150 :
                            e.minuteBucket === '2-1m' ? 90 : 30;

      if (timeRemaining < minTimeRemaining || timeRemaining > maxTimeRemaining) continue;

      if (minPriceBuffer > 0) {
        // Price distance at round start to end or buffer
        const diff = Math.abs((round.endPrice || 0) - (round.startPrice || 0));
        // If the round outcome price diff was close-call < buffer
        // (In live trading, this is currentPrice - startPrice >= buffer)
      }

      if (e.favoriteOdds >= oddsMin && e.favoriteOdds < oddsMax) {
        matched = e;
        break;
      }
    }

    if (!matched) continue;

    const isWin = matched.favoriteSide === round.winner;
    const feeRate = 0.02;
    const amountOut = (1 - feeRate) / matched.favoriteOdds;

    if (isWin) {
      wins++;
      const profit = stake * (amountOut - 1);
      balance += profit;
    } else {
      losses++;
      balance -= stake;
      if (cooldownRounds > 0) {
        cooldown = cooldownRounds;
      }
    }

    if (balance > peakBalance) peakBalance = balance;
    const dd = peakBalance - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const netPnl = balance - initialBalance;

  console.log(`\n========================================`);
  console.log(`🔹 ${name}`);
  console.log(`Lệnh: ${total} | Thắng: ${wins} (${winRate.toFixed(2)}%) | Thua: ${losses}`);
  console.log(`Lợi nhuận ròng (Stake $${stake}): ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} | Max DD: $${maxDrawdown.toFixed(2)}`);
  return { total, winRate, netPnl, maxDrawdown };
}

// 1. Phút 2-1m (90s còn lại), Odds 85-90% - KHÔNG GẤP THẾP
runFlatTest({
  name: 'Phút 2-1m | Cố định 10$ | Không gấp thếp | Cooldown 0',
  targetMinutes: ['2-1m'],
  minTimeRemaining: 30,
  maxTimeRemaining: 150,
  oddsMin: 0.85,
  oddsMax: 0.90,
  stake: 10,
  cooldownRounds: 0,
});

// 2. Phút 2-1m, Odds 85-90% - Cooldown 2 trận sau thua
runFlatTest({
  name: 'Phút 2-1m | Cố định 10$ | Cooldown 2 trận sau thua',
  targetMinutes: ['2-1m'],
  minTimeRemaining: 30,
  maxTimeRemaining: 150,
  oddsMin: 0.85,
  oddsMax: 0.90,
  stake: 10,
  cooldownRounds: 2,
});

// 3. Phút 3-2m (150s còn lại), Odds 85-90%
runFlatTest({
  name: 'Phút 3-2m | Cố định 10$ | Cooldown 2',
  targetMinutes: ['3-2m'],
  minTimeRemaining: 100,
  maxTimeRemaining: 200,
  oddsMin: 0.85,
  oddsMax: 0.90,
  stake: 10,
  cooldownRounds: 2,
});

// 4. Cả phút 3-2m và 2-1m (1-3 phút cuối), Odds 85-90%
runFlatTest({
  name: 'Phút 3-2m và 2-1m (1-3m cuối) | Cố định 10$ | Cooldown 2',
  targetMinutes: ['3-2m', '2-1m'],
  minTimeRemaining: 60,
  maxTimeRemaining: 200,
  oddsMin: 0.85,
  oddsMax: 0.90,
  stake: 10,
  cooldownRounds: 2,
});

// 5. Thử với Odds 80-85% ở phút 2-1m
runFlatTest({
  name: 'Phút 2-1m | Odds 80-85% (Payout cao hơn) | Cooldown 2',
  targetMinutes: ['2-1m'],
  minTimeRemaining: 30,
  maxTimeRemaining: 150,
  oddsMin: 0.80,
  oddsMax: 0.85,
  stake: 10,
  cooldownRounds: 2,
});

// 6. Thử với Odds 90-95% ở phút 2-1m
runFlatTest({
  name: 'Phút 2-1m | Odds 90-95% (Siêu chắc) | Cooldown 2',
  targetMinutes: ['2-1m'],
  minTimeRemaining: 30,
  maxTimeRemaining: 150,
  oddsMin: 0.90,
  oddsMax: 0.95,
  stake: 10,
  cooldownRounds: 2,
});
