'use client';

import { Clock, ArrowUpRight, ArrowDownRight, Tag } from 'lucide-react';
import type { DetectedTrade } from '@/lib/types';

interface TradeTimelineProps {
  trades: DetectedTrade[];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUsd(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

const STRATEGY_EMOJI: Record<string, string> = {
  HEDGE: '🛡️',
  SCALE_IN: '📈',
  DOUBLE_DOWN: '💪',
  CONTRARIAN: '🔄',
  ODDS_SHIFT: '⚡',
  REBALANCE: '⚖️',
  INITIAL: '🎯',
  SELL: '💰',
};

export default function TradeTimeline({ trades }: TradeTimelineProps) {
  // Show most recent first
  const sortedTrades = [...trades].reverse();

  return (
    <div className="glass-card">
      <div className="card-title">
        <Clock size={14} />
        Trade Timeline
        {trades.length > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>
            {trades.length} trades
          </span>
        )}
      </div>

      {sortedTrades.length === 0 ? (
        <div className="empty-state">
          Chưa detect được lệnh nào. Đang theo dõi thay đổi...
        </div>
      ) : (
        <div className="timeline">
          {sortedTrades.map((trade, i) => {
            const isNew = i === 0;
            const upValue = trade.cumUp?.value ?? 0;
            const downValue = trade.cumDown?.value ?? 0;
            const total = upValue + downValue;
            const upPct = total > 0 ? (upValue / total) * 100 : 50;
            const downPct = 100 - upPct;

            const actionClass =
              trade.action === 'SELL'
                ? 'sell'
                : trade.side === 'Up'
                  ? 'buy-up'
                  : 'buy-down';

            return (
              <div
                key={`${trade.timestamp}-${trade.side}-${i}`}
                className={`trade-entry ${isNew ? 'new' : ''}`}
              >
                {/* Header: time + action badge + payout */}
                <div className="trade-header">
                  <span className="trade-time">{formatTime(trade.timestamp)}</span>
                  <span className={`trade-action ${actionClass}`}>
                    {trade.side === 'Up' ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}
                    {trade.action} {trade.side}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      color: 'var(--warning)',
                      fontWeight: 700,
                    }}
                  >
                    payout {trade.payoutMultiplier.toFixed(2)}x
                  </span>
                </div>

                {/* Trade details */}
                <div className="trade-details">
                  <span>
                    Amount: <span className="value">{formatUsd(trade.amountChange)}</span>
                  </span>
                  <span>
                    Fill: <span className="value">{trade.fillPrice.toFixed(4)}</span>
                  </span>
                  <span>
                    Mkt:{' '}
                    <span className="value" style={{ color: 'var(--up)' }}>
                      {(trade.marketOddsUp * 100).toFixed(0)}%
                    </span>
                    /
                    <span className="value" style={{ color: 'var(--down)' }}>
                      {(trade.marketOddsDown * 100).toFixed(0)}%
                    </span>
                  </span>
                  <span>
                    Shares: <span className="value">+{trade.sharesChange.toFixed(2)}</span>
                  </span>
                </div>

                {/* Hedge bar */}
                <div className="hedge-bar-container">
                  <div className="hedge-bar">
                    <div
                      className="up-fill"
                      style={{ width: `${upPct}%` }}
                    >
                      {upPct > 20 && `UP ${formatUsd(upValue)} (${upPct.toFixed(0)}%)`}
                    </div>
                    <div
                      className="down-fill"
                      style={{ width: `${downPct}%` }}
                    >
                      {downPct > 20 && `DOWN ${formatUsd(downValue)} (${downPct.toFixed(0)}%)`}
                    </div>
                  </div>
                </div>

                {/* Footer: PnL + strategy */}
                <div className="trade-footer">
                  <span
                    className="trade-pnl"
                    style={{
                      color: trade.netPnl >= 0 ? 'var(--up)' : 'var(--down)',
                    }}
                  >
                    Net PnL: {trade.netPnl >= 0 ? '+' : ''}{formatUsd(trade.netPnl)}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Hedge: {(trade.hedgeRatio * 100).toFixed(0)}/{((1 - trade.hedgeRatio) * 100).toFixed(0)}
                    {trade.prevHedgeRatio !== trade.hedgeRatio && (
                      <span style={{ color: 'var(--accent)' }}>
                        {' '}← {(trade.prevHedgeRatio * 100).toFixed(0)}/{((1 - trade.prevHedgeRatio) * 100).toFixed(0)}
                      </span>
                    )}
                  </span>
                </div>

                {/* Strategy tag + note */}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="strategy-tag">
                    <Tag size={10} />
                    {STRATEGY_EMOJI[trade.strategyTag] || '📊'} {trade.strategyTag}
                  </span>
                  <span className="strategy-note">{trade.strategyNote}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
