'use client';

import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { DetectedTrade } from '@/lib/types';

interface HedgingInsightProps {
  trades: DetectedTrade[];
}

function formatUsd(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

const PROFILE_LABELS: Record<string, { label: string; desc: string }> = {
  ASYMMETRIC_HEDGE: {
    label: 'Asymmetric Hedge',
    desc: 'Đặt cả 2 bên nhưng lệch về 1 hướng chính',
  },
  BALANCED_HEDGE: {
    label: 'Balanced Hedge',
    desc: 'Phân bổ tương đối cân bằng 2 bên',
  },
  CONTRARIAN_TRADER: {
    label: 'Contrarian Trader',
    desc: 'Thường xuyên đặt ngược xu hướng thị trường',
  },
  DIRECTIONAL: {
    label: 'Directional',
    desc: 'Tập trung 1 hướng chính, ít hedge',
  },
  NO_DATA: {
    label: 'Analyzing...',
    desc: 'Đang thu thập dữ liệu',
  },
};

export default function HedgingInsight({ trades }: HedgingInsightProps) {
  // Inline analysis (avoid importing server-side analysis module)
  const buyTrades = trades.filter((t) => t.action === 'BUY');
  const upTrades = buyTrades.filter((t) => t.side === 'Up');
  const downTrades = buyTrades.filter((t) => t.side === 'Down');

  const totalUpInvested = upTrades.reduce((s, t) => s + t.amountChange, 0);
  const totalDownInvested = downTrades.reduce((s, t) => s + t.amountChange, 0);

  const avgUpFillPrice =
    upTrades.length > 0
      ? upTrades.reduce((s, t) => s + t.fillPrice, 0) / upTrades.length
      : 0;
  const avgDownFillPrice =
    downTrades.length > 0
      ? downTrades.reduce((s, t) => s + t.fillPrice, 0) / downTrades.length
      : 0;

  const avgUpMarketOdds =
    upTrades.length > 0
      ? upTrades.reduce((s, t) => s + t.marketOddsUp, 0) / upTrades.length
      : 0;
  const avgDownMarketOdds =
    downTrades.length > 0
      ? downTrades.reduce((s, t) => s + t.marketOddsDown, 0) / downTrades.length
      : 0;

  const upEdge = avgUpMarketOdds - avgUpFillPrice;
  const downEdge = avgDownMarketOdds - avgDownFillPrice;

  const avgHedgeRatio =
    trades.length > 0
      ? trades.reduce((s, t) => s + t.hedgeRatio, 0) / trades.length
      : 0.5;

  // Strategy breakdown
  const strategyBreakdown: Record<string, number> = {};
  for (const t of buyTrades) {
    strategyBreakdown[t.strategyTag] =
      (strategyBreakdown[t.strategyTag] || 0) + 1;
  }

  // Trade frequency
  const timespan =
    trades.length > 1
      ? trades[trades.length - 1].timestamp - trades[0].timestamp
      : 60;
  const tradeFrequency =
    timespan > 0 ? (buyTrades.length / timespan) * 60 : 0;

  // Primary bias
  const primaryBias: 'UP' | 'DOWN' | 'NEUTRAL' =
    avgHedgeRatio > 0.55 ? 'UP' : avgHedgeRatio < 0.45 ? 'DOWN' : 'NEUTRAL';

  // Profile
  let profile = 'BALANCED_HEDGE';
  if (buyTrades.length === 0) {
    profile = 'NO_DATA';
  } else if (primaryBias !== 'NEUTRAL' && strategyBreakdown['HEDGE']) {
    profile = 'ASYMMETRIC_HEDGE';
  } else if (
    strategyBreakdown['CONTRARIAN'] &&
    strategyBreakdown['CONTRARIAN'] > buyTrades.length * 0.3
  ) {
    profile = 'CONTRARIAN_TRADER';
  } else if (primaryBias !== 'NEUTRAL') {
    profile = 'DIRECTIONAL';
  }

  // Entry patterns
  const entryPatterns: string[] = [];
  if (downTrades.length > upTrades.length) {
    entryPatterns.push(`Ưu tiên DOWN (${downTrades.length} vs ${upTrades.length} lệnh UP)`);
  } else if (upTrades.length > downTrades.length) {
    entryPatterns.push(`Ưu tiên UP (${upTrades.length} vs ${downTrades.length} lệnh DOWN)`);
  } else if (upTrades.length > 0) {
    entryPatterns.push(`Cân bằng (${upTrades.length} UP, ${downTrades.length} DOWN)`);
  }
  if (totalDownInvested > totalUpInvested * 1.2) {
    entryPatterns.push(`Vốn DOWN lớn hơn (${formatUsd(totalDownInvested)} vs ${formatUsd(totalUpInvested)})`);
  } else if (totalUpInvested > totalDownInvested * 1.2) {
    entryPatterns.push(`Vốn UP lớn hơn (${formatUsd(totalUpInvested)} vs ${formatUsd(totalDownInvested)})`);
  }
  if (upEdge > 0.02) {
    entryPatterns.push(`Mua UP giá tốt hơn thị trường (edge +${(upEdge * 100).toFixed(1)}%)`);
  }
  if (downEdge > 0.02) {
    entryPatterns.push(`Mua DOWN giá tốt hơn thị trường (edge +${(downEdge * 100).toFixed(1)}%)`);
  }
  if (strategyBreakdown['CONTRARIAN']) {
    entryPatterns.push(`${strategyBreakdown['CONTRARIAN']} lệnh contrarian (mua bên odds thấp)`);
  }

  const profileInfo = PROFILE_LABELS[profile] || PROFILE_LABELS['NO_DATA'];

  return (
    <div className="glass-card">
      <div className="card-title">
        <Brain size={14} />
        Hedging Analysis
      </div>

      {/* Profile */}
      <div className="insight-profile">
        <div>
          <div className="profile-label">Strategy Profile</div>
          <div className="profile-value">{profileInfo.label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {profileInfo.desc}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Primary Bias</div>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            {primaryBias === 'UP' && (
              <>
                <TrendingUp size={16} style={{ color: 'var(--up)' }} />
                <span style={{ color: 'var(--up)' }}>UP</span>
              </>
            )}
            {primaryBias === 'DOWN' && (
              <>
                <TrendingDown size={16} style={{ color: 'var(--down)' }} />
                <span style={{ color: 'var(--down)' }}>DOWN</span>
              </>
            )}
            {primaryBias === 'NEUTRAL' && (
              <>
                <Minus size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-muted)' }}>NEUTRAL</span>
              </>
            )}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Avg ratio: {(avgHedgeRatio * 100).toFixed(0)}/{((1 - avgHedgeRatio) * 100).toFixed(0)}
          </div>
        </div>
      </div>

      {/* Entry patterns */}
      {entryPatterns.length > 0 && (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Entry Patterns
          </div>
          <ul className="insight-patterns">
            {entryPatterns.map((p, i) => (
              <li key={i}>💡 {p}</li>
            ))}
          </ul>
        </>
      )}

      {/* Comparison table */}
      {buyTrades.length > 0 && (
        <table className="insight-table">
          <thead>
            <tr>
              <th></th>
              <th className="col-up">UP</th>
              <th className="col-down">DOWN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>Total Trades</td>
              <td className="col-up">{upTrades.length}</td>
              <td className="col-down">{downTrades.length}</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>Total Invested</td>
              <td className="col-up">{formatUsd(totalUpInvested)}</td>
              <td className="col-down">{formatUsd(totalDownInvested)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>Avg Fill Price</td>
              <td className="col-up">{avgUpFillPrice.toFixed(4)}</td>
              <td className="col-down">{avgDownFillPrice.toFixed(4)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>Avg Market Odds</td>
              <td className="col-up">{(avgUpMarketOdds * 100).toFixed(1)}%</td>
              <td className="col-down">{(avgDownMarketOdds * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>Edge*</td>
              <td style={{ color: upEdge >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {upEdge >= 0 ? '+' : ''}{(upEdge * 100).toFixed(2)}%
              </td>
              <td style={{ color: downEdge >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {downEdge >= 0 ? '+' : ''}{(downEdge * 100).toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {buyTrades.length > 0 && (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
          *Edge = Market odds − Fill price (positive = got better price than market)
        </div>
      )}

      {/* Strategy breakdown */}
      {Object.keys(strategyBreakdown).length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Strategy Breakdown
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {Object.entries(strategyBreakdown).map(([tag, count]) => (
              <span key={tag} className="strategy-tag" style={{ fontSize: '0.75rem' }}>
                {tag}: {count}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
            Frequency: {tradeFrequency.toFixed(1)} trades/min
          </div>
        </div>
      )}
    </div>
  );
}
