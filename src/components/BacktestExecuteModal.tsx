'use client';

import React, { useState, useEffect } from 'react';
import type { BotConfig, BacktestRunRecord } from '@/lib/types';
import { Play, CheckCircle, AlertTriangle, TrendingUp, X, Sparkles, Sliders, History } from 'lucide-react';

interface BacktestExecuteModalProps {
  bot: BotConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onViewHistory?: () => void;
  onRunComplete?: (record: BacktestRunRecord) => void;
}

export default function BacktestExecuteModal({
  bot,
  isOpen,
  onClose,
  onViewHistory,
  onRunComplete,
}: BacktestExecuteModalProps) {
  const [roundLimit, setRoundLimit] = useState<number>(0); // 0 = Toàn bộ
  const [initialBalance, setInitialBalance] = useState<number>(1000);
  const [simulateSlippage, setSimulateSlippage] = useState<boolean>(true);
  const [slippageBps, setSlippageBps] = useState<number>(bot?.maxSlippageBps || 450);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultRecord, setResultRecord] = useState<BacktestRunRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'result'>('config');

  // Bộ lọc cho danh sách lệnh của kết quả
  const [tradeFilter, setTradeFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all');
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;

  // Hàm thực thi kiểm thử cho bot
  const runTest = async (
    targetBot: BotConfig,
    limit = roundLimit,
    bal = initialBalance,
    simSlip = simulateSlippage,
    slipBps = slippageBps
  ) => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/bots/backtest/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: targetBot.id,
          config: targetBot,
          options: {
            roundLimit: limit,
            initialBalance: bal,
            simulateSlippage: simSlip,
            slippageBps: slipBps,
          },
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.message || 'Lỗi khi thực thi backtest');
      }

      setResultRecord(data.record);
      setActiveTab('result');
      if (onRunComplete) {
        onRunComplete(data.record);
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi chạy kiểm thử');
      setActiveTab('config');
    } finally {
      setIsRunning(false);
    }
  };

  // Tự động chạy ngay lập tức khi mở modal hoặc khi cấu hình bot thay đổi
  useEffect(() => {
    if (bot && isOpen) {
      setResultRecord(null);
      setError(null);
      const bps = bot.maxSlippageBps || 450;
      setSlippageBps(bps);
      setPage(1);
      runTest(bot, roundLimit, initialBalance, simulateSlippage, bps);
    }
  }, [bot?.id, bot?.updatedAt, JSON.stringify(bot), isOpen]);

  if (!isOpen || !bot) return null;

  const handleExecute = () => {
    runTest(bot, roundLimit, initialBalance, simulateSlippage, slippageBps);
  };

  const trades = resultRecord?.trades || [];
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
    const balances = trades.map((t) => t.balanceAfter);
    const minBal = Math.min(...balances, initialBalance);
    const maxBal = Math.max(...balances, initialBalance);
    const range = maxBal - minBal || 1;

    const width = 600;
    const height = 90;
    const points = trades.map((t, idx) => {
      const x = (idx / (trades.length - 1)) * width;
      const y = height - ((t.balanceAfter - minBal) / range) * (height - 16) - 8;
      return `${x},${y}`;
    }).join(' ');

    const isProfit = (resultRecord?.summary.netPnl ?? 0) >= 0;
    const strokeColor = isProfit ? '#22c55e' : '#ef4444';
    const fillColor = isProfit ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';

    return (
      <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
          <span>📈 Đường cong vốn (Equity Curve - {trades.length} lệnh)</span>
          <span>Cao nhất: <strong>${resultRecord?.summary.peakBalance.toFixed(2)}</strong> | Thấp nhất: <strong>${(minBal).toFixed(2)}</strong></span>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
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
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(6px)',
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
        maxWidth: activeTab === 'result' ? '920px' : '620px',
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.2rem' }}>🧪</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Thực Thi Dữ Liệu Cũ (Backtest Real-Simulation)
              </h2>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
              Bot: <strong style={{ color: '#60a5fa' }}>{bot.name}</strong> • Khớp lệnh &amp; báo giá thực tế Binance
            </div>
          </div>
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

        {/* Tab Toggle (nếu đã có kết quả) */}
        {resultRecord && (
          <div style={{
            display: 'flex',
            background: '#1e293b',
            borderBottom: '1px solid #334155',
            padding: '0 20px',
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('result')}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'result' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'result' ? '#60a5fa' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              📊 Kết Quả Kiểm Thử Vừa Chạy
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'config' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'config' ? '#60a5fa' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              ⚙️ Tùy Chỉnh Tham Số Chạy Lại
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {isRunning && !resultRecord ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>⏳</div>
              <h3 style={{ fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700, margin: '0 0 6px 0' }}>
                Đang thực thi dữ liệu cũ cho &ldquo;{bot.name}&rdquo;...
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: 450, margin: '0 auto' }}>
                Đang duyệt từng kỳ logs thực tế, so khớp điều kiện chiến thuật {bot.strategy === 'TRAP_TRADERS' ? 'Bẫy Trader' : 'Cửa Thuận'}, tính toán báo giá Binance và trượt giá...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              {activeTab === 'config' && (
            <div>
              {/* Bot Strategy & Criteria Summary Box */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 18,
              }}>
                <div style={{ fontSize: '0.78rem', color: '#93c5fd', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🎯</span> ĐIỀU KIỆN VÀO LỆNH RIÊNG BIỆT CỦA BOT NÀY:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: '0.74rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Chiến thuật:</span>{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {bot.strategy === 'TRAP_TRADERS' ? '🪤 Bẫy Trader (Trap)' : '🛡️ Cửa Thuận (Favorite)'}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Khung phút:</span>{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {bot.targetMinutes && bot.targetMinutes.length > 0 ? bot.targetMinutes.join(', ') : `${bot.minTimeRemaining}-${bot.maxTimeRemaining}s`}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Mốc Odds:</span>{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {bot.targetOddsBuckets && bot.targetOddsBuckets.length > 0 ? bot.targetOddsBuckets.join(', ') + '%' : `${(bot.oddsMin * 100).toFixed(0)}-${(bot.oddsMax * 100).toFixed(0)}%`}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Quản lý vốn:</span>{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {bot.stakeMode === 'FLAT' ? `Đều tay $${bot.baseStake}` : bot.stakeMode === 'CUSTOM_LADDER' ? `Chuỗi [${bot.customLadder?.join(',')}]` : `Gấp ${bot.multiplier}x (${bot.maxSteps} bước)`}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Đệm giá:</span>{' '}
                    <strong style={{ color: '#f8fafc' }}>≥${bot.minPriceBuffer}</strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Max Loss:</span>{' '}
                    <strong style={{ color: '#f87171' }}>${bot.maxDailyLoss}/ngày</strong>
                  </div>
                </div>
              </div>

              {/* Scope Selection */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 8 }}>
                  Phạm vi số kỳ kiểm thử:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { val: 0, label: 'Toàn bộ logs', sub: 'Tối đa (770+ kỳ)' },
                    { val: 500, label: '500 kỳ', sub: 'Gần nhất' },
                    { val: 200, label: '200 kỳ', sub: 'Gần nhất' },
                    { val: 100, label: '100 kỳ', sub: 'Siêu tốc' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setRoundLimit(item.val)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: roundLimit === item.val ? '1px solid #3b82f6' : '1px solid #334155',
                        background: roundLimit === item.val ? 'rgba(59, 130, 246, 0.18)' : '#1e293b',
                        color: roundLimit === item.val ? '#60a5fa' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.label}</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>{item.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Initial Balance */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, marginBottom: 8 }}>
                  Số vốn giả định ban đầu ($):
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[200, 500, 1000, 2000].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setInitialBalance(b)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 6,
                        border: initialBalance === b ? '1px solid #22c55e' : '1px solid #334155',
                        background: initialBalance === b ? 'rgba(34, 197, 94, 0.18)' : '#1e293b',
                        color: initialBalance === b ? '#4ade80' : '#94a3b8',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ${b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Simulation Settings */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                padding: '14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                      ⚡ Mô phỏng khớp lệnh thực tế Binance
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Sử dụng báo giá API thực tế `favAmountOut`, áp dụng trượt giá và quy tắc dừng Max Daily Loss
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={simulateSlippage}
                    onChange={(e) => setSimulateSlippage(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                </div>

                {simulateSlippage && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8', marginBottom: 4 }}>
                      <span>Mức trượt giá mô phỏng:</span>
                      <strong style={{ color: '#38bdf8' }}>{slippageBps} bps ({(slippageBps / 100).toFixed(1)}%)</strong>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={1200}
                      step={50}
                      value={slippageBps}
                      onChange={(e) => setSlippageBps(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isRunning}
                onClick={handleExecute}
                style={{
                  width: '100%',
                  background: isRunning
                    ? '#334155'
                    : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                }}
              >
                {isRunning ? (
                  <>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                    Đang thực thi mô phỏng trên tập dữ liệu logs...
                  </>
                ) : (
                  <>
                    <Play size={18} /> Bắt Đầu Thực Thi Kiểm Thử
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'result' && resultRecord && (
            <div>
              {/* Header Status & Rating */}
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
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                    Kết quả kiểm thử cho <strong>{resultRecord.botName}</strong> ({resultRecord.datasetScope.rangeLabel})
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                    Chạy lúc: {new Date(resultRecord.executedAt).toLocaleString('vi-VN')} • Mã phiên: #{resultRecord.id.slice(-6)}
                  </div>
                </div>
                <span style={{
                  background: resultRecord.summary.rating === 'EXCELLENT' ? 'rgba(34, 197, 94, 0.2)' : resultRecord.summary.rating === 'HIGH_RISK' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: resultRecord.summary.rating === 'EXCELLENT' ? '#4ade80' : resultRecord.summary.rating === 'HIGH_RISK' ? '#f87171' : '#60a5fa',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: '1px solid currentColor',
                }}>
                  {resultRecord.summary.rating === 'EXCELLENT' ? '🌟 HIỆU QUẢ CAO' : resultRecord.summary.rating === 'HIGH_RISK' ? '⚠️ RỦI RO CAO' : '⚖️ CÂN BẰNG'}
                </span>
              </div>

              {/* KPI Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Tỉ lệ thắng (Win Rate)</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: resultRecord.summary.winRate >= 80 ? '#4ade80' : resultRecord.summary.winRate >= 60 ? '#facc15' : '#f87171',
                  }}>
                    {resultRecord.summary.winRate}%
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    {resultRecord.summary.wins}W / {resultRecord.summary.losses}L ({resultRecord.summary.tradesCount} lệnh)
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Lãi ròng (Net PnL)</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: resultRecord.summary.netPnl >= 0 ? '#4ade80' : '#f87171',
                  }}>
                    {resultRecord.summary.netPnl >= 0 ? '+' : ''}${resultRecord.summary.netPnl.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    ROI: {resultRecord.summary.roiPct >= 0 ? '+' : ''}{resultRecord.summary.roiPct}%
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Sụt giảm tối đa</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: resultRecord.summary.maxDrawdown < 100 ? '#60a5fa' : '#f87171',
                  }}>
                    ${resultRecord.summary.maxDrawdown.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    Max Drawdown ({resultRecord.summary.maxDrawdownPct}%)
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Chuỗi thắng / thua</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#cbd5e1' }}>
                    <span style={{ color: '#4ade80' }}>{resultRecord.summary.maxWinStreak}W</span>
                    <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
                    <span style={{ color: '#f87171' }}>{resultRecord.summary.maxLossStreak}L</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    Cắt lỗ: {resultRecord.summary.cutLossCount} lần
                  </div>
                </div>
              </div>

              {/* Equity Curve */}
              {renderEquityCurve()}

              {/* Filter & Trade List */}
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
                    Hiển thị {filteredTrades.length} lệnh (Trang {page}/{totalPages})
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid #1e293b' }}>
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
          )}
          </>
        )}
      </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderTop: '1px solid #1e293b',
          background: '#090d16',
        }}>
          <div>
            {onViewHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewHistory();
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#93c5fd',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <History size={15} /> Xem Toàn Bộ Lịch Sử Backtest
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '8px 16px',
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
    </div>
  );
}
