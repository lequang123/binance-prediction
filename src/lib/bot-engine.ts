// ============================================================
// Bot Engine — Multi-Bot Management, Evaluation & Instant Backtest
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type {
  BotConfig,
  BotRuntimeState,
  BacktestResult,
  BacktestTradeItem,
  BotTradeLog,
  RoundResult,
  RoundOddsBucketEntry,
  OddsSnapshot,
  TradingSession,
  RealisticBacktestOptions,
} from './types';
import { getTradingSession } from './odds-stats';
import {
  run5mPredictionEngine,
  sharedCandleCache,
  type CandleOHLCV,
} from './standalone5mEngine';

const CONFIG_FILE = path.join(process.cwd(), '.bots_config.json');
const STATE_FILE = path.join(process.cwd(), '.bots_state.json');
const LOG_FILE = path.join(process.cwd(), 'logs', 'bots_activity.jsonl');

// Bộ nhớ đệm lưu đỉnh Odds của từng kỳ để phục vụ chiến thuật Trap Traders
export const roundPeakOddsMap = new Map<number, { peakOdds: number; peakSide: 'Up' | 'Down'; peakTr: number }>();

// ── Default Preset Bots ──
export const DEFAULT_PRESET_BOTS: BotConfig[] = [
  {
    id: 'bot_trap_traders',
    name: '🪤 Bot Săn Bẫy Trader (Trap 90% -> Đảo $15 Phút Chót)',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'TRAP_TRADERS',
    stakeMode: 'FLAT',
    baseStake: 10,
    multiplier: 1.0,
    maxSteps: 1,
    maxDailyLoss: 50,
    oddsMin: 0.50,
    oddsMax: 0.85,
    trapPeakOddsMin: 0.90,
    trapMinPriceReversal: 15,
    trapMaxOdds: 0.85,
    sessions: ['all'],
    targetMinutes: ['1-0m'],
    minTimeRemaining: 15,
    maxTimeRemaining: 60,
    minPriceBuffer: 15,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'bot_flat_2_1m',
    name: '🛡️ Bot Đánh Đều Phút 2-1m (Win 94.8%)',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'MARTINGALE_FAVORITE',
    stakeMode: 'FLAT',
    baseStake: 10,
    multiplier: 1.0,
    maxSteps: 1,
    maxDailyLoss: 50,
    oddsMin: 0.85,
    oddsMax: 0.90,
    sessions: ['all'],
    targetMinutes: ['2-1m'],
    minTimeRemaining: 60,
    maxTimeRemaining: 120,
    minPriceBuffer: 20,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'bot_flat_1_0m',
    name: '⚡ Bot Đánh Đều Phút 1-0m (Win 91.4%)',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'MARTINGALE_FAVORITE',
    stakeMode: 'FLAT',
    baseStake: 10,
    multiplier: 1.0,
    maxSteps: 1,
    maxDailyLoss: 50,
    targetOddsBuckets: ['85-90'],
    oddsMin: 0.85,
    oddsMax: 0.90,
    sessions: ['all'],
    targetMinutes: ['1-0m'],
    minTimeRemaining: 35,
    maxTimeRemaining: 60,
    minPriceBuffer: 20,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'bot_ladder_1_6_15_40',
    name: '👑 Bot Thần Tốc 1$ - 6$ - 15$ - 40$',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'MARTINGALE_FAVORITE',
    stakeMode: 'CUSTOM_LADDER',
    baseStake: 1,
    multiplier: 4.0,
    maxSteps: 4,
    customLadder: [1, 6, 15, 40],
    maxDailyLoss: 65,
    oddsMin: 0.85,
    oddsMax: 0.90,
    sessions: ['all'],
    minTimeRemaining: 35,
    maxTimeRemaining: 240,
    minPriceBuffer: 20,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'bot_martingale_85_90',
    name: '🎯 Bot Gấp Thếp 85-90% An Toàn (2 Bước)',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'MARTINGALE_FAVORITE',
    stakeMode: 'MARTINGALE',
    baseStake: 10,
    multiplier: 4.0,
    maxSteps: 2,
    maxDailyLoss: 100,
    oddsMin: 0.85,
    oddsMax: 0.90,
    sessions: ['all'],
    minTimeRemaining: 35,
    maxTimeRemaining: 240,
    minPriceBuffer: 20,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'bot_underdog_hunter',
    name: '🏹 Bot Săn Lật Kèo Payout Khủng (3-2m)',
    enabled: false,
    mode: 'SIMULATOR',
    strategy: 'UNDERDOG_HUNTER',
    stakeMode: 'MARTINGALE',
    baseStake: 5,
    multiplier: 2.0,
    maxSteps: 3,
    maxDailyLoss: 50,
    oddsMin: 0.05,
    oddsMax: 0.20,
    sessions: ['all'],
    targetMinutes: ['3-2m'],
    minTimeRemaining: 120,
    maxTimeRemaining: 180,
    minPriceBuffer: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ── Storage Helpers (Optimized with In-Memory Caching) ──

let cachedConfigs: BotConfig[] | null = null;
let cachedConfigsMtime = 0;
let cachedStates: Record<string, BotRuntimeState> | null = null;
let cachedStatesMtime = 0;

export function loadBotsConfig(): BotConfig[] {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const stats = fs.statSync(CONFIG_FILE);
      if (cachedConfigs && stats.mtimeMs === cachedConfigsMtime) {
        return cachedConfigs;
      }
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const configs = JSON.parse(data) as BotConfig[];
      if (Array.isArray(configs) && configs.length > 0) {
        cachedConfigs = configs;
        cachedConfigsMtime = stats.mtimeMs;
        return configs;
      }
    }
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi đọc config bots:', e);
  }
  if (!cachedConfigs) {
    saveBotsConfig(DEFAULT_PRESET_BOTS);
    return DEFAULT_PRESET_BOTS;
  }
  return cachedConfigs;
}

export function saveBotsConfig(configs: BotConfig[]): void {
  try {
    cachedConfigs = configs;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf8');
    cachedConfigsMtime = fs.statSync(CONFIG_FILE).mtimeMs;
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi lưu config bots:', e);
  }
}

export function loadBotsState(): Record<string, BotRuntimeState> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stats = fs.statSync(STATE_FILE);
      if (cachedStates && stats.mtimeMs === cachedStatesMtime) {
        return cachedStates;
      }
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      cachedStates = JSON.parse(data);
      cachedStatesMtime = stats.mtimeMs;
      return cachedStates || {};
    }
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi đọc state bots:', e);
  }
  return cachedStates || {};
}

export function saveBotsState(states: Record<string, BotRuntimeState>): void {
  try {
    cachedStates = states;
    fs.writeFileSync(STATE_FILE, JSON.stringify(states, null, 2), 'utf8');
    cachedStatesMtime = fs.statSync(STATE_FILE).mtimeMs;
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi lưu state bots:', e);
  }
}

export function logBotActivity(trade: BotTradeLog): void {
  try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(trade) + '\n', 'utf8');
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi ghi log trade:', e);
  }
}

export function updateBotTradeResolution(mtid: number, botId: string, isWin: boolean, pnl: number): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    let updated = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(lines[i]) as BotTradeLog;
        if (item.mtid === mtid && item.botId === botId && item.status === 'PENDING') {
          item.status = isWin ? 'WIN' : 'LOSS';
          if (isWin && item.shares && item.shares > 0) {
            item.pnl = Number((item.shares - item.stake).toFixed(2));
          } else {
            item.pnl = Number(pnl.toFixed(2));
          }
          lines[i] = JSON.stringify(item);
          updated = true;
          break;
        }
      } catch { }
    }
    if (updated) {
      fs.writeFileSync(LOG_FILE, lines.join('\n') + '\n', 'utf8');
    }
  } catch (e) {
    console.error('[BOT ENGINE] Lỗi khi cập nhật kết quả trade log:', e);
  }
}

export function readBotTradeLogs(botId?: string, limit: number = 50): BotTradeLog[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const logs: BotTradeLog[] = [];

    // Tải các kết quả vòng đấu để tự động đồng bộ kết quả cho các lệnh còn PENDING
    const resultsFile = path.join(process.cwd(), 'logs', 'round_results.jsonl');
    const resultsMap = new Map<number, RoundResult>();
    if (fs.existsSync(resultsFile)) {
      const resLines = fs.readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean);
      for (const line of resLines) {
        try {
          const r = JSON.parse(line) as RoundResult;
          resultsMap.set(r.mtid, r);
        } catch { }
      }
    }

    let modified = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(lines[i]) as BotTradeLog;
        if (item.status === 'PENDING' && resultsMap.has(item.mtid)) {
          const res = resultsMap.get(item.mtid)!;
          const isWin = item.side === res.winner;
          item.status = isWin ? 'WIN' : 'LOSS';
          const amountOut = item.shares && item.shares > 0 ? item.shares : (item.stake / item.odds);
          item.pnl = isWin ? Number((amountOut - item.stake).toFixed(2)) : -item.stake;
          lines[i] = JSON.stringify(item);
          modified = true;
        }

        if (!botId || item.botId === botId) {
          logs.push(item);
          if (logs.length >= limit) break;
        }
      } catch { }
    }

    if (modified) {
      fs.writeFileSync(LOG_FILE, lines.join('\n') + '\n', 'utf8');
    }

    return logs;
  } catch {
    return [];
  }
}

/**
 * Tính toán số liệu thống kê độc lập cho từng chế độ (REAL_TRADE vs SIMULATOR)
 * Không bao giờ bị trộn lẫn giữa cược tiền thật và cược thử nghiệm!
 */
export function computeBotModeStats(botId: string, mode: 'REAL_TRADE' | 'SIMULATOR'): {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  dailyPnl: number;
  dailyLoss: number;
} {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return { totalTrades: 0, winCount: 0, lossCount: 0, dailyPnl: 0, dailyLoss: 0 };
    }
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const trades: BotTradeLog[] = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line) as BotTradeLog;
        if (item.botId === botId && item.mode === mode && item.status !== 'SKIPPED') {
          trades.push(item);
        }
      } catch { }
    }

    const totalTrades = trades.length;
    const winCount = trades.filter((t) => t.status === 'WIN').length;
    const lossCount = trades.filter((t) => t.status === 'LOSS').length;
    const dailyPnl = Number(
      trades
        .filter((t) => t.status === 'WIN' || t.status === 'LOSS')
        .reduce((sum, t) => sum + (t.pnl || 0), 0)
        .toFixed(2)
    );
    const dailyLoss = Number(
      trades
        .filter((t) => t.status === 'LOSS')
        .reduce((sum, t) => sum + (t.stake || 0), 0)
        .toFixed(2)
    );

    return { totalTrades, winCount, lossCount, dailyPnl, dailyLoss };
  } catch {
    return { totalTrades: 0, winCount: 0, lossCount: 0, dailyPnl: 0, dailyLoss: 0 };
  }
}

// ── Instant Backtest Engine (765 Kỳ Thực Tế) ──

export function runBotBacktest(
  config: BotConfig,
  results: RoundResult[],
  entries: RoundOddsBucketEntry[],
  options?: RealisticBacktestOptions
): BacktestResult {
  if (results.length === 0 || entries.length === 0) {
    return {
      totalRoundsEvaluated: 0,
      tradesCount: 0,
      wins: 0,
      losses: 0,
      skippedCount: 0,
      winRate: 0,
      netPnl: 0,
      roiPct: 0,
      initialBalance: options?.initialBalance || 1000,
      finalBalance: options?.initialBalance || 1000,
      peakBalance: options?.initialBalance || 1000,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      cutLossCount: 0,
      dailyLossStops: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      avgProfitPerWin: 0,
      avgLossPerLoss: 0,
      rating: 'BALANCED',
    };
  }

  // Sắp xếp các round theo thứ tự thời gian tăng dần
  let sortedResults = [...results].sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

  // Giới hạn số kỳ nếu có chỉ định (lấy N kỳ gần nhất)
  if (options?.roundLimit && options.roundLimit > 0 && sortedResults.length > options.roundLimit) {
    sortedResults = sortedResults.slice(-options.roundLimit);
  }

  // Gom các entry theo mtid và sắp xếp theo thời gian xuất hiện ts tăng dần
  const entriesByRound = new Map<number, RoundOddsBucketEntry[]>();
  for (const e of entries) {
    const list = entriesByRound.get(e.mtid) || [];
    list.push(e);
    entriesByRound.set(e.mtid, list);
  }
  for (const list of entriesByRound.values()) {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  const initialBalance = options?.initialBalance && options.initialBalance > 0 ? options.initialBalance : 1000;
  let balance = initialBalance;
  const isFlat = config.stakeMode === 'FLAT';
  const useLadder = !isFlat && Array.isArray(config.customLadder) && config.customLadder.length > 0;
  const ladder = useLadder ? config.customLadder! : [];
  const maxSteps = isFlat ? 1 : (useLadder ? ladder.length : (config.maxSteps || 2));
  const multiplier = isFlat ? 1.0 : (config.multiplier || 4.0);
  let stake = useLadder ? ladder[0] : config.baseStake;
  let step = 1;
  let wins = 0;
  let losses = 0;
  let skippedCount = 0;
  let cutLossCount = 0;
  let dailyLossStops = 0;
  let maxDrawdown = 0;
  let peakBalance = balance;
  let dailyLoss = 0;
  let currentDay = -1;
  let dayStopped = false;

  let currentWinStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  let totalWinProfit = 0;
  let totalLossAmount = 0;

  const tradesHistory: BacktestTradeItem[] = [];

  for (const round of sortedResults) {
    // 1. Kiểm tra phiên nếu có cấu hình
    if (!config.sessions.includes('all')) {
      const session = getTradingSession(round.startDate || round.endDate);
      if (!config.sessions.includes(session)) {
        continue;
      }
    }

    // 2. Reset daily loss khi bước sang ngày UTC mới
    const roundDay = new Date(round.startDate || 0).getUTCDate();
    if (roundDay !== currentDay) {
      currentDay = roundDay;
      dailyLoss = 0;
      dayStopped = false;
    }

    // 3. Kiểm tra giới hạn Max Daily Loss (Dừng cho đến hết ngày UTC)
    if (config.maxDailyLoss > 0 && dailyLoss >= config.maxDailyLoss) {
      if (!dayStopped) {
        dayStopped = true;
        dailyLossStops++;
      }
      continue;
    }

    const roundEntries = entriesByRound.get(round.mtid) || [];
    if (roundEntries.length === 0) continue;

    // ═══════════════════════════════════════════════════════════════════
    // TÁCH BIỆT 100% LOGIC BACKTEST GIỮA 2 CHIẾN THUẬT BOT:
    // ═══════════════════════════════════════════════════════════════════
    let matchedEntry: RoundOddsBucketEntry | null = null;
    let targetSide: 'Up' | 'Down' = 'Up';
    let targetOdds = 0;

    if (config.strategy === 'TRAP_TRADERS') {
      // 🪤 BOT SĂN BẪY TRADER (TRAP TRADERS)
      const targetMins = Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0
        ? config.targetMinutes
        : ['1-0m'];
      const targetMinSet = new Set(targetMins);

      // Các phút ban đầu (trước phút kích hoạt đảo chiều) để rà soát đỉnh Odds
      const earlyEntries = roundEntries.filter((re) => !targetMinSet.has(re.minuteBucket as any));
      const poolForPeak = earlyEntries.length > 0 ? earlyEntries : roundEntries.filter((re) => re.minuteBucket !== '1-0m');

      let maxEarly = 0;
      let peakSide: 'Up' | 'Down' = 'Up';
      for (const ee of poolForPeak) {
        if (ee.favoriteOdds > maxEarly) {
          maxEarly = ee.favoriteOdds;
          peakSide = ee.favoriteSide;
        }
      }

      const minPeak = config.trapPeakOddsMin || 0.90;
      if (maxEarly >= minPeak) {
        const newSide: 'Up' | 'Down' = peakSide === 'Up' ? 'Down' : 'Up';
        // ⚠️ Tuyệt đối không dùng round.endPrice để lọc trước kết quả (tránh lookahead bias)
        // Tìm entry đảo chiều tại đúng các khung phút targetMinutes mà người dùng cấu hình
        const lateEntry = roundEntries.find((re) => targetMinSet.has(re.minuteBucket as any) && re.favoriteSide === newSide);
        if (lateEntry) {
          const favPct = Math.round(lateEntry.favoriteOdds * 100);
          let bucket = lateEntry.oddsBucket;
          if (!bucket) {
            if (favPct >= 95) bucket = '95+';
            else if (favPct >= 90) bucket = '90-95';
            else if (favPct >= 85) bucket = '85-90';
            else if (favPct >= 80) bucket = '80-85';
            else if (favPct >= 75) bucket = '75-80';
            else if (favPct >= 70) bucket = '70-75';
            else if (favPct >= 65) bucket = '65-70';
            else if (favPct >= 60) bucket = '60-65';
            else if (favPct >= 55) bucket = '55-60';
            else bucket = '50-55';
          }

          const hasTargetBuckets = Array.isArray(config.targetOddsBuckets) && config.targetOddsBuckets.length > 0;
          const bucketMatch = hasTargetBuckets ? config.targetOddsBuckets!.includes(bucket) : true;
          const odds = lateEntry.favoriteOdds;
          const maxOdds = config.trapMaxOdds || config.oddsMax || 0.85;
          const minOdds = config.oddsMin || 0.50;

          if (odds <= maxOdds && odds >= minOdds && bucketMatch) {
            matchedEntry = lateEntry;
            targetSide = newSide;
            targetOdds = odds;
          }
        }
      }
    } else {
      // 🛡️ BOT THÔNG THƯỜNG (CỬA THUẬN FAVORITE / UNDERDOG / EV_SNIPER)
      for (const e of roundEntries) {
        // 1. Lọc phút
        if (Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0) {
          const allowedMinutes = new Set(config.targetMinutes);
          if (!allowedMinutes.has(e.minuteBucket as any)) continue;
        } else if (config.minTimeRemaining !== undefined && config.maxTimeRemaining !== undefined) {
          const allowedMinutes = new Set<string>();
          if (config.maxTimeRemaining > 240 && config.minTimeRemaining < 300) allowedMinutes.add('5-4m');
          if (config.maxTimeRemaining > 180 && config.minTimeRemaining < 240) allowedMinutes.add('4-3m');
          if (config.maxTimeRemaining > 120 && config.minTimeRemaining < 180) allowedMinutes.add('3-2m');
          if (config.maxTimeRemaining > 60 && config.minTimeRemaining < 120) allowedMinutes.add('2-1m');
          if (config.minTimeRemaining < 60) allowedMinutes.add('1-0m');
          if (!allowedMinutes.has(e.minuteBucket as any)) continue;
        }

        // 2. Lọc thời gian giây (chỉ áp dụng nếu không dùng targetMinutes)
        if (!config.targetMinutes || config.targetMinutes.length === 0) {
          const timeRemaining = e.minuteBucket === '5-4m' ? 270 :
            e.minuteBucket === '4-3m' ? 210 :
              e.minuteBucket === '3-2m' ? 150 :
                e.minuteBucket === '2-1m' ? 90 : 45;

          if (timeRemaining < config.minTimeRemaining) continue;
          if (timeRemaining > config.maxTimeRemaining) continue;
        }

        // 3. Mốc Odds
        const favPct = Math.round(e.favoriteOdds * 100);
        let bucket = e.oddsBucket;
        if (!bucket) {
          if (favPct >= 95) bucket = '95+';
          else if (favPct >= 90) bucket = '90-95';
          else if (favPct >= 85) bucket = '85-90';
          else if (favPct >= 80) bucket = '80-85';
          else if (favPct >= 75) bucket = '75-80';
          else if (favPct >= 70) bucket = '70-75';
          else if (favPct >= 65) bucket = '65-70';
          else if (favPct >= 60) bucket = '60-65';
          else if (favPct >= 55) bucket = '55-60';
          else bucket = '50-55';
        }

        const hasTargetBuckets = Array.isArray(config.targetOddsBuckets) && config.targetOddsBuckets.length > 0;
        const bucketMatch = hasTargetBuckets ? config.targetOddsBuckets!.includes(bucket) : true;

        if (config.strategy === 'MARTINGALE_FAVORITE') {
          const match = hasTargetBuckets ? bucketMatch : (e.favoriteOdds >= config.oddsMin && e.favoriteOdds <= config.oddsMax);
          if (match) {
            matchedEntry = e;
            targetSide = e.favoriteSide;
            targetOdds = e.favoriteOdds;
            break;
          }
        } else if (config.strategy === 'UNDERDOG_HUNTER') {
          const underdogOdds = Math.max(0, 1 - e.favoriteOdds);
          const match = hasTargetBuckets ? bucketMatch : (
            config.oddsMin >= 0.50
              ? (e.favoriteOdds >= config.oddsMin && e.favoriteOdds <= config.oddsMax)
              : (underdogOdds >= config.oddsMin && underdogOdds <= config.oddsMax)
          );
          if (match) {
            matchedEntry = e;
            targetSide = e.favoriteSide === 'Up' ? 'Down' : 'Up';
            targetOdds = underdogOdds;
            break;
          }
        } else if (config.strategy === 'EV_SNIPER') {
          if (e.favoriteOdds >= 0.70 && e.favoriteOdds <= 0.85 && e.minuteBucket === '5-4m') {
            matchedEntry = e;
            targetSide = e.favoriteSide;
            targetOdds = e.favoriteOdds;
            break;
          }
        }
      }

      // ⚠️ Gỡ bỏ hoàn toàn việc dùng round.endPrice để lọc đệm giá.
      // Khi backtest, bot phải chịu đựng các pha rút râu / đảo chiều nến giống hệt 100% như khi trade thật.
    }

    if (!matchedEntry || targetOdds <= 0) continue;

    // ═══════════════════════════════════════════════════════════════════
    // MÔ PHỎNG KHỚP LỆNH THỰC TẾ (REAL BINANCE QUOTE & SLIPPAGE)
    // ═══════════════════════════════════════════════════════════════════
    let amountOut = 1 / targetOdds;
    let actualQuoteUsed = false;

    // Kiểm tra xem trong log có báo giá thực tế favAmountOut / undAmountOut từ Binance API hay không
    if (targetSide === matchedEntry.favoriteSide && matchedEntry.favAmountOut && matchedEntry.favAmountOut > 0) {
      amountOut = matchedEntry.favAmountOut;
      actualQuoteUsed = true;
    } else if (targetSide !== matchedEntry.favoriteSide && matchedEntry.undAmountOut && matchedEntry.undAmountOut > 0) {
      amountOut = matchedEntry.undAmountOut;
      actualQuoteUsed = true;
    }

    // Nếu không có báo giá thực tế từ API và bật mô phỏng trượt giá:
    if (!actualQuoteUsed && options?.simulateSlippage) {
      const slippageBps = options.slippageBps ?? config.maxSlippageBps ?? 450;
      const slipFactor = 1 - slippageBps / 10000;
      // Trượt giá làm giảm payout thực nhận
      amountOut = 1 + Math.max(0, (amountOut - 1) * slipFactor);
    }

    const isWin = targetSide === round.winner;
    const bet = stake;
    const currentStep = step;
    let pnl = 0;
    let actionNote = '';

    if (isFlat) {
      // 1. Chế độ Đi đều tay (Flat Bet)
      if (isWin) {
        wins++;
        currentWinStreak++;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
        currentLossStreak = 0;

        pnl = bet * (amountOut - 1);
        totalWinProfit += pnl;
        balance += pnl;
        actionNote = `✅ Thắng (+${pnl.toFixed(2)}$) -> Giữ đều $${stake}`;
      } else {
        losses++;
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        currentWinStreak = 0;

        pnl = -bet;
        totalLossAmount += bet;
        balance -= bet;
        dailyLoss += bet;
        actionNote = `❌ Thua (-$${bet}) -> Tiếp tục đánh đều $${stake}`;
      }
    } else {
      // 2. Chế độ Gấp thếp (Martingale) hoặc Chuỗi vốn (Ladder)
      if (isWin) {
        wins++;
        currentWinStreak++;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
        currentLossStreak = 0;

        pnl = bet * (amountOut - 1);
        totalWinProfit += pnl;
        balance += pnl;
        stake = useLadder ? ladder[0] : config.baseStake;
        step = 1;
        actionNote = currentStep > 1 ? `✅ Thắng B${currentStep} -> Reset về B1 ($${stake})` : `Thắng B1 -> Giữ B1 ($${stake})`;
      } else {
        losses++;
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        currentWinStreak = 0;

        pnl = -bet;
        totalLossAmount += bet;
        balance -= bet;
        dailyLoss += bet;

        if (step < maxSteps) {
          step++;
          stake = useLadder ? ladder[step - 1] : Number((config.baseStake * Math.pow(multiplier, step - 1)).toFixed(2));
          actionNote = `❌ Thua B${currentStep} -> Lên B${step} ($${stake})`;
        } else {
          // Cắt lỗ khi chạm số bước tối đa
          cutLossCount++;
          step = 1;
          stake = useLadder ? ladder[0] : config.baseStake;
          actionNote = `⚠️ Cắt lỗ chuỗi B${currentStep} -> Reset B1 ($${stake})`;
        }
      }
    }

    tradesHistory.push({
      roundId: round.mtid,
      timeStr: round.startDate ? new Date(round.startDate).toISOString().replace('T', ' ').slice(11, 19) : '',
      minuteBucket: matchedEntry.minuteBucket,
      step: currentStep,
      stake: bet,
      side: targetSide,
      odds: Number(targetOdds.toFixed(2)),
      quotePayout: Number(amountOut.toFixed(4)),
      fillPrice: Number((1 / amountOut).toFixed(4)),
      winner: round.winner,
      isWin,
      status: isWin ? 'WIN' : 'LOSS',
      pnl: Number(pnl.toFixed(2)),
      balanceAfter: Number(balance.toFixed(2)),
      actionNote,
    });

    if (balance > peakBalance) peakBalance = balance;
    const dd = peakBalance - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const netPnl = balance - initialBalance;
  const roiPct = initialBalance > 0 ? (netPnl / initialBalance) * 100 : 0;
  const maxDrawdownPct = peakBalance > 0 ? (maxDrawdown / peakBalance) * 100 : 0;
  const avgProfitPerWin = wins > 0 ? totalWinProfit / wins : 0;
  const avgLossPerLoss = losses > 0 ? totalLossAmount / losses : 0;

  let rating: 'EXCELLENT' | 'BALANCED' | 'HIGH_RISK' = 'BALANCED';
  if (netPnl > 30 && winRate >= 80 && maxDrawdown < 150) {
    rating = 'EXCELLENT';
  } else if (netPnl < -20 || maxDrawdown > 250 || cutLossCount > 8) {
    rating = 'HIGH_RISK';
  }

  return {
    totalRoundsEvaluated: sortedResults.length,
    tradesCount: totalTrades,
    wins,
    losses,
    skippedCount,
    winRate: Number(winRate.toFixed(1)),
    netPnl: Number(netPnl.toFixed(2)),
    roiPct: Number(roiPct.toFixed(1)),
    initialBalance,
    finalBalance: Number(balance.toFixed(2)),
    peakBalance: Number(peakBalance.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(1)),
    cutLossCount,
    dailyLossStops,
    maxWinStreak,
    maxLossStreak,
    avgProfitPerWin: Number(avgProfitPerWin.toFixed(2)),
    avgLossPerLoss: Number(avgLossPerLoss.toFixed(2)),
    rating,
    trades: tradesHistory,
  };
}

// ── Realtime Signal Evaluator for 1s Tick ──

export interface EvaluatedSignal {
  shouldTrade: boolean;
  side?: 'Up' | 'Down';
  odds?: number;
  stake?: number;
  step?: number;
  reason: string;
  engineConfidence?: number;
  engineSignal?: string;
}

/**
 * 🪤 BỘ LỌC ĐẶC QUYỀN CHO BOT SĂN BẪY TRADER (TRAP TRADERS)
 * Hoàn toàn độc lập với Bot Cược Thuận / Gấp thếp thông thường.
 *
 * Điều kiện vào lệnh:
 * 1. Khung thời gian: Phải là 1 phút cuối cùng (tr <= 60s và tr >= 15s tránh râu giật sát nút)
 * 2. Đỉnh Odds ban đầu (phút 5-2m): Phải từng có 1 bên đạt đỉnh >= trapPeakOddsMin (80%, 85%, 90%)
 * 3. Xác nhận đảo chiều (Confirmed Reversal): Nến BTC đã cắt qua StartPrice >= trapMinPriceReversal ($15) về phía cửa mới
 * 4. Odds cửa mới <= trapMaxOdds (85%) để Payout luôn đạt >= x1.35 - x1.45
 * 5. Cược ngay vào CỬA MỚI đã quay xe!
 */
function evaluateTrapTradersSignal(
  config: BotConfig,
  state: BotRuntimeState,
  snapshot: OddsSnapshot,
  eventDetail: {
    startPrice: number;
    currentPrice?: number;
    upPrice: number;
    downPrice: number;
  }
): EvaluatedSignal {
  // 1. Chỉ rà soát ở 1 phút cuối cùng (tr <= 60s)
  const maxTr = config.maxTimeRemaining ?? 60;
  if (snapshot.tr > maxTr) {
    return {
      shouldTrade: false,
      reason: `[TRAP] Chờ 1 phút cuối để quét bẫy đảo chiều (Hiện tại còn ${snapshot.tr}s > ${maxTr}s)`,
    };
  }

  // 2. Chặn giây cuối nếu quá sát nút (mặc định 15s)
  const minTr = config.minTimeRemaining ?? 15;
  if (snapshot.tr < minTr) {
    return {
      shouldTrade: false,
      reason: `[TRAP] Thời gian còn lại quá ít (${snapshot.tr}s < ${minTr}s - tránh râu giật sát nút)`,
    };
  }

  // 3. Kiểm tra Đỉnh Odds đã từng xảy ra ở phút 5-2m của vòng này
  const peak = roundPeakOddsMap.get(snapshot.mtid);
  const minPeak = config.trapPeakOddsMin || 0.90;
  if (!peak || peak.peakOdds < minPeak) {
    const curFavOdds = Math.max(snapshot.up, snapshot.dn);
    return {
      shouldTrade: false,
      reason: `[TRAP] Chưa từng có bên nào đạt đỉnh Odds >= ${(minPeak * 100).toFixed(0)}% (Đỉnh cao nhất: ${((peak?.peakOdds || curFavOdds) * 100).toFixed(1)}%)`,
    };
  }

  // 4. Kiểm tra Giá BTC đã đảo chiều qua StartPrice ít nhất $15 (Không đoán trước)
  const startPrice = eventDetail.startPrice || 0;
  const currentPrice = eventDetail.currentPrice || 0;
  if (startPrice <= 0 || currentPrice <= 0) {
    return {
      shouldTrade: false,
      reason: '[TRAP] Chưa có đủ dữ liệu giá BTC để xác nhận đảo chiều',
    };
  }

  const priceDelta = currentPrice - startPrice; // >0 là UP, <0 là DOWN
  const newSide: 'Up' | 'Down' = peak.peakSide === 'Up' ? 'Down' : 'Up';
  const newSideDelta = newSide === 'Up' ? priceDelta : -priceDelta;
  const minReversal = config.trapMinPriceReversal ?? 15;

  if (newSideDelta < minReversal) {
    return {
      shouldTrade: false,
      reason: `[TRAP] Chưa đảo chiều đủ $${minReversal} (Cửa mới ${newSide} đang lệch $${newSideDelta.toFixed(1)} so với StartPrice)`,
    };
  }

  // 5. Kiểm tra Odds của cửa mới không được vượt trần (đảm bảo Payout tốt)
  const newSideOdds = newSide === 'Up' ? snapshot.up : snapshot.dn;
  const maxOdds = config.trapMaxOdds || 0.85;
  if (newSideOdds > maxOdds) {
    return {
      shouldTrade: false,
      reason: `[TRAP] Odds cửa mới vượt trần ${(newSideOdds * 100).toFixed(1)}% > ${(maxOdds * 100).toFixed(0)}%`,
    };
  }

  // THỎA MÃN TOÀN BỘ ĐIỀU KIỆN TRAP -> VÀO LỆNH CỬA MỚI!
  return {
    shouldTrade: true,
    side: newSide,
    odds: newSideOdds,
    stake: state.currentStake,
    step: state.currentStep,
    reason: `🪤 Bẫy Trader kích hoạt! Đỉnh cũ ${peak.peakSide} ${(peak.peakOdds * 100).toFixed(0)}% -> Đã đảo chiều sang ${newSide} lệch $${newSideDelta.toFixed(1)} (Odds: ${(newSideOdds * 100).toFixed(1)}%)`,
  };
}

/**
 * 🛡️ BỘ LỌC CHO BOT THÔNG THƯỜNG (CỬA THUẬN FAVORITE / CỬA LẬT KÈO / GẤP THẾP)
 * Chuyên đánh theo xu hướng Odds, mốc phút và đệm giá an toàn.
 */
function evaluateStandardBotSignal(
  config: BotConfig,
  state: BotRuntimeState,
  snapshot: OddsSnapshot,
  eventDetail: {
    startPrice: number;
    currentPrice?: number;
    upPrice: number;
    downPrice: number;
  }
): EvaluatedSignal {
  // 1. Bộ lọc Thời gian còn lại
  if (config.minTimeRemaining !== undefined && snapshot.tr < config.minTimeRemaining) {
    return { shouldTrade: false, reason: `Thời gian còn lại quá ít (${snapshot.tr}s < ${config.minTimeRemaining}s - tránh râu nến giật)` };
  }
  if (config.maxTimeRemaining !== undefined && snapshot.tr > config.maxTimeRemaining) {
    return { shouldTrade: false, reason: `Thời gian còn lại quá sớm (${snapshot.tr}s > ${config.maxTimeRemaining}s - nến chưa có đà)` };
  }

  // 2. Bộ lọc Khung phút vào lệnh
  if (Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0) {
    const allowedMinutes = new Set(config.targetMinutes);
    if (config.minTimeRemaining !== undefined && config.maxTimeRemaining !== undefined) {
      if (config.maxTimeRemaining > 240 && config.minTimeRemaining < 300) allowedMinutes.add('5-4m');
      if (config.maxTimeRemaining > 180 && config.minTimeRemaining < 240) allowedMinutes.add('4-3m');
      if (config.maxTimeRemaining > 120 && config.minTimeRemaining < 180) allowedMinutes.add('3-2m');
      if (config.maxTimeRemaining > 60 && config.minTimeRemaining < 120) allowedMinutes.add('2-1m');
      if (config.minTimeRemaining < 60) allowedMinutes.add('1-0m');
    }

    if (!allowedMinutes.has(snapshot.mb as any)) {
      return { shouldTrade: false, reason: `Ngoài khung phút đã chọn (Hiện tại: ${snapshot.mb || 'N/A'} vs cần: ${Array.from(allowedMinutes).join(', ')})` };
    }
  }

  // 3. Bộ lọc Đệm giá an toàn (chống nến Doji / quét 2 đầu sát nút)
  if (config.minPriceBuffer > 0 && eventDetail.startPrice > 0 && eventDetail.currentPrice) {
    const priceDelta = Math.abs(eventDetail.currentPrice - eventDetail.startPrice);
    if (priceDelta < config.minPriceBuffer) {
      return {
        shouldTrade: false,
        reason: `Đệm giá chưa đủ an toàn (Chênh lệch $${priceDelta.toFixed(1)} < $${config.minPriceBuffer})`,
      };
    }
  }

  // 4. Xác định Cửa và Mốc Odds
  const favoriteOdds = Math.max(snapshot.up, snapshot.dn);
  const favoriteSide: 'Up' | 'Down' = snapshot.up >= snapshot.dn ? 'Up' : 'Down';
  const underdogOdds = Math.min(snapshot.up, snapshot.dn);
  const underdogSide: 'Up' | 'Down' = snapshot.up >= snapshot.dn ? 'Down' : 'Up';

  const favPct = Math.round(favoriteOdds * 100);
  let currentBucket = '50-55';
  if (favPct >= 95) currentBucket = '95+';
  else if (favPct >= 90) currentBucket = '90-95';
  else if (favPct >= 85) currentBucket = '85-90';
  else if (favPct >= 80) currentBucket = '80-85';
  else if (favPct >= 75) currentBucket = '75-80';
  else if (favPct >= 70) currentBucket = '70-75';
  else if (favPct >= 65) currentBucket = '65-70';
  else if (favPct >= 60) currentBucket = '60-65';
  else if (favPct >= 55) currentBucket = '55-60';

  const hasTargetBuckets = Array.isArray(config.targetOddsBuckets) && config.targetOddsBuckets.length > 0;
  const bucketMatch = hasTargetBuckets ? config.targetOddsBuckets!.includes(currentBucket) : true;

  if (config.strategy === 'MARTINGALE_FAVORITE') {
    const match = hasTargetBuckets ? bucketMatch : (favoriteOdds >= config.oddsMin && favoriteOdds <= config.oddsMax);
    if (match) {
      return {
        shouldTrade: true,
        side: favoriteSide,
        odds: favoriteOdds,
        stake: state.currentStake,
        step: state.currentStep,
        reason: `Odds ${favoriteSide} đạt ${(favoriteOdds * 100).toFixed(1)}% [Mốc ${currentBucket}]`,
      };
    }
  } else if (config.strategy === 'UNDERDOG_HUNTER') {
    const match = hasTargetBuckets ? bucketMatch : (
      config.oddsMin >= 0.50
        ? (favoriteOdds >= config.oddsMin && favoriteOdds <= config.oddsMax)
        : (underdogOdds >= config.oddsMin && underdogOdds <= config.oddsMax)
    );
    if (match) {
      return {
        shouldTrade: true,
        side: underdogSide,
        odds: underdogOdds,
        stake: state.currentStake,
        step: state.currentStep,
        reason: `Odds đảo chiều ${underdogSide} đạt ${(underdogOdds * 100).toFixed(1)}% [Mốc ${currentBucket}]`,
      };
    }
  } else if (config.strategy === 'EV_SNIPER') {
    if (favoriteOdds >= 0.70 && favoriteOdds <= 0.85 && snapshot.mb === '5-4m') {
      return {
        shouldTrade: true,
        side: favoriteSide,
        odds: favoriteOdds,
        stake: state.currentStake,
        step: state.currentStep,
        reason: `EV Sniper: Cửa trên bứt phá sớm ${(favoriteOdds * 100).toFixed(1)}% ở phút 5-4m`,
      };
    }
  }

  const targetDesc = hasTargetBuckets
    ? `mốc [${config.targetOddsBuckets!.join(', ')}]`
    : `${(config.oddsMin * 100).toFixed(0)}-${(config.oddsMax * 100).toFixed(0)}%`;
  return {
    shouldTrade: false,
    reason: `Chưa đạt Odds mục tiêu (${favoriteSide} ${(favoriteOdds * 100).toFixed(1)}% [Mốc ${currentBucket}] vs cần ${targetDesc})`,
  };
}

export function evaluateBotSignal(
  config: BotConfig,
  state: BotRuntimeState,
  snapshot: OddsSnapshot,
  eventDetail: {
    startPrice: number;
    currentPrice?: number;
    upPrice: number;
    downPrice: number;
  }
): EvaluatedSignal {
  if (!config.enabled) {
    return { shouldTrade: false, reason: 'Bot đang tắt' };
  }

  // 1. Kiểm tra nếu đã vào lệnh cho vòng này rồi
  if (state.lastActiveMarketId === snapshot.mtid) {
    return { shouldTrade: false, reason: 'Đã vào lệnh cho vòng cược này' };
  }

  // 2. Kiểm tra Giới hạn Max Daily Loss
  if (config.maxDailyLoss > 0 && state.dailyLoss >= config.maxDailyLoss) {
    return { shouldTrade: false, reason: `Đã chạm mức lỗ tối đa trong ngày ($${config.maxDailyLoss})` };
  }

  // 3. Kiểm tra Phiên giao dịch
  if (!config.sessions.includes('all')) {
    const currentSession = getTradingSession(snapshot.ts);
    if (!config.sessions.includes(currentSession)) {
      return { shouldTrade: false, reason: `Ngoài phiên hoạt động (Hiện tại: ${currentSession} vs cần: ${config.sessions.join(', ')})` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TÁCH BIỆT HOÀN TOÀN GIỮA 2 LOẠI BOT - KHÔNG DÙNG CHUNG ĐIỀU KIỆN
  // ═══════════════════════════════════════════════════════════════════
  let signal: EvaluatedSignal;
  if (config.strategy === 'TRAP_TRADERS') {
    // 🪤 ĐIỀU KIỆN ĐẶC QUYỀN CỦA BOT SĂN BẪY TRADER:
    signal = evaluateTrapTradersSignal(config, state, snapshot, eventDetail);
  } else {
    // 🛡️ ĐIỀU KIỆN TIÊU CHUẨN CỦA BOT THÔNG THƯỜNG:
    signal = evaluateStandardBotSignal(config, state, snapshot, eventDetail);
  }

  if (!signal.shouldTrade || !signal.side) {
    return signal;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🛡️ CONFIDENCE GATE: BỘ LỌC TỰ TIN TỪ 5M PREDICTION ENGINE
  // ═══════════════════════════════════════════════════════════════════
  if (config.useEngineFilter) {
    const activeCandles = sharedCandleCache.getCandlesSync();
    const currentPrice = eventDetail.currentPrice || eventDetail.startPrice || 0;
    const startPrice = eventDetail.startPrice || 0;

    if (activeCandles && activeCandles.length >= 10 && currentPrice > 0 && startPrice > 0) {
      const minConfidence = config.minEngineConfidence ?? 60;
      const engineRes = run5mPredictionEngine(
        currentPrice,
        startPrice,
        snapshot.tr,
        activeCandles
      );

      signal.engineConfidence = engineRes.confidence;
      signal.engineSignal = engineRes.signal;

      // 1. Kiểm tra hướng đồng thuận (Engine UP/DOWN phải trùng với Bot Side)
      const botSideUpper = signal.side.toUpperCase(); // 'UP' | 'DOWN'
      if (engineRes.signal !== botSideUpper) {
        return {
          shouldTrade: false,
          reason: `[ENGINE GATE] ❌ Engine báo ${engineRes.signal} (${engineRes.confidence}%) không đồng thuận với hướng bot ${signal.side}. (${engineRes.reason})`,
          engineConfidence: engineRes.confidence,
          engineSignal: engineRes.signal,
        };
      }

      // 2. Kiểm tra độ tự tin tối thiểu
      if (engineRes.confidence < minConfidence) {
        return {
          shouldTrade: false,
          reason: `[ENGINE GATE] ⚠️ Độ tự tin Engine (${engineRes.confidence}%) chưa đạt ngưỡng tối thiểu (${minConfidence}%). (${engineRes.reason})`,
          engineConfidence: engineRes.confidence,
          engineSignal: engineRes.signal,
        };
      }

      // 3. Kiểm tra nến có đang suy yếu (nếu cấu hình rejectIfWeakening)
      if (config.rejectIfWeakening && engineRes.trajectory.status === 'WEAKENING') {
        return {
          shouldTrade: false,
          reason: `[ENGINE GATE] ⚠️ Lực nến đang suy yếu (${engineRes.trajectory.displayText}). (${engineRes.reason})`,
          engineConfidence: engineRes.confidence,
          engineSignal: engineRes.signal,
        };
      }

      // Tự tin đạt yêu cầu!
      signal.reason = `${signal.reason} | 🎯 [Engine duyệt: ${engineRes.confidence}% ${engineRes.signal}]`;
    }
  }

  return signal;
}

// ── Background Runner Orchestrators (Hooked into 1s loop) ──



/**
 * Quét các bot đang bật mỗi giây trong vòng lặp collector
 */
export async function tickMultiBots(
  snapshot: OddsSnapshot,
  eventDetail: {
    marketTopicId: number;
    startPrice: number;
    currentPrice?: number;
    upPrice: number;
    downPrice: number;
    upTokenId?: string;
    downTokenId?: string;
  }
): Promise<void> {
  // Ghi nhận liên tục Đỉnh Odds của vòng hiện tại (bảo đảm mọi giây đều được lưu đỉnh để rà soát Trap)
  if (snapshot && snapshot.mtid) {
    const curFavOdds = Math.max(snapshot.up, snapshot.dn);
    const curFavSide: 'Up' | 'Down' = snapshot.up >= snapshot.dn ? 'Up' : 'Down';
    const existingPeak = roundPeakOddsMap.get(snapshot.mtid);
    if (!existingPeak || curFavOdds > existingPeak.peakOdds) {
      roundPeakOddsMap.set(snapshot.mtid, { peakOdds: curFavOdds, peakSide: curFavSide, peakTr: snapshot.tr });
    }
    if (roundPeakOddsMap.size > 30) {
      const keys = Array.from(roundPeakOddsMap.keys());
      for (let i = 0; i < keys.length - 20; i++) roundPeakOddsMap.delete(keys[i]);
    }
  }

  const configs = loadBotsConfig();
  const states = loadBotsState();
  let modified = false;

  for (const config of configs) {
    if (!config.enabled) continue;

    let state = states[config.id];
    if (!state) {
      state = {
        botId: config.id,
        currentStake: config.baseStake,
        currentStep: 1,
        cooldownRemaining: 0,
        dailyLoss: 0,
        dailyPnl: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        lastTradeTimestamp: 0,
        lastActiveMarketId: null,
        status: 'IDLE',
      };
      states[config.id] = state;
      modified = true;
    }

    // Reset daily loss / daily PnL khi bước sang ngày UTC mới
    const todayUTC = new Date().getUTCDate();
    if (state.lastDayUTC !== todayUTC) {
      state.lastDayUTC = todayUTC;
      state.dailyLoss = 0;
      state.dailyPnl = 0;
      if (state.status === 'STOPPED_MAX_LOSS') {
        state.status = 'IDLE';
      }
      modified = true;
    }

    // Tự động đồng bộ tiền cược về baseStake khi bot đang rảnh (IDLE) ở chế độ FLAT
    if (config.stakeMode === 'FLAT' && state.status === 'IDLE' && (state.currentStake !== config.baseStake || state.currentStep !== 1)) {
      state.currentStake = config.baseStake;
      state.currentStep = 1;
      modified = true;
    }

    const signal = evaluateBotSignal(config, state, snapshot, eventDetail);

    if (signal.shouldTrade && signal.side && signal.odds && signal.stake) {
      state.lastActiveMarketId = snapshot.mtid;
      state.status = 'IN_TRADE';
      state.lastTradeSide = signal.side;
      state.lastTradeOdds = signal.odds;
      state.lastTradeTimestamp = Date.now();
      state.totalTrades++;
      modified = true;

      const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const tokenId = signal.side === 'Up' ? eventDetail.upTokenId : eventDetail.downTokenId;

      const tradeLog: BotTradeLog = {
        id: tradeId,
        botId: config.id,
        botName: config.name,
        mtid: snapshot.mtid,
        timestamp: Date.now(),
        side: signal.side,
        odds: signal.odds,
        triggerOdds: signal.odds,
        stake: signal.stake,
        step: state.currentStep,
        mode: config.mode,
        status: 'PENDING',
        pnl: 0,
        engineConfidence: signal.engineConfidence,
        engineSignal: signal.engineSignal,
      };

      if (config.mode === 'REAL_TRADE' && tokenId) {
        console.log(`[MULTI-BOT] 🚀 BOT "${config.name}" VÀO LỆNH THẬT: ${signal.side} $${signal.stake} @ ${(signal.odds * 100).toFixed(1)}%`);
        const amountInWei = (BigInt(Math.floor(signal.stake * 1e6)) * BigInt('1000000000000')).toString();

        try {
          const { executeLiveTrade } = await import('./trade-api');
          const slippageBps = config.maxSlippageBps || 450;
          const res = await executeLiveTrade(tokenId, 'BUY', amountInWei, signal.odds, slippageBps);
          tradeLog.orderId = res?.orderId || res?.orderResult?.data?.orderId || res?.orderResult?.orderId || res?.data?.orderId;

          if (res?.isFailed) {
            console.warn(`[MULTI-BOT] ⚠️ Lệnh #${tradeLog.orderId} bị sàn Binance từ chối khớp (${res.failReason}), đánh dấu SKIPPED!`);
            tradeLog.status = 'SKIPPED';
            tradeLog.skipReason = res.failReason || 'Binance FOK FAILED (Không khớp trên sàn)';
            tradeLog.pnl = 0;
            state.status = 'IDLE';
            state.lastActiveMarketId = null;
            logBotActivity(tradeLog);
            saveBotsState(states);
            return;
          }

          if (res?.shares && res.shares > 0) {
            tradeLog.shares = Number(res.shares.toFixed(4));
            state.lastTradeShares = res.shares;
          }
          if (res?.fillPrice && res.fillPrice > 0) {
            tradeLog.fillPrice = Number(res.fillPrice.toFixed(4));
            tradeLog.odds = Number(res.fillPrice.toFixed(4));
            state.lastTradeOdds = res.fillPrice;
          }
          logBotActivity(tradeLog);
          saveBotsState(states);
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.error(`[MULTI-BOT REAL TRADE ERROR] Bot "${config.name}" lỗi đặt lệnh:`, errMsg);
          state.status = 'IDLE';
          state.lastActiveMarketId = null;
          saveBotsState(states);

          // Ghi nhận log BỎ QUA (SKIP/FAIL) khi Binance từ chối hoặc lỗi mạng/slippage
          tradeLog.status = 'SKIPPED';
          tradeLog.skipReason = `Binance từ chối: ${errMsg.slice(0, 150)}`;
          logBotActivity(tradeLog);
        }
      } else {
        console.log(`[MULTI-BOT] 🎯 BOT "${config.name}" (SIMULATOR) CƯỢC ẢO: ${signal.side} $${signal.stake} @ ${(signal.odds * 100).toFixed(1)}% (Lý do: ${signal.reason})`);
        logBotActivity(tradeLog);
      }
    }
  }

  if (modified) {
    saveBotsState(states);
  }
}

/**
 * Báo kết quả khi vòng cược kết thúc để cập nhật Thắng/Thua và Cooldown
 */
export function resolveMultiBots(result: RoundResult): void {
  const configs = loadBotsConfig();
  const states = loadBotsState();
  let modified = false;

  for (const config of configs) {
    const state = states[config.id];
    if (!state) continue;

    // 1. Nếu bot đã cược ở vòng này
    if (state.lastActiveMarketId === result.mtid && state.lastTradeSide && state.lastTradeOdds) {
      const isWin = state.lastTradeSide === result.winner;
      const bet = state.currentStake;
      const profit = state.lastTradeShares && state.lastTradeShares > 0
        ? Number((state.lastTradeShares - bet).toFixed(2))
        : Number((bet * ((1 / state.lastTradeOdds) - 1)).toFixed(2));
      const isFlat = config.stakeMode === 'FLAT';
      const useLadder = !isFlat && Array.isArray(config.customLadder) && config.customLadder.length > 0;
      const ladder = useLadder ? config.customLadder! : [];
      const maxSteps = isFlat ? 1 : (useLadder ? ladder.length : (config.maxSteps || 2));
      const baseStake = useLadder ? ladder[0] : config.baseStake;

      // Xóa số shares tạm sau khi giải quyết kết quả
      state.lastTradeShares = undefined;

      if (isFlat) {
        // 1. Chế độ Đi đều tay (Flat Bet)
        if (isWin) {
          state.winCount++;
          state.dailyPnl += profit;
          state.currentStake = baseStake;
          state.currentStep = 1;
          state.cooldownRemaining = 0;
          state.status = 'IDLE';

          updateBotTradeResolution(result.mtid, config.id, true, profit);
          console.log(`[MULTI-BOT] 🏆 BOT "${config.name}" (ĐỀU TAY) THẮNG KỲ #${result.mtid}! Lãi: +$${profit.toFixed(2)} (Giữ $${baseStake})`);
        } else {
          state.lossCount++;
          state.dailyPnl -= bet;
          state.dailyLoss += bet;
          state.currentStep = 1;
          state.currentStake = baseStake;
          state.cooldownRemaining = 0;
          state.status = 'IDLE';

          updateBotTradeResolution(result.mtid, config.id, false, -bet);
          console.log(`[MULTI-BOT] ❌ BOT "${config.name}" (ĐỀU TAY) THUA KỲ #${result.mtid}! (-$${bet}). Giữ đều $${baseStake}`);
        }
      } else {
        // 2. Chế độ Gấp thếp (Martingale) hoặc Chuỗi bậc thang (Ladder)
        if (isWin) {
          state.winCount++;
          state.dailyPnl += profit;
          state.currentStake = baseStake;
          state.currentStep = 1;
          state.cooldownRemaining = 0;
          state.status = 'IDLE';

          updateBotTradeResolution(result.mtid, config.id, true, profit);
          console.log(`[MULTI-BOT] 🏆 BOT "${config.name}" THẮNG KỲ #${result.mtid}! Lãi: +$${profit.toFixed(2)} (Reset về $${baseStake})`);
        } else {
          state.lossCount++;
          state.dailyPnl -= bet;
          state.dailyLoss += bet;

          updateBotTradeResolution(result.mtid, config.id, false, -bet);

          if (state.currentStep < maxSteps) {
            state.currentStep++;
            state.currentStake = useLadder
              ? ladder[state.currentStep - 1]
              : Number((config.baseStake * Math.pow(config.multiplier, state.currentStep - 1)).toFixed(2));
            state.cooldownRemaining = 0;
            state.status = 'IDLE';

            console.log(`[MULTI-BOT] ❌ BOT "${config.name}" THUA KỲ #${result.mtid}! (-$${bet}). Bước tiếp theo cược $${state.currentStake}`);
          } else {
            // Chạm số bước tối đa -> Cắt lỗ
            state.currentStep = 1;
            state.currentStake = baseStake;
            state.cooldownRemaining = 0;
            state.status = 'IDLE';

            console.log(`[MULTI-BOT] ⚠️ BOT "${config.name}" CẮT LỖ (Chạm tối đa ${maxSteps} bước). Reset về $${baseStake}`);
          }
        }
      }

      // Kiểm tra chạm maxDailyLoss
      if (config.maxDailyLoss > 0 && state.dailyLoss >= config.maxDailyLoss) {
        state.status = 'STOPPED_MAX_LOSS';
        console.log(`[MULTI-BOT] 🛑 BOT "${config.name}" ĐÃ TỰ ĐỘNG DỪNG do chạm giới hạn lỗ $${config.maxDailyLoss}!`);
      }

      state.lastActiveMarketId = null;
      state.lastTradeSide = undefined;
      state.lastTradeOdds = undefined;
      modified = true;
    } else {
      // 2. Bot KHÔNG cược ở kỳ này (không đủ điều kiện tín hiệu)
      if (state.status === 'COOLDOWN') {
        state.status = 'IDLE';
        state.cooldownRemaining = 0;
        modified = true;
      }

      // Nếu không vào lệnh, bỏ qua hoàn toàn không ghi log
    }
  }


  if (modified) {
    saveBotsState(states);
  }
}

