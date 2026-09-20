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
} from './types';
import { getTradingSession } from './odds-stats';

const CONFIG_FILE = path.join(process.cwd(), '.bots_config.json');
const STATE_FILE = path.join(process.cwd(), '.bots_state.json');
const LOG_FILE = path.join(process.cwd(), 'logs', 'bots_activity.jsonl');

// ── Default Preset Bots ──
export const DEFAULT_PRESET_BOTS: BotConfig[] = [
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
    cooldownRounds: 1,
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
    cooldownRounds: 1,
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
    cooldownRounds: 2,
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
    cooldownRounds: 2,
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
    cooldownRounds: 1,
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
  entries: RoundOddsBucketEntry[]
): BacktestResult {
  if (results.length === 0 || entries.length === 0) {
    return {
      totalRoundsEvaluated: 0,
      tradesCount: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netPnl: 0,
      maxDrawdown: 0,
      cutLossCount: 0,
      rating: 'BALANCED',
    };
  }

  // Sắp xếp các round theo thứ tự thời gian
  const sortedResults = [...results].sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

  // Gom các entry theo mtid
  const entriesByRound = new Map<number, RoundOddsBucketEntry[]>();
  for (const e of entries) {
    const list = entriesByRound.get(e.mtid) || [];
    list.push(e);
    entriesByRound.set(e.mtid, list);
  }

  let balance = 1000;
  const initialBalance = balance;
  const isFlat = config.stakeMode === 'FLAT';
  const useLadder = !isFlat && Array.isArray(config.customLadder) && config.customLadder.length > 0;
  const ladder = useLadder ? config.customLadder! : [];
  const maxSteps = isFlat ? 1 : (useLadder ? ladder.length : (config.maxSteps || 2));
  const multiplier = isFlat ? 1.0 : (config.multiplier || 4.0);
  let stake = useLadder ? ladder[0] : config.baseStake;
  let cooldown = 0;
  let step = 1;
  let wins = 0;
  let losses = 0;
  let cutLossCount = 0;
  let maxDrawdown = 0;
  let peakBalance = balance;
  let dailyLoss = 0;
  let currentDay = -1;
  const tradesHistory: BacktestTradeItem[] = [];

  for (const round of sortedResults) {
    // Kiểm tra phiên nếu có cấu hình
    if (!config.sessions.includes('all')) {
      const session = getTradingSession(round.startDate || round.endDate);
      if (!config.sessions.includes(session)) {
        continue;
      }
    }

    // Reset daily loss khi qua ngày mới
    const roundDay = new Date(round.startDate || 0).getUTCDate();
    if (roundDay !== currentDay) {
      currentDay = roundDay;
      dailyLoss = 0;
    }

    // Kiểm tra giới hạn Max Daily Loss
    if (config.maxDailyLoss > 0 && dailyLoss >= config.maxDailyLoss) {
      continue;
    }

    // Nếu đang trong thời gian Cooldown
    if (cooldown > 0) {
      cooldown--;
      continue;
    }

    const roundEntries = entriesByRound.get(round.mtid) || [];
    if (roundEntries.length === 0) continue;

    // Tìm entry đầu tiên thỏa mãn điều kiện lọc
    let matchedEntry: RoundOddsBucketEntry | null = null;
    let targetSide: 'Up' | 'Down' = 'Up';
    let targetOdds = 0;

    for (const e of roundEntries) {
      // Bộ lọc theo phút nếu có chọn
      if (Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0) {
        if (!config.targetMinutes.includes(e.minuteBucket as any)) continue;
      }

      // Bộ lọc thời gian còn lại
      const timeRemaining = e.minuteBucket === '5-4m' ? 270 :
        e.minuteBucket === '4-3m' ? 210 :
          e.minuteBucket === '3-2m' ? 150 :
            e.minuteBucket === '2-1m' ? 90 : 45;

      if (timeRemaining < config.minTimeRemaining) continue;
      if (timeRemaining > config.maxTimeRemaining) continue;

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
      } else {
        // EV_SNIPER: Cửa trên có odds >= 0.70 ở phút 5-4m
        if (e.favoriteOdds >= 0.70 && e.favoriteOdds <= 0.85 && e.minuteBucket === '5-4m') {
          matchedEntry = e;
          targetSide = e.favoriteSide;
          targetOdds = e.favoriteOdds;
          break;
        }
      }
    }

    if (!matchedEntry || targetOdds <= 0) continue;

    // Bộ lọc đệm giá an toàn: Nếu biên độ giá phiên quá hẹp (< minPriceBuffer), bỏ qua không vào lệnh (tránh nến Doji / quét 2 đầu sát nút)
    const priceDiff = Math.abs((round.endPrice || 0) - (round.startPrice || 0));
    if (config.minPriceBuffer > 0 && priceDiff < config.minPriceBuffer) {
      continue;
    }

    const isWin = targetSide === round.winner;

    // Tính kết quả lệnh (không trừ 2% vì số tiền trong log đã là thực tế)
    const amountOut = 1 / targetOdds;
    const bet = stake;
    const currentStep = step;
    let pnl = 0;
    let actionNote = '';

    if (isFlat) {
      // 1. Chế độ Đi đều tay (Flat Bet)
      if (isWin) {
        wins++;
        pnl = bet * (amountOut - 1);
        balance += pnl;
        actionNote = `✅ Thắng (+${pnl.toFixed(2)}$) -> Giữ đều $${stake}`;
      } else {
        losses++;
        pnl = -bet;
        balance -= bet;
        dailyLoss += bet;
        cooldown = config.cooldownRounds;
        actionNote = cooldown > 0
          ? `❌ Thua (-$${bet}) -> Nghỉ ${cooldown} trận (Cooldown)`
          : `❌ Thua (-$${bet}) -> Tiếp tục đánh đều $${stake}`;
      }
    } else {
      // 2. Chế độ Gấp thếp (Martingale) hoặc Chuỗi vốn (Ladder)
      if (isWin) {
        wins++;
        pnl = bet * (amountOut - 1);
        balance += pnl;
        stake = useLadder ? ladder[0] : config.baseStake;
        step = 1;
        actionNote = currentStep > 1 ? `✅ Thắng B${currentStep} -> Reset về B1 ($${stake})` : `Thắng B1 -> Giữ B1 ($${stake})`;
      } else {
        losses++;
        pnl = -bet;
        balance -= bet;
        dailyLoss += bet;

        if (step < maxSteps) {
          step++;
          stake = useLadder ? ladder[step - 1] : config.baseStake * Math.pow(multiplier, step - 1);
          cooldown = config.cooldownRounds;
          actionNote = `❌ Thua B${currentStep} -> Nghỉ ${cooldown}T, Lên B${step} ($${stake})`;
        } else {
          // Cắt lỗ khi chạm số bước tối đa
          cutLossCount++;
          step = 1;
          stake = useLadder ? ladder[0] : config.baseStake;
          cooldown = config.cooldownRounds;
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
      winner: round.winner,
      isWin,
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
    winRate: Number(winRate.toFixed(1)),
    netPnl: Number(netPnl.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    cutLossCount,
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

  // 2. Kiểm tra Cooldown
  if (state.status === 'COOLDOWN' && state.cooldownRemaining > 0) {
    return { shouldTrade: false, reason: `Đang Cooldown (còn ${state.cooldownRemaining} trận)` };
  }

  // 3. Kiểm tra Giới hạn Max Daily Loss
  if (config.maxDailyLoss > 0 && state.dailyLoss >= config.maxDailyLoss) {
    return { shouldTrade: false, reason: `Đã chạm mức lỗ tối đa trong ngày ($${config.maxDailyLoss})` };
  }

  // 4. Kiểm tra Phiên giao dịch
  if (!config.sessions.includes('all')) {
    const currentSession = getTradingSession(snapshot.ts);
    if (!config.sessions.includes(currentSession)) {
      return { shouldTrade: false, reason: `Ngoài phiên hoạt động (Hiện tại: ${currentSession} vs cần: ${config.sessions.join(', ')})` };
    }
  }

  // 5. Bộ lọc Khung phút vào lệnh
  if (Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0) {
    if (!config.targetMinutes.includes(snapshot.mb as any)) {
      return { shouldTrade: false, reason: `Ngoài khung phút đã chọn (Hiện tại: ${snapshot.mb || 'N/A'} vs cần: ${config.targetMinutes.join(', ')})` };
    }
  }

  // 6. Bộ lọc Thời gian còn lại
  if (snapshot.tr < config.minTimeRemaining) {
    return { shouldTrade: false, reason: `Thời gian còn lại quá ít (${snapshot.tr}s < ${config.minTimeRemaining}s - tránh râu nến giật)` };
  }
  if (snapshot.tr > config.maxTimeRemaining) {
    return { shouldTrade: false, reason: `Thời gian còn lại quá sớm (${snapshot.tr}s > ${config.maxTimeRemaining}s - nến chưa có đà)` };
  }

  // 6. Bộ lọc Đệm giá an toàn
  if (config.minPriceBuffer > 0 && eventDetail.startPrice > 0 && eventDetail.currentPrice) {
    const priceDelta = Math.abs(eventDetail.currentPrice - eventDetail.startPrice);
    if (priceDelta < config.minPriceBuffer) {
      return {
        shouldTrade: false,
        reason: `Đệm giá chưa đủ an toàn (Chênh lệch $${priceDelta.toFixed(1)} < $${config.minPriceBuffer})`,
      };
    }
  }

  // 7. Xác định Cửa và Mốc Odds
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
    reason: `Chưa đạt Odds mục tiêu (${favoriteSide} ${(favoriteOdds * 100).toFixed(1)}% [Mốc ${currentBucket}] vs cần ${targetDesc})`
  };
}

// ── Background Runner Orchestrators (Hooked into 1s loop) ──

interface RoundBotEvaluation {
  mtid: number;
  reason: string;
  bestOdds?: number;
  bestSide?: 'Up' | 'Down';
  timestamp: number;
  priority: number;
}

const roundEvaluations = new Map<string, RoundBotEvaluation>();

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
        stake: signal.stake,
        step: state.currentStep,
        mode: config.mode,
        status: 'PENDING',
        pnl: 0,
      };

      if (config.mode === 'REAL_TRADE' && tokenId) {
        console.log(`[MULTI-BOT] 🚀 BOT "${config.name}" VÀO LỆNH THẬT: ${signal.side} $${signal.stake} @ ${(signal.odds * 100).toFixed(1)}%`);
        const amountInWei = (BigInt(Math.floor(signal.stake * 1e6)) * BigInt('1000000000000')).toString();

        try {
          const { executeLiveTrade } = await import('./trade-api');
          const slippageBps = config.maxSlippageBps || 450;
          const res = await executeLiveTrade(tokenId, 'BUY', amountInWei, signal.odds, slippageBps);
          tradeLog.orderId = res?.orderId || res?.orderResult?.data?.orderId || res?.orderResult?.orderId || res?.data?.orderId;
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
    } else {
      // Cập nhật lý do không vào lệnh đại diện nhất trong kỳ này
      const evalKey = `${config.id}_${snapshot.mtid}`;
      const favOdds = Math.max(snapshot.up, snapshot.dn);
      const favSide: 'Up' | 'Down' = snapshot.up >= snapshot.dn ? 'Up' : 'Down';

      let priority = 1;
      if (signal.reason.includes('Cooldown') || signal.reason.includes('tối đa trong ngày')) {
        priority = 10;
      } else if (signal.reason.includes('Odds')) {
        priority = 8;
      } else if (signal.reason.includes('Đệm giá')) {
        priority = 6;
      } else if (signal.reason.includes('Ngoài khung phút')) {
        priority = 4;
      } else if (signal.reason.includes('Ngoài phiên')) {
        priority = 4;
      }

      const existing = roundEvaluations.get(evalKey);
      if (!existing || priority > existing.priority || (priority === existing.priority && favOdds > (existing.bestOdds || 0))) {
        roundEvaluations.set(evalKey, {
          mtid: snapshot.mtid,
          reason: signal.reason,
          bestOdds: favOdds,
          bestSide: favSide,
          timestamp: Date.now(),
          priority,
        });
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
          state.cooldownRemaining = config.cooldownRounds;
          state.status = config.cooldownRounds > 0 ? 'COOLDOWN' : 'IDLE';

          updateBotTradeResolution(result.mtid, config.id, false, -bet);
          console.log(`[MULTI-BOT] ❌ BOT "${config.name}" (ĐỀU TAY) THUA KỲ #${result.mtid}! (-$${bet}). Cooldown ${config.cooldownRounds} trận. Giữ đều $${baseStake}`);
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
            state.cooldownRemaining = config.cooldownRounds;
            state.status = 'COOLDOWN';

            console.log(`[MULTI-BOT] ❌ BOT "${config.name}" THUA KỲ #${result.mtid}! (-$${bet}). Cooldown ${config.cooldownRounds} trận. Bước tiếp theo cược $${state.currentStake}`);
          } else {
            // Chạm số bước tối đa -> Cắt lỗ
            state.currentStep = 1;
            state.currentStake = baseStake;
            state.cooldownRemaining = config.cooldownRounds;
            state.status = 'COOLDOWN';

            console.log(`[MULTI-BOT] ⚠️ BOT "${config.name}" CẮT LỖ (Chạm tối đa ${maxSteps} bước). Reset về $${baseStake}. Cooldown ${config.cooldownRounds} trận.`);
          }
        }
      }

      // Kiểm tra chạm maxDailyLoss
      if (config.maxDailyLoss > 0 && state.dailyLoss >= config.maxDailyLoss) {
        state.status = 'STOPPED_MAX_LOSS';
        console.log(`[MULTI-BOT] 🛑 BOT "${config.name}" ĐÃ TỰ ĐỘNG DỪNG do chạm giới hạn lỗ $${config.maxDailyLoss}!`);
      }

      modified = true;
    } else if (config.enabled && state.lastActiveMarketId !== result.mtid) {
      // 2. Bot đang BẬT nhưng không cược ở kỳ này -> Ghi nhận log BỎ QUA (SKIP) kèm lý do
      const evalKey = `${config.id}_${result.mtid}`;
      const evalData = roundEvaluations.get(evalKey);
      const skipReason = evalData?.reason || 'Không xuất hiện tín hiệu thỏa mãn điều kiện chiến lược trong kỳ';

      const skipLog: BotTradeLog = {
        id: `skip_${result.mtid}_${config.id}`,
        botId: config.id,
        botName: config.name,
        mtid: result.mtid,
        timestamp: evalData?.timestamp || Date.now(),
        side: evalData?.bestSide || 'Up',
        odds: evalData?.bestOdds || 0,
        stake: state.currentStake,
        step: state.currentStep,
        mode: config.mode,
        status: 'SKIPPED',
        pnl: 0,
        skipReason,
      };

      logBotActivity(skipLog);
      console.log(`[MULTI-BOT] ⏭️ BOT "${config.name}" BỎ QUA Kỳ #${result.mtid}. Lý do: ${skipReason}`);
    } else if (state.status === 'COOLDOWN' && state.cooldownRemaining > 0) {
      // 3. Nếu bot đang cooldown ở các vòng sau
      state.cooldownRemaining--;
      if (state.cooldownRemaining === 0) {
        state.status = 'IDLE';
        console.log(`[MULTI-BOT] 🔔 BOT "${config.name}" ĐÃ HẾT COOLDOWN. Sẵn sàng vào lệnh tiếp theo!`);
      }
      modified = true;
    }
  }

  // Dọn dẹp evaluation cache của các kỳ cũ hơn 5 kỳ
  for (const [key, val] of roundEvaluations.entries()) {
    if (val.mtid < result.mtid - 5) {
      roundEvaluations.delete(key);
    }
  }

  if (modified) {
    saveBotsState(states);
  }
}

