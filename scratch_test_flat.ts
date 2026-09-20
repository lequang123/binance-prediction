import * as fs from 'fs';
import * as path from 'path';

interface RoundResult {
  roundId: string;
  closePrice: number;
  lockPrice: number;
  outcome: 'UP' | 'DOWN';
  openTime: number;
  closeTime: number;
}

interface OddsBucketEntry {
  roundId: string;
  bucket: '5-4m' | '4-3m' | '3-2m' | '2-1m' | '1-0m';
  secondsRemaining: number;
  priceDistance: number;
  predictedDirection: 'UP' | 'DOWN';
  predictedOdds: number;
  payoutOdds: number;
  timestamp: number;
}

const LOGS_DIR = path.join(process.cwd(), 'logs');
const resultsPath = path.join(LOGS_DIR, 'round_results.jsonl');
const entriesPath = path.join(LOGS_DIR, 'odds_bucket_entries.jsonl');

const resultsMap = new Map<string, RoundResult>();
for (const line of fs.readFileSync(resultsPath, 'utf8').trim().split('\n')) {
  if (line.trim()) {
    const r = JSON.parse(line) as RoundResult;
    resultsMap.set(r.roundId, r);
  }
}

const entries: OddsBucketEntry[] = [];
for (const line of fs.readFileSync(entriesPath, 'utf8').trim().split('\n')) {
  if (line.trim()) {
    entries.push(JSON.parse(line) as OddsBucketEntry);
  }
}

console.log(`Loaded ${resultsMap.size} rounds, ${entries.length} entries.`);

// Test flat betting (đánh đều 10$)
// Conditions:
// Odds: 85-90%
// Time window: e.g. 2-1m (60s <= sec <= 120s)
// Price buffer: e.g. >= 15$, >= 20$
function testFlat(name: string, filterFn: (e: OddsBucketEntry) => boolean) {
  const STAKE = 10;
  let totalTrades = 0;
  let wins = 0;
  let losses = 0;
  let netPnL = 0;
  let maxDD = 0;
  let peakPnL = 0;

  // Group entries by roundId
  const roundEntries = new Map<string, OddsBucketEntry[]>();
  for (const e of entries) {
    if (!filterFn(e)) continue;
    if (!roundEntries.has(e.roundId)) roundEntries.set(e.roundId, []);
    roundEntries.get(e.roundId)!.push(e);
  }

  // Sort rounds chronologically
  const sortedRounds = Array.from(resultsMap.values()).sort((a, b) => a.openTime - b.openTime);

  for (const round of sortedRounds) {
    const rEntries = roundEntries.get(round.roundId);
    if (!rEntries || rEntries.length === 0) continue;

    // Pick entry (first matching entry in the window)
    const entry = rEntries[0];
    const isWin = entry.predictedDirection === round.outcome;

    totalTrades++;
    if (isWin) {
      wins++;
      const pnl = STAKE * entry.payoutOdds * 0.98; // minus 2% fee
      netPnL += pnl;
    } else {
      losses++;
      netPnL -= STAKE;
    }

    if (netPnL > peakPnL) peakPnL = netPnL;
    const dd = peakPnL - netPnL;
    if (dd > maxDD) maxDD = dd;
  }

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  console.log(`\n--- ${name} ---`);
  console.log(`Trades: ${totalTrades} | Win: ${wins} (${winRate.toFixed(2)}%) | Loss: ${losses}`);
  console.log(`Net PnL (Stake $10): $${netPnL.toFixed(2)} | Max DD: $${maxDD.toFixed(2)}`);
  return { totalTrades, winRate, netPnL, maxDD };
}

// 1. All minutes, Odds 85-90%, no buffer
testFlat('All minutes, Odds 85-90%, buffer 0', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90);

// 2. All minutes, Odds 85-90%, buffer >= 15
testFlat('All minutes, Odds 85-90%, buffer >= 15', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && Math.abs(e.priceDistance) >= 15);

// 3. Phút 2-1m (60s - 120s), Odds 85-90%, buffer 0
testFlat('Phút 2-1m (60s-120s), Odds 85-90%, buffer 0', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && e.secondsRemaining >= 60 && e.secondsRemaining <= 120);

// 4. Phút 2-1m (60s - 120s), Odds 85-90%, buffer >= 15
testFlat('Phút 2-1m (60s-120s), Odds 85-90%, buffer >= 15', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && e.secondsRemaining >= 60 && e.secondsRemaining <= 120 && Math.abs(e.priceDistance) >= 15);

// 5. Phút 2-1m (60s - 120s), Odds 85-90%, buffer >= 20
testFlat('Phút 2-1m (60s-120s), Odds 85-90%, buffer >= 20', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && e.secondsRemaining >= 60 && e.secondsRemaining <= 120 && Math.abs(e.priceDistance) >= 20);

// 6. Phút 3-2m (120s - 180s), Odds 85-90%, buffer >= 20
testFlat('Phút 3-2m (120s-180s), Odds 85-90%, buffer >= 20', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && e.secondsRemaining >= 120 && e.secondsRemaining <= 180 && Math.abs(e.priceDistance) >= 20);

// 7. Phút 2-1m + 1-0m (> 35s), Odds 85-90%, buffer >= 20 (tức là 35s - 120s)
testFlat('Phút 2-1m + chặn sát nút (35s-120s), Odds 85-90%, buffer >= 20', (e) => e.predictedOdds >= 0.85 && e.predictedOdds <= 0.90 && e.secondsRemaining >= 35 && e.secondsRemaining <= 120 && Math.abs(e.priceDistance) >= 20);
