'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Plus, Play, ShieldAlert, Cpu, Activity, BarChart2, RefreshCw } from 'lucide-react';
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
    refreshInterval: 500, // Cập nhật live realtime mỗi 500ms
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
  const [activeMode, setActiveMode] = useState<'REAL_TRADE' | 'SIMULATOR' | 'ALL'>('REAL_TRADE');

  const realLogs = logs.filter((l) => l.mode === 'REAL_TRADE');
  const simLogs = logs.filter((l) => l.mode === 'SIMULATOR');

  const currentDisplayLogs = activeMode === 'ALL'
    ? logs
    : activeMode === 'REAL_TRADE'
      ? realLogs
      : simLogs;

  const totalBots = bots.length;
  const liveBots = bots.filter((b) => b.config.mode === 'REAL_TRADE').length;
  const simBots = bots.filter((b) => b.config.mode === 'SIMULATOR').length;

  // Lọc bot hiển thị trên Dashboard theo chế độ chọn:
  // Chọn LIVE -> Ẩn hết bot Simulator
  // Chọn SIMULATOR -> Ẩn hết bot LIVE
  const displayedBots = activeMode === 'ALL'
    ? bots
    : activeMode === 'REAL_TRADE'
      ? bots.filter((b) => b.config.mode === 'REAL_TRADE')
      : bots.filter((b) => b.config.mode === 'SIMULATOR');

  const realDailyPnl = bots
    .filter((b) => b.config.mode === 'REAL_TRADE')
    .reduce((sum, b) => sum + (b.state?.dailyPnl || 0), 0);
  const simDailyPnl = bots
    .filter((b) => b.config.mode === 'SIMULATOR')
    .reduce((sum, b) => sum + (b.state?.dailyPnl || 0), 0);
  const displayedDailyPnl = activeMode === 'ALL'
    ? (realDailyPnl + simDailyPnl)
    : activeMode === 'REAL_TRADE'
      ? realDailyPnl
      : simDailyPnl;

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
        marginBottom: 24,
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
            <RefreshCw size={16} className={redeeming ? 'animate-spin' : ''} />
            {redeeming ? 'Đang Redeem...' : 'Redeem All Thắng'}
          </button>

          <button
            type="button"
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

      {/* Dashboard Mode Switcher Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        padding: '10px 16px',
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 700 }}>Chế độ Dashboard:</span>
          <span style={{ fontSize: '0.78rem', color: activeMode === 'REAL_TRADE' ? '#fca5a5' : activeMode === 'SIMULATOR' ? '#7dd3fc' : '#94a3b8' }}>
            {activeMode === 'REAL_TRADE'
              ? '🔥 Đang xem Cược Thật (Đã ẩn 100% bot & lịch sử Simulator)'
              : activeMode === 'SIMULATOR'
                ? '🟡 Đang xem Giả Lập (Đã ẩn 100% bot & lịch sử Live tiền thật)'
                : '🌐 Đang xem Song Song Cả Hai'}
          </span>
        </div>

        <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => setActiveMode('REAL_TRADE')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: activeMode === 'REAL_TRADE' ? '1px solid #ef4444' : '1px solid transparent',
              background: activeMode === 'REAL_TRADE' ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
              color: activeMode === 'REAL_TRADE' ? '#fca5a5' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔥 Cược Thật (LIVE)
            <span style={{
              background: activeMode === 'REAL_TRADE' ? '#ef4444' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: 10,
            }}>
              {liveBots} bot
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('SIMULATOR')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: activeMode === 'SIMULATOR' ? '1px solid #38bdf8' : '1px solid transparent',
              background: activeMode === 'SIMULATOR' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
              color: activeMode === 'SIMULATOR' ? '#7dd3fc' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🟡 Giả Lập (SIMULATOR)
            <span style={{
              background: activeMode === 'SIMULATOR' ? '#0284c7' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: 10,
            }}>
              {simBots} bot
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('ALL')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: activeMode === 'ALL' ? '1px solid #64748b' : '1px solid transparent',
              background: activeMode === 'ALL' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: activeMode === 'ALL' ? '#f1f5f9' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            🌐 Tất cả ({bots.length})
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
        <div
          onClick={() => setActiveMode('ALL')}
          style={{
            background: activeMode === 'ALL' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: activeMode === 'ALL' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px 20px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <Cpu size={16} /> Tổng số Bot
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>
            {totalBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot đã tạo</span>
          </div>
        </div>

        {/* Live Bots */}
        <div
          onClick={() => setActiveMode('REAL_TRADE')}
          style={{
            background: activeMode === 'REAL_TRADE' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255, 255, 255, 0.03)',
            border: activeMode === 'REAL_TRADE' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: activeMode === 'REAL_TRADE' ? '0 0 14px rgba(239, 68, 68, 0.2)' : 'none',
            borderRadius: 12,
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: activeMode === 'REAL_TRADE' ? '#f87171' : '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <ShieldAlert size={16} /> Đang chạy LIVE tiền thật
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: activeMode === 'REAL_TRADE' ? '#ef4444' : '#f8fafc' }}>
            {liveBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot LIVE</span>
          </div>
        </div>

        {/* Simulator Bots */}
        <div
          onClick={() => setActiveMode('SIMULATOR')}
          style={{
            background: activeMode === 'SIMULATOR' ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255, 255, 255, 0.03)',
            border: activeMode === 'SIMULATOR' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: activeMode === 'SIMULATOR' ? '0 0 14px rgba(56, 189, 248, 0.2)' : 'none',
            borderRadius: 12,
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: activeMode === 'SIMULATOR' ? '#60a5fa' : '#94a3b8', fontSize: '0.8rem', marginBottom: 6 }}>
            <Activity size={16} /> Đang chạy SIMULATOR
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: activeMode === 'SIMULATOR' ? '#3b82f6' : '#f8fafc' }}>
            {simBots} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>bot ảo</span>
          </div>
        </div>

        {/* Selected Mode Daily PnL */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
            {activeMode === 'REAL_TRADE' ? '🔥 PnL LIVE hôm nay' : activeMode === 'SIMULATOR' ? '🟡 PnL SIM hôm nay' : 'Tổng PnL hôm nay'}
          </div>
          <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: displayedDailyPnl > 0 ? '#4ade80' : displayedDailyPnl < 0 ? '#f87171' : '#cbd5e1',
          }}>
            {displayedDailyPnl > 0 ? '+' : ''}${displayedDailyPnl.toFixed(2)}
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
        ) : displayedBots.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
              {activeMode === 'REAL_TRADE'
                ? '🔥 Chưa có Bot nào ở chế độ LIVE tiền thật'
                : activeMode === 'SIMULATOR'
                  ? '🟡 Chưa có Bot nào ở chế độ SIMULATOR'
                  : 'Bạn chưa tạo con bot nào'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
              {activeMode === 'REAL_TRADE'
                ? 'Hãy chỉnh sửa bot hiện có sang REAL_TRADE hoặc bấm nút tạo bot mới.'
                : 'Chuyển chế độ của bot sang SIMULATOR để theo dõi cược ảo an toàn.'}
            </p>
            <button
              onClick={handleCreateNew}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: '0.85rem',
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
            {displayedBots.map((item) => (
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
              {activeMode === 'REAL_TRADE'
                ? '🔥 Đang chỉ hiển thị lịch sử cược tiền thật (Đã ẩn toàn bộ lịch sử Simulator)'
                : activeMode === 'SIMULATOR'
                  ? '🟡 Đang chỉ hiển thị lịch sử giả lập realtime (Đã ẩn toàn bộ lịch sử Live)'
                  : 'Tách bạch rõ ràng giữa lệnh cược tiền thật (Real Trade) và lệnh giả lập (Simulator)'}
            </div>
          </div>

          {/* Tab Buttons */}
          <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              type="button"
              onClick={() => setActiveMode('REAL_TRADE')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: activeMode === 'REAL_TRADE' ? '1px solid #ef4444' : '1px solid transparent',
                background: activeMode === 'REAL_TRADE' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                color: activeMode === 'REAL_TRADE' ? '#f87171' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔥 Cược Thật (Real)
              <span style={{
                fontSize: '0.7rem',
                background: activeMode === 'REAL_TRADE' ? '#ef4444' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
              }}>
                {realLogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('SIMULATOR')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: activeMode === 'SIMULATOR' ? '1px solid #38bdf8' : '1px solid transparent',
                background: activeMode === 'SIMULATOR' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: activeMode === 'SIMULATOR' ? '#38bdf8' : '#94a3b8',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🟡 Giả Lập (Sim)
              <span style={{
                fontSize: '0.7rem',
                background: activeMode === 'SIMULATOR' ? '#0284c7' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
              }}>
                {simLogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('ALL')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: activeMode === 'ALL' ? '1px solid #64748b' : '1px solid transparent',
                background: activeMode === 'ALL' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: activeMode === 'ALL' ? '#f1f5f9' : '#94a3b8',
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
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: activeMode === 'REAL_TRADE' ? '#f87171' : activeMode === 'SIMULATOR' ? '#38bdf8' : '#e2e8f0' }}>
              {activeMode === 'REAL_TRADE' ? '🔥 Cược Thật (Ví Web3)' : activeMode === 'SIMULATOR' ? '🟡 Giả Lập Realtime' : '🌐 Toàn Bộ Lệnh'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Tổng số lệnh</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f1f5f9' }}>
              {currentDisplayLogs.length} lệnh
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Thắng / Thua / Bỏ qua</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4ade80' }}>
              {currentDisplayLogs.filter(l => l.status === 'WIN').length}W{' '}
              <span style={{ color: '#64748b' }}>/</span>{' '}
              <span style={{ color: '#f87171' }}>{currentDisplayLogs.filter(l => l.status === 'LOSS').length}L</span>{' '}
              <span style={{ color: '#64748b' }}>/</span>{' '}
              <span style={{ color: '#94a3b8' }}>{currentDisplayLogs.filter(l => l.status === 'SKIPPED').length} Skip</span>
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
            {activeMode === 'REAL_TRADE' ? (
              <>
                <p style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#f87171' }}>🔥 Chưa có lệnh Cược Thật nào</p>
                <span>Chuyển chế độ của bot sang <strong>REAL_TRADE</strong> để hệ thống bắt đầu đặt lệnh thật qua API Binance.</span>
              </>
            ) : activeMode === 'SIMULATOR' ? (
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
                  <th style={{ padding: '8px 12px' }}>Odds / Khớp Thực Tế</th>
                  <th style={{ padding: '8px 12px' }}>Tiền Cược</th>
                  <th style={{ padding: '8px 12px' }}>Chế Độ</th>
                  {activeMode === 'REAL_TRADE' && <th style={{ padding: '8px 12px' }}>OrderID Binance</th>}
                  <th style={{ padding: '8px 12px' }}>Trạng Thái &amp; PnL Thực Nhận</th>
                </tr>
              </thead>
              <tbody>
                {currentDisplayLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
                      {log.botName}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>#{log.mtid}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {log.status === 'SKIPPED' && (!log.odds || log.odds === 0) ? (
                        <span style={{ color: '#64748b' }}>—</span>
                      ) : (
                        <span style={{
                          background: log.side === 'Up' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: log.side === 'Up' ? '#4ade80' : '#f87171',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}>
                          {log.side}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {log.odds && log.odds > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>
                            {log.status === 'SKIPPED' ? `(Mốc ${(log.odds * 100).toFixed(1)}%)` : `${(log.odds * 100).toFixed(1)}%`}
                          </span>
                          {log.shares ? (
                            <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 500 }}>
                              ({log.shares.toFixed(2)} shares)
                            </span>
                          ) : null}
                          {log.triggerOdds && log.fillPrice && Math.abs(log.triggerOdds - log.fillPrice) >= 0.01 ? (
                            <span style={{ fontSize: '0.68rem', color: '#a1a1aa' }}>
                              Quét: {(log.triggerOdds * 100).toFixed(1)}%
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                      {log.status === 'SKIPPED' ? <span style={{ color: '#64748b' }}>$0</span> : `$${log.stake}`}
                    </td>
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
                    {activeMode === 'REAL_TRADE' && (
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {log.status === 'SKIPPED' ? '—' : (log.orderId || 'Chờ khớp')}
                      </td>
                    )}
                    <td style={{ padding: '10px 12px' }}>
                      {log.status === 'SKIPPED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{
                            color: '#cbd5e1',
                            background: 'rgba(100, 116, 139, 0.25)',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            width: 'fit-content',
                            fontSize: '0.78rem',
                          }}>
                            ⏭️ Bỏ qua (Skip)
                          </span>
                          {log.skipReason && (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.3 }}>
                              Lý do: <strong style={{ color: '#e2e8f0' }}>{log.skipReason}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          color: log.status === 'WIN' ? '#4ade80' : log.status === 'LOSS' ? '#f87171' : '#facc15',
                          fontWeight: 700,
                        }}>
                          {log.status === 'WIN'
                            ? `🏆 Thắng (+${log.pnl !== undefined && log.pnl !== null ? log.pnl.toFixed(2) : ((log.stake * (1 / log.odds - 1)).toFixed(2))}$)`
                            : log.status === 'LOSS'
                              ? `❌ Thua (-$${log.stake})`
                              : '⏳ Đang chờ kết quả'}
                        </span>
                      )}
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
