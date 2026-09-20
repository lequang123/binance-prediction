// ============================================================
// Binance Prediction Tracker — Type Definitions
// ============================================================

/** Raw position entry from Binance API response */
export interface BinancePosition {
  topicTitle: string;
  marketId: number;
  marketTopicId: number;
  eventSlug: string;
  marketStatus: number; // 1 = active, 0 = closed
  marketTitle: string;
  marketImageUrl: string;
  tokenId: string;
  outcomeName: 'Up' | 'Down';
  outcomeIndex: number; // 0 = Up, 1 = Down
  outcomeWinner: boolean | null;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  value: number;
  toWin: number;
  shares: number;
  result: string | null;
  closeType: string | null;
  totalBoughtShares: number | null;
  totalBoughtAmount: number | null;
  totalSoldShares: number | null;
  totalSoldAmount: number | null;
  avgSoldPrice: number | null;
  realizedPnlFromSells: number | null;
  sellRoi: number | null;
  settleAmount: number | null;
  claimedShares: number | null;
  realizedPnlFromSettle: number | null;
  settleRoi: number | null;
  settledPrice: number | null;
  lastActiveTime: number;
}

/** Binance API full response */
export interface BinanceApiResponse {
  code: string;
  message: string | null;
  messageDetail: string | null;
  data: {
    total: number;
    entries: BinancePosition[];
  };
  success: boolean;
}

/** Normalized position for a single side (Up or Down) */
export interface SidePosition {
  side: 'Up' | 'Down';
  tokenId: string; // Token ID dùng để đặt lệnh
  shares: number;
  value: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  toWin: number;
  payoutMultiplier: number; // 1 / avgPrice
}

/** Normalized market snapshot (both sides) */
export interface MarketSnapshot {
  timestamp: number;
  marketId: number;
  marketTitle: string;
  eventSlug: string;
  marketStatus: number;
  up: SidePosition | null;
  down: SidePosition | null;
  hedgeRatio: number; // up.value / (up.value + down.value), 0-1
  totalInvested: number;
  netPnl: number;
}

/** Strategy tag for detected trades */
export type StrategyTag =
  | 'HEDGE'
  | 'SCALE_IN'
  | 'DOUBLE_DOWN'
  | 'CONTRARIAN'
  | 'ODDS_SHIFT'
  | 'REBALANCE'
  | 'INITIAL'
  | 'SELL';

/** A trade detected by diffing two consecutive snapshots */
export interface DetectedTrade {
  timestamp: number;
  marketId: number;
  marketTitle: string;
  side: 'Up' | 'Down';
  tokenId: string; // Token ID tương ứng với side này
  action: 'BUY' | 'SELL';
  sharesChange: number;
  amountChange: number; // cost basis change (shares × avgPrice diff)
  fillPrice: number; // amountChange / sharesChange
  marketOddsUp: number;
  marketOddsDown: number;
  payoutMultiplier: number; // 1 / fillPrice
  potentialWin: number; // profit if this side wins = sharesChange - amountChange
  // Cumulative state after this trade
  cumUp: { shares: number; value: number; pnl: number; costBasis: number } | null;
  cumDown: { shares: number; value: number; pnl: number; costBasis: number } | null;
  hedgeRatio: number;
  totalInvested: number;
  netPnl: number;
  // Strategy analysis
  strategyTag: StrategyTag;
  strategyNote: string;
  // Previous hedge ratio for comparison
  prevHedgeRatio: number;
  // Copy Trade status
  copyTradeMode?: 'SIMULATOR' | 'REAL_TRADE';
  copyTradeAmount?: number;
}

/** Compact snapshot for JSONL logging */
export interface CompactSnapshot {
  t: number; // timestamp
  mid: number; // marketId
  up: { s: number; v: number; avg: number; cur: number; pnl: number } | null;
  dn: { s: number; v: number; avg: number; cur: number; pnl: number } | null;
  hr: number; // hedgeRatio
}

/** Historical (closed) position result */
export interface HistoricalResult {
  marketId: number;
  marketTitle: string;
  side: 'Up' | 'Down';
  outcomeWinner: boolean | null;
  result: string | null;
  avgPrice: number;
  shares: number;
  totalBoughtAmount: number | null;
  settleAmount: number | null;
  realizedPnlFromSettle: number | null;
  settleRoi: number | null;
  isWin: boolean;
  pnl: number;
}

/** Grouped historical result by marketTopicId */
export interface GroupedHistoricalResult {
  marketTopicId: number;
  marketTitle: string;
  up: HistoricalResult | null;
  down: HistoricalResult | null;
  totalPnl: number;
  isWin: boolean;
}

/** Win/Loss summary statistics */
export interface WinLossSummary {
  totalRounds: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxWin: number;
  maxLoss: number;
}

export interface DashboardData {
  active: MarketSnapshot | null;
  trades: DetectedTrade[];
  timestamp: number;
}

export interface PaginatedHistoryResponse {
  results: GroupedHistoricalResult[];
  summary: WinLossSummary;
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// Odds Statistics Types
// ============================================================

/** Odds snapshot recorded every 1 second */
export interface OddsSnapshot {
  ts: number;           // timestamp (ms)
  mtid: number;         // marketTopicId
  up: number;           // upPrice (0-1)
  dn: number;           // downPrice (0-1)
  tr: number;           // timeRemaining (seconds)
  mb: string;           // minuteBucket: "5-4m", "4-3m", ...
}

/** Result of a resolved round */
export interface RoundResult {
  mtid: number;         // marketTopicId
  winner: 'Up' | 'Down';
  startPrice: number;   // BTC start price
  endPrice: number;     // BTC end price
  volume: number;
  startDate: number;
  endDate: number;
}

/**
 * Per-round, per-bucket entry: records the FIRST TIME odds entered a bucket.
 * Each round × oddsBucket × minuteBucket combination is counted only once.
 */
export type TradingSession = 'all' | 'asia' | 'europe' | 'us' | 'night';

export interface RoundOddsBucketEntry {
  mtid: number;
  oddsBucket: string;       // "50-60", "60-70", "70-80", "80-90", "90+"
  minuteBucket: string;     // "5-4m", "4-3m", "3-2m", "2-1m", "1-0m"
  favoriteSide: 'Up' | 'Down';
  favoriteOdds: number;     // actual odds at first touch
  ts: number;               // timestamp of first touch
  favAmountOut?: number;    // Real quote amountOut per $1 from Binance API
  undAmountOut?: number;    // Real quote amountOut for underdog per $1
}

/** Aggregated win rate for a specific odds × time bucket */
export interface OddsBucketWinRate {
  oddsBucket: string;
  minuteBucket: string;
  totalRounds: number;
  favoriteWins: number;
  favoriteWinRate: number;
  reversals: number;
  reversalRate: number;
  avgFavoriteOdds: number;
  avgFavAmountOut?: number;  // Báo giá thực tế trung bình từ API get-quote
  avgUndAmountOut?: number;  // Báo giá thực tế trung bình cho Underdog
  evFavorite: number;       // Expected Value buying favorite
  evUnderdog: number;       // Expected Value buying underdog
  maxConsecutiveLosses: number; // Chuỗi thua liên tục tối đa
  currentLossStreak: number;    // Chuỗi thua hiện tại
}

/** Summary for an entire odds row (e.g. all minutes of 80-90%) */
export interface OddsRowSummary {
  oddsBucket: string;
  totalRounds: number;
  favoriteWins: number;
  favoriteWinRate: number;
  reversals: number;
  reversalRate: number;
  avgFavoriteOdds: number;
  avgFavAmountOut?: number;
  avgUndAmountOut?: number;
  evFavorite: number;
  evUnderdog: number;
  maxConsecutiveLosses: number;
  currentLossStreak: number;
}

/** Full stats result */
export interface LossRecordDetail {
  mtid: number;
  ts: number;
  oddsBucket: string;
  minuteBucket: string;
  favoriteSide: 'Up' | 'Down';
  favoriteOdds: number;
  winner: 'Up' | 'Down';
  startPrice: number;
  endPrice: number;
  shortfall: number;      // Khoảng cách giá thiếu để hòa vốn / thắng ($)
  shortfallPct: number;   // Khoảng cách theo %
  category: 'close_call' | 'moderate_reversal' | 'strong_reversal'; // <15, 15-50, >=50
}

export interface LossAnalysisSummary {
  totalLosses: number;
  avgShortfall: number;
  closeCallCount: number;
  closeCallPct: number;
  moderateCount: number;
  moderatePct: number;
  strongCount: number;
  strongPct: number;
}

export interface OddsStatsResult {
  totalSnapshots: number;
  totalRounds: number;
  resolvedRounds: number;
  collectingSince: number | null;  // timestamp
  session: TradingSession;
  winRateTable: OddsBucketWinRate[];
  rowSummaries: OddsRowSummary[];
  overallUpWinRate: number;
  overallDownWinRate: number;
  lossDetails: LossRecordDetail[];
  lossSummary: LossAnalysisSummary;
}

// ============================================================
// Multi-Bot Studio Types
// ============================================================

export type BotStrategy = 'MARTINGALE_FAVORITE' | 'UNDERDOG_HUNTER' | 'EV_SNIPER';

export interface BotConfig {
  id: string;
  name: string;
  enabled: boolean;
  mode: 'SIMULATOR' | 'REAL_TRADE';
  strategy: BotStrategy;

  // Quản lý vốn
  stakeMode?: 'FLAT' | 'MARTINGALE' | 'CUSTOM_LADDER'; // Chế độ: Đi đều tay, Gấp thếp, hoặc Chuỗi tùy chỉnh
  baseStake: number;               // Số tiền cược cơ bản (ví dụ: 10 USDT)
  multiplier: number;              // Hệ số nhân gấp thếp (ví dụ: 4.0x)
  maxSteps: number;                // Số bước gấp thếp tối đa (mặc định: 2)
  maxDailyLoss: number;            // Giới hạn lỗ tối đa trong ngày (ví dụ: 50 USDT)
  customLadder?: number[];         // Chuỗi tiền cược bậc thang tùy chỉnh (ví dụ: [1, 6, 15, 40])

  // Điều kiện vào lệnh
  oddsMin: number;                 // Odds tối thiểu (ví dụ: 0.85)
  oddsMax: number;                 // Odds tối đa (ví dụ: 0.90)
  targetOddsBuckets?: string[];    // Danh sách các mốc odds được chọn (ví dụ: ['80-85', '85-90', '90-95'])
  sessions: TradingSession[];      // ['all'] hoặc ['asia', 'us', ...]
  targetMinutes?: ('5-4m' | '4-3m' | '3-2m' | '2-1m' | '1-0m')[]; // Chọn phút vào lệnh (ví dụ: ['2-1m'])

  // Bộ lọc tránh thua lỗ
  cooldownRounds?: number;         // (Đã bỏ) Số vòng nghỉ sau khi thua
  minTimeRemaining: number;        // Chặn giây cuối (mặc định: 35s)
  maxTimeRemaining: number;        // Chặn vào quá sớm (mặc định: 240s)
  minPriceBuffer: number;          // Đệm giá an toàn tối thiểu (mặc định: $20)
  maxSlippageBps?: number;         // Mức trượt giá tối đa (ví dụ: 450 = 4.5%, 500 = 5.0%)

  createdAt: number;
  updatedAt: number;
}

export interface BotRuntimeState {
  botId: string;
  currentStake: number;
  currentStep: number;
  cooldownRemaining?: number;
  dailyLoss: number;
  dailyPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  lastTradeTimestamp: number;
  lastActiveMarketId: number | null;
  status: 'IDLE' | 'IN_TRADE' | 'COOLDOWN' | 'STOPPED_MAX_LOSS';
  lastTradeSide?: 'Up' | 'Down';
  lastTradeOdds?: number;
  lastTradeShares?: number;
  lastDayUTC?: number;
}

export interface BacktestTradeItem {
  roundId: number;
  timeStr: string;
  minuteBucket: string;
  step: number;
  stake: number;
  side: 'Up' | 'Down';
  odds: number;
  winner: 'Up' | 'Down';
  isWin: boolean;
  pnl: number;
  balanceAfter: number;
  actionNote: string;
}

export interface BacktestResult {
  totalRoundsEvaluated: number;
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  cutLossCount: number;
  rating: 'EXCELLENT' | 'BALANCED' | 'HIGH_RISK';
  trades?: BacktestTradeItem[];
}

export interface BotTradeLog {
  id: string;
  botId: string;
  botName: string;
  mtid: number;
  timestamp: number;
  side: 'Up' | 'Down';
  odds: number;
  stake: number;
  step: number;
  mode: 'SIMULATOR' | 'REAL_TRADE';
  status: 'PENDING' | 'WIN' | 'LOSS' | 'SKIPPED';
  pnl: number;
  orderId?: string;
  shares?: number;
  fillPrice?: number;
  triggerOdds?: number;
  skipReason?: string;
}



