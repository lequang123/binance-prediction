'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Plus, Play, ShieldAlert, Cpu, Activity, BarChart2 } from 'lucide-react';
import type { BotConfig, BotRuntimeState, BotTradeLog } from '@/lib/types';
import BotCard from '@/components/BotCard';
import BotConfigModal from '@/components/BotConfigModal';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface BotsResponse {
  ok: boolean;
  bots: {
    config: BotConfig;
    state: BotRuntimeState;
  }[];
  recentLogs: BotTradeLog[];
}

export default function BotsStudioPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<BotConfig | null>(null);

  const { data, error, isLoading, mutate } = useSWR<BotsResponse>('/api/bots', fetcher, {
    refreshInterval: 3000, // Cập nhật live mỗi 3 giây
  });

  const handleCreateNew = () => {
    setEditingBot(null);
    setModalOpen(true);
  };

  const handleEdit = (bot: BotConfig) => {
    setEditingBot(bot);
    setModalOpen(true);
  };

  const handleSaveBot = async (config: BotConfig) => {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.message || 'Lỗi khi lưu cấu hình bot');
    }
    await mutate();
  };

  const handleDeleteBot = async (id: string) => {
    const res = await fetch(`/api/bots?id=${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (json.ok) {
      await mutate();
    } else {
      alert(json.message || 'Lỗi khi xóa bot');
    }
  };

  const [redeeming, setRedeeming] = useState(false);
  const handleRedeemAll = async () => {
    try {
      setRedeeming(true);
      const res = await fetch('/api/bots/redeem', { method: 'POST' });
      const json = await res.json();
      alert(json.message || 'Đã gửi yêu cầu Redeem All!');
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || err));
    } finally {
      setRedeeming(false);
    }
  };

  const bots = data?.bots || [];
  const logs = data?.recentLogs || [];
  const [historyMode, setHistoryMode] = useState<'ALL' | 'REAL_TRADE' | 'SIMULATOR'>('ALL');

  const realLogs = logs.filter((l) => l.mode === 'REAL_TRADE');
  const simLogs = logs.filter((l) => l.mode === 'SIMULATOR');

  const currentDisplayLogs = historyMode === 'ALL'
    ? logs
    : historyMode === 'REAL_TRADE'
      ? realLogs
      : simLogs;

  const totalBots = bots.length;
  const liveBots = bots.filter((b) => b.config.enabled && b.config.mode === 'REAL_TRADE').length;
  const simBots = bots.filter((b) => b.config.enabled && b.config.mode === 'SIMULATOR').length;
  const combinedDailyPnl = bots.reduce((sum, b) => sum + (b.state?.dailyPnl || 0), 0);

  return (
    <main style={{
      minHeight: '100vh',
      background: '#090d16',
      color: '#f8fafc',
      padding: '24px 32px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Navigation & Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 28,
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              padding: '8px 14px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} /> Quay lại Dashboard
          </Link>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              🤖 Multi-Bot Studio
            </h1>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
              Cấu hình đa bot, thẩm định hiệu quả tức thì trên 765 kỳ logs và chạy tự động 24/7
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Link
            href="/stats"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              padding: '10px 16px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            <BarChart2 size={16} /> Thống kê Odds (/stats)
          </Link>

          <button
            type="button"
            onClick={handleRedeemAll}
            disabled={redeeming}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: '#facc15',
              padding: '10px 16px',
              borderRadius: 8,
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: redeeming ? 'not-allowed' : 'pointer',
            }}
          >
            {redeeming ? '⏳ Đang Redeem...' : '🎁 Redeem All Vị Thế Thắng'}
          </button>

          <button
            onClick={handleCreateNew}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            }}
          >
            <Plus size={18} /> Tạo Bot Mới
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        {/* Total Bots */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <Cpu size={16} /> Tổng số Bot
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>
            {totalBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot đã tạo</span>
          </div>
        </div>

        {/* Live Bots */}
        <div style={{
          background: liveBots > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)',
          border: liveBots > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: liveBots > 0 ? '#f87171' : '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <ShieldAlert size={16} /> Đang chạy LIVE tiền thật
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: liveBots > 0 ? '#ef4444' : '#f8fafc' }}>
            {liveBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot LIVE</span>
          </div>
        </div>

        {/* Simulator Bots */}
        <div style={{
          background: simBots > 0 ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
          border: simBots > 0 ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: simBots > 0 ? '#60a5fa' : '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <Activity size={16} /> Đang chạy SIMULATOR
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: simBots > 0 ? '#3b82f6' : '#f8fafc' }}>
            {simBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot ảo</span>
          </div>
        </div>

        {/* Combined Daily PnL */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
            Tổng PnL hôm nay
          </div>
          <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: combinedDailyPnl > 0 ? '#4ade80' : combinedDailyPnl < 0 ? '#f87171' : '#cbd5e1',
          }}>
            {combinedDailyPnl > 0 ? '+' : ''}${combinedDailyPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Bot Grid Section */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
            Danh Sách Bot Của Bạn
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Tự động quét ngầm 1s/lần trong tiến trình Next.js
          </span>
        </div>

        {isLoading && !data ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            ⏳ Đang tải danh sách bot...
          </div>
        ) : bots.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            padding: '48px 20px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
              Bạn chưa tạo con bot nào
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 20 }}>
              Bấm vào nút bên dưới để tạo bot đầu tiên và xem thẩm định thống kê tức thời
            </p>
            <button
              onClick={handleCreateNew}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Tạo Bot Mới Ngay
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {bots.map((item) => (
              <BotCard
                key={item.config.id}
                config={item.config}
                state={item.state}
                onUpdate={handleSaveBot}
                onEdit={handleEdit}
                onDelete={handleDeleteBot}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity Logs (Tách biệt Lịch sử Cược Thật và Giả Lập) */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '20px 24px',
      }}>
        {/* Header & Mode Tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              📜 Nhật Ký Lệnh Hoạt Động
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
              Tách bạch rõ ràng giữa lệnh cược tiền thật (Real Trade) và lệnh giả lập (Simulator)
            </div>
          </div>

          {/* Tab Buttons */}
          <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              type="button"
              onClick={() => setHistoryMode('REAL_TRADE')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: historyMode === 'REAL_TRADE' ? '1px solid #ef4444' : '1px solid transparent',
                background: historyMode === 'REAL_TRADE' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                color: historyMode === 'REAL_TRADE' ? '#f87171' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔥 Cược Thật (Real)
              <span style={{
                fontSize: '0.7rem',
                background: historyMode === 'REAL_TRADE' ? '#ef4444' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
              }}>
                {realLogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryMode('SIMULATOR')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: historyMode === 'SIMULATOR' ? '1px solid #38bdf8' : '1px solid transparent',
                background: historyMode === 'SIMULATOR' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: historyMode === 'SIMULATOR' ? '#38bdf8' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🟡 Giả Lập (Sim)
              <span style={{
                fontSize: '0.7rem',
                background: historyMode === 'SIMULATOR' ? '#0284c7' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
              }}>
                {simLogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryMode('ALL')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: historyMode === 'ALL' ? '1px solid #64748b' : '1px solid transparent',
                background: historyMode === 'ALL' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: historyMode === 'ALL' ? '#f1f5f9' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tất cả ({logs.length})
            </button>
          </div>
        </div>

        {/* Tab Summary Stat Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          background: 'rgba(0,0,0,0.2)',
          padding: '10px 14px',
          borderRadius: 10,
          marginBottom: 14,
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Đang xem lịch sử</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: historyMode === 'REAL_TRADE' ? '#f87171' : historyMode === 'SIMULATOR' ? '#38bdf8' : '#e2e8f0' }}>
              {historyMode === 'REAL_TRADE' ? '🔥 Cược Thật (Ví Web3)' : historyMode === 'SIMULATOR' ? '🟡 Giả Lập Realtime' : '🌐 Toàn Bộ Lệnh'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Tổng số lệnh</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f1f5f9' }}>
              {currentDisplayLogs.length} lệnh
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Thắng / Thua</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4ade80' }}>
              {currentDisplayLogs.filter(l => l.status === 'WIN').length}W <span style={{ color: '#64748b' }}>/</span> <span style={{ color: '#f87171' }}>{currentDisplayLogs.filter(l => l.status === 'LOSS').length}L</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Tổng Lãi/Lỗ (PnL)</div>
            {(() => {
              const tabPnl = currentDisplayLogs.reduce((acc, l) => acc + (l.pnl || 0), 0);
              return (
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tabPnl >= 0 ? '#4ade80' : '#f87171' }}>
                  {tabPnl >= 0 ? `+$${tabPnl.toFixed(2)}` : `-$${Math.abs(tabPnl).toFixed(2)}`}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Table / Empty State */}
        {currentDisplayLogs.length === 0 ? (
          <div style={{
            padding: '36px 20px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.85rem',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: 8,
            border: '1px dashed rgba(255,255,255,0.06)',
          }}>
            {historyMode === 'REAL_TRADE' ? (
              <>
                <p style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#f87171' }}>🔥 Chưa có lệnh Cược Thật nào</p>
                <span>Chuyển chế độ của bot sang <strong>REAL_TRADE</strong> để hệ thống bắt đầu đặt lệnh thật qua API Binance.</span>
              </>
            ) : historyMode === 'SIMULATOR' ? (
              <>
                <p style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#38bdf8' }}>🟡 Chưa có lệnh Giả Lập nào</p>
                <span>Bật ít nhất 1 bot ở chế độ SIMULATOR để theo dõi lệnh cược ảo theo thời gian thực.</span>
              </>
            ) : (
              <p style={{ margin: 0 }}>Chưa có nhật ký lệnh nào được ghi nhận.</p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Thời gian</th>
                  <th style={{ padding: '8px 12px' }}>Tên Bot</th>
                  <th style={{ padding: '8px 12px' }}>Mã Kỳ</th>
                  <th style={{ padding: '8px 12px' }}>Cửa Cược</th>
                  <th style={{ padding: '8px 12px' }}>Odds</th>
                  <th style={{ padding: '8px 12px' }}>Tiền Cược</th>
                  <th style={{ padding: '8px 12px' }}>Chế Độ</th>
                  {historyMode === 'REAL_TRADE' && <th style={{ padding: '8px 12px' }}>OrderID Binance</th>}
                  <th style={{ padding: '8px 12px' }}>Trạng Thái &amp; PnL</th>
                </tr>
              </thead>
              <tbody>
                {currentDisplayLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>
                      {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f1f5f9' }}>
                      {log.botName}
                    </td>
                    <td style={{ padding: '10px 12px' }}>#{log.mtid}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: log.side === 'Up' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: log.side === 'Up' ? '#4ade80' : '#f87171',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {log.side}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{(log.odds * 100).toFixed(1)}%</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>${log.stake}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        color: log.mode === 'REAL_TRADE' ? '#f87171' : '#60a5fa',
                        background: log.mode === 'REAL_TRADE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 700,
                      }}>
                        {log.mode === 'REAL_TRADE' ? '🔥 REAL' : '🟡 SIM'}
                      </span>
                    </td>
                    {historyMode === 'REAL_TRADE' && (
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {log.orderId || 'Chờ khớp'}
                      </td>
                    )}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        color: log.status === 'WIN' ? '#4ade80' : log.status === 'LOSS' ? '#f87171' : '#facc15',
                        fontWeight: 600,
                      }}>
                        {log.status === 'WIN'
                          ? `🏆 Thắng (+${log.pnl ? log.pnl.toFixed(2) : ((log.stake * (1 / log.odds - 1)).toFixed(2))}$)`
                          : log.status === 'LOSS'
                            ? `❌ Thua (-$${log.stake})`
                            : '⏳ Đang chờ kết quả'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Cấu Hình Bot */}
      <BotConfigModal
        isOpen={modalOpen}
        initialConfig={editingBot}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveBot}
      />
    </main>
  );
}
