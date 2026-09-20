'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { BotConfig, BacktestResult, TradingSession, BotStrategy } from '@/lib/types';
import BacktestPreviewCard from './BacktestPreviewCard';

interface BotConfigModalProps {
  initialConfig?: BotConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: BotConfig) => Promise<void>;
}

const ALL_ODDS_BUCKETS = [
  '50-55',
  '55-60',
  '60-65',
  '65-70',
  '70-75',
  '75-80',
  '80-85',
  '85-90',
  '90-95',
  '95+',
];

const DEFAULT_CONFIG: BotConfig = {
  id: '',
  name: 'Bot Mới',
  enabled: false,
  mode: 'SIMULATOR',
  strategy: 'MARTINGALE_FAVORITE',
  stakeMode: 'FLAT',
  baseStake: 10,
  multiplier: 1.0,
  maxSteps: 1,
  maxDailyLoss: 50,
  oddsMin: 0.85,
  oddsMax: 0.90,
  targetOddsBuckets: ['85-90'],
  sessions: ['all'],
  targetMinutes: ['2-1m'],
  minTimeRemaining: 60,
  maxTimeRemaining: 120,
  minPriceBuffer: 20,
  maxSlippageBps: 450,
  trapPeakOddsMin: 0.90,
  trapMinPriceReversal: 15,
  trapMaxOdds: 0.85,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

type StakeMode = 'FLAT' | 'MARTINGALE' | 'CUSTOM_LADDER';

export default function BotConfigModal({
  initialConfig,
  isOpen,
  onClose,
  onSave,
}: BotConfigModalProps) {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [stakeMode, setStakeMode] = useState<StakeMode>('FLAT');
  const [ladderText, setLadderText] = useState<string>('1, 6, 15, 40');
  const [showAdvancedSeconds, setShowAdvancedSeconds] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = initialConfig ? { ...initialConfig } : { ...DEFAULT_CONFIG, id: `bot_${Date.now()}` };

      // Khởi tạo mốc odds nếu chưa có
      if (!cfg.targetOddsBuckets || cfg.targetOddsBuckets.length === 0) {
        if (cfg.oddsMin >= 0.85 && cfg.oddsMax <= 0.90) {
          cfg.targetOddsBuckets = ['85-90'];
        } else if (cfg.oddsMin >= 0.80 && cfg.oddsMax <= 0.95) {
          cfg.targetOddsBuckets = ['80-85', '85-90', '90-95'];
        } else {
          cfg.targetOddsBuckets = ['85-90'];
        }
      }

      // Xác định stakeMode
      let mode: StakeMode = 'FLAT';
      if (cfg.stakeMode) {
        mode = cfg.stakeMode;
      } else if (Array.isArray(cfg.customLadder) && cfg.customLadder.length > 0) {
        mode = 'CUSTOM_LADDER';
      } else if (cfg.maxSteps > 1 || cfg.multiplier > 1) {
        mode = 'MARTINGALE';
      }

      setStakeMode(mode);
      setLadderText(cfg.customLadder && cfg.customLadder.length > 0 ? cfg.customLadder.join(', ') : '1, 6, 15, 40');
      setConfig(cfg);
      triggerBacktest(cfg);
    }
  }, [isOpen, initialConfig]);

  const triggerBacktest = (currentCfg: BotConfig) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsBacktesting(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/bots/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentCfg),
        });
        const data = await res.json();
        if (data.ok && data.result) {
          setBacktestResult(data.result);
        }
      } catch (err) {
        console.error('Lỗi backtest:', err);
      } finally {
        setIsBacktesting(false);
      }
    }, 250);
  };

  const handleChange = (field: keyof BotConfig, value: any) => {
    const updated = { ...config, [field]: value };
    setConfig(updated);
    triggerBacktest(updated);
  };

  // Toggle từng mốc Odds Bucket (Cho phép chọn nhiều giống trong Thống kê)
  const handleToggleOddsBucket = (bucket: string) => {
    const current = config.targetOddsBuckets || [];
    let updated: string[];

    if (current.includes(bucket)) {
      updated = current.filter((b) => b !== bucket);
      if (updated.length === 0) updated = [bucket]; // Luôn giữ tối thiểu 1 mốc
    } else {
      updated = [...current, bucket];
    }

    handleChange('targetOddsBuckets', updated);
  };

  // Chọn nhanh nhóm Odds
  const handleSelectOddsGroup = (group: 'optimal' | 'wide' | 'strong' | 'underdog' | 'all') => {
    let buckets: string[] = [];
    if (group === 'optimal') {
      buckets = ['85-90', '90-95'];
    } else if (group === 'wide') {
      buckets = ['80-85', '85-90', '90-95'];
    } else if (group === 'strong') {
      buckets = ['75-80', '80-85', '85-90', '90-95', '95+'];
    } else if (group === 'underdog') {
      buckets = ['50-55', '55-60'];
    } else if (group === 'all') {
      buckets = [...ALL_ODDS_BUCKETS];
    }

    handleChange('targetOddsBuckets', buckets);
  };

  const handleSelectStakeMode = (mode: StakeMode) => {
    setStakeMode(mode);
    let updated = { ...config, stakeMode: mode };

    if (mode === 'FLAT') {
      updated = {
        ...updated,
        multiplier: 1.0,
        maxSteps: 1,
        customLadder: undefined,
        baseStake: config.baseStake || 10,
        maxDailyLoss: config.maxDailyLoss > 50 ? 50 : config.maxDailyLoss,
      };
    } else if (mode === 'MARTINGALE') {
      updated = {
        ...updated,
        multiplier: config.multiplier <= 1 ? 4.0 : config.multiplier,
        maxSteps: config.maxSteps <= 1 ? 2 : config.maxSteps,
        customLadder: undefined,
        maxDailyLoss: config.maxDailyLoss < 50 ? 100 : config.maxDailyLoss,
      };
    } else if (mode === 'CUSTOM_LADDER') {
      const parts = ladderText.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
      const ladder = parts.length > 0 ? parts : [1, 6, 15, 40];
      setLadderText(ladder.join(', '));
      updated = {
        ...updated,
        customLadder: ladder,
        maxSteps: ladder.length,
        baseStake: ladder[0],
        maxDailyLoss: 65,
      };
    }

    setConfig(updated);
    triggerBacktest(updated);
  };

  const handleLadderTextChange = (text: string) => {
    setLadderText(text);
    const parts = text
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (parts.length > 0) {
      const updated: BotConfig = {
        ...config,
        stakeMode: 'CUSTOM_LADDER',
        customLadder: parts,
        maxSteps: parts.length,
        baseStake: parts[0],
      };
      setConfig(updated);
      triggerBacktest(updated);
    }
  };

  const handleSelectMinutePreset = (presetKey: '1-0m' | '2-1m' | '3-2m' | '4-3m' | '5-4m' | '2-0m' | '3-1m' | 'all') => {
    let updated = { ...config };

    if (presetKey === '1-0m') {
      updated.targetMinutes = ['1-0m'];
      updated.minTimeRemaining = 35;
      updated.maxTimeRemaining = 60;
    } else if (presetKey === '2-1m') {
      updated.targetMinutes = ['2-1m'];
      updated.minTimeRemaining = 60;
      updated.maxTimeRemaining = 120;
    } else if (presetKey === '3-2m') {
      updated.targetMinutes = ['3-2m'];
      updated.minTimeRemaining = 120;
      updated.maxTimeRemaining = 180;
    } else if (presetKey === '4-3m') {
      updated.targetMinutes = ['4-3m'];
      updated.minTimeRemaining = 180;
      updated.maxTimeRemaining = 240;
    } else if (presetKey === '5-4m') {
      updated.targetMinutes = ['5-4m'];
      updated.minTimeRemaining = 240;
      updated.maxTimeRemaining = 300;
    } else if (presetKey === '2-0m') {
      updated.targetMinutes = ['2-1m', '1-0m'];
      updated.minTimeRemaining = 35;
      updated.maxTimeRemaining = 120;
    } else if (presetKey === '3-1m') {
      updated.targetMinutes = ['3-2m', '2-1m'];
      updated.minTimeRemaining = 60;
      updated.maxTimeRemaining = 180;
    } else if (presetKey === 'all') {
      updated.targetMinutes = undefined;
      updated.minTimeRemaining = 35;
      updated.maxTimeRemaining = 240;
    }

    setConfig(updated);
    triggerBacktest(updated);
  };

  const handleSessionToggle = (session: TradingSession) => {
    let updatedSessions: TradingSession[];
    if (session === 'all') {
      updatedSessions = ['all'];
    } else {
      const filtered = config.sessions.filter((s) => s !== 'all');
      if (filtered.includes(session)) {
        updatedSessions = filtered.filter((s) => s !== session);
        if (updatedSessions.length === 0) updatedSessions = ['all'];
      } else {
        updatedSessions = [...filtered, session];
      }
    }
    handleChange('sessions', updatedSessions);
  };

  const handleApplyPreset = (presetType: 'FLAT_BET_1_0M' | 'FLAT_BET_2_1M' | 'LADDER_1_6_15_40' | 'SAFE_MARTINGALE' | 'UNDERDOG_HUNTER' | 'EV_SNIPER' | 'TRAP_TRADERS') => {
    let preset: Partial<BotConfig> = {};

    if (presetType === 'TRAP_TRADERS') {
      setStakeMode('FLAT');
      preset = {
        name: '🪤 Bot Săn Bẫy Trader (Trap 90% -> Đảo $15 Phút Chót)',
        strategy: 'TRAP_TRADERS',
        stakeMode: 'FLAT',
        baseStake: 10,
        multiplier: 1.0,
        maxSteps: 1,
        customLadder: undefined,
        maxDailyLoss: 50,
        trapPeakOddsMin: 0.90,
        trapMinPriceReversal: 15,
        trapMaxOdds: 0.85,
        targetOddsBuckets: ['65-70', '70-75', '75-80', '80-85'],
        targetMinutes: ['1-0m'],
        minTimeRemaining: 15,
        maxTimeRemaining: 60,
        minPriceBuffer: 15,
      };
    } else if (presetType === 'FLAT_BET_1_0M') {
      setStakeMode('FLAT');
      preset = {
        name: '⚡ Bot Đánh Đều Phút 1-0m (Win 91.4%)',
        strategy: 'MARTINGALE_FAVORITE',
        stakeMode: 'FLAT',
        baseStake: 10,
        multiplier: 1.0,
        maxSteps: 1,
        customLadder: undefined,
        maxDailyLoss: 50,
        targetOddsBuckets: ['85-90'],
        oddsMin: 0.85,
        oddsMax: 0.90,
        targetMinutes: ['1-0m'],
        minTimeRemaining: 35,
        maxTimeRemaining: 60,
        minPriceBuffer: 20,
      };
    } else if (presetType === 'FLAT_BET_2_1M') {
      setStakeMode('FLAT');
      preset = {
        name: '🛡️ Bot Đánh Đều Phút 2-1m (Win 95.0%)',
        strategy: 'MARTINGALE_FAVORITE',
        stakeMode: 'FLAT',
        baseStake: 10,
        multiplier: 1.0,
        maxSteps: 1,
        customLadder: undefined,
        maxDailyLoss: 50,
        targetOddsBuckets: ['85-90'],
        oddsMin: 0.85,
        oddsMax: 0.90,
        targetMinutes: ['2-1m'],
        minTimeRemaining: 20,
        maxTimeRemaining: 120,
        minPriceBuffer: 20,
      };
    } else if (presetType === 'LADDER_1_6_15_40') {
      setStakeMode('CUSTOM_LADDER');
      const ladder = [1, 6, 15, 40];
      setLadderText('1, 6, 15, 40');
      preset = {
        name: '👑 Bot Thần Tốc 1$ - 6$ - 15$ - 40$',
        strategy: 'MARTINGALE_FAVORITE',
        stakeMode: 'CUSTOM_LADDER',
        baseStake: 1,
        multiplier: 4.0,
        maxSteps: 4,
        customLadder: ladder,
        maxDailyLoss: 65,
        targetOddsBuckets: ['85-90'],
        oddsMin: 0.85,
        oddsMax: 0.90,
        targetMinutes: undefined,
        minTimeRemaining: 35,
        maxTimeRemaining: 240,
        minPriceBuffer: 20,
      };
    } else if (presetType === 'SAFE_MARTINGALE') {
      setStakeMode('MARTINGALE');
      preset = {
        name: '🎯 Bot Gấp Thếp 85-90% An Toàn (2 Bước)',
        strategy: 'MARTINGALE_FAVORITE',
        stakeMode: 'MARTINGALE',
        baseStake: 10,
        multiplier: 4.0,
        maxSteps: 2,
        customLadder: undefined,
        maxDailyLoss: 50,
        targetOddsBuckets: ['85-90'],
        oddsMin: 0.85,
        oddsMax: 0.90,
        targetMinutes: undefined,
        minTimeRemaining: 35,
        maxTimeRemaining: 240,
        minPriceBuffer: 20,
      };
    } else if (presetType === 'UNDERDOG_HUNTER') {
      setStakeMode('MARTINGALE');
      preset = {
        name: '🏹 Bot Săn Lật Kèo Payout Khủng (3-2m)',
        strategy: 'UNDERDOG_HUNTER',
        stakeMode: 'MARTINGALE',
        baseStake: 5,
        multiplier: 2.0,
        maxSteps: 3,
        customLadder: undefined,
        maxDailyLoss: 35,
        targetOddsBuckets: ['50-55', '55-60'],
        oddsMin: 0.05,
        oddsMax: 0.20,
        targetMinutes: ['3-2m'],
        minTimeRemaining: 120,
        maxTimeRemaining: 180,
        minPriceBuffer: 0,
      };
    } else if (presetType === 'EV_SNIPER') {
      setStakeMode('MARTINGALE');
      preset = {
        name: '⚡ Bot Bắn Tỉa EV+ Phút Đầu (5-4m)',
        strategy: 'EV_SNIPER',
        stakeMode: 'MARTINGALE',
        baseStake: 10,
        multiplier: 2.0,
        maxSteps: 2,
        customLadder: undefined,
        maxDailyLoss: 40,
        targetOddsBuckets: ['70-75', '75-80', '80-85'],
        oddsMin: 0.70,
        oddsMax: 0.85,
        targetMinutes: ['5-4m'],
        minTimeRemaining: 240,
        maxTimeRemaining: 300,
        minPriceBuffer: 15,
      };
    }

    const updated = { ...config, ...preset };
    setConfig(updated);
    triggerBacktest(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalConfig: BotConfig = { ...config, stakeMode };

      if (stakeMode === 'CUSTOM_LADDER') {
        const parts = ladderText
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n) && n > 0);
        const ladder = parts.length > 0 ? parts : [1, 6, 15, 40];
        finalConfig.stakeMode = 'CUSTOM_LADDER';
        finalConfig.customLadder = ladder;
        finalConfig.maxSteps = ladder.length;
        finalConfig.baseStake = ladder[0];
        finalConfig.multiplier = 1.0;
      } else if (stakeMode === 'FLAT') {
        finalConfig.stakeMode = 'FLAT';
        finalConfig.customLadder = undefined;
        finalConfig.maxSteps = 1;
        finalConfig.multiplier = 1.0;
      } else if (stakeMode === 'MARTINGALE') {
        finalConfig.stakeMode = 'MARTINGALE';
        finalConfig.customLadder = undefined;
      }

      await onSave(finalConfig);
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi lưu cấu hình bot');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 16,
        width: '100%',
        maxWidth: 750,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
        color: '#f8fafc',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {initialConfig ? '⚙️ Chỉnh Sửa Cấu Hình Bot' : '✨ Tạo Bot Giao Dịch Mới'}
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Chọn đi đều tay hay gấp thếp, chọn theo phút và chọn nhiều mốc Odds giống bảng thống kê
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {/* Presets Bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
              💡 MẪU CẤU HÌNH GỢI Ý (1-CLICK NẠP THÔNG SỐ TỐI ƯU):
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleApplyPreset('TRAP_TRADERS')}
                style={{
                  background: 'rgba(244, 63, 94, 0.2)',
                  border: '1px solid rgba(244, 63, 94, 0.5)',
                  color: '#fb7185',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                🪤 Bẫy Trader 90% (Win 93.8%)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('FLAT_BET_1_0M')}
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  color: '#38bdf8',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ⚡ Đánh Đều Phút 1-0m (Win 91%)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('FLAT_BET_2_1M')}
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  color: '#38bdf8',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                🛡️ Đánh Đều Phút 2-1m (Win 95%)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('LADDER_1_6_15_40')}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                👑 Chuỗi 1$ - 6$ - 15$ - 40$ (100% Win)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('SAFE_MARTINGALE')}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  color: '#60a5fa',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                🎯 Gấp Thếp 2 Bước (10$ x4)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('UNDERDOG_HUNTER')}
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: '#facc15',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                🏹 Săn Lật Kèo Payout Khủng
              </button>
            </div>
          </div>

          {/* Tên Bot */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
              Tên Bot *
            </label>
            <input
              type="text"
              required
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* CỬA ĐÁNH & MỐC ODDS (CHO PHÉP CHỌN NHIỀU GIỐNG BẢNG THỐNG KÊ) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🎯 CỬA ĐÁNH &amp; MỐC ODDS (CHỌN NHIỀU MỐC GIỐNG BẢNG THỐNG KÊ):
              </label>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Đã chọn: {config.targetOddsBuckets?.length || 0} mốc
              </span>
            </div>

            {/* 1. Chọn Cửa Đánh */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                Hướng Cửa Đánh:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'MARTINGALE_FAVORITE')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: config.strategy === 'MARTINGALE_FAVORITE' ? '2px solid #22c55e' : '1px solid #334155',
                    background: config.strategy === 'MARTINGALE_FAVORITE' ? 'rgba(34, 197, 94, 0.15)' : '#1e293b',
                    color: config.strategy === 'MARTINGALE_FAVORITE' ? '#4ade80' : '#94a3b8',
                    fontWeight: config.strategy === 'MARTINGALE_FAVORITE' ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🟢 Cửa Thuận (Favorite)
                  <div style={{ fontSize: '0.7rem', color: '#86efac', marginTop: 2 }}>
                    Cược theo cửa đang có tỷ lệ áp đảo (&gt; 50%)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange('strategy', 'UNDERDOG_HUNTER')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: config.strategy === 'UNDERDOG_HUNTER' ? '2px solid #facc15' : '1px solid #334155',
                    background: config.strategy === 'UNDERDOG_HUNTER' ? 'rgba(234, 179, 8, 0.15)' : '#1e293b',
                    color: config.strategy === 'UNDERDOG_HUNTER' ? '#facc15' : '#94a3b8',
                    fontWeight: config.strategy === 'UNDERDOG_HUNTER' ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🟡 Cửa Lật Kèo (Underdog)
                  <div style={{ fontSize: '0.7rem', color: '#fde047', marginTop: 2 }}>
                    Cược cửa bị dẫn, săn Payout cao khi đảo chiều
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated: Partial<BotConfig> = {
                      strategy: 'TRAP_TRADERS',
                      targetMinutes: ['1-0m'],
                      minTimeRemaining: 15,
                      maxTimeRemaining: 60,
                      trapPeakOddsMin: config.trapPeakOddsMin ?? 0.90,
                      trapMinPriceReversal: config.trapMinPriceReversal ?? 15,
                      trapMaxOdds: config.trapMaxOdds ?? 0.85,
                      minPriceBuffer: config.trapMinPriceReversal ?? 15,
                    };
                    const merged = { ...config, ...updated };
                    setConfig(merged);
                    triggerBacktest(merged);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: config.strategy === 'TRAP_TRADERS' ? '2px solid #f43f5e' : '1px solid #334155',
                    background: config.strategy === 'TRAP_TRADERS' ? 'rgba(244, 63, 94, 0.15)' : '#1e293b',
                    color: config.strategy === 'TRAP_TRADERS' ? '#fb7185' : '#94a3b8',
                    fontWeight: config.strategy === 'TRAP_TRADERS' ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🪤 Bẫy Trader (Trap Phút Chót)
                  <div style={{ fontSize: '0.7rem', color: '#fda4af', marginTop: 2 }}>
                    Đỉnh ≥90%, sập qua StartPrice ≥$15, ăn theo cửa mới
                  </div>
                </button>
              </div>
            </div>

            {/* BẢNG CẤU HÌNH ĐẶC BIỆT KHI CHỌN TRAP TRADERS */}
            {config.strategy === 'TRAP_TRADERS' && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.06)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: 10,
                padding: '14px',
                marginBottom: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fb7185', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🪤 CẤU HÌNH BẪY TRADER (TRAP TRADERS):
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#fda4af', fontWeight: 600 }}>
                    🏆 Win Rate Thống kê 870 kỳ: 93.8% - 96.1%
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {/* 1. Đỉnh Odds tối thiểu */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                      🎯 Đỉnh Odds ban đầu (Phút 5-2m)
                    </label>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                      {[
                        { label: '85% (Win 96%)', val: 0.85 },
                        { label: '90% (Chuẩn)', val: 0.90 },
                        { label: '95%', val: 0.95 },
                      ].map((btn) => (
                        <button
                          key={btn.val}
                          type="button"
                          onClick={() => handleChange('trapPeakOddsMin', btn.val)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: (config.trapPeakOddsMin ?? 0.90) === btn.val ? '1px solid #fb7185' : '1px solid #334155',
                            background: (config.trapPeakOddsMin ?? 0.90) === btn.val ? 'rgba(244, 63, 94, 0.25)' : '#1e293b',
                            color: (config.trapPeakOddsMin ?? 0.90) === btn.val ? '#fb7185' : '#94a3b8',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: (config.trapPeakOddsMin ?? 0.90) === btn.val ? 700 : 400,
                          }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={70}
                      max={99}
                      value={Math.round((config.trapPeakOddsMin ?? 0.90) * 100)}
                      onChange={(e) => handleChange('trapPeakOddsMin', Number(e.target.value) / 100)}
                      style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc', fontSize: '0.85rem' }}
                    />
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                      Ít nhất 1 bên từng đạt đỉnh $\ge$ {Math.round((config.trapPeakOddsMin ?? 0.90) * 100)}% trước phút cuối.
                    </div>
                  </div>

                  {/* 2. Giá sập đảo chiều */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                      📉 Đã vượt StartPrice ($)
                    </label>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                      {[
                        { label: '$10', val: 10 },
                        { label: '$15 (Chuẩn)', val: 15 },
                        { label: '$20', val: 20 },
                        { label: '$30', val: 30 },
                      ].map((btn) => (
                        <button
                          key={btn.val}
                          type="button"
                          onClick={() => {
                            handleChange('trapMinPriceReversal', btn.val);
                            handleChange('minPriceBuffer', btn.val);
                          }}
                          style={{
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: (config.trapMinPriceReversal ?? 15) === btn.val ? '1px solid #fb7185' : '1px solid #334155',
                            background: (config.trapMinPriceReversal ?? 15) === btn.val ? 'rgba(244, 63, 94, 0.25)' : '#1e293b',
                            color: (config.trapMinPriceReversal ?? 15) === btn.val ? '#fb7185' : '#94a3b8',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: (config.trapMinPriceReversal ?? 15) === btn.val ? 700 : 400,
                          }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={config.trapMinPriceReversal ?? 15}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleChange('trapMinPriceReversal', val);
                        handleChange('minPriceBuffer', val);
                      }}
                      style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc', fontSize: '0.85rem' }}
                    />
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                      Giá đã cắt qua StartPrice $\ge$ ${config.trapMinPriceReversal ?? 15} theo hướng mới (Vào sau khi đảo chiều).
                    </div>
                  </div>

                  {/* 3. Trần Odds khi vào lệnh mới */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                      🛡️ Trần Odds mới (Giữ Payout tốt)
                    </label>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                      {[
                        { label: '80%', val: 0.80 },
                        { label: '85% (Chuẩn)', val: 0.85 },
                        { label: '90%', val: 0.90 },
                      ].map((btn) => (
                        <button
                          key={btn.val}
                          type="button"
                          onClick={() => handleChange('trapMaxOdds', btn.val)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: (config.trapMaxOdds ?? 0.85) === btn.val ? '1px solid #fb7185' : '1px solid #334155',
                            background: (config.trapMaxOdds ?? 0.85) === btn.val ? 'rgba(244, 63, 94, 0.25)' : '#1e293b',
                            color: (config.trapMaxOdds ?? 0.85) === btn.val ? '#fb7185' : '#94a3b8',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: (config.trapMaxOdds ?? 0.85) === btn.val ? 700 : 400,
                          }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={60}
                      max={95}
                      value={Math.round((config.trapMaxOdds ?? 0.85) * 100)}
                      onChange={(e) => handleChange('trapMaxOdds', Number(e.target.value) / 100)}
                      style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc', fontSize: '0.85rem' }}
                    />
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                      Chỉ cược khi Odds cửa mới $\le$ {Math.round((config.trapMaxOdds ?? 0.85) * 100)}% để Payout trung bình đạt x1.4 trở lên.
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#fda4af', lineHeight: 1.4 }}>
                  ⚡ <strong>Quy tắc vào lệnh:</strong> Bot chờ đến 1 phút cuối (còn $\le$ 60s). Khi thấy BTC "quay xe" gãy StartPrice ít nhất ${config.trapMinPriceReversal ?? 15}, bot cược ngay vào cửa đảo chiều mới.
                </div>
              </div>
            )}

            {/* 2. Chọn các mốc Odds giống hệt bảng thống kê */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Chọn các mốc Odds (Click để Bật / Tắt từng mốc):
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleSelectOddsGroup('optimal')}
                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    🎯 85-95%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOddsGroup('wide')}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ⚡ 80-95%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOddsGroup('all')}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    🌐 Tất cả mốc
                  </button>
                </div>
              </div>

              {/* Grid 10 mốc Odds */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {ALL_ODDS_BUCKETS.map((ob) => {
                  const isSelected = config.targetOddsBuckets?.includes(ob);
                  return (
                    <button
                      key={ob}
                      type="button"
                      onClick={() => handleToggleOddsBucket(ob)}
                      style={{
                        padding: '6px 4px',
                        borderRadius: 6,
                        border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                        color: isSelected ? '#38bdf8' : '#64748b',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {isSelected ? '✓ ' : ''}{ob}%
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>
                Đang áp dụng mốc: <strong>{config.targetOddsBuckets?.map(b => `${b}%`).join(', ')}</strong> (Bot sẽ chỉ vào khi Odds nằm trong các mốc này).
              </div>
            </div>
          </div>

          {/* PHẦN 1: CHỌN ĐI ĐỀU TAY HAY GẤP THẾP */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                💰 1. CHỌN CHẾ ĐỘ VÀO TIỀN:
              </label>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {stakeMode === 'FLAT' && '🛡️ Đi đều tay: Cố định mỗi lệnh, không tăng vốn khi thua'}
                {stakeMode === 'MARTINGALE' && '🎯 Gấp thếp: Tăng tiền khi thua theo hệ số nhân'}
                {stakeMode === 'CUSTOM_LADDER' && '🪜 Chuỗi vốn: Tùy biến mức tiền cụ thể từng bước'}
              </span>
            </div>

            {/* Tabs chuyển chế độ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => handleSelectStakeMode('FLAT')}
                style={{
                  padding: '10px',
                  borderRadius: 8,
                  border: stakeMode === 'FLAT' ? '2px solid #38bdf8' : '1px solid #334155',
                  background: stakeMode === 'FLAT' ? 'rgba(56, 189, 248, 0.15)' : '#1e293b',
                  color: stakeMode === 'FLAT' ? '#38bdf8' : '#94a3b8',
                  fontWeight: stakeMode === 'FLAT' ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                🛡️ Đi Đều Tay (Flat Bet)
              </button>

              <button
                type="button"
                onClick={() => handleSelectStakeMode('MARTINGALE')}
                style={{
                  padding: '10px',
                  borderRadius: 8,
                  border: stakeMode === 'MARTINGALE' ? '2px solid #60a5fa' : '1px solid #334155',
                  background: stakeMode === 'MARTINGALE' ? 'rgba(59, 130, 246, 0.15)' : '#1e293b',
                  color: stakeMode === 'MARTINGALE' ? '#60a5fa' : '#94a3b8',
                  fontWeight: stakeMode === 'MARTINGALE' ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                🎯 Gấp Thếp (Martingale)
              </button>

              <button
                type="button"
                onClick={() => handleSelectStakeMode('CUSTOM_LADDER')}
                style={{
                  padding: '10px',
                  borderRadius: 8,
                  border: stakeMode === 'CUSTOM_LADDER' ? '2px solid #34d399' : '1px solid #334155',
                  background: stakeMode === 'CUSTOM_LADDER' ? 'rgba(16, 185, 129, 0.15)' : '#1e293b',
                  color: stakeMode === 'CUSTOM_LADDER' ? '#34d399' : '#94a3b8',
                  fontWeight: stakeMode === 'CUSTOM_LADDER' ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                🪜 Chuỗi Vốn Tùy Chỉnh
              </button>
            </div>

            {/* Khung nhập liệu tương ứng với từng chế độ */}
            {stakeMode === 'FLAT' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                    💵 Tiền cược cố định mỗi lệnh ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={config.baseStake}
                    onChange={(e) => handleChange('baseStake', Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#f8fafc',
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                    Mỗi lệnh đánh đúng ${config.baseStake}, thua không tăng tiền.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                    🛑 Dừng lỗ trong ngày ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={config.maxDailyLoss}
                    onChange={(e) => handleChange('maxDailyLoss', Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#f8fafc',
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                    Đạt mức lỗ này bot tự ngắt nghỉ trong ngày.
                  </div>
                </div>
              </div>
            )}

            {stakeMode === 'MARTINGALE' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                    Tiền gốc ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={config.baseStake}
                    onChange={(e) => handleChange('baseStake', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                    Hệ số nhân (x)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={config.multiplier}
                    onChange={(e) => handleChange('multiplier', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                    Tối đa bước gấp
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={config.maxSteps}
                    onChange={(e) => handleChange('maxSteps', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 6 }}>
                    Lỗ tối đa/ngày ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={config.maxDailyLoss}
                    onChange={(e) => handleChange('maxDailyLoss', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                  />
                </div>
              </div>
            )}

            {stakeMode === 'CUSTOM_LADDER' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                      🪜 Nhập chuỗi cược ngăn cách bằng dấu phẩy (Gõ tự do: 1, 6, 15, 40)
                    </label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: '👑 1, 6, 15, 40', val: '1, 6, 15, 40' },
                        { label: '⚡ 1, 3, 7, 15, 31', val: '1, 3, 7, 15, 31' },
                        { label: '🛡️ 2, 8, 20, 50', val: '2, 8, 20, 50' },
                        { label: '🎯 5, 20, 80', val: '5, 20, 80' },
                      ].map((p) => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => handleLadderTextChange(p.val)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: ladderText === p.val ? '1px solid #10b981' : '1px solid #334155',
                            background: ladderText === p.val ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                            color: ladderText === p.val ? '#34d399' : '#94a3b8',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            fontWeight: ladderText === p.val ? 700 : 500,
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="VD: 1, 6, 15, 40"
                      value={ladderText}
                      onChange={(e) => handleLadderTextChange(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        border: '1px solid #10b981',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#f8fafc',
                        fontFamily: 'monospace',
                        fontSize: '0.95rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                      Lỗ tối đa/ngày ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={config.maxDailyLoss}
                      onChange={(e) => handleChange('maxDailyLoss', Number(e.target.value))}
                      style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span>
                    {(() => {
                      const parts = ladderText.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                      return parts.length > 0
                        ? `Áp dụng ${parts.length} bước: ${parts.map((v, i) => `B${i + 1}: $${v}`).join(' ➔ ')}`
                        : 'Ví dụ: 1, 6, 15, 40';
                    })()}
                  </span>
                  {(() => {
                    const parts = ladderText.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                    return parts.length > 0 ? (
                      <span style={{ fontWeight: 600, color: '#facc15' }}>
                        Tổng vốn 1 chuỗi: ${parts.reduce((a, b) => a + b, 0)} USDT
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* PHẦN 2: CHỌN THEO PHÚT VÀO LỆNH */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ⏱️ 2. CHỌN PHÚT VÀO LỆNH (ĐẾM NGƯỢC 5 PHÚT):
              </label>
              <button
                type="button"
                onClick={() => setShowAdvancedSeconds(!showAdvancedSeconds)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {showAdvancedSeconds ? 'Ẩn số giây' : '⚙️ Chỉnh số giây lẻ'}
              </button>
            </div>

            {/* Các nút bấm chọn phút trực quan */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { key: '1-0m' as const, label: '⚡ Phút 1 - 0m', desc: 'Còn 1:00 -> 0:35 (Phút chót)', active: config.targetMinutes?.length === 1 && config.targetMinutes[0] === '1-0m' },
                { key: '2-1m' as const, label: '⚡ Phút 2 - 1m', desc: 'Còn 2:00 -> 1:00 (Khuyên dùng)', active: config.targetMinutes?.length === 1 && config.targetMinutes[0] === '2-1m' },
                { key: '3-2m' as const, label: '⏱️ Phút 3 - 2m', desc: 'Còn 3:00 -> 2:00', active: config.targetMinutes?.length === 1 && config.targetMinutes[0] === '3-2m' },
                { key: '4-3m' as const, label: '⏱️ Phút 4 - 3m', desc: 'Còn 4:00 -> 3:00', active: config.targetMinutes?.length === 1 && config.targetMinutes[0] === '4-3m' },
                { key: '5-4m' as const, label: '⚡ Phút 5 - 4m', desc: 'Còn 5:00 -> 4:00 (Phút đầu)', active: config.targetMinutes?.length === 1 && config.targetMinutes[0] === '5-4m' },
                { key: '2-0m' as const, label: '🎯 Cả Phút 2 - 0m', desc: 'Khoảng 2 phút cuối cùng', active: config.targetMinutes?.includes('2-1m') && config.targetMinutes?.includes('1-0m') && config.targetMinutes.length === 2 },
                { key: '3-1m' as const, label: '🎯 Cả Phút 3 - 1m', desc: 'Khoảng 2 phút áp chót', active: config.targetMinutes?.includes('3-2m') && config.targetMinutes?.includes('2-1m') && config.targetMinutes.length === 2 },
                { key: 'all' as const, label: '🌐 Tất cả các phút', desc: 'Quét tự do 35s - 240s', active: !config.targetMinutes || config.targetMinutes.length >= 5 },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleSelectMinutePreset(m.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: m.active ? '2px solid #facc15' : '1px solid #334155',
                    background: m.active ? 'rgba(234, 179, 8, 0.15)' : '#1e293b',
                    color: m.active ? '#facc15' : '#cbd5e1',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: m.active ? 700 : 600, fontSize: '0.82rem' }}>{m.label}</div>
                  <div style={{ fontSize: '0.68rem', color: m.active ? '#fde047' : '#94a3b8' }}>{m.desc}</div>
                </button>
              ))}
            </div>

            {/* Chi tiết số giây lẻ (khi bật xem) */}
            {showAdvancedSeconds && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                    Chặn giây cuối (&gt; s)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={config.minTimeRemaining}
                    onChange={(e) => handleChange('minTimeRemaining', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                    Chặn vào sớm (&lt; s)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={config.maxTimeRemaining}
                    onChange={(e) => handleChange('maxTimeRemaining', Number(e.target.value))}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* PHẦN 3: BỘ LỌC ĐỆM GIÁ TRÁNH SÁT NÚT & NGHỈ SAU THUA */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              🛡️ 3. BỘ LỌC ĐỆM GIÁ AN TOÀN (CHỐNG LẬT KÈO SÁT NÚT):
            </div>

            <div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 6 }}>
                  Đệm giá an toàn ($) - Khuyên dùng: $20
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[
                    { label: '🛡️ $20 (Chuẩn)', val: 20 },
                    { label: '$15', val: 15 },
                    { label: '$30', val: 30 },
                    { label: 'Tắt ($0)', val: 0 },
                  ].map((b) => (
                    <button
                      key={b.val}
                      type="button"
                      onClick={() => handleChange('minPriceBuffer', b.val)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: config.minPriceBuffer === b.val ? '1px solid #34d399' : '1px solid #334155',
                        background: config.minPriceBuffer === b.val ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                        color: config.minPriceBuffer === b.val ? '#34d399' : '#94a3b8',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontWeight: config.minPriceBuffer === b.val ? 700 : 400,
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0}
                  value={config.minPriceBuffer}
                  onChange={(e) => handleChange('minPriceBuffer', Number(e.target.value))}
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                  Chỉ vào lệnh khi khoảng cách giá so với giá chốt $\ge$ ${config.minPriceBuffer}. Bỏ toàn bộ râu nến giật sát rạt!
                </div>
              </div>
            </div>
          </div>

          {/* PHẦN 4: KIỂM SOÁT TRƯỢT GIÁ (MAX SLIPPAGE BPS) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ⚡ 4. KIỂM SOÁT TRƯỢT GIÁ (SLIPPAGE BPS):
              </div>
              <span style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600 }}>
                {((config.maxSlippageBps || 450) / 100).toFixed(1)}% trượt giá tối đa
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {[
                  { label: '🛡️ 3.0% (300 bps - Chặt chẽ)', val: 300 },
                  { label: '🎯 4.5% (450 bps - Chuẩn khuyên dùng)', val: 450 },
                  { label: '⚡ 5.0% (500 bps - Vừa phải)', val: 500 },
                  { label: '🔓 8.0% (800 bps - Rộng)', val: 800 },
                ].map((b) => (
                  <button
                    key={b.val}
                    type="button"
                    onClick={() => handleChange('maxSlippageBps', b.val)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: (config.maxSlippageBps || 450) === b.val ? '1px solid #f43f5e' : '1px solid #334155',
                      background: (config.maxSlippageBps || 450) === b.val ? 'rgba(244, 63, 94, 0.2)' : '#1e293b',
                      color: (config.maxSlippageBps || 450) === b.val ? '#fb7185' : '#94a3b8',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: (config.maxSlippageBps || 450) === b.val ? 700 : 400,
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'center' }}>
                <input
                  type="number"
                  min={50}
                  max={2000}
                  step={50}
                  value={config.maxSlippageBps || 450}
                  onChange={(e) => handleChange('maxSlippageBps', Number(e.target.value))}
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', color: '#f8fafc' }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Hạ từ 12% (1200 bps) xuống <strong>{config.maxSlippageBps || 450} bps ({((config.maxSlippageBps || 450) / 100).toFixed(1)}%)</strong> để Binance tự động hủy lệnh cược nếu giá bị đẩy quá đà, tránh bị khớp giá xấu chỉ ăn payout bèo!
                </div>
              </div>
            </div>
          </div>

          {/* Phiên hoạt động */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>
              Phiên hoạt động:
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'all' as TradingSession, label: '🌐 Tất cả (24/7)' },
                { id: 'asia' as TradingSession, label: '🌏 Á (07:00 - 14:00)' },
                { id: 'europe' as TradingSession, label: '🌍 Âu (14:00 - 19:00)' },
                { id: 'us' as TradingSession, label: '🌎 Mỹ (19:00 - 23:00)' },
                { id: 'night' as TradingSession, label: '🌙 Đêm (23:00 - 07:00)' },
              ].map((s) => {
                const isActive = config.sessions.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSessionToggle(s.id)}
                    style={{
                      background: isActive ? '#3b82f6' : '#1e293b',
                      color: isActive ? 'white' : '#94a3b8',
                      border: '1px solid #334155',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instant Backtest Preview */}
          <BacktestPreviewCard result={backtestResult} loading={isBacktesting} />

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #475569',
                color: '#cbd5e1',
                padding: '10px 18px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: '#3b82f6',
                border: 'none',
                color: 'white',
                padding: '10px 24px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              {isSaving ? '⏳ Đang lưu...' : '💾 Lưu Cấu Hình Bot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
