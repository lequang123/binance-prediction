'use client';

import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3 } from 'lucide-react';
import type { MarketSnapshot } from '@/lib/types';

interface ActivePositionsProps {
  snapshot: MarketSnapshot | null;
}

function formatUsd(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function formatOdds(n: number): string {
  return n.toFixed(3);
}

export default function ActivePositions({ snapshot }: ActivePositionsProps) {
  if (!snapshot) {
    return (
      <div className="glass-card full-width">
        <div className="card-title">
          <Target size={14} />
          Active Positions
        </div>
        <div className="empty-state">Đang chờ dữ liệu từ trader...</div>
      </div>
    );
  }

  const { up, down, hedgeRatio, totalInvested, netPnl } = snapshot;

  const biasLabel =
    hedgeRatio > 0.55
      ? 'Up bias'
      : hedgeRatio < 0.45
        ? 'Down bias'
        : 'Balanced';

  return (
    <div className="glass-card full-width">
      <div className="card-title" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Target size={14} />
          <span>Active Positions — {snapshot.marketTitle}</span>
        </div>
      </div>

      <div className="positions-grid">
        {/* UP Side */}
        <div className="position-side up">
          <div className="side-label">
            <TrendingUp size={16} />
            UP
          </div>
          <div className="position-stats">
            <div className="stat-row">
              <span className="stat-label">Invested</span>
              <span className="stat-value">{up ? formatUsd(up.shares * up.avgPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Current Value</span>
              <span className="stat-value">{up ? formatUsd(up.value) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Shares</span>
              <span className="stat-value">{up ? up.shares.toFixed(2) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Price</span>
              <span className="stat-value">{up ? formatOdds(up.avgPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Current Odds</span>
              <span className="stat-value">{up ? formatOdds(up.currentPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Payout</span>
              <span className="stat-value" style={{ color: 'var(--warning)' }}>
                {up ? `${up.payoutMultiplier.toFixed(2)}x` : '--'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">To Win</span>
              <span className="stat-value">{up ? formatUsd(up.toWin) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">PnL</span>
              <span className={`stat-value ${up && up.pnl >= 0 ? 'positive' : 'negative'}`}>
                {up ? `${up.pnl >= 0 ? '+' : ''}${formatUsd(up.pnl)} (${up.pnl >= 0 ? '+' : ''}${formatPct(up.pnlPct)})` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="position-divider">
          <span className="vs-label">VS</span>
          <BarChart3 size={20} style={{ color: 'var(--text-muted)' }} />
        </div>

        {/* DOWN Side */}
        <div className="position-side down">
          <div className="side-label">
            <TrendingDown size={16} />
            DOWN
          </div>
          <div className="position-stats">
            <div className="stat-row">
              <span className="stat-label">Invested</span>
              <span className="stat-value">{down ? formatUsd(down.shares * down.avgPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Current Value</span>
              <span className="stat-value">{down ? formatUsd(down.value) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Shares</span>
              <span className="stat-value">{down ? down.shares.toFixed(2) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Price</span>
              <span className="stat-value">{down ? formatOdds(down.avgPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Current Odds</span>
              <span className="stat-value">{down ? formatOdds(down.currentPrice) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Payout</span>
              <span className="stat-value" style={{ color: 'var(--warning)' }}>
                {down ? `${down.payoutMultiplier.toFixed(2)}x` : '--'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">To Win</span>
              <span className="stat-value">{down ? formatUsd(down.toWin) : '--'}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">PnL</span>
              <span className={`stat-value ${down && down.pnl >= 0 ? 'positive' : 'negative'}`}>
                {down ? `${down.pnl >= 0 ? '+' : ''}${formatUsd(down.pnl)} (${down.pnl >= 0 ? '+' : ''}${formatPct(down.pnlPct)})` : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Summary */}
      <div className="net-summary">
        <div className="net-item">
          <div className="net-label">Total Invested</div>
          <div className="net-value">{formatUsd(totalInvested)}</div>
        </div>
        <div className="net-item">
          <div className="net-label">Net PnL</div>
          <div className={`net-value ${netPnl >= 0 ? 'positive' : 'negative'}`} style={{ color: netPnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
            {netPnl >= 0 ? '+' : ''}{formatUsd(netPnl)}
          </div>
        </div>
        <div className="net-item">
          <div className="net-label">Hedge Ratio</div>
          <div className="net-value" style={{ color: 'var(--accent)' }}>
            {(hedgeRatio * 100).toFixed(0)}/{((1 - hedgeRatio) * 100).toFixed(0)} — {biasLabel}
          </div>
        </div>
        <div className="net-item">
          <div className="net-label">
            <DollarSign size={12} style={{ display: 'inline' }} /> Potential Max
          </div>
          <div className="net-value" style={{ color: 'var(--warning)' }}>
            {formatUsd(Math.max(up?.toWin ?? 0, down?.toWin ?? 0))}
          </div>
        </div>
      </div>
    </div>
  );
}
