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

function runBacktest(config) {
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

    const roundEntries = entriesByRound.get(round.mtid) || [];
    if (roundEntries.length === 0) continue;

    let matchedEntry = null;
    let targetSide = 'Up';
    let targetOdds = 0;

    for (const e of roundEntries) {
      const timeRemaining = e.minuteBucket === '5-4m' ? 270 :
                            e.minuteBucket === '4-3m' ? 210 :
                            e.minuteBucket === '3-2m' ? 150 :
                            e.minuteBucket === '2-1m' ? 90 : 30;

      if (timeRemaining < config.minTimeRemaining) continue;
      if (timeRemaining > config.maxTimeRemaining) continue;

      if (config.strategy === 'MARTINGALE_FAVORITE') {
        if (e.favoriteOdds >= config.oddsMin && e.favoriteOdds < config.oddsMax) {
          matchedEntry = e;
          targetSide = e.favoriteSide;
          targetOdds = e.favoriteOdds;
          break;
        }
      }
    }

    if (!matchedEntry || targetOdds <= 0) continue;

    const priceDiff = Math.abs((round.endPrice || 0) - (round.startPrice || 0));
    const isWin = targetSide === round.winner;
    if (!isWin && config.minPriceBuffer > 0 && priceDiff < config.minPriceBuffer) {
      continue;
    }

    const amountOut = 1 / targetOdds;
    const bet = config.baseStake;

    if (isWin) {
      wins++;
      const profit = bet * (amountOut - 1);
      balance += profit;
    } else {
      losses++;
      balance -= bet;
      cooldown = config.cooldownRounds;
    }

    if (balance > peakBalance) peakBalance = balance;
    const dd = peakBalance - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const netPnl = balance - initialBalance;
  console.log(`\nCấu hình: ${config.name}`);
  console.log(`Khung thời gian: ${config.minTimeRemaining}s - ${config.maxTimeRemaining}s | Buffer: >=$${config.minPriceBuffer}`);
  console.log(`Lệnh: ${total} | Thắng: ${wins} (${winRate.toFixed(1)}%) | Thua: ${losses}`);
  console.log(`Net PnL (Cược đều $${config.baseStake}): ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} | Max DD: $${maxDrawdown.toFixed(2)}`);
}

// 1. Phút 2-1m (60s-120s), Buffer $20, Đánh đều 10$, Cooldown 1
runBacktest({
  name: 'Đánh Đều Phút 2-1m (60s-120s) | Buffer $20 | Cooldown 1',
  strategy: 'MARTINGALE_FAVORITE',
  baseStake: 10,
  oddsMin: 0.85,
  oddsMax: 0.90,
  cooldownRounds: 1,
  minTimeRemaining: 60,
  maxTimeRemaining: 120,
  minPriceBuffer: 20,
});

// 2. Phút 2-1m (60s-120s), Buffer $15, Đánh đều 10$, Cooldown 1
runBacktest({
  name: 'Đánh Đều Phút 2-1m (60s-120s) | Buffer $15 | Cooldown 1',
  strategy: 'MARTINGALE_FAVORITE',
  baseStake: 10,
  oddsMin: 0.85,
  oddsMax: 0.90,
  cooldownRounds: 1,
  minTimeRemaining: 60,
  maxTimeRemaining: 120,
  minPriceBuffer: 15,
});

// 3. Phút 3-2m (120s-180s), Buffer $20, Đánh đều 10$, Cooldown 1
runBacktest({
  name: 'Đánh Đều Phút 3-2m (120s-180s) | Buffer $20 | Cooldown 1',
  strategy: 'MARTINGALE_FAVORITE',
  baseStake: 10,
  oddsMin: 0.85,
  oddsMax: 0.90,
  cooldownRounds: 1,
  minTimeRemaining: 120,
  maxTimeRemaining: 180,
  minPriceBuffer: 20,
});
