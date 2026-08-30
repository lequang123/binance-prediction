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

export default function CopyTradeTimeline({ trades }: TradeTimelineProps) {
  // Only show trades that were actually copied (have copyTradeMode)
  const copyTrades = trades.filter(t => t.copyTradeMode);
  // Show most recent first
  const sortedTrades = [...copyTrades].reverse();

  return (
    <div className="glass-card">
      <div className="card-title">
        <Clock size={14} />
        Trade Copy Timeline
        {copyTrades.length > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>
            {copyTrades.length} copied
          </span>
        )}
      </div>

      {sortedTrades.length === 0 ? (
        <div className="empty-state">
          Chưa có lệnh auto-copy nào. Đang chờ tín hiệu...
        </div>
      ) : (
        <div className="timeline">
          {sortedTrades.map((trade, i) => {
            const isNew = i === 0;

            const actionClass =
              trade.action === 'SELL'
                ? 'sell'
                : trade.side === 'Up'
                  ? 'buy-up'
                  : 'buy-down';

            const potentialBotWin = trade.potentialWin > 0 && trade.copyTradeAmount
              ? trade.copyTradeAmount * (trade.potentialWin / trade.amountChange)
              : 0;

            return (
              <div
                key={`copy-${trade.timestamp}-${trade.side}-${i}`}
                className={`trade-entry ${isNew ? 'new' : ''}`}
                style={{
                  borderLeft: `4px solid ${trade.copyTradeMode === 'REAL_TRADE' ? 'var(--up)' : '#888'}`
                }}
              >
                {/* Header: time + action badge + mode */}
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
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: trade.copyTradeMode === 'REAL_TRADE' ? 'var(--up)' : '#555',
                    color: trade.copyTradeMode === 'REAL_TRADE' ? 'black' : 'white'
                  }}>
                    {trade.copyTradeMode === 'REAL_TRADE' ? 'REAL TRADE' : 'SIMULATOR'}
                  </span>
                </div>

                {/* Trade details */}
                <div className="trade-details" style={{ marginTop: 8 }}>
                  <span>
                    Bot Invested: <span className="value" style={{ color: 'white', fontWeight: 'bold' }}>
                      {formatUsd(trade.copyTradeAmount || 0)}
                    </span>
                  </span>
                  <span>
                    Fill: <span className="value">{trade.fillPrice.toFixed(4)}</span>
                  </span>
                  <span>
                    Payout: <span className="value" style={{ color: 'var(--warning)' }}>{trade.payoutMultiplier.toFixed(2)}x</span>
                  </span>
                  {trade.action === 'BUY' && potentialBotWin > 0 && (
                    <span>
                      If Win:{' '}
                      <span className="value" style={{ color: 'var(--up)', fontWeight: 700 }}>
                        +{formatUsd(potentialBotWin)}
                      </span>
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  (Trader originally invested {formatUsd(trade.amountChange)})
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
