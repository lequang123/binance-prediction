'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OddsStatsResult, OddsBucketWinRate } from '@/lib/types';
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

const ODDS_BUCKETS = ['50-60', '60-70', '70-80', '80-90', '90+'];
const MINUTE_BUCKETS = ['5-4m', '4-3m', '3-2m', '2-1m', '1-0m'];

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

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<'winrate' | 'reversal' | 'ev'>('winrate');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

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
      await fetchStats();
    } catch (err) {
      console.error('Failed to toggle collector:', err);
    } finally {
      setToggling(false);
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

  if (loading) {
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
          <h3>Chưa có dữ liệu</h3>
          <p>
            Bấm &quot;Bắt đầu thu thập&quot; và chờ ít nhất 2-3 kỳ (10-15 phút) để có kết quả
            thống kê.
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <div className={styles.tableInfo}>
            <span>
              {activeTab === 'winrate' && '% Favorite thắng — Mỗi kỳ chỉ tính 1 lần (lần đầu odds chạm bucket)'}
              {activeTab === 'reversal' && '% Đảo chiều — Khi odds cao cho 1 bên nhưng bên kia thắng'}
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
              </tr>
            </thead>
            <tbody>
              {ODDS_BUCKETS.map((ob) => (
                <tr key={ob}>
                  <td className={styles.rowHeader}>{ob}%</td>
                  {MINUTE_BUCKETS.map((mb) => {
                    const cell = getCell(ob, mb);
                    const n = cell?.totalRounds ?? 0;

                    if (activeTab === 'winrate') {
                      const rate = cell?.favoriteWinRate ?? 0;
                      return (
                        <td
                          key={mb}
                          className={styles.dataCell}
                          style={{ backgroundColor: getWinRateColor(rate, n) }}
                          title={`${n} kỳ | Thắng: ${cell?.favoriteWins ?? 0} | Thua: ${cell?.reversals ?? 0}`}
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

                    // EV tab - show EV for both favorite and underdog
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
                </tr>
              ))}
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
              </>
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
          📌 <strong>Gợi ý</strong>: Chạy collector liên tục ít nhất vài giờ (50+ kỳ) để có dữ liệu đáng tin cậy.
        </p>
      </div>
    </div>
  );
}
