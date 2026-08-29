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
