// ============================================================
// JSONL Logger — Append-only log files for ML training
// ============================================================

import fs from 'fs';
import path from 'path';
import type { DetectedTrade, MarketSnapshot, CompactSnapshot } from './types';

// Use /tmp/logs on Vercel (read-only filesystem workaround), otherwise local logs dir
const LOGS_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'logs') 
  : path.join(process.cwd(), 'logs');

/**
 * Ensure logs directory exists.
 */
function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Get today's date string for file naming.
 */
function getDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Append a JSON line to a file.
 */
function appendJsonl(filename: string, data: unknown): void {
  // Logging to file disabled as requested
  return;
  /*
  ensureLogsDir();
  const filepath = path.join(LOGS_DIR, filename);
  const line = JSON.stringify(data) + '\n';
  fs.appendFileSync(filepath, line, 'utf-8');
  */
}

/**
 * Log a detected trade to trades_YYYY-MM-DD.jsonl
 */
export function logTrade(trade: DetectedTrade): void {
  const filename = `trades_${getDateString()}.jsonl`;
  appendJsonl(filename, {
    timestamp: trade.timestamp,
    marketId: trade.marketId,
    marketTitle: trade.marketTitle,
    side: trade.side,
    action: trade.action,
    sharesChange: trade.sharesChange,
    amountChange: round(trade.amountChange),
    fillPrice: round(trade.fillPrice, 6),
    marketOddsUp: trade.marketOddsUp,
    marketOddsDown: trade.marketOddsDown,
    payoutMultiplier: round(trade.payoutMultiplier),
    potentialWin: round(trade.potentialWin),
    cumUp: trade.cumUp
      ? {
          shares: round(trade.cumUp.shares),
          value: round(trade.cumUp.value),
          pnl: round(trade.cumUp.pnl),
          costBasis: round(trade.cumUp.costBasis),
        }
      : null,
    cumDown: trade.cumDown
      ? {
          shares: round(trade.cumDown.shares),
          value: round(trade.cumDown.value),
          pnl: round(trade.cumDown.pnl),
          costBasis: round(trade.cumDown.costBasis),
        }
      : null,
    hedgeRatio: round(trade.hedgeRatio, 4),
    totalInvested: round(trade.totalInvested),
    netPnl: round(trade.netPnl),
    strategyTag: trade.strategyTag,
  });
}

/**
 * Log a compact snapshot to snapshots_YYYY-MM-DD.jsonl
 */
export function logSnapshot(snapshot: MarketSnapshot): void {
  const filename = `snapshots_${getDateString()}.jsonl`;
  const compact: CompactSnapshot = {
    t: snapshot.timestamp,
    mid: snapshot.marketId,
    up: snapshot.up
      ? {
          s: round(snapshot.up.shares),
          v: round(snapshot.up.value),
          avg: round(snapshot.up.avgPrice, 6),
          cur: snapshot.up.currentPrice,
          pnl: round(snapshot.up.pnl),
        }
      : null,
    dn: snapshot.down
      ? {
          s: round(snapshot.down.shares),
          v: round(snapshot.down.value),
          avg: round(snapshot.down.avgPrice, 6),
          cur: snapshot.down.currentPrice,
          pnl: round(snapshot.down.pnl),
        }
      : null,
    hr: round(snapshot.hedgeRatio, 4),
  };
  appendJsonl(filename, compact);
}

/**
 * Round a number to a specified number of decimal places.
 */
function round(n: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
