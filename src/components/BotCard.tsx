'use client';

import React, { useState } from 'react';
import type { BotConfig, BotRuntimeState } from '@/lib/types';

interface BotCardProps {
  config: BotConfig;
  state?: BotRuntimeState;
  onUpdate: (updatedConfig: BotConfig) => Promise<void>;
  onEdit: (config: BotConfig) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function BotCard({
  config,
  state,
  onUpdate,
  onEdit,
  onDelete,
}: BotCardProps) {
  const [updating, setUpdating] = useState(false);

  const handleModeChange = async (newMode: 'OFF' | 'SIMULATOR' | 'REAL_TRADE') => {
    if (newMode === 'REAL_TRADE') {
      const confirmed = window.confirm(
        `⚠️ CẢNH BÁO TIỀN THẬT!\n\nBot "${config.name}" sẽ tự động đặt lệnh mua shares thật trên tài khoản Binance Web3 của bạn mỗi khi phát hiện tín hiệu.\n\nBạn có chắc chắn muốn bật chế độ LIVE REAL TRADE không?`
      );
      if (!confirmed) return;
    }

    setUpdating(true);
    try {
      if (newMode === 'OFF') {
        await onUpdate({ ...config, enabled: false });
      } else {
        await onUpdate({ ...config, enabled: true, mode: newMode });
      }
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = () => {
    if (!config.enabled) {
      return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', text: '⚪ ĐÃ TẮT' };
    }
    if (state?.status === 'IN_TRADE') {
      return { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', text: '⚡ ĐANG CƯỢC' };
    }
    if (state?.status === 'COOLDOWN') {
      return { bg: 'rgba(234, 179, 8, 0.2)', color: '#facc15', text: `⏳ COOLDOWN (${state.cooldownRemaining}T)` };
    }
    if (state?.status === 'STOPPED_MAX_LOSS') {
      return { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', text: '🛑 CHẠM MAX LOSS' };
    }
    return { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', text: '🟢 ĐANG SĂN KÈO' };
  };

  const statusBadge = getStatusBadge();
  const dailyPnl = state?.dailyPnl ?? 0;
  const isPnlPositive = dailyPnl > 0;

  return (
    <div style={{
      background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
      border: config.enabled
        ? config.mode === 'REAL_TRADE'
          ? '1px solid rgba(239, 68, 68, 0.5)'
          : '1px solid rgba(59, 130, 246, 0.4)'
        : '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16,
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Banner if Live */}
      {config.enabled && config.mode === 'REAL_TRADE' && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: '#ef4444',
          color: 'white',
          fontSize: '0.65rem',
          fontWeight: 800,
          padding: '2px 10px',
          borderBottomLeftRadius: 8,
          letterSpacing: 0.5,
        }}>
          🔥 LIVE TIỀN THẬT
        </div>
      )}

      {/* Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
              {config.name}
            </h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                background: config.stakeMode === 'FLAT' ? 'rgba(56, 189, 248, 0.15)' : config.stakeMode === 'CUSTOM_LADDER' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: config.stakeMode === 'FLAT' ? '#38bdf8' : config.stakeMode === 'CUSTOM_LADDER' ? '#34d399' : '#cbd5e1',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.7rem',
                fontWeight: 600,
              }}>
                {config.stakeMode === 'FLAT'
                  ? `🛡️ Đi đều $${config.baseStake}`
                  : config.stakeMode === 'CUSTOM_LADDER'
                    ? `🪜 Chuỗi [${config.customLadder?.join(',')}]`
                    : `🎯 Gấp ${config.multiplier}x`}
              </span>
              <span style={{
                background: 'rgba(234, 179, 8, 0.12)',
                color: '#fde047',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.7rem',
                fontWeight: 500,
              }}>
                {config.targetMinutes && config.targetMinutes.length > 0
                  ? `⏱️ ${config.targetMinutes.join(', ')}`
                  : `⏱️ ${config.minTimeRemaining}-${config.maxTimeRemaining}s`}
              </span>
              <span style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#93c5fd',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.7rem',
              }}>
                {config.targetOddsBuckets && config.targetOddsBuckets.length > 0
                  ? `Odds ${config.targetOddsBuckets.join(', ')}%`
                  : `Odds ${config.oddsMin * 100}-${config.oddsMax * 100}%`}
              </span>
              {config.mode === 'REAL_TRADE' && (
                <span style={{
                  background: 'rgba(244, 63, 94, 0.12)',
                  color: '#fb7185',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}>
                  Trượt giá: {((config.maxSlippageBps || 450) / 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <span style={{
            background: statusBadge.bg,
            color: statusBadge.color,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.7rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {statusBadge.text}
          </span>
        </div>

        {/* Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          margin: '16px 0',
          background: 'rgba(0,0,0,0.2)',
          padding: '12px',
          borderRadius: 10,
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Tiền cược hiện tại</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
              ${state?.currentStake ?? config.baseStake}{' '}
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                (Bước {state?.currentStep ?? 1}/{config.maxSteps})
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {config.mode === 'REAL_TRADE' ? '🔥 PnL LIVE' : '🟡 PnL SIM'}
            </div>
            <div style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: dailyPnl !== 0 ? (isPnlPositive ? '#4ade80' : '#f87171') : '#cbd5e1',
            }}>
              {dailyPnl > 0 ? '+' : ''}${dailyPnl.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Lệnh {config.mode === 'REAL_TRADE' ? 'LIVE' : 'SIM'}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1' }}>
              {state?.totalTrades ?? 0} ({state?.winCount ?? 0}W - {state?.lossCount ?? 0}L)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Tỉ lệ thắng</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#60a5fa' }}>
              {state && state.totalTrades > 0
                ? ((state.winCount / state.totalTrades) * 100).toFixed(1) + '%'
                : '—'}
            </div>
          </div>
        </div>

        {/* Settings Summary */}
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>🛡️ Đệm ${config.minPriceBuffer}</span>
          <span>•</span>
          <span>🛑 Max Loss ${config.maxDailyLoss}/ngày</span>
        </div>
      </div>

      {/* Action Footer */}
      <div>
        {/* Mode Selector Buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          background: '#0f172a',
          padding: 4,
          borderRadius: 8,
          marginBottom: 12,
        }}>
          <button
            type="button"
            disabled={updating}
            onClick={() => handleModeChange('OFF')}
            style={{
              background: !config.enabled ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              color: !config.enabled ? '#f8fafc' : '#64748b',
              border: 'none',
              borderRadius: 6,
              padding: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚪ TẮT
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={() => handleModeChange('SIMULATOR')}
            style={{
              background: config.enabled && config.mode === 'SIMULATOR' ? '#3b82f6' : 'transparent',
              color: config.enabled && config.mode === 'SIMULATOR' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: 6,
              padding: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🟡 SIMULATOR
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={() => handleModeChange('REAL_TRADE')}
            style={{
              background: config.enabled && config.mode === 'REAL_TRADE' ? '#ef4444' : 'transparent',
              color: config.enabled && config.mode === 'REAL_TRADE' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: 6,
              padding: '6px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🔴 BẬT LIVE
          </button>
        </div>

        {/* Edit & Delete Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onEdit(config)}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            ✏️ Chỉnh sửa / Thẩm định
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Bạn có chắc muốn xóa bot "${config.name}" không?`)) {
                onDelete(config.id);
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              padding: '6px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            🗑️ Xóa
          </button>
        </div>
      </div>
    </div>
  );
}
