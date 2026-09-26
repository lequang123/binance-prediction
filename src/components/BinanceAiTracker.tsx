'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { BinanceAiStats, AiPredictionRecord } from '@/lib/types';
import styles from './BinanceAiTracker.module.css';

interface BinanceAiTrackerProps {
  currentMarketTopicId?: number | null;
}

export default function BinanceAiTracker({ currentMarketTopicId }: BinanceAiTrackerProps) {
  const [stats, setStats] = useState<BinanceAiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-stats', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.stats) {
        setStats(json.stats);
      }
    } catch (e) {
      // Ignore network hiccup
    } finally {
      setLoading(false);
    }
  }, [currentMarketTopicId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleManualRefresh = async () => {
    if (!currentMarketTopicId) return;
    setRefreshing(true);
    try {
      await fetch('/api/ai-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', marketTopicId: currentMarketTopicId }),
      });
      await fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const latest = stats?.latestPrediction;

  const getConfClass = (conf: string) => {
    if (conf === 'high') return styles.confHigh;
    if (conf === 'medium') return styles.confMedium;
    return styles.confLow;
  };

  const getImpactClass = (impact: string) => {
    if (impact === 'bullish') return styles.impactBullish;
    if (impact === 'bearish') return styles.impactBearish;
    return styles.impactNeutral;
  };

  const formatVnTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={styles.container}>
      {/* 1. LIVE SIGNAL CARD */}
      <div className={styles.liveCard}>
        <div className={styles.cardHeader}>
          <div className={styles.titleArea}>
            <span className={styles.botBadge}>⚡ Binance Official AI</span>
            <span className={styles.roundId}>
              {latest ? `Kỳ #${latest.mtid}` : 'Đang chờ dữ liệu kỳ...'}
            </span>
            {latest?.targetPrice && (
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                (Mốc giá mục tiêu: ${latest.targetPrice})
              </span>
            )}
          </div>
          <button
            className={styles.refreshBtn}
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Gọi lại Binance AI phân tích lại kỳ này"
          >
            {refreshing ? '⏳ Đang phân tích...' : '🔄 Làm mới phân tích AI'}
          </button>
        </div>

        {latest ? (
          <>
            <div className={styles.signalBanner}>
              {/* Recommendation Box */}
              <div
                className={`${styles.recommendationBox} ${
                  latest.direction === 'Up' ? styles.recUp : styles.recDown
                }`}
              >
                <span className={styles.recLabel}>Khuyến nghị từ Binance AI</span>
                <span className={styles.recDirection}>
                  {latest.direction === 'Up' ? '▲ CHỌN UP' : '▼ CHỌN DOWN'}
                </span>
                <span className={`${styles.confidenceBadge} ${getConfClass(latest.confidence)}`}>
                  Độ tự tin: {latest.confidence.toUpperCase()}
                </span>
              </div>

              {/* Probability Comparison */}
              <div className={styles.probCompareBox}>
                <div className={styles.probRow}>
                  <div className={styles.probLabelRow}>
                    <span>🤖 Xác suất AI tính:</span>
                    <span>
                      Up {latest.aiProbUp}% | Down {latest.aiProbDown}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barUp} style={{ width: `${latest.aiProbUp}%` }} />
                  </div>
                </div>

                <div className={styles.probRow}>
                  <div className={styles.probLabelRow}>
                    <span>👥 Đám đông thị trường:</span>
                    <span>
                      Up {latest.marketProbUp}% | Down {latest.marketProbDown}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barUp} style={{ width: `${latest.marketProbUp}%` }} />
                  </div>
                </div>

                {/* Contrarian Notice */}
                {((latest.direction === 'Up' && latest.marketProbDown > 50) ||
                  (latest.direction === 'Down' && latest.marketProbUp > 50)) && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#fbbf24',
                      background: 'rgba(251, 191, 36, 0.1)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                    }}
                  >
                    ⚡ AI đang đi ngược đám đông thị trường (Cơ hội đảo chiều / Contrarian)!
                  </div>
                )}
              </div>
            </div>

            {/* Reasoning & Summary */}
            {(latest.summary || latest.reasoning) && (
              <div className={styles.reasonBox}>
                {latest.summary && (
                  <div className={styles.reasonSummary}>📌 {latest.summary}</div>
                )}
                {latest.reasoning && (
                  <div className={styles.reasonText}>{latest.reasoning}</div>
                )}
              </div>
            )}

            {/* Technical Indicators Breakdown */}
            {latest.indicators && latest.indicators.length > 0 && (
              <div className={styles.indicatorsGrid}>
                {latest.indicators.map((ind, idx) => (
                  <div key={idx} className={styles.indicatorCard}>
                    <div className={styles.indTop}>
                      <span className={styles.indName}>{ind.name}</span>
                      <span className={`${styles.impactBadge} ${getImpactClass(ind.impact)}`}>
                        {ind.impact}
                      </span>
                    </div>
                    {ind.signal && (
                      <div style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: 2 }}>
                        {ind.signal}
                      </div>
                    )}
                    {ind.summary && <div className={styles.indSummary}>{ind.summary}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyBox}>
            {loading ? '⏳ Đang kết nối Binance AI...' : 'Chưa có phân tích cho kỳ này.'}
          </div>
        )}
      </div>

      {/* 2. OVERVIEW METRICS CARDS */}
      <div className={styles.metricsGrid}>
        {/* Win Rate */}
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>Tỉ Lệ Thắng (Win Rate)</span>
          <span
            className={`${styles.metricValue} ${
              (stats?.winRate ?? 0) >= 0.55
                ? styles.winrateHigh
                : (stats?.winRate ?? 0) >= 0.48
                ? styles.winrateMed
                : styles.winrateLow
            }`}
          >
            {stats ? `${(stats.winRate * 100).toFixed(1)}%` : '0.0%'}
          </span>
          <span className={styles.metricSub}>
            Đã đối soát {stats?.totalEvaluated ?? 0} kỳ ({stats?.wins ?? 0} Thắng /{' '}
            {stats?.losses ?? 0} Thua)
          </span>
        </div>

        {/* PnL Simulation */}
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>PnL Giả Lập ($1 Đều Tay)</span>
          <span
            className={`${styles.metricValue} ${
              (stats?.simulatedNetPnl ?? 0) >= 0 ? styles.pnlPositive : styles.pnlNegative
            }`}
          >
            {stats
              ? `${stats.simulatedNetPnl >= 0 ? '+' : ''}$${stats.simulatedNetPnl.toFixed(2)}`
              : '$0.00'}
          </span>
          <span className={styles.metricSub}>
            ROI:{' '}
            {stats
              ? `${stats.simulatedRoiPct >= 0 ? '+' : ''}${stats.simulatedRoiPct.toFixed(1)}%`
              : '0.0%'}
          </span>
        </div>

        {/* Streaks */}
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>Chuỗi Thắng / Thua</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className={styles.metricValue}>
              {stats?.currentStreak.type === 'WIN' ? '🔥' : stats?.currentStreak.type === 'LOSS' ? '❄️' : '—'}
              {stats?.currentStreak.count ?? 0}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>
              {stats?.currentStreak.type === 'WIN'
                ? 'Thắng liên tiếp'
                : stats?.currentStreak.type === 'LOSS'
                ? 'Thua liên tiếp'
                : 'Chưa có'}
            </span>
          </div>
          <span className={styles.metricSub}>
            Kỷ lục: Max Win {stats?.maxWinStreak ?? 0} | Max Loss {stats?.maxLossStreak ?? 0}
          </span>
        </div>

        {/* Contrarian Edge */}
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>AI Ngược Đám Đông (Contrarian)</span>
          <span
            className={`${styles.metricValue} ${
              (stats?.contrarianStats.winRate ?? 0) >= 0.5 ? styles.winrateHigh : styles.winrateMed
            }`}
          >
            {stats ? `${(stats.contrarianStats.winRate * 100).toFixed(1)}%` : '0.0%'}
          </span>
          <span className={styles.metricSub}>
            {stats?.contrarianStats.wins ?? 0}/{stats?.contrarianStats.total ?? 0} kỳ thắng (PnL:{' '}
            {stats
              ? `${stats.contrarianStats.pnl >= 0 ? '+' : ''}$${stats.contrarianStats.pnl.toFixed(2)}`
              : '$0.00'}
            )
          </span>
        </div>
      </div>

      {/* 3. CONFIDENCE BREAKDOWN */}
      <div>
        <h3 style={{ fontSize: '1rem', color: '#f8fafc', marginBottom: 12 }}>
          🎯 Tỷ Lệ Thắng Theo Mức Độ Tự Tin (Confidence Breakdown)
        </h3>
        <div className={styles.confidenceGrid}>
          {/* Low */}
          <div className={styles.confCard}>
            <div className={styles.confCardTitle} style={{ color: '#fde047' }}>
              🟡 Độ Tự Tin: LOW
            </div>
            <div className={styles.confCardRate} style={{ color: '#fde047' }}>
              {stats ? `${(stats.confidenceStats.low.winRate * 100).toFixed(1)}%` : '0%'}
            </div>
            <div className={styles.confCardSub}>
              {stats?.confidenceStats.low.wins ?? 0} / {stats?.confidenceStats.low.total ?? 0} kỳ |
              PnL: ${(stats?.confidenceStats.low.pnl ?? 0).toFixed(2)}
            </div>
          </div>

          {/* Medium */}
          <div className={styles.confCard}>
            <div className={styles.confCardTitle} style={{ color: '#fdba74' }}>
              🟠 Độ Tự Tin: MEDIUM
            </div>
            <div className={styles.confCardRate} style={{ color: '#fdba74' }}>
              {stats ? `${(stats.confidenceStats.medium.winRate * 100).toFixed(1)}%` : '0%'}
            </div>
            <div className={styles.confCardSub}>
              {stats?.confidenceStats.medium.wins ?? 0} / {stats?.confidenceStats.medium.total ?? 0}{' '}
              kỳ | PnL: ${(stats?.confidenceStats.medium.pnl ?? 0).toFixed(2)}
            </div>
          </div>

          {/* High */}
          <div className={styles.confCard}>
            <div className={styles.confCardTitle} style={{ color: '#6ee7b7' }}>
              🟢 Độ Tự Tin: HIGH
            </div>
            <div className={styles.confCardRate} style={{ color: '#6ee7b7' }}>
              {stats ? `${(stats.confidenceStats.high.winRate * 100).toFixed(1)}%` : '0%'}
            </div>
            <div className={styles.confCardSub}>
              {stats?.confidenceStats.high.wins ?? 0} / {stats?.confidenceStats.high.total ?? 0} kỳ |
              PnL: ${(stats?.confidenceStats.high.pnl ?? 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. AUDIT LOG TABLE */}
      <div className={styles.historyCard}>
        <div className={styles.historyTitle}>
          <span>📋 Nhật Ký Đối Soát Dự Đoán Của AI (50 Kỳ Gần Nhất)</span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>
            Tự động đối soát khi kỳ hoàn tất
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mã Kỳ</th>
                <th>Giờ</th>
                <th>AI Đề Xuất</th>
                <th>Độ Tự Tin</th>
                <th>Xác Suất AI vs Đám Đông</th>
                <th>Kết Quả Thực Tế</th>
                <th>Trạng Thái</th>
                <th>PnL Giả Lập ($1)</th>
              </tr>
            </thead>
            <tbody>
              {(!stats?.recentPredictions || stats.recentPredictions.length === 0) ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px' }}>
                    Chưa có lịch sử dự đoán nào được ghi nhận. Hệ thống sẽ tự động ghi lại mỗi khi có kỳ mới.
                  </td>
                </tr>
              ) : (
                stats.recentPredictions.map((r) => (
                  <tr key={r.mtid}>
                    <td>
                      <strong>#{r.mtid}</strong>
                    </td>
                    <td>{formatVnTime(r.ts)}</td>
                    <td>
                      <span className={r.direction === 'Up' ? styles.badgeUp : styles.badgeDown}>
                        {r.direction === 'Up' ? '▲ UP' : '▼ DOWN'}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.confidenceBadge} ${getConfClass(r.confidence)}`}>
                        {r.confidence}
                      </span>
                    </td>
                    <td>
                      AI {r.direction === 'Up' ? r.aiProbUp : r.aiProbDown}% vs Market{' '}
                      {r.direction === 'Up' ? r.marketProbUp : r.marketProbDown}%
                    </td>
                    <td>
                      {r.winner ? (
                        <span className={r.winner === 'Up' ? styles.badgeUp : styles.badgeDown}>
                          {r.winner === 'Up' ? '▲ Up' : '▼ Down'}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Đang chạy...</span>
                      )}
                    </td>
                    <td>
                      {r.winner === undefined ? (
                        <span className={styles.badgePending}>⏳ Đang chờ</span>
                      ) : r.isWin ? (
                        <span className={styles.badgeWin}>✅ THẮNG</span>
                      ) : (
                        <span className={styles.badgeLoss}>❌ THUA</span>
                      )}
                    </td>
                    <td>
                      {r.simulatedPnl !== undefined ? (
                        <span
                          style={{
                            fontWeight: 700,
                            color: r.simulatedPnl >= 0 ? '#34d399' : '#f87171',
                          }}
                        >
                          {r.simulatedPnl >= 0 ? '+' : ''}${r.simulatedPnl.toFixed(2)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
