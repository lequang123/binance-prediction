import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { MockTrader } from '../src/lib/mock-trader';
import type { DetectedTrade } from '../src/lib/types';

async function runBacktest() {
  console.log('--- STARTING BACKTEST ---');

  const logFilePath = path.join(__dirname, '../logs/trades_2026-08-27.jsonl');

  if (!fs.existsSync(logFilePath)) {
    console.error(`Log file not found: ${logFilePath}`);
    process.exit(1);
  }

  // Initialize a mock trader with $1000
  const trader = new MockTrader(1000);

  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let tradeCount = 0;

  let currentMarketId: number | null = null;
  let lastOdds: { up: number, down: number } | null = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const trade: DetectedTrade = JSON.parse(line);

      // If marketId changed, settle the old market immediately
      if (currentMarketId && trade.marketId !== currentMarketId) {
        let guessedWinner: 'Up' | 'Down' | 'Refund' = 'Refund';
        if (lastOdds) {
          if (lastOdds.up > lastOdds.down) guessedWinner = 'Up';
          else if (lastOdds.down > lastOdds.up) guessedWinner = 'Down';
        }
        trader.settleMarket(currentMarketId, guessedWinner);
      }

      currentMarketId = trade.marketId;

      // Process the copy trade signal (Cost / 10 is inside processSignal)
      trader.processSignal(trade);
      tradeCount++;

      // Keep track of the latest odds to guess the winner when it closes
      lastOdds = {
        up: trade.marketOddsUp,
        down: trade.marketOddsDown
      };

    } catch (e) {
      console.error('Error parsing line:', e);
    }
  }

  // Settle the very last market in the file
  if (currentMarketId && lastOdds) {
    let guessedWinner: 'Up' | 'Down' | 'Refund' = 'Refund';
    if (lastOdds.up > lastOdds.down) guessedWinner = 'Up';
    else if (lastOdds.down > lastOdds.up) guessedWinner = 'Down';
    trader.settleMarket(currentMarketId, guessedWinner);
  }

  console.log(`\nProcessed ${tradeCount} historical trades.`);

  const stats = trader.getStats();

  console.log('\n--- PER MARKET SUMMARY ---');
  let tableOutput = 'Market ID | Invested | Won | Lost | Net PnL | Result\n';
  tableOutput += '----------------------------------------------------------\n';
  
  for (const sum of stats.marketSummaries) {
    // Only show markets we actually invested in
    if (sum.invested > 0) {
      const pnlSign = sum.netProfit >= 0 ? '+' : '';
      const pnlStr = `${pnlSign}$${sum.netProfit.toFixed(2)}`;
      tableOutput += `${sum.marketId} | $${sum.invested.toFixed(2).padStart(6)} | $${sum.won.toFixed(2).padStart(5)} | $${sum.lost.toFixed(2).padStart(5)} | ${pnlStr.padStart(8)} | ${sum.winner}\n`;
    }
  }
  console.log(tableOutput);

  console.log('--- OVERALL RESULTS ---');
  console.log(`Initial Balance: $1000.00`);
  console.log(`Final Balance: $${stats.currentBalance.toFixed(2)}`);
  console.log(`Open Positions: ${stats.openPositionsCount} (Unrealized Cost: $${stats.totalUnrealizedCost.toFixed(2)})`);
  console.log(`Total Trades Executed: ${stats.tradeCount}`);
  console.log(`Total Invested: $${stats.totalInvested.toFixed(2)}`);
  console.log(`Total Won: $${stats.totalWon.toFixed(2)}`);
  console.log(`Total Lost: $${stats.totalLost.toFixed(2)}`);

  const pnlColor = stats.netProfit >= 0 ? '\x1b[32m' : '\x1b[31m'; // Green/Red
  console.log(`Net Profit: ${pnlColor}$${stats.netProfit.toFixed(2)}\x1b[0m`);
}

runBacktest().catch(console.error);
