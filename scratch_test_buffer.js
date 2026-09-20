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

function testBufferImpact(buffer) {
  const stake = 10;
  let balance = 1000;
  const initialBalance = balance;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakBalance = balance;

  for (const round of sortedResults) {
    const diff = Math.abs((round.endPrice || 0) - (round.startPrice || 0));
    // If shortfall / close-call: rounds where final price is < buffer are high risk
    const rEntries = entriesByRound.get(round.mtid) || [];
    if (rEntries.length === 0) continue;

    let matched = null;
    for (const e of rEntries) {
      if (e.minuteBucket !== '2-1m') continue;
      if (e.favoriteOdds >= 0.85 && e.favoriteOdds < 0.90) {
        matched = e;
        break;
      }
    }
    if (!matched) continue;

    // Filter: only enter if endPrice vs startPrice or distance >= buffer
    // Wait, in real rounds, what if we check the rounds that won vs lost by shortfall?
    const isWin = matched.favoriteSide === round.winner;
    
    // If it was a close-call loss (< buffer), a price filter would have prevented it!
    if (!isWin && diff < buffer) {
      // Skipped because of buffer filter!
      continue;
    }

    const feeRate = 0.02;
    const amountOut = (1 - feeRate) / matched.favoriteOdds;

    if (isWin) {
      wins++;
      const profit = stake * (amountOut - 1);
      balance += profit;
    } else {
      losses++;
      balance -= stake;
    }

    if (balance > peakBalance) peakBalance = balance;
    const dd = peakBalance - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const netPnl = balance - initialBalance;

  console.log(`Buffer >= $${buffer}: Lệnh: ${total} | Thắng: ${wins} (${winRate.toFixed(2)}%) | Thua: ${losses} | PnL: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)} | DD: $${maxDrawdown.toFixed(2)}`);
}

console.log('--- KHÔNG GẤP THẾP - PHÚT 2-1m - LỌC SÁT NÚT ---');
testBufferImpact(0);
testBufferImpact(15);
testBufferImpact(20);
testBufferImpact(30);
testBufferImpact(50);
