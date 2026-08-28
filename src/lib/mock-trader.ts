import type { DetectedTrade } from './types';

export interface MockPosition {
  marketId: number;
  marketTitle: string;
  side: 'Up' | 'Down';
  shares: number;
  investedAmount: number; // Cost basis
}

export interface MarketSummary {
  marketId: number;
  invested: number;
  won: number;
  lost: number;
  netProfit: number;
  winner: string;
}

export class MockTrader {
  private balance: number;
  private positions: Map<string, MockPosition>; // Key: `${marketId}-${side}`
  private tradeHistory: any[];

  public totalInvested: number = 0;
  public totalWon: number = 0;
  public totalLost: number = 0;
  public marketSummaries: Map<number, MarketSummary>;

  constructor(initialBalance: number = 1000) {
    this.balance = initialBalance;
    this.positions = new Map();
    this.tradeHistory = [];
    this.marketSummaries = new Map();
  }

  // Handle a new detected trade (Copy trade logic)
  public processSignal(trade: DetectedTrade) {
    // 1. Only copy BUY orders for now (you can add SELL logic later)
    if (trade.action !== 'BUY') return;

    // 2. Scale down the cost: Cost / 10
    const mockCost = trade.amountChange / 20;

    // Ignore tiny trades to prevent spam
    if (mockCost < 1) return;

    // 3. Calculate simulated shares based on fillPrice
    const mockShares = mockCost / trade.fillPrice;

    // 4. Deduct balance and add to totalInvested
    this.balance -= mockCost;
    this.totalInvested += mockCost;

    const summary = this.marketSummaries.get(trade.marketId) || {
      marketId: trade.marketId, invested: 0, won: 0, lost: 0, netProfit: 0, winner: ''
    };
    summary.invested += mockCost;
    this.marketSummaries.set(trade.marketId, summary);

    // 5. Update open position
    const positionKey = `${trade.marketId}-${trade.side}`;
    const existingPosition = this.positions.get(positionKey) || {
      marketId: trade.marketId,
      marketTitle: trade.marketTitle,
      side: trade.side,
      shares: 0,
      investedAmount: 0,
    };

    existingPosition.shares += mockShares;
    existingPosition.investedAmount += mockCost;
    this.positions.set(positionKey, existingPosition);

    // 6. Record history
    const mockRecord = {
      timestamp: trade.timestamp,
      marketId: trade.marketId,
      side: trade.side,
      mockCost,
      mockShares,
      fillPrice: trade.fillPrice,
      strategy: trade.strategyTag,
    };
    this.tradeHistory.push(mockRecord);

    console.log(`[MOCK TRADE] Copied! Spent $${mockCost.toFixed(2)} on ${trade.side} @ ${trade.fillPrice.toFixed(4)} | Market: ${trade.marketId} | Bal: $${this.balance.toFixed(2)}`);
  }

  // Settle the market when result is known
  public settleMarket(marketId: number, winningSide: 'Up' | 'Down' | 'Refund') {
    const upKey = `${marketId}-Up`;
    const downKey = `${marketId}-Down`;

    const upPos = this.positions.get(upKey);
    const downPos = this.positions.get(downKey);

    let pnl = 0;

    const summary = this.marketSummaries.get(marketId) || {
      marketId, invested: 0, won: 0, lost: 0, netProfit: 0, winner: winningSide
    };
    summary.winner = winningSide;

    if (upPos) {
      if (winningSide === 'Up') {
        const payout = upPos.shares * 1.0;
        this.balance += payout;
        pnl += (payout - upPos.investedAmount);
        this.totalWon += (payout - upPos.investedAmount);
        summary.won += (payout - upPos.investedAmount);
        summary.netProfit += (payout - upPos.investedAmount);
      } else if (winningSide === 'Refund') {
        this.balance += upPos.investedAmount;
      } else {
        pnl -= upPos.investedAmount;
        this.totalLost += upPos.investedAmount;
        summary.lost += upPos.investedAmount;
        summary.netProfit -= upPos.investedAmount;
      }
      this.positions.delete(upKey);
    }

    if (downPos) {
      if (winningSide === 'Down') {
        const payout = downPos.shares * 1.0;
        this.balance += payout;
        pnl += (payout - downPos.investedAmount);
        this.totalWon += (payout - downPos.investedAmount);
        summary.won += (payout - downPos.investedAmount);
        summary.netProfit += (payout - downPos.investedAmount);
      } else if (winningSide === 'Refund') {
        this.balance += downPos.investedAmount;
      } else {
        pnl -= downPos.investedAmount;
        this.totalLost += downPos.investedAmount;
        summary.lost += downPos.investedAmount;
        summary.netProfit -= downPos.investedAmount;
      }
      this.positions.delete(downKey);
    }

    this.marketSummaries.set(marketId, summary);

    if (upPos || downPos) {
      console.log(`[MOCK SETTLE] Market ${marketId} won by ${winningSide}. PnL: $${pnl.toFixed(2)}. New Bal: $${this.balance.toFixed(2)}`);
    }
  }

  public getStats() {
    let totalUnrealizedCost = 0;
    for (const pos of this.positions.values()) {
      totalUnrealizedCost += pos.investedAmount;
    }

    return {
      currentBalance: this.balance,
      openPositions: Array.from(this.positions.values()),
      openPositionsCount: this.positions.size,
      totalUnrealizedCost,
      tradeCount: this.tradeHistory.length,
      netProfit: this.balance + totalUnrealizedCost - 1000, // Assumes $1000 initial
      totalInvested: this.totalInvested,
      totalWon: this.totalWon,
      totalLost: this.totalLost,
      marketSummaries: Array.from(this.marketSummaries.values())
    };
  }
}

export const globalMockTrader = new MockTrader(1000);
