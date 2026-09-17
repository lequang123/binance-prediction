'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OddsStatsResult,
  OddsBucketWinRate,
  TradingSession,
} from '@/lib/types';
import AiAdvisorPanel from './AiAdvisorPanel';
import styles from './stats.module.css';

interface CollectorStatus {
  isCollecting: boolean;
  snapshotCount: number;
  roundCount: number;
  resolvedCount: number;
  errorCount: number;
  lastError: string | null;
  collectingSince: number | null;
  currentMarketTopicId: number | null;
}

interface StatsResponse {
  collector: CollectorStatus;
  stats: OddsStatsResult;
}

const ODDS_BUCKETS = [
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
const MINUTE_BUCKETS = ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'];

const SESSIONS: { id: TradingSession; name: string; time: string; icon: string }[] = [
  { id: 'all', name: 'Tất cả phiên', time: '24/24h', icon: '🌐' },
  { id: 'asia', name: 'Phiên Á', time: '07:00 - 14:00', icon: '🌏' },
  { id: 'europe', name: 'Phiên Âu', time: '14:00 - 19:00', icon: '🌍' },
  { id: 'us', name: 'Phiên Mỹ', time: '19:00 - 23:00', icon: '🌎' },
  { id: 'night', name: 'Phiên Đêm', time: '23:00 - 07:00', icon: '🌙' },
];

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getWinRateColor(rate: number, samples: number): string {
  if (samples === 0) return 'var(--cell-empty)';
  if (rate >= 0.8) return 'var(--cell-very-high)';
  if (rate >= 0.65) return 'var(--cell-high)';
  if (rate >= 0.55) return 'var(--cell-medium)';
  if (rate >= 0.45) return 'var(--cell-neutral)';
  if (rate >= 0.35) return 'var(--cell-low)';
  return 'var(--cell-very-low)';
}

function getReversalColor(rate: number, samples: number): string {
  if (samples === 0) return 'var(--cell-empty)';
  if (rate >= 0.4) return 'var(--cell-very-high)';
  if (rate >= 0.3) return 'var(--cell-high)';
  if (rate >= 0.2) return 'var(--cell-medium)';
  if (rate >= 0.1) return 'var(--cell-low)';
  return 'var(--cell-very-low-green)';
}

function getEVColor(ev: number, samples: number): string {
  if (samples === 0) return 'var(--cell-empty)';
  if (ev > 0.1) return 'var(--cell-ev-very-positive)';
  if (ev > 0.03) return 'var(--cell-ev-positive)';
  if (ev > -0.03) return 'var(--cell-neutral)';
  if (ev > -0.1) return 'var(--cell-ev-negative)';
  return 'var(--cell-ev-very-negative)';
}

interface TradePnlResult {
  stake: number;
  totalRounds: number;
  favWins: number;
  favLosses: number;
  favTotalLost: number;
  favTotalWon: number;
  favNetPnl: number;
  favPnlPerTrade: number;
  favRoi: number;
  favMultiplier: number;
  favReturnPerWin: number;
  favProfitPerWin: number;
  avgFavOddsPct: number;

  undWins: number;
  undLosses: number;
  undTotalLost: number;
  undTotalWon: number;
  undNetPnl: number;
  undPnlPerTrade: number;
  undRoi: number;
  undMultiplier: number;
  undReturnPerWin: number;
  undProfitPerWin: number;
  avgUndOddsPct: number;
}

function calculateTradePnl(
  totalRounds: number,
  favoriteWins: number,
  reversals: number,
  evFavorite: number,
  evUnderdog: number,
  avgFavoriteOdds: number,
  stake: number,
  avgFavAmountOut?: number,
  avgUndAmountOut?: number
): TradePnlResult | null {
  if (totalRounds <= 0) return null;

  const feeRate = 0.02;

  // Nếu có amountOut thực tế từ API get-quote thời gian thực thì dùng, nếu chưa thì tính theo chuẩn Binance get-quote
  const favAmountOut = (avgFavAmountOut && avgFavAmountOut > 0)
    ? avgFavAmountOut * stake
    : (avgFavoriteOdds > 0 ? (stake * (1 - feeRate)) / avgFavoriteOdds : 0);

  const favReturnPerWin = favAmountOut;
  const favProfitPerWin = favAmountOut - stake;
  const favMultiplier = stake > 0 ? favAmountOut / stake : 0;
  const avgFavOddsPct = avgFavoriteOdds * 100;

  const favTotalLost = reversals * stake;
  const favTotalWon = favoriteWins * favProfitPerWin;
  const favNetPnl = totalRounds * evFavorite * stake;
  const favPnlPerTrade = evFavorite * stake;
  const favRoi = evFavorite * 100;

  const underdogOdds = Math.max(0, 1 - avgFavoriteOdds);
  const undAmountOut = (avgUndAmountOut && avgUndAmountOut > 0)
    ? avgUndAmountOut * stake
    : (underdogOdds > 0 ? (stake * (1 - feeRate)) / underdogOdds : 0);

  const undReturnPerWin = undAmountOut;
  const undProfitPerWin = undAmountOut - stake;
  const undMultiplier = stake > 0 ? undAmountOut / stake : 0;
  const avgUndOddsPct = underdogOdds * 100;

  const undTotalLost = favoriteWins * stake;
  const undTotalWon = reversals * undProfitPerWin;
  const undNetPnl = totalRounds * evUnderdog * stake;
  const undPnlPerTrade = evUnderdog * stake;
  const undRoi = evUnderdog * 100;

  return {
    stake,
    totalRounds,
    favWins: favoriteWins,
    favLosses: reversals,
    favTotalLost,
    favTotalWon,
    favNetPnl,
    favPnlPerTrade,
    favRoi,
    favMultiplier,
    favReturnPerWin,
    favProfitPerWin,
    avgFavOddsPct,
    undWins: reversals,
    undLosses: favoriteWins,
    undTotalLost,
    undTotalWon,
    undNetPnl,
    undPnlPerTrade,
    undRoi,
    undMultiplier,
    undReturnPerWin,
    undProfitPerWin,
    avgUndOddsPct,
  };
}

function formatUsd(amount: number, forceSign = true): string {
  const sign = forceSign ? (amount > 0.005 ? '+' : amount < -0.005 ? '-' : '') : '';
  const abs = Math.abs(amount);
  if (abs >= 1000) {
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (abs >= 100) {
    return `${sign}$${abs.toFixed(0)}`;
  }
  return `${sign}$${abs.toFixed(1)}`;
}

function getStreakColor(maxLoss: number, samples: number): string {
  if (samples === 0) return 'var(--cell-empty)';
  if (maxLoss <= 1) return 'rgba(34, 197, 94, 0.35)';
  if (maxLoss <= 2) return 'rgba(34, 197, 94, 0.2)';
  if (maxLoss <= 3) return 'rgba(234, 179, 8, 0.25)';
  if (maxLoss <= 5) return 'rgba(239, 68, 68, 0.25)';
  return 'rgba(239, 68, 68, 0.45)';
}

function getStreakBadgeClass(maxLoss: number): string {
  if (maxLoss <= 2) return styles.streakSafe;
  if (maxLoss <= 3) return styles.streakWarning;
  return styles.streakDanger;
}

function formatVnTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TradingSession>('all');
  const [activeTab, setActiveTab] = useState<'winrate' | 'reversal' | 'ev' | 'streak' | 'losses' | 'ai'>('winrate');
  const [simStake, setSimStake] = useState<number>(10);
  const [simViewMode, setSimViewMode] = useState<'total' | 'per_trade'>('total');
  const [simSide, setSimSide] = useState<'both' | 'favorite' | 'underdog'>('both');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lossOddsFilter, setLossOddsFilter] = useState<string>('all');
  const [lossMinuteFilter, setLossMinuteFilter] = useState<string>('all');
  const [lossCategoryFilter, setLossCategoryFilter] = useState<string>('all');
  const [lossSearch, setLossSearch] = useState<string>('');
  const [lossPage, setLossPage] = useState<number>(1);
  const LOSS_PAGE_SIZE = 15;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStats = useCallback(async (session: TradingSession = selectedSession) => {
    try {
      const res = await fetch(`/api/stats?session=${session}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      // Khi server restart hoặc dev recompile, browser fetch có thể tạm gián đoạn 1 nhịp
      // Không crash UI, nhịp 5s tiếp theo sẽ tự động reconnect
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    fetchStats(selectedSession);
    intervalRef.current = setInterval(() => fetchStats(selectedSession), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats, selectedSession]);

  const handleSessionChange = (session: TradingSession) => {
    setSelectedSession(session);
    setLoading(true);
    fetchStats(session);
  };

  const toggleCollector = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const action = data.collector.isCollecting ? 'stop' : 'start';
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await fetchStats(selectedSession);
    } catch (err) {
      console.error('Failed to toggle collector:', err);
    } finally {
      setToggling(false);
    }
  };

  const handleExportBackup = () => {
    window.open('/api/stats/backup', '_blank');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/stats/backup', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (json.ok) {
        setNotice({ type: 'success', text: `✅ ${json.message}` });
        await fetchStats(selectedSession);
      } else {
        setNotice({ type: 'error', text: `❌ ${json.message || 'Lỗi khi nhập dữ liệu'}` });
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: `❌ Lỗi tải file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearData = async () => {
    if (!window.confirm('Bạn có chắc muốn XÓA SẠCH toàn bộ dữ liệu lịch sử để test dữ liệu mới không?\n(Dữ liệu cũ sẽ được tự động lưu 1 bản sao lưu trong thư mục logs/archive)')) {
      return;
    }
    try {
      const res = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const json = await res.json();
      if (json.ok) {
        setNotice({ type: 'success', text: '✅ Đã xóa sạch toàn bộ data cũ! Hệ thống bắt đầu thu thập dữ liệu mới.' });
        await fetchStats(selectedSession);
      } else {
        setNotice({ type: 'error', text: `❌ ${json.message || 'Lỗi khi xóa dữ liệu'}` });
      }
    } catch (err) {
      setNotice({ type: 'error', text: '❌ Lỗi khi gửi yêu cầu xóa' });
    }
  };

  const getCell = (
    oddsBucket: string,
    minuteBucket: string
  ): OddsBucketWinRate | undefined => {
    return data?.stats.winRateTable.find(
      (w) => w.oddsBucket === oddsBucket && w.minuteBucket === minuteBucket
    );
  };

  const getRowSummary = (oddsBucket: string) => {
    return data?.stats.rowSummaries?.find((r) => r.oddsBucket === oddsBucket);
  };

  const filteredLosses = (data?.stats.lossDetails || []).filter((l) => {
    if (lossOddsFilter !== 'all' && l.oddsBucket !== lossOddsFilter) return false;
    if (lossMinuteFilter !== 'all' && l.minuteBucket !== lossMinuteFilter) return false;
    if (lossCategoryFilter !== 'all' && l.category !== lossCategoryFilter) return false;
    if (lossSearch.trim()) {
      const q = lossSearch.trim().toLowerCase();
      if (!String(l.mtid).includes(q) && !l.oddsBucket.includes(q)) return false;
    }
    return true;
  });

  const totalLossPages = Math.max(1, Math.ceil(filteredLosses.length / LOSS_PAGE_SIZE));
  const currentPageLosses = filteredLosses.slice(
    (lossPage - 1) * LOSS_PAGE_SIZE,
    lossPage * LOSS_PAGE_SIZE
  );

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>⏳ Đang tải dữ liệu thống kê...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>📊 Thống kê Odds BTC Up/Down 5m</h1>
        <a href="/" className={styles.backLink}>
          ← Quay lại Dashboard
        </a>
      </div>

      {/* Backup / Export / Import Toolbar */}
      <div className={styles.backupBar}>
        <div className={styles.backupInfo}>
          <span>📦 Dữ liệu logs:</span>
          <span className={styles.backupBadge}>
            {data?.stats.resolvedRounds ?? 0} kỳ resolved ({data?.stats.totalRounds ?? 0} kỳ chạm odds)
          </span>
        </div>
        <div className={styles.backupActions}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,.jsonl"
            style={{ display: 'none' }}
          />
          <button
            className={styles.exportBtn}
            onClick={handleExportBackup}
            title="Tải về file backup JSON chứa toàn bộ dữ liệu kỳ và odds"
          >
            ⬇️ Xuất Backup (.json)
          </button>
          <button
            className={styles.importBtn}
            onClick={handleImportClick}
            disabled={importing}
            title="Tải lên file backup JSON hoặc JSONL để khôi phục dữ liệu sau khi deploy"
          >
            {importing ? '⏳ Đang nhập...' : '⬆️ Nhập Backup'}
          </button>
          <button
            className={styles.clearBtn}
            onClick={handleClearData}
            title="Xóa toàn bộ dữ liệu cũ để test dữ liệu mới (tự động sao lưu vào logs/archive)"
          >
            🗑️ Xóa Data cũ
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`${styles.backupNotice} ${notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}`}
        >
          {notice.text}
        </div>
      )}

      {/* Session Filter Selector */}
      <div className={styles.sessionSelector}>
        {SESSIONS.map((s) => (
          <button
            key={s.id}
            className={`${styles.sessionBtn} ${selectedSession === s.id ? styles.sessionBtnActive : ''}`}
            onClick={() => handleSessionChange(s.id)}
          >
            <span className={styles.sessionName}>
              {s.icon} {s.name}
            </span>
            <span className={styles.sessionTime}>{s.time}</span>
          </button>
        ))}
      </div>

      {/* Collector Status Card */}
      <div className={styles.statusCard}>
        <div className={styles.statusHeader}>
          <div className={styles.statusIndicator}>
            <span
              className={`${styles.statusDot} ${data?.collector.isCollecting ? styles.dotActive : styles.dotInactive}`}
            />
            <span className={styles.statusText}>
              {data?.collector.isCollecting
                ? 'Đang thu thập dữ liệu'
                : 'Đã dừng'}
            </span>
          </div>
          <button
            className={`${styles.toggleBtn} ${data?.collector.isCollecting ? styles.btnStop : styles.btnStart}`}
            onClick={toggleCollector}
            disabled={toggling}
          >
            {toggling
              ? '...'
              : data?.collector.isCollecting
                ? '⏹ Dừng'
                : '▶️ Bắt đầu thu thập'}
          </button>
        </div>

        <div className={styles.statusGrid}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {data?.collector.snapshotCount.toLocaleString() ?? 0}
            </span>
            <span className={styles.statLabel}>Snapshots</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {data?.stats.resolvedRounds ?? 0}
            </span>
            <span className={styles.statLabel}>Kỳ đã resolve</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {data?.stats.overallUpWinRate
                ? (data.stats.overallUpWinRate * 100).toFixed(1) + '%'
                : '—'}
            </span>
            <span className={styles.statLabel}>Up Win Rate</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {data?.stats.overallDownWinRate
                ? (data.stats.overallDownWinRate * 100).toFixed(1) + '%'
                : '—'}
            </span>
            <span className={styles.statLabel}>Down Win Rate</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {data?.collector.collectingSince
                ? formatDuration(Date.now() - data.collector.collectingSince)
                : '—'}
            </span>
            <span className={styles.statLabel}>Thời gian chạy</span>
          </div>
          {data?.collector.errorCount ? (
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${styles.errorValue}`}>
                {data.collector.errorCount}
              </span>
              <span className={styles.statLabel}>Errors</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'winrate' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('winrate')}
        >
          🏆 Tỉ lệ thắng
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'streak' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('streak')}
        >
          📉 Chuỗi thua liên tục
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'reversal' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('reversal')}
        >
          🔄 Đảo chiều
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'ev' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('ev')}
        >
          💰 Lời/Lỗ & EV (Trade Thật)
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'losses' ? styles.tabActive : ''}`}
          onClick={() => {
            setActiveTab('losses');
            setLossPage(1);
          }}
        >
          🔍 Chi tiết ca thua & Giá lệch
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'ai' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          🤖 AI Chiến Lược (Gemini)
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'ai' ? (
        <AiAdvisorPanel
          selectedSession={selectedSession}
          resolvedRounds={data?.stats.resolvedRounds ?? 0}
          totalRounds={data?.stats.totalRounds ?? 0}
        />
      ) : activeTab === 'losses' ? (
        <div className={styles.lossReportContainer}>
          {/* Summary Cards */}
          <div className={styles.lossSummaryGrid}>
            <div className={`${styles.lossCard} ${styles.cardTotal}`}>
              <span className={styles.lossCardTitle}>Tổng số ca lật kèo</span>
              <span className={styles.lossCardValue}>{data?.stats.lossSummary?.totalLosses ?? 0}</span>
              <span className={styles.lossCardSub}>
                Lệch giá TB: ${data?.stats.lossSummary?.avgShortfall.toFixed(2) ?? '0.00'}
              </span>
            </div>
            <div className={`${styles.lossCard} ${styles.cardCloseCall}`}>
              <span className={styles.lossCardTitle}>⚡ Sát nút (&lt; $15)</span>
              <span className={styles.lossCardValue}>
                {data?.stats.lossSummary?.closeCallCount ?? 0}
              </span>
              <span className={styles.lossCardSub}>
                {(data?.stats.lossSummary?.closeCallPct ?? 0).toFixed(1)}% — Giật giá giây cuối
              </span>
            </div>
            <div className={`${styles.lossCard} ${styles.cardModerate}`}>
              <span className={styles.lossCardTitle}>🌊 Đảo chiều vừa ($15 - $50)</span>
              <span className={styles.lossCardValue}>
                {data?.stats.lossSummary?.moderateCount ?? 0}
              </span>
              <span className={styles.lossCardSub}>
                {(data?.stats.lossSummary?.moderatePct ?? 0).toFixed(1)}% — Bẫy FOMO đầu/giữa phiên
              </span>
            </div>
            <div className={`${styles.lossCard} ${styles.cardStrong}`}>
              <span className={styles.lossCardTitle}>💥 Sập/Bơm mạnh (&ge; $50)</span>
              <span className={styles.lossCardValue}>
                {data?.stats.lossSummary?.strongCount ?? 0}
              </span>
              <span className={styles.lossCardSub}>
                {(data?.stats.lossSummary?.strongPct ?? 0).toFixed(1)}% — Quét nến xu hướng lớn
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className={styles.lossFilterBar}>
            <select
              className={styles.lossFilterSelect}
              value={lossOddsFilter}
              onChange={(e) => {
                setLossOddsFilter(e.target.value);
                setLossPage(1);
              }}
            >
              <option value="all">Mọi mức Odds</option>
              {ODDS_BUCKETS.map((ob) => (
                <option key={ob} value={ob}>
                  {ob}%
                </option>
              ))}
            </select>

            <select
              className={styles.lossFilterSelect}
              value={lossMinuteFilter}
              onChange={(e) => {
                setLossMinuteFilter(e.target.value);
                setLossPage(1);
              }}
            >
              <option value="all">Mọi khung phút</option>
              {MINUTE_BUCKETS.map((mb) => (
                <option key={mb} value={mb}>
                  {mb}
                </option>
              ))}
            </select>

            <select
              className={styles.lossFilterSelect}
              value={lossCategoryFilter}
              onChange={(e) => {
                setLossCategoryFilter(e.target.value);
                setLossPage(1);
              }}
            >
              <option value="all">Mọi mức lệch giá</option>
              <option value="close_call">⚡ Sát nút (&lt; $15)</option>
              <option value="moderate_reversal">🌊 Đảo chiều ($15 - $50)</option>
              <option value="strong_reversal">💥 Sập/Bơm mạnh (&ge; $50)</option>
            </select>

            <input
              type="text"
              placeholder="Tìm theo mã kỳ #mtid..."
              className={styles.lossSearchInput}
              value={lossSearch}
              onChange={(e) => {
                setLossSearch(e.target.value);
                setLossPage(1);
              }}
            />
          </div>

          {/* Loss Table */}
          <div className={styles.lossTableWrapper}>
            <table className={styles.lossTable}>
              <thead>
                <tr>
                  <th>Mã kỳ / Giờ</th>
                  <th>Cửa trên (Odds lúc vào)</th>
                  <th>Phút vào</th>
                  <th>Kết quả ra</th>
                  <th>Giá Start → End</th>
                  <th>Khoảng cách thiếu để thắng (ΔP)</th>
                  <th>Phân loại nguyên nhân</th>
                </tr>
              </thead>
              <tbody>
                {currentPageLosses.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                      Không có ca thua nào khớp với bộ lọc
                    </td>
                  </tr>
                ) : (
                  currentPageLosses.map((l, idx) => (
                    <tr key={`${l.mtid}-${l.oddsBucket}-${l.minuteBucket}-${idx}`}>
                      <td>
                        <strong>#{l.mtid}</strong>
                        <div style={{ fontSize: '11px', color: '#9aa0a6' }}>
                          {formatVnTime(l.ts)}
                        </div>
                      </td>
                      <td>
                        <span className={l.favoriteSide === 'Up' ? styles.badgeUp : styles.badgeDown}>
                          {l.favoriteSide}
                        </span>{' '}
                        <strong>{(l.favoriteOdds * 100).toFixed(1)}%</strong> ({l.oddsBucket}%)
                      </td>
                      <td>{l.minuteBucket}</td>
                      <td>
                        <span className={l.winner === 'Up' ? styles.badgeUp : styles.badgeDown}>
                          {l.winner} thắng
                        </span>
                      </td>
                      <td className={styles.priceFlow}>
                        ${l.startPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} →{' '}
                        ${l.endPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={styles.shortfallValue}>
                          Thiếu ${l.shortfall.toFixed(2)}
                        </span>{' '}
                        <span style={{ fontSize: '11px', color: '#9aa0a6' }}>
                          ({l.shortfallPct.toFixed(3)}%)
                        </span>
                      </td>
                      <td>
                        {l.category === 'close_call' && (
                          <span className={styles.badgeCatClose}>⚡ Sát nút (&lt; $15)</span>
                        )}
                        {l.category === 'moderate_reversal' && (
                          <span className={styles.badgeCatMod}>🌊 Đảo chiều ($15-$50)</span>
                        )}
                        {l.category === 'strong_reversal' && (
                          <span className={styles.badgeCatStrong}>💥 Quét mạnh (&ge; $50)</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalLossPages > 1 && (
            <div className={styles.paginationBar}>
              <button
                className={styles.pageBtn}
                onClick={() => setLossPage((p) => Math.max(1, p - 1))}
                disabled={lossPage <= 1}
              >
                ← Trang trước
              </button>
              <span className={styles.pageInfo}>
                Trang {lossPage} / {totalLossPages} (Tổng {filteredLosses.length} ca)
              </span>
              <button
                className={styles.pageBtn}
                onClick={() => setLossPage((p) => Math.min(totalLossPages, p + 1))}
                disabled={lossPage >= totalLossPages}
              >
                Trang sau →
              </button>
            </div>
          )}
        </div>
      ) : data?.stats.resolvedRounds === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <h3>Chưa có dữ liệu cho phiên này</h3>
          <p>
            Không tìm thấy kỳ nào trong khung giờ{' '}
            {SESSIONS.find((s) => s.id === selectedSession)?.name}. Hãy chọn &quot;Tất cả phiên&quot; hoặc thu thập thêm dữ liệu.
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <div className={styles.tableInfo}>
            <span>
              {activeTab === 'winrate' && '% Favorite thắng & Chuỗi thua tối đa (Max L) — Mỗi kỳ chỉ tính 1 lần'}
              {activeTab === 'streak' && 'Chuỗi thua liên tục tối đa (Max Consecutive Losses) — Số kỳ Favorite thua liên tiếp khi ô đó xuất hiện'}
              {activeTab === 'reversal' && '% Đảo chiều — Khi odds cao cho 1 bên nhưng bên kia thắng (Underdog ăn)'}
              {activeTab === 'ev' && '💰 Mô phỏng Trade Thật & Lợi nhuận kỳ vọng — Tính chuẩn xác số tiền Lời/Lỗ ($) đã trừ 2% phí sàn'}
            </span>
          </div>

          {activeTab === 'ev' && (
            <div className={styles.simToolbar}>
              <div className={styles.simGroup}>
                <span className={styles.simLabel}>💵 Cược mỗi ván:</span>
                <div className={styles.simBtnGroup}>
                  {[1, 5, 10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`${styles.simPillBtn} ${simStake === amt ? styles.simPillActive : ''}`}
                      onClick={() => setSimStake(amt)}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={simStake}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val > 0) setSimStake(val);
                  }}
                  className={styles.simInput}
                  title="Nhập số tiền cược tùy ý ($)"
                />
              </div>

              <div className={styles.simGroup}>
                <span className={styles.simLabel}>📊 Hiển thị:</span>
                <div className={styles.simBtnGroup}>
                  <button
                    type="button"
                    className={`${styles.simPillBtn} ${simViewMode === 'total' ? styles.simPillActive : ''}`}
                    onClick={() => setSimViewMode('total')}
                  >
                    Tổng Lời/Lỗ ($)
                  </button>
                  <button
                    type="button"
                    className={`${styles.simPillBtn} ${simViewMode === 'per_trade' ? styles.simPillActive : ''}`}
                    onClick={() => setSimViewMode('per_trade')}
                  >
                    Mỗi lệnh ($/lệnh & %)
                  </button>
                </div>
              </div>

              <div className={styles.simGroup}>
                <span className={styles.simLabel}>🎯 Cửa cược:</span>
                <div className={styles.simBtnGroup}>
                  <button
                    type="button"
                    className={`${styles.simPillBtn} ${simSide === 'both' ? styles.simPillActive : ''}`}
                    onClick={() => setSimSide('both')}
                  >
                    ⚖️ Cả 2 (F & U)
                  </button>
                  <button
                    type="button"
                    className={`${styles.simPillBtn} ${simSide === 'favorite' ? styles.simPillActive : ''}`}
                    onClick={() => setSimSide('favorite')}
                  >
                    🔵 Favorite
                  </button>
                  <button
                    type="button"
                    className={`${styles.simPillBtn} ${simSide === 'underdog' ? styles.simPillActive : ''}`}
                    onClick={() => setSimSide('underdog')}
                  >
                    🟠 Underdog
                  </button>
                </div>
              </div>

              <div className={styles.simHint}>
                💡 <strong>Mô phỏng trade thật ${simStake}/kỳ</strong> (đã trừ 2% phí sàn).{' '}
                <span className={styles.textGreen}>Màu xanh = Có lãi ròng</span> •{' '}
                <span className={styles.textRed}>Màu đỏ = Thua lỗ ròng</span>. Rê chuột vào từng ô để xem chi tiết số tiền THẮNG ĐƯỢC và THUA MẤT.
              </div>
            </div>
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.cornerCell}>
                  Odds ↓ / Thời gian →
                </th>
                {MINUTE_BUCKETS.map((mb) => (
                  <th key={mb} className={styles.headerCell}>
                    {mb}
                  </th>
                ))}
                <th className={styles.summaryHeader}>
                  Tổng mức Odds (All mins)
                </th>
              </tr>
            </thead>
            <tbody>
              {ODDS_BUCKETS.map((ob) => {
                const rowSummary = getRowSummary(ob);
                const rowN = rowSummary?.totalRounds ?? 0;

                return (
                  <tr key={ob}>
                    <td className={styles.rowHeader}>{ob}%</td>
                    {MINUTE_BUCKETS.map((mb) => {
                      const cell = getCell(ob, mb);
                      const n = cell?.totalRounds ?? 0;
                      const maxL = cell?.maxConsecutiveLosses ?? 0;
                      const curL = cell?.currentLossStreak ?? 0;

                      // Tab 1: Win Rate
                      if (activeTab === 'winrate') {
                        const rate = cell?.favoriteWinRate ?? 0;
                        return (
                          <td
                            key={mb}
                            className={styles.dataCell}
                            style={{ backgroundColor: getWinRateColor(rate, n) }}
                            title={`${n} kỳ | Thắng: ${cell?.favoriteWins ?? 0} | Thua: ${cell?.reversals ?? 0} | Thua liên tiếp max: ${maxL} (hiện tại: ${curL})`}
                          >
                            <span className={styles.cellValue}>
                              {n > 0 ? (rate * 100).toFixed(1) + '%' : '—'}
                            </span>
                            {n > 0 && (
                              <span className={`${styles.streakBadge} ${getStreakBadgeClass(maxL)}`}>
                                Max L: {maxL}
                              </span>
                            )}
                            <span className={styles.cellSample}>
                              {n > 0 ? `n=${n}` : ''}
                            </span>
                          </td>
                        );
                      }

                      // Tab 2: Consecutive Losses Streak
                      if (activeTab === 'streak') {
                        return (
                          <td
                            key={mb}
                            className={styles.dataCell}
                            style={{ backgroundColor: getStreakColor(maxL, n) }}
                            title={`${n} kỳ | Chuỗi thua max: ${maxL} kỳ liên tiếp | Chuỗi thua hiện tại: ${curL}`}
                          >
                            <span className={styles.cellValue}>
                              {n > 0 ? `Max: ${maxL}` : '—'}
                            </span>
                            <span className={styles.cellSubValue}>
                              {n > 0 ? `Hiện tại: ${curL}` : ''}
                            </span>
                            <span className={styles.cellSample}>
                              {n > 0 ? `n=${n}` : ''}
                            </span>
                          </td>
                        );
                      }

                      // Tab 3: Reversals
                      if (activeTab === 'reversal') {
                        const rate = cell?.reversalRate ?? 0;
                        return (
                          <td
                            key={mb}
                            className={styles.dataCell}
                            style={{ backgroundColor: getReversalColor(rate, n) }}
                            title={`${n} kỳ | Đảo chiều: ${cell?.reversals ?? 0}`}
                          >
                            <span className={styles.cellValue}>
                              {n > 0 ? (rate * 100).toFixed(1) + '%' : '—'}
                            </span>
                            <span className={styles.cellSample}>
                              {n > 0 ? `n=${n}` : ''}
                            </span>
                          </td>
                        );
                      }

                      // Tab 4: EV / Trade PnL Simulation
                      if (activeTab === 'ev') {
                        const pnl = calculateTradePnl(
                          n,
                          cell?.favoriteWins ?? 0,
                          cell?.reversals ?? 0,
                          cell?.evFavorite ?? 0,
                          cell?.evUnderdog ?? 0,
                          cell?.avgFavoriteOdds ?? 0,
                          simStake,
                          cell?.avgFavAmountOut,
                          cell?.avgUndAmountOut
                        );

                        const primaryEv = simSide === 'underdog' ? (cell?.evUnderdog ?? 0) : (cell?.evFavorite ?? 0);
                        const cellBg = getEVColor(primaryEv, n);

                        let mainText = '—';
                        let subText = '';

                        if (pnl) {
                          if (simSide === 'both') {
                            if (simViewMode === 'total') {
                              mainText = formatUsd(pnl.favNetPnl);
                              subText = `U: ${formatUsd(pnl.undNetPnl)}`;
                            } else {
                              mainText = `${formatUsd(pnl.favPnlPerTrade)} (${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(0)}%)`;
                              subText = `U: ${formatUsd(pnl.undPnlPerTrade)} (${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(0)}%)`;
                            }
                          } else if (simSide === 'favorite') {
                            if (simViewMode === 'total') {
                              mainText = formatUsd(pnl.favNetPnl);
                              subText = `+${formatUsd(pnl.favTotalWon, false)} | -${formatUsd(pnl.favTotalLost, false)}`;
                            } else {
                              mainText = `${formatUsd(pnl.favPnlPerTrade)}/lệnh`;
                              subText = `ROI: ${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(1)}%`;
                            }
                          } else {
                            if (simViewMode === 'total') {
                              mainText = formatUsd(pnl.undNetPnl);
                              subText = `+${formatUsd(pnl.undTotalWon, false)} | -${formatUsd(pnl.undTotalLost, false)}`;
                            } else {
                              mainText = `${formatUsd(pnl.undPnlPerTrade)}/lệnh`;
                              subText = `ROI: ${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(1)}%`;
                            }
                          }
                        }

                        const cellTooltip = pnl
                          ? `[Odds ${ob}% • ${mb} | ${n} kỳ]
Mức cược mô phỏng: $${simStake}/kỳ (Tổng vốn đã cược: $${(n * simStake).toLocaleString()})

🔹 CƯỢC FAVORITE (Kèo trên — Odds TB: ${pnl.avgFavOddsPct.toFixed(1)}%):
• Tỷ lệ ăn thưởng (Multiplier): ${pnl.favMultiplier.toFixed(2)}x
• Mỗi ván thắng NHẬN VỀ: $${pnl.favReturnPerWin.toFixed(2)} (Gốc $${simStake} + Lãi ròng +$${pnl.favProfitPerWin.toFixed(2)})
• Kết quả ${n} kỳ: Thắng ${pnl.favWins} ván (Được: +$${pnl.favTotalWon.toFixed(1)}) | Thua ${pnl.favLosses} ván (Mất: -$${pnl.favTotalLost.toFixed(1)})
➜ TỔNG LÃI/LỖ: ${formatUsd(pnl.favNetPnl)} (TB: ${formatUsd(pnl.favPnlPerTrade)}/lệnh | ROI: ${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(1)}%)

🔸 CƯỢC UNDERDOG (Kèo dưới — Odds TB: ${pnl.avgUndOddsPct.toFixed(1)}%):
• Tỷ lệ ăn thưởng (Multiplier): ${pnl.undMultiplier.toFixed(2)}x
• Mỗi ván thắng NHẬN VỀ: $${pnl.undReturnPerWin.toFixed(2)} (Gốc $${simStake} + Lãi ròng +$${pnl.undProfitPerWin.toFixed(2)})
• Kết quả ${n} kỳ: Thắng ${pnl.undWins} ván (Được: +$${pnl.undTotalWon.toFixed(1)}) | Thua ${pnl.undLosses} ván (Mất: -$${pnl.undTotalLost.toFixed(1)})
➜ TỔNG LÃI/LỖ: ${formatUsd(pnl.undNetPnl)} (TB: ${formatUsd(pnl.undPnlPerTrade)}/lệnh | ROI: ${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(1)}%)`
                          : 'Chưa có dữ liệu';

                        return (
                          <td
                            key={mb}
                            className={styles.dataCell}
                            style={{ backgroundColor: cellBg }}
                            title={cellTooltip}
                          >
                            <span className={styles.cellValue}>
                              {mainText}
                            </span>
                            {subText && (
                              <span className={styles.cellSubValue}>
                                {subText}
                              </span>
                            )}
                            <span className={styles.cellSample}>
                              {n > 0 ? `n=${n}` : ''}
                            </span>
                          </td>
                        );
                      }
                    })}

                    {/* Summary Cell for the whole Odds Row */}
                    {activeTab === 'winrate' && (
                      <td
                        className={styles.summaryCell}
                        style={{ backgroundColor: getWinRateColor(rowSummary?.favoriteWinRate ?? 0, rowN) }}
                        title={`Tổng mức ${ob}%: ${rowN} kỳ | Thắng: ${rowSummary?.favoriteWins ?? 0} | Thua: ${rowSummary?.reversals ?? 0} | Chuỗi thua max: ${rowSummary?.maxConsecutiveLosses ?? 0}`}
                      >
                        <span className={styles.cellValue}>
                          {rowN > 0 ? ((rowSummary?.favoriteWinRate ?? 0) * 100).toFixed(1) + '%' : '—'}
                        </span>
                        {rowN > 0 && (
                          <span className={`${styles.streakBadge} ${getStreakBadgeClass(rowSummary?.maxConsecutiveLosses ?? 0)}`}>
                            Max L: {rowSummary?.maxConsecutiveLosses ?? 0}
                          </span>
                        )}
                        <span className={styles.cellSample}>
                          {rowN > 0 ? `n=${rowN}` : ''}
                        </span>
                      </td>
                    )}

                    {activeTab === 'streak' && (
                      <td
                        className={styles.summaryCell}
                        style={{ backgroundColor: getStreakColor(rowSummary?.maxConsecutiveLosses ?? 0, rowN) }}
                        title={`Tổng mức ${ob}%: Chuỗi thua max: ${rowSummary?.maxConsecutiveLosses ?? 0} kỳ liên tiếp | Chuỗi thua hiện tại: ${rowSummary?.currentLossStreak ?? 0}`}
                      >
                        <span className={styles.cellValue}>
                          {rowN > 0 ? `Max: ${rowSummary?.maxConsecutiveLosses ?? 0}` : '—'}
                        </span>
                        <span className={styles.cellSubValue}>
                          {rowN > 0 ? `Hiện tại: ${rowSummary?.currentLossStreak ?? 0}` : ''}
                        </span>
                        <span className={styles.cellSample}>
                          {rowN > 0 ? `n=${rowN}` : ''}
                        </span>
                      </td>
                    )}

                    {activeTab === 'reversal' && (
                      <td
                        className={styles.summaryCell}
                        style={{ backgroundColor: getReversalColor(rowSummary?.reversalRate ?? 0, rowN) }}
                        title={`Tổng mức ${ob}%: Đảo chiều ${rowSummary?.reversals ?? 0}/${rowN}`}
                      >
                        <span className={styles.cellValue}>
                          {rowN > 0 ? ((rowSummary?.reversalRate ?? 0) * 100).toFixed(1) + '%' : '—'}
                        </span>
                        <span className={styles.cellSample}>
                          {rowN > 0 ? `n=${rowN}` : ''}
                        </span>
                      </td>
                    )}

                    {activeTab === 'ev' && (() => {
                      const pnl = calculateTradePnl(
                        rowN,
                        rowSummary?.favoriteWins ?? 0,
                        rowSummary?.reversals ?? 0,
                        rowSummary?.evFavorite ?? 0,
                        rowSummary?.evUnderdog ?? 0,
                        rowSummary?.avgFavoriteOdds ?? 0,
                        simStake,
                        rowSummary?.avgFavAmountOut,
                        rowSummary?.avgUndAmountOut
                      );

                      const primaryEv = simSide === 'underdog' ? (rowSummary?.evUnderdog ?? 0) : (rowSummary?.evFavorite ?? 0);
                      const cellBg = getEVColor(primaryEv, rowN);

                      let mainText = '—';
                      let subText = '';

                      if (pnl) {
                        if (simSide === 'both') {
                          if (simViewMode === 'total') {
                            mainText = formatUsd(pnl.favNetPnl);
                            subText = `U: ${formatUsd(pnl.undNetPnl)}`;
                          } else {
                            mainText = `${formatUsd(pnl.favPnlPerTrade)} (${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(0)}%)`;
                            subText = `U: ${formatUsd(pnl.undPnlPerTrade)} (${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(0)}%)`;
                          }
                        } else if (simSide === 'favorite') {
                          if (simViewMode === 'total') {
                            mainText = formatUsd(pnl.favNetPnl);
                            subText = `+${formatUsd(pnl.favTotalWon, false)} | -${formatUsd(pnl.favTotalLost, false)}`;
                          } else {
                            mainText = `${formatUsd(pnl.favPnlPerTrade)}/lệnh`;
                            subText = `ROI: ${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(1)}%`;
                          }
                        } else {
                          if (simViewMode === 'total') {
                            mainText = formatUsd(pnl.undNetPnl);
                            subText = `+${formatUsd(pnl.undTotalWon, false)} | -${formatUsd(pnl.undTotalLost, false)}`;
                          } else {
                            mainText = `${formatUsd(pnl.undPnlPerTrade)}/lệnh`;
                            subText = `ROI: ${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(1)}%`;
                          }
                        }
                      }

                      const summaryTooltip = pnl
                        ? `[Tổng mức ${ob}% | ${rowN} kỳ]
Mức cược mô phỏng: $${simStake}/kỳ (Tổng vốn đã cược: $${(rowN * simStake).toLocaleString()})

🔹 CƯỢC FAVORITE (Kèo trên — Odds TB: ${pnl.avgFavOddsPct.toFixed(1)}%):
• Tỷ lệ ăn thưởng (Multiplier): ${pnl.favMultiplier.toFixed(2)}x
• Mỗi ván thắng NHẬN VỀ: $${pnl.favReturnPerWin.toFixed(2)} (Gốc $${simStake} + Lãi ròng +$${pnl.favProfitPerWin.toFixed(2)})
• Kết quả ${rowN} kỳ: Thắng ${pnl.favWins} ván (Được: +$${pnl.favTotalWon.toFixed(1)}) | Thua ${pnl.favLosses} ván (Mất: -$${pnl.favTotalLost.toFixed(1)})
➜ TỔNG LÃI/LỖ: ${formatUsd(pnl.favNetPnl)} (TB: ${formatUsd(pnl.favPnlPerTrade)}/lệnh | ROI: ${pnl.favRoi >= 0 ? '+' : ''}${pnl.favRoi.toFixed(1)}%)

🔸 CƯỢC UNDERDOG (Kèo dưới — Odds TB: ${pnl.avgUndOddsPct.toFixed(1)}%):
• Tỷ lệ ăn thưởng (Multiplier): ${pnl.undMultiplier.toFixed(2)}x
• Mỗi ván thắng NHẬN VỀ: $${pnl.undReturnPerWin.toFixed(2)} (Gốc $${simStake} + Lãi ròng +$${pnl.undProfitPerWin.toFixed(2)})
• Kết quả ${rowN} kỳ: Thắng ${pnl.undWins} ván (Được: +$${pnl.undTotalWon.toFixed(1)}) | Thua ${pnl.undLosses} ván (Mất: -$${pnl.undTotalLost.toFixed(1)})
➜ TỔNG LÃI/LỖ: ${formatUsd(pnl.undNetPnl)} (TB: ${formatUsd(pnl.undPnlPerTrade)}/lệnh | ROI: ${pnl.undRoi >= 0 ? '+' : ''}${pnl.undRoi.toFixed(1)}%)`
                        : 'Chưa có dữ liệu';

                      return (
                        <td
                          className={styles.summaryCell}
                          style={{ backgroundColor: cellBg }}
                          title={summaryTooltip}
                        >
                          <span className={styles.cellValue}>
                            {mainText}
                          </span>
                          {subText && (
                            <span className={styles.cellSubValue}>
                              {subText}
                            </span>
                          )}
                          <span className={styles.cellSample}>
                            {rowN > 0 ? `n=${rowN}` : ''}
                          </span>
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={styles.legend}>
            {activeTab === 'winrate' && (
              <>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-very-high)' }}
                  />
                  ≥80%
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-high)' }}
                  />
                  65-80%
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-medium)' }}
                  />
                  55-65%
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-neutral)' }}
                  />
                  45-55%
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-low)' }}
                  />
                  35-45%
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: 'var(--cell-very-low)' }}
                  />
                  &lt;35%
                </span>
                <span className={styles.legendNote}>
                  | <strong style={{ color: '#86efac' }}>Max L: X</strong> là số kỳ thua liên tục tối đa của ô/mức đó
                </span>
              </>
            )}
            {activeTab === 'streak' && (
              <span className={styles.legendNote}>
                🟢 Xanh (Max L ≤ 2): Chuỗi thua ít, an toàn | 🟡 Vàng (Max L = 3): Cảnh báo vừa | 🔴 Đỏ (Max L ≥ 4): Rủi ro chuỗi thua cao
              </span>
            )}
            {activeTab === 'reversal' && (
              <span className={styles.legendNote}>
                🔴 Đỏ = đảo chiều nhiều (cơ hội mua underdog) | 🟢 Xanh = ít đảo chiều (xu hướng ổn định)
              </span>
            )}
            {activeTab === 'ev' && (
              <span className={styles.legendNote}>
                🟢 Xanh = Trade thật có LÃI RÒNG (+$$) | 🔴 Đỏ = Trade thật bị THUA LỖ (-$$) | U = Cửa Underdog | Rê chuột vào từng ô để xem số tiền ĐƯỢC và MẤT cụ thể
              </span>
            )}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <p>
          💡 <strong>Cách đọc</strong>: Mỗi ô = khi odds favorite ở mức X% tại thời điểm còn Y phút.
          Mỗi kỳ chỉ tính 1 lần (lần đầu odds chạm bucket đó).
        </p>
        <p>
          📌 <strong>Khung giờ các phiên (GMT+7)</strong>: Phiên Á (07:00 - 14:00) • Phiên Âu (14:00 - 19:00) • Phiên Mỹ (19:00 - 23:00) • Phiên Đêm (23:00 - 07:00).
        </p>
        <p>
          🎯 <strong>Quản lý vốn</strong>: Chỉ số <code>Max L</code> (Chuỗi thua liên tiếp) giúp bạn xác định mức drawdown tối đa để chia volume cược, tránh cháy tài khoản khi thị trường đi vào chuỗi bão lật kèo.
        </p>
      </div>
    </div>
  );
}
