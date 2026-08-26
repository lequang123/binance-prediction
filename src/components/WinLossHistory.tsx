'use client';

import { History, Trophy, XCircle, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GroupedHistoricalResult, WinLossSummary } from '@/lib/types';

interface WinLossHistoryProps {
  results: GroupedHistoricalResult[];
  summary: WinLossSummary;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  isLoading?: boolean;
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function WinLossHistory({ results, summary, page, totalPages, onPageChange, isLoading }: WinLossHistoryProps) {
  return (
    <div className="glass-card" style={{ width: '100%' }}>
      <div className="card-title">
        <History size={16} />
        Win/Loss History Dashboard
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Win Rate</div>
          <div className={`stat-card-value ${summary.winRate >= 0.5 ? 'positive' : 'negative'}`}>
            {(summary.winRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Rounds</div>
          <div className="stat-card-value accent">{summary.totalRounds}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            <Trophy size={12} style={{ display: 'inline', marginRight: 4 }} />
            Wins
          </div>
          <div className="stat-card-value positive">{summary.wins}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">
            <XCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
            Losses
          </div>
          <div className="stat-card-value negative">{summary.losses}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Net PnL</div>
          <div className={`stat-card-value ${summary.netPnl >= 0 ? 'positive' : 'negative'}`}>
            {formatUsd(summary.netPnl)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Win</div>
          <div className="stat-card-value positive">{formatUsd(summary.avgWin)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Loss</div>
          <div className="stat-card-value negative">{formatUsd(summary.avgLoss)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Max Win / Max Loss</div>
          <div className="stat-card-value">
            <span className="positive">{formatUsd(summary.maxWin)}</span>
            {' / '}
            <span className="negative">{formatUsd(summary.maxLoss)}</span>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="history-scroll" style={{ position: 'relative', minHeight: '300px' }}>
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10, borderRadius: 'var(--radius)' }}>
            <div className="spinner" />
          </div>
        )}
        
        {results.length === 0 && !isLoading ? (
          <div className="empty-state">Chưa có lịch sử giao dịch đã đóng.</div>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>UP Leg</th>
                <th>DOWN Leg</th>
                <th>Total PnL</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.marketTopicId}`}>
                  <td style={{ fontFamily: 'var(--font-sans)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.marketTitle}
                  </td>
                  <td>
                    {r.up ? (
                      <div>
                        <span style={{ color: 'var(--up)', fontSize: '0.8rem', marginRight: 8 }}><TrendingUp size={10} style={{display:'inline'}}/> {r.up.avgPrice.toFixed(4)} ({r.up.shares.toFixed(0)})</span>
                        <br/>
                        <span style={{ color: r.up.pnl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: r.up.pnl >= 0 ? 600 : 400 }}>
                          {formatUsd(r.up.pnl)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td>
                    {r.down ? (
                      <div>
                        <span style={{ color: 'var(--down)', fontSize: '0.8rem', marginRight: 8 }}><TrendingDown size={10} style={{display:'inline'}}/> {r.down.avgPrice.toFixed(4)} ({r.down.shares.toFixed(0)})</span>
                        <br/>
                        <span style={{ color: r.down.pnl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: r.down.pnl >= 0 ? 600 : 400 }}>
                          {formatUsd(r.down.pnl)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`result-badge ${r.isWin ? 'win' : 'loss'}`} style={{ marginBottom: 4, display: 'inline-block' }}>
                      {r.isWin ? '✅ WIN' : '❌ LOSS'}
                    </span>
                    <br/>
                    <span style={{ color: r.totalPnl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 700, fontSize: '1.1rem' }}>
                      {formatUsd(r.totalPnl)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 'var(--space-md)', gap: 'var(--space-md)' }}>
          <button 
            onClick={() => onPageChange(page - 1)} 
            disabled={page <= 1 || isLoading}
            style={{ 
              padding: '10px 16px', 
              background: 'var(--accent)', 
              color: '#ffffff',
              border: 'none', 
              borderRadius: 'var(--radius)', 
              cursor: page <= 1 || isLoading ? 'not-allowed' : 'pointer', 
              opacity: page <= 1 || isLoading ? 0.5 : 1, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              fontWeight: 600
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          
          <span style={{ fontSize: '1rem', color: 'var(--text)', fontWeight: 600, background: 'var(--surface-light)', padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            Page {page} of {totalPages}
          </span>
          
          <button 
            onClick={() => onPageChange(page + 1)} 
            disabled={page >= totalPages || isLoading}
            style={{ 
              padding: '10px 16px', 
              background: 'var(--accent)', 
              color: '#ffffff',
              border: 'none', 
              borderRadius: 'var(--radius)', 
              cursor: page >= totalPages || isLoading ? 'not-allowed' : 'pointer', 
              opacity: page >= totalPages || isLoading ? 0.5 : 1, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8,
              fontWeight: 600
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
