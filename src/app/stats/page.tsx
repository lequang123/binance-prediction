'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OddsStatsResult,
  OddsBucketWinRate,
  TradingSession,
} from '@/lib/types';
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

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TradingSession>('all');
  const [activeTab, setActiveTab] = useState<'winrate' | 'reversal' | 'ev' | 'streak'>('winrate');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStats = useCallback(async (session: TradingSession = selectedSession) => {
    try {
      const res = await fetch(`/api/stats?session=${session}`, { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
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
          💰 Expected Value
        </button>
      </div>

      {/* Data Table */}
      {data?.stats.resolvedRounds === 0 ? (
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
              {activeTab === 'ev' && 'EV (Expected Value) — Giá trị kỳ vọng mỗi $1 đặt cược (đã trừ 2% fee)'}
            </span>
          </div>

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

                      // Tab 4: EV
                      const evF = cell?.evFavorite ?? 0;
                      const evU = cell?.evUnderdog ?? 0;
                      return (
                        <td
                          key={mb}
                          className={styles.dataCell}
                          style={{ backgroundColor: getEVColor(evF, n) }}
                          title={`Favorite EV: ${evF >= 0 ? '+' : ''}${(evF * 100).toFixed(1)}¢ | Underdog EV: ${evU >= 0 ? '+' : ''}${(evU * 100).toFixed(1)}¢ per $1`}
                        >
                          <span className={styles.cellValue}>
                            {n > 0
                              ? `${evF >= 0 ? '+' : ''}${(evF * 100).toFixed(0)}¢`
                              : '—'}
                          </span>
                          <span className={styles.cellSubValue}>
                            {n > 0
                              ? `U: ${evU >= 0 ? '+' : ''}${(evU * 100).toFixed(0)}¢`
                              : ''}
                          </span>
                          <span className={styles.cellSample}>
                            {n > 0 ? `n=${n}` : ''}
                          </span>
                        </td>
                      );
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

                    {activeTab === 'ev' && (
                      <td
                        className={styles.summaryCell}
                        style={{ backgroundColor: getEVColor(rowSummary?.evFavorite ?? 0, rowN) }}
                        title={`Tổng mức ${ob}%: EV Favorite ${(rowSummary?.evFavorite ?? 0) >= 0 ? '+' : ''}${(((rowSummary?.evFavorite ?? 0) * 100)).toFixed(1)}¢ | EV Underdog ${(rowSummary?.evUnderdog ?? 0) >= 0 ? '+' : ''}${(((rowSummary?.evUnderdog ?? 0) * 100)).toFixed(1)}¢`}
                      >
                        <span className={styles.cellValue}>
                          {rowN > 0
                            ? `${(rowSummary?.evFavorite ?? 0) >= 0 ? '+' : ''}${((rowSummary?.evFavorite ?? 0) * 100).toFixed(0)}¢`
                            : '—'}
                        </span>
                        <span className={styles.cellSubValue}>
                          {rowN > 0
                            ? `U: ${(rowSummary?.evUnderdog ?? 0) >= 0 ? '+' : ''}${((rowSummary?.evUnderdog ?? 0) * 100).toFixed(0)}¢`
                            : ''}
                        </span>
                        <span className={styles.cellSample}>
                          {rowN > 0 ? `n=${rowN}` : ''}
                        </span>
                      </td>
                    )}
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
                🟢 EV dương = có lợi nhuận kỳ vọng | 🔴 EV âm = bất lợi | U = EV khi mua Underdog
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
