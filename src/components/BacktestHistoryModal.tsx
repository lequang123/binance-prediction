'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import type { BacktestRunRecord } from '@/lib/types';
import { History, X, Trash2, ArrowLeft, TrendingUp, Calendar, AlertTriangle, RefreshCw } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface BacktestHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBotId?: string;
  onSelectRunToExecute?: (config: any) => void;
}

export default function BacktestHistoryModal({
  isOpen,
  onClose,
  selectedBotId,
  onSelectRunToExecute,
}: BacktestHistoryModalProps) {
  const [selectedBotFilter, setSelectedBotFilter] = useState<string>(selectedBotId || 'ALL');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // SWR fetch list
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; history: Omit<BacktestRunRecord, 'trades'>[] }>(
    isOpen ? '/api/bots/backtest/history' : null,
    fetcher
  );

  // SWR fetch detail of selected run
  const { data: detailData, isLoading: detailLoading } = useSWR<{ ok: boolean; record: BacktestRunRecord }>(
    selectedRunId ? `/api/bots/backtest/history?runId=${selectedRunId}` : null,
    fetcher
  );

  // Bộ lọc cho danh sách lệnh của 1 phiên
  const [tradeFilter, setTradeFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all');
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;

  if (!isOpen) return null;

  const historyList = data?.history || [];
  const filteredList = selectedBotFilter === 'ALL'
    ? historyList
    : historyList.filter((r) => r.botId === selectedBotFilter);

  // Lấy danh sách các unique bots đã từng test
  const uniqueBots = Array.from(new Set(historyList.map((r) => JSON.stringify({ id: r.botId, name: r.botName }))))
    .map((str) => JSON.parse(str) as { id: string; name: string });

  const handleDeleteRun = async (runId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa bản ghi kiểm thử này?')) return;
    try {
      const res = await fetch(`/api/bots/backtest/history?runId=${runId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        if (selectedRunId === runId) setSelectedRunId(null);
        await mutate();
      } else {
        alert(json.message || 'Lỗi khi xóa bản ghi');
      }
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || err));
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('⚠️ Bạn có chắc muốn xóa TOÀN BỘ lịch sử kiểm thử không?')) return;
    try {
      const res = await fetch('/api/bots/backtest/history?clearAll=true', { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        setSelectedRunId(null);
        await mutate();
      }
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || err));
    }
  };

  const currentRun = detailData?.record;
  const trades = currentRun?.trades || [];
  const filteredTrades = trades.filter((t) => {
    if (tradeFilter === 'win' && !t.isWin) return false;
    if (tradeFilter === 'loss' && t.isWin) return false;
    if (stepFilter !== 'all' && t.step !== stepFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredTrades.length / pageSize) || 1;
  const paginatedTrades = filteredTrades.slice((page - 1) * pageSize, page * pageSize);

  // SVG mini Equity Curve
  const renderEquityCurve = () => {
    if (!trades || trades.length < 2) return null;
    const initialBal = currentRun?.datasetScope.initialBalance || 1000;
    const balances = trades.map((t) => t.balanceAfter);
    const minBal = Math.min(...balances, initialBal);
    const maxBal = Math.max(...balances, initialBal);
    const range = maxBal - minBal || 1;

    const width = 600;
    const height = 90;
    const points = trades.map((t, idx) => {
      const x = (idx / (trades.length - 1)) * width;
      const y = height - ((t.balanceAfter - minBal) / range) * (height - 16) - 8;
      return `${x},${y}`;
    }).join(' ');

    const isProfit = (currentRun?.summary.netPnl ?? 0) >= 0;
    const strokeColor = isProfit ? '#22c55e' : '#ef4444';

    return (
      <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
          <span>📈 Đường cong vốn (Equity Curve - {trades.length} lệnh thực thi)</span>
          <span>Đỉnh vốn: <strong>${currentRun?.summary.peakBalance.toFixed(2)}</strong> | Thấp nhất: <strong>${minBal.toFixed(2)}</strong></span>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            points={points}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 16,
        width: '100%',
        maxWidth: selectedRunId ? '960px' : '840px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        transition: 'max-width 0.25s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedRunId ? (
              <button
                type="button"
                onClick={() => setSelectedRunId(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <ArrowLeft size={16} /> Quay lại danh sách
              </button>
            ) : (
              <History size={22} style={{ color: '#60a5fa' }} />
            )}

            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>
                {selectedRunId ? 'Chi Tiết Phiên Kiểm Thử' : 'Lịch Sử Kiểm Thử (Backtest History)'}
              </h2>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                {selectedRunId
                  ? `Mã phiên: #${selectedRunId.slice(-6)} • ${currentRun?.botName || ''}`
                  : `Đã lưu ${historyList.length} phiên kiểm thử trên dữ liệu lịch sử thực tế`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!selectedRunId && historyList.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Trash2 size={14} /> Xóa tất cả
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* VIEW 1: DANH SÁCH LỊCH SỬ CÁC LẦN TEST */}
          {!selectedRunId && (
            <div>
              {/* Bot Filter Bar */}
              {uniqueBots.length > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Lọc theo Bot:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedBotFilter('ALL')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: selectedBotFilter === 'ALL' ? '1px solid #3b82f6' : '1px solid #334155',
                      background: selectedBotFilter === 'ALL' ? 'rgba(59, 130, 246, 0.2)' : '#1e293b',
                      color: selectedBotFilter === 'ALL' ? '#60a5fa' : '#94a3b8',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Tất cả ({historyList.length})
                  </button>
                  {uniqueBots.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBotFilter(b.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: selectedBotFilter === b.id ? '1px solid #3b82f6' : '1px solid #334155',
                        background: selectedBotFilter === b.id ? 'rgba(59, 130, 246, 0.2)' : '#1e293b',
                        color: selectedBotFilter === b.id ? '#60a5fa' : '#94a3b8',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}

              {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  ⏳ Đang tải lịch sử kiểm thử...
                </div>
              ) : filteredList.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 12,
                  border: '1px dashed #334155',
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🧪</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                    Chưa có phiên kiểm thử nào được lưu
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Hãy chọn một bot trên Dashboard và bấm <strong>"🧪 Chạy Data Cũ"</strong> để thực thi mô phỏng và lưu kết quả.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredList.map((item) => {
                    const isProfit = item.summary.netPnl >= 0;
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid #1e293b',
                          borderRadius: 12,
                          padding: '14px 18px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 16,
                          flexWrap: 'wrap',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        {/* Bot Info */}
                        <div style={{ flex: '1 1 260px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <strong style={{ fontSize: '0.92rem', color: '#f8fafc' }}>{item.botName}</strong>
                            <span style={{
                              background: item.summary.rating === 'EXCELLENT' ? 'rgba(34, 197, 94, 0.15)' : item.summary.rating === 'HIGH_RISK' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                              color: item.summary.rating === 'EXCELLENT' ? '#4ade80' : item.summary.rating === 'HIGH_RISK' ? '#f87171' : '#60a5fa',
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                            }}>
                              {item.summary.rating === 'EXCELLENT' ? 'HIỆU QUẢ CAO' : item.summary.rating === 'HIGH_RISK' ? 'RỦI RO' : 'CÂN BẰNG'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            {new Date(item.executedAt).toLocaleString('vi-VN')} • {item.datasetScope.rangeLabel}
                          </div>
                        </div>

                        {/* Metric Highlights */}
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Tỉ lệ thắng</div>
                            <div style={{
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: item.summary.winRate >= 80 ? '#4ade80' : item.summary.winRate >= 60 ? '#facc15' : '#f87171',
                            }}>
                              {item.summary.winRate}%
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                              {item.summary.wins}W / {item.summary.losses}L
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>PnL Ròng</div>
                            <div style={{
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: isProfit ? '#4ade80' : '#f87171',
                            }}>
                              {isProfit ? '+' : ''}${item.summary.netPnl.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                              {item.summary.tradesCount} lệnh
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Max DD</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#cbd5e1' }}>
                              ${item.summary.maxDrawdown.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                              Sụt giảm
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunId(item.id);
                              setPage(1);
                            }}
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#60a5fa',
                              padding: '8px 14px',
                              borderRadius: 6,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            👁️ Xem chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRun(item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              padding: '8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                            title="Xóa bản ghi này"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: DRILL-DOWN CHI TIẾT 1 PHIÊN TEST */}
          {selectedRunId && (
            <div>
              {detailLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  ⏳ Đang tải chi tiết lệnh của phiên kiểm thử...
                </div>
              ) : currentRun ? (
                <div>
                  {/* Summary Bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>
                        {currentRun.botName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                        {currentRun.datasetScope.rangeLabel} • Vốn khởi điểm: ${currentRun.datasetScope.initialBalance} • Khớp thực tế: {currentRun.datasetScope.simulateSlippage ? 'Có trượt giá' : 'Không trượt giá'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        Thời gian: {new Date(currentRun.executedAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  {/* KPI Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                    marginBottom: 14,
                  }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Tỉ lệ thắng</div>
                      <div style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        color: currentRun.summary.winRate >= 80 ? '#4ade80' : currentRun.summary.winRate >= 60 ? '#facc15' : '#f87171',
                      }}>
                        {currentRun.summary.winRate}%
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        {currentRun.summary.wins}W / {currentRun.summary.losses}L ({currentRun.summary.tradesCount} lệnh)
                      </div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Lãi ròng (Net PnL)</div>
                      <div style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        color: currentRun.summary.netPnl >= 0 ? '#4ade80' : '#f87171',
                      }}>
                        {currentRun.summary.netPnl >= 0 ? '+' : ''}${currentRun.summary.netPnl.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        ROI: {currentRun.summary.roiPct >= 0 ? '+' : ''}{currentRun.summary.roiPct}%
                      </div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Sụt giảm tối đa</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentRun.summary.maxDrawdown < 100 ? '#60a5fa' : '#f87171' }}>
                        ${currentRun.summary.maxDrawdown.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Max DD ({currentRun.summary.maxDrawdownPct}%)
                      </div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Chuỗi thắng / thua</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#cbd5e1' }}>
                        <span style={{ color: '#4ade80' }}>{currentRun.summary.maxWinStreak}W</span>
                        <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
                        <span style={{ color: '#f87171' }}>{currentRun.summary.maxLossStreak}L</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Cắt lỗ chuỗi: {currentRun.summary.cutLossCount} lần
                      </div>
                    </div>
                  </div>

                  {/* Equity Curve Chart */}
                  {renderEquityCurve()}

                  {/* Filter & Trades Table */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Kết quả:</span>
                        {(['all', 'win', 'loss'] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => { setTradeFilter(r); setPage(1); }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              border: tradeFilter === r ? '1px solid #3b82f6' : '1px solid #334155',
                              background: tradeFilter === r ? 'rgba(59, 130, 246, 0.2)' : '#1e293b',
                              color: tradeFilter === r ? '#60a5fa' : '#94a3b8',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                            }}
                          >
                            {r === 'all' ? 'Tất cả' : r === 'win' ? 'Thắng (W)' : 'Thua (L)'}
                          </button>
                        ))}
                      </div>

                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Tổng {filteredTrades.length} lệnh (Trang {page}/{totalPages})
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '280px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid #1e293b' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', background: '#090d16' }}>
                            <th style={{ padding: '6px 8px' }}>Kỳ</th>
                            <th style={{ padding: '6px 8px' }}>Phút</th>
                            <th style={{ padding: '6px 8px' }}>Bước</th>
                            <th style={{ padding: '6px 8px' }}>Cược ($)</th>
                            <th style={{ padding: '6px 8px' }}>Cửa &amp; Odds</th>
                            <th style={{ padding: '6px 8px' }}>Kết quả</th>
                            <th style={{ padding: '6px 8px' }}>PnL</th>
                            <th style={{ padding: '6px 8px' }}>Số dư</th>
                            <th style={{ padding: '6px 8px' }}>Hành động</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTrades.map((t, idx) => (
                            <tr
                              key={idx}
                              style={{
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                background: t.isWin ? 'rgba(34, 197, 94, 0.02)' : 'rgba(239, 68, 68, 0.03)',
                              }}
                            >
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                                #{t.roundId} <span style={{ color: '#64748b' }}>{t.timeStr}</span>
                              </td>
                              <td style={{ padding: '6px 8px' }}>{t.minuteBucket}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>B{t.step}</td>
                              <td style={{ padding: '6px 8px' }}>${t.stake}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ color: t.side === 'Up' ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                                  {t.side}
                                </span>{' '}
                                @ {(t.odds * 100).toFixed(0)}%
                              </td>
                              <td style={{ padding: '6px 8px', fontWeight: 700, color: t.isWin ? '#4ade80' : '#f87171' }}>
                                {t.isWin ? 'THẮNG' : 'THUA'}
                              </td>
                              <td style={{ padding: '6px 8px', fontWeight: 700, color: t.pnl >= 0 ? '#4ade80' : '#f87171' }}>
                                {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
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

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          style={{ padding: '3px 8px', borderRadius: 4, background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                          ◀ Trang trước
                        </button>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                          {page} / {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          style={{ padding: '3px 8px', borderRadius: 4, background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                        >
                          Trang sau ▶
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: '#f87171' }}>
                  Không tìm thấy chi tiết phiên kiểm thử này.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '12px 20px',
          borderTop: '1px solid #1e293b',
          background: '#090d16',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
