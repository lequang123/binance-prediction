import * as fs from 'fs';
import * as path from 'path';
import type { BacktestRunRecord } from './types';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const HISTORY_FILE = path.join(LOG_DIR, 'backtest_history.json');
const MAX_SAVED_RUNS = 100;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Đọc toàn bộ danh sách các phiên backtest đã lưu từ disk
 */
export function loadBacktestHistory(): BacktestRunRecord[] {
  try {
    ensureLogDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    if (!content.trim()) return [];
    const records = JSON.parse(content) as BacktestRunRecord[];
    return Array.isArray(records) ? records : [];
  } catch (err) {
    console.error('[BACKTEST STORAGE] Error reading history file:', err);
    return [];
  }
}

/**
 * Lưu 1 phiên backtest mới vào file (giữ tối đa 100 phiên gần nhất)
 */
export function saveBacktestRun(record: BacktestRunRecord): void {
  try {
    ensureLogDir();
    const existing = loadBacktestHistory();
    // Đưa bản ghi mới lên đầu
    const updated = [record, ...existing.filter((r) => r.id !== record.id)].slice(0, MAX_SAVED_RUNS);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('[BACKTEST STORAGE] Error saving backtest run:', err);
  }
}

/**
 * Lấy danh sách tóm tắt các lần chạy (lược bỏ mảng trades lớn để tối ưu tải trang và RAM)
 */
export function getBacktestHistorySummary(botId?: string): Omit<BacktestRunRecord, 'trades'>[] {
  const records = loadBacktestHistory();
  const filtered = botId ? records.filter((r) => r.botId === botId) : records;

  return filtered.map(({ trades, ...summary }) => summary);
}

/**
 * Lấy chi tiết đầy đủ của 1 phiên test bao gồm mảng trades
 */
export function getBacktestRunDetail(runId: string): BacktestRunRecord | null {
  const records = loadBacktestHistory();
  return records.find((r) => r.id === runId) || null;
}

/**
 * Xóa 1 phiên test theo ID
 */
export function deleteBacktestRun(runId: string): boolean {
  try {
    ensureLogDir();
    const records = loadBacktestHistory();
    const filtered = records.filter((r) => r.id !== runId);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[BACKTEST STORAGE] Error deleting backtest run:', err);
    return false;
  }
}

/**
 * Xóa toàn bộ lịch sử test
 */
export function clearAllBacktestHistory(): boolean {
  try {
    ensureLogDir();
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf-8');
    return true;
  } catch (err) {
    console.error('[BACKTEST STORAGE] Error clearing history:', err);
    return false;
  }
}
