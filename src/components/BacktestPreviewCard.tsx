'use client';

import React, { useState } from 'react';
import type { BacktestResult } from '@/lib/types';

interface BacktestPreviewCardProps {
  result: BacktestResult | null;
  loading: boolean;
}

export default function BacktestPreviewCard({ result, loading }: BacktestPreviewCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [filterStep, setFilterStep] = useState<number | 'all'>('all');
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  if (loading) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px dashed rgba(255, 255, 255, 0.15)',
        borderRadius: 12,
        padding: '20px',
        textAlign: 'center',
        color: '#9aa0a6',
        fontSize: '0.9rem',
      }}>
        ⏳ Đang chạy mô phỏng trên 775 kỳ logs lịch sử...
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const isProfitable = result.netPnl > 0;
  const ratingColors = {
    EXCELLENT: { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', text: '🌟 HIỆU QUẢ CAO' },
    BALANCED: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', text: '⚖️ CÂN BẰNG' },
    HIGH_RISK: { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', text: '⚠️ RỦI RO CAO' },
  };

  const currentRating = ratingColors[result.rating] || ratingColors.BALANCED;
  const allTrades = result.trades || [];
  const isFlatMode = allTrades.length > 0 && allTrades.every(t => t.step === 1);

  // Lọc lịch sử theo bộ lọc
  const filteredTrades = allTrades.filter(t => {
    if (filterStep !== 'all' && t.step !== filterStep) return false;
    if (filterResult === 'win' && !t.isWin) return false;
    if (filterResult === 'loss' && t.isWin) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredTrades.length / pageSize) || 1;
  const paginatedTrades = filteredTrades.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: 12,
      padding: '16px 20px',
      marginTop: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>📊</span>
          <strong style={{ fontSize: '0.95rem', color: '#f1f5f9' }}>Thẩm Định Thống Kê ({result.totalRoundsEvaluated} Kỳ Thực Tế)</strong>
        </div>
        <span style={{
          background: currentRating.bg,
          color: currentRating.color,
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: '0.75rem',
          fontWeight: 700,
          border: `1px solid ${currentRating.color}40`,
        }}>
          {currentRating.text}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 12,
        marginBottom: 14,
      }}>
        {/* Win Rate */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Tỉ lệ thắng</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: result.winRate >= 80 ? '#4ade80' : result.winRate >= 60 ? '#facc15' : '#f87171' }}>
            {result.winRate}%
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{result.wins}W / {result.losses}L</div>
        </div>

        {/* Net PnL */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Lãi ròng (PnL)</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: isProfitable ? '#4ade80' : '#f87171' }}>
            {isProfitable ? '+' : ''}${result.netPnl.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Trên {result.tradesCount} lệnh</div>
        </div>

        {/* Max Drawdown */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Sụt giảm tối đa</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: result.maxDrawdown < 150 ? '#60a5fa' : '#f87171' }}>
            ${result.maxDrawdown.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Max Drawdown</div>
        </div>

        {/* Cut Loss Count */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>
            {isFlatMode ? 'Cắt lỗ chuỗi' : 'Số lần cắt lỗ'}
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: result.cutLossCount <= 4 ? '#4ade80' : '#f87171' }}>
            {isFlatMode ? '0 (Đều tay)' : `${result.cutLossCount} lần`}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
            {isFlatMode ? 'Không dùng gấp thếp' : 'Thua chạm max steps'}
          </div>
        </div>
      </div>

      {/* Button Toggle Chi Tiết Từng Lệnh */}
      {allTrades.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            style={{
              width: '100%',
              background: showHistory ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {showHistory ? '▲ Thu gọn Lịch Sử Lệnh' : `📜 Xem Lịch Sử Chi Tiết Từng Lệnh (${allTrades.length} lệnh)`}
          </button>

          {/* Expandable History Table */}
          {showHistory && (
            <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Filter Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                {!isFlatMode ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Lọc bước:</span>
                    {(['all', 1, 2, 3, 4] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setFilterStep(s); setPage(1); }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: filterStep === s ? '1px solid #38bdf8' : '1px solid #334155',
                          background: filterStep === s ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                          color: filterStep === s ? '#38bdf8' : '#94a3b8',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                        }}
                      >
                        {s === 'all' ? 'Tất cả' : `B${s}`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.15)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      fontWeight: 600,
                    }}>
                      🛡️ Chế độ: Đi đều tay cố định (Flat Bet)
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kết quả:</span>
                  {(['all', 'win', 'loss'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setFilterResult(r); setPage(1); }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: filterResult === r ? '1px solid #38bdf8' : '1px solid #334155',
                        background: filterResult === r ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                        color: filterResult === r ? '#38bdf8' : '#94a3b8',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                    >
                      {r === 'all' ? 'Tất cả' : r === 'win' ? 'Thắng (W)' : 'Thua (L)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                      <th style={{ padding: '6px 8px' }}>Kỳ (Mã / Giờ)</th>
                      <th style={{ padding: '6px 8px' }}>Phút</th>
                      <th style={{ padding: '6px 8px' }}>Bước</th>
                      <th style={{ padding: '6px 8px' }}>Cược ($)</th>
                      <th style={{ padding: '6px 8px' }}>Cửa &amp; Odds</th>
                      <th style={{ padding: '6px 8px' }}>Kết quả</th>
                      <th style={{ padding: '6px 8px' }}>PnL</th>
                      <th style={{ padding: '6px 8px' }}>Số dư</th>
                      <th style={{ padding: '6px 8px' }}>Hành động tiếp theo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTrades.map((t, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: t.isWin ? 'rgba(34, 197, 94, 0.02)' : 'rgba(239, 68, 68, 0.03)',
                        }}
                      >
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                          #{t.roundId} <span style={{ color: '#64748b' }}>{t.timeStr}</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                            {t.minuteBucket}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: allTrades.every(tr => tr.step === 1) ? '#38bdf8' : t.step === 1 ? '#cbd5e1' : t.step === 2 ? '#facc15' : '#f87171' }}>
                          {allTrades.every(tr => tr.step === 1) ? 'Đều tay' : `B${t.step}`}
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#f8fafc' }}>
                          ${t.stake}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ color: t.side === 'Up' ? '#4ade80' : '#f87171', fontWeight: 600 }}>{t.side}</span> @ {(t.odds * 100).toFixed(0)}%
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{
                            background: t.isWin ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: t.isWin ? '#4ade80' : '#f87171',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                          }}>
                            {t.isWin ? 'WIN' : 'LOSS'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: t.pnl > 0 ? '#4ade80' : '#f87171' }}>
                          {t.pnl > 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                          ${t.balanceAfter.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '0.7rem' }}>
                          {t.actionNote}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filteredTrades.length)} trên {filteredTrades.length} lệnh
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{
                      background: page <= 1 ? '#1e293b' : '#334155',
                      color: page <= 1 ? '#475569' : '#f8fafc',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.7rem',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ◀ Trang trước
                  </button>
                  <span style={{ fontSize: '0.7rem', color: '#cbd5e1', alignSelf: 'center' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{
                      background: page >= totalPages ? '#1e293b' : '#334155',
                      color: page >= totalPages ? '#475569' : '#f8fafc',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.7rem',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Trang sau ▶
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
