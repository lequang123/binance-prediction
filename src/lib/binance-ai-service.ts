// ============================================================
// Binance Official AI Analysis Collector & Performance Tracker
// Endpoint: https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/web/market/ai-analysis
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type {
  AiPredictionRecord,
  BinanceAiStats,
  AiIndicatorItem,
} from './types';

const AI_ANALYSIS_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/web/market/ai-analysis';

const HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  'clienttype': 'web',
  'lang': 'vi',
};

function ensureLogDir(): string {
  const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
  if (!fs.existsSync(/*turbopackIgnore: true*/ logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function getLogFilePath(): string {
  return path.join(ensureLogDir(), 'binance_ai_predictions.jsonl');
}

// Global Singleton State
interface GlobalAiServiceState {
  records: Map<number, AiPredictionRecord>;
  latestMtid: number | null;
  isInitialized: boolean;
}

const g = globalThis as unknown as { __binanceAiState?: GlobalAiServiceState };
if (!g.__binanceAiState) {
  g.__binanceAiState = {
    records: new Map(),
    latestMtid: null,
    isInitialized: false,
  };
}

const state = g.__binanceAiState;

/**
 * Load saved predictions from disk
 */
export function initAiStorage(): void {
  if (state.isInitialized) return;
  state.isInitialized = true;

  try {
    const filePath = getLogFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const rec: AiPredictionRecord = JSON.parse(line);
          if (rec.mtid) {
            state.records.set(rec.mtid, rec);
            if (!state.latestMtid || rec.ts > (state.records.get(state.latestMtid)?.ts || 0)) {
              state.latestMtid = rec.mtid;
            }
          }
        } catch { }
      }
      console.log(`[BINANCE AI] 📂 Đã tải ${state.records.size} bản ghi dự đoán AI từ file log.`);
    }
  } catch (err) {
    console.error('[BINANCE AI] Lỗi đọc file log AI:', err);
  }
}

/**
 * Persist records to disk
 */
function flushRecordsToDisk(): void {
  try {
    const filePath = getLogFilePath();
    const sorted = Array.from(state.records.values()).sort((a, b) => a.ts - b.ts);
    const content = sorted.map((r) => JSON.stringify(r)).join('\n') + (sorted.length ? '\n' : '');
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (err) {
    console.error('[BINANCE AI] Lỗi ghi file log AI:', err);
  }
}

/**
 * Fetch official AI analysis from Binance for a specific market
 */
export async function fetchAiAnalysisForMarket(
  marketTopicId: number,
  context?: {
    upPrice?: number;
    downPrice?: number;
    startPrice?: number;
  }
): Promise<AiPredictionRecord | null> {
  initAiStorage();

  // If already fetched and has recommendation, return cached
  const existing = state.records.get(marketTopicId);
  if (existing && existing.direction) {
    return existing;
  }

  try {
    const res = await fetch(AI_ANALYSIS_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ marketTopicId }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[BINANCE AI] API trả về status ${res.status} cho kỳ ${marketTopicId}`);
      return null;
    }

    const json = (await res.json()) as any;
    if (!json.success || !json.data) {
      return null;
    }

    const analyses = json.data?.analyses;
    if (!Array.isArray(analyses) || analyses.length === 0) {
      return null;
    }

    const item = analyses[0];
    const recData = item.recommendation;
    const resultData = item.result;
    if (!recData || !recData.direction) {
      return null;
    }

    const rawDir = String(recData.direction).toUpperCase();
    const direction: 'Up' | 'Down' = rawDir === 'UP' ? 'Up' : 'Down';
    const confidence: string = recData.confidence ? String(recData.confidence).toLowerCase() : 'low';
    const reasoning: string = recData.reasoning || resultData?.reason || '';
    const summary: string = resultData?.summary || '';

    // Outcomes
    const outcomes: any[] = Array.isArray(resultData?.outcomes) ? resultData.outcomes : [];
    const upOutcome = outcomes.find((o) => o.name === 'Up');
    const dnOutcome = outcomes.find((o) => o.name === 'Down');

    const aiProbUp = Number(upOutcome?.aiProb ?? 50);
    const aiProbDown = Number(dnOutcome?.aiProb ?? 50);
    const marketProbUp = Number(upOutcome?.marketProb ?? 50);
    const marketProbDown = Number(dnOutcome?.marketProb ?? 50);

    // Extract top indicator signals
    const indicators: AiIndicatorItem[] = [];
    if (Array.isArray(item.indicatorGroups)) {
      for (const group of item.indicatorGroups) {
        if (Array.isArray(group.items)) {
          for (const ind of group.items) {
            indicators.push({
              name: ind.name || group.group || 'Indicator',
              value: ind.value || null,
              signal: ind.signal || null,
              impact: ind.impact || 'neutral',
              summary: ind.summary || '',
            });
          }
        }
      }
    }

    const oddsAtSignal =
      direction === 'Up'
        ? context?.upPrice ?? (marketProbUp > 0 ? marketProbUp / 100 : 0.5)
        : context?.downPrice ?? (marketProbDown > 0 ? marketProbDown / 100 : 0.5);

    const record: AiPredictionRecord = {
      mtid: marketTopicId,
      ts: Date.now(),
      direction,
      confidence,
      summary,
      reasoning,
      aiProbUp,
      aiProbDown,
      marketProbUp,
      marketProbDown,
      startPrice: context?.startPrice,
      targetPrice: item.question?.match(/\$([0-9,.]+)/)?.[1],
      indicators: indicators.slice(0, 8),
      oddsAtSignal,
    };

    state.records.set(marketTopicId, record);
    state.latestMtid = marketTopicId;
    flushRecordsToDisk();

    console.log(
      `[BINANCE AI] 🤖 Nhận định kỳ #${marketTopicId}: Cửa ${direction.toUpperCase()} | Độ tự tin: ${confidence.toUpperCase()} | AI Prob: Up ${aiProbUp}% - Dn ${aiProbDown}%`
    );

    return record;
  } catch (err: any) {
    console.warn(`[BINANCE AI] Không thể lấy phân tích AI kỳ ${marketTopicId}:`, err?.message || err);
    return null;
  }
}

/**
 * Resolve AI prediction when round finishes
 */
export function resolveAiPrediction(
  marketTopicId: number,
  winner: 'Up' | 'Down',
  endPrice?: number
): void {
  initAiStorage();

  const record = state.records.get(marketTopicId);
  if (!record) {
    return;
  }

  // Already resolved with same winner
  if (record.winner && record.winner === winner) {
    return;
  }

  record.winner = winner;
  record.endPrice = endPrice;
  record.resolvedAt = Date.now();
  record.isWin = record.direction.toLowerCase() === winner.toLowerCase();

  // Calculate simulated PnL for $1 bet
  const odds = record.oddsAtSignal && record.oddsAtSignal > 0.05 ? record.oddsAtSignal : 0.5;
  if (record.isWin) {
    record.simulatedPnl = Number(((1 / odds) - 1).toFixed(4));
  } else {
    record.simulatedPnl = -1.0;
  }

  state.records.set(marketTopicId, record);
  flushRecordsToDisk();

  console.log(
    `[BINANCE AI] 🎯 Đối soát Kỳ #${marketTopicId}: AI chọn ${record.direction} vs Thực tế ${winner} -> ${record.isWin ? '✅ THẮNG (+$' + record.simulatedPnl.toFixed(2) + ')' : '❌ THUA (-$1.00)'
    }`
  );
}

/**
 * Compute aggregate statistics of Binance AI
 */
export function getBinanceAiStats(): BinanceAiStats {
  initAiStorage();

  const allRecords = Array.from(state.records.values()).sort((a, b) => a.ts - b.ts);
  const resolved = allRecords.filter((r) => r.winner !== undefined && r.isWin !== undefined);

  let wins = 0;
  let losses = 0;
  let simulatedNetPnl = 0;

  let currentStreakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  let currentStreakCount = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  let curWinStreak = 0;
  let curLossStreak = 0;

  const confidenceStats = {
    low: { total: 0, wins: 0, winRate: 0, pnl: 0 },
    medium: { total: 0, wins: 0, winRate: 0, pnl: 0 },
    high: { total: 0, wins: 0, winRate: 0, pnl: 0 },
  };

  const directionStats = {
    up: { total: 0, wins: 0, winRate: 0 },
    down: { total: 0, wins: 0, winRate: 0 },
  };

  const contrarianStats = {
    total: 0,
    wins: 0,
    winRate: 0,
    pnl: 0,
  };

  for (const r of resolved) {
    const isWin = !!r.isWin;
    const pnl = r.simulatedPnl ?? (isWin ? 1 : -1);
    simulatedNetPnl += pnl;

    if (isWin) {
      wins++;
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
    } else {
      losses++;
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
    }

    // Confidence
    const confKey = (r.confidence || 'low').toLowerCase() as 'low' | 'medium' | 'high';
    if (confidenceStats[confKey]) {
      confidenceStats[confKey].total++;
      if (isWin) confidenceStats[confKey].wins++;
      confidenceStats[confKey].pnl += pnl;
    }

    // Direction
    const dirKey = r.direction.toLowerCase() as 'up' | 'down';
    if (directionStats[dirKey]) {
      directionStats[dirKey].total++;
      if (isWin) directionStats[dirKey].wins++;
    }

    // Contrarian check: AI chose Up while Market favored Down (>52%), or vice versa
    const isContrarian =
      (r.direction === 'Up' && r.marketProbDown > 52) ||
      (r.direction === 'Down' && r.marketProbUp > 52);

    if (isContrarian) {
      contrarianStats.total++;
      if (isWin) contrarianStats.wins++;
      contrarianStats.pnl += pnl;
    }
  }

  // Calculate current streak
  if (resolved.length > 0) {
    const last = resolved[resolved.length - 1];
    currentStreakType = last.isWin ? 'WIN' : 'LOSS';
    let count = 0;
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i].isWin === last.isWin) {
        count++;
      } else {
        break;
      }
    }
    currentStreakCount = count;
  }

  const totalEvaluated = resolved.length;
  const winRate = totalEvaluated > 0 ? wins / totalEvaluated : 0;
  const simulatedRoiPct = totalEvaluated > 0 ? (simulatedNetPnl / totalEvaluated) * 100 : 0;

  // Finalize winrates for breakdowns
  for (const k of ['low', 'medium', 'high'] as const) {
    const c = confidenceStats[k];
    c.winRate = c.total > 0 ? c.wins / c.total : 0;
  }

  directionStats.up.winRate = directionStats.up.total > 0 ? directionStats.up.wins / directionStats.up.total : 0;
  directionStats.down.winRate = directionStats.down.total > 0 ? directionStats.down.wins / directionStats.down.total : 0;
  contrarianStats.winRate = contrarianStats.total > 0 ? contrarianStats.wins / contrarianStats.total : 0;

  // Latest prediction
  let latestPrediction: AiPredictionRecord | null = null;
  if (state.latestMtid && state.records.has(state.latestMtid)) {
    latestPrediction = state.records.get(state.latestMtid)!;
  } else if (allRecords.length > 0) {
    latestPrediction = allRecords[allRecords.length - 1];
  }

  // Recent predictions (newest first, max 50)
  const recentPredictions = [...allRecords].reverse().slice(0, 50);

  return {
    totalEvaluated,
    resolvedCount: resolved.length,
    wins,
    losses,
    winRate,
    currentStreak: { type: currentStreakType, count: currentStreakCount },
    maxWinStreak,
    maxLossStreak,
    simulatedNetPnl: Number(simulatedNetPnl.toFixed(2)),
    simulatedRoiPct: Number(simulatedRoiPct.toFixed(2)),
    confidenceStats,
    directionStats,
    contrarianStats,
    latestPrediction,
    recentPredictions,
  };
}
