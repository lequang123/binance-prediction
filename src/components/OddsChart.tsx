'use client';

import { useEffect, useRef, useCallback } from 'react';
import { LineChart } from 'lucide-react';
import type { DetectedTrade, MarketSnapshot } from '@/lib/types';

interface OddsChartProps {
  snapshot: MarketSnapshot | null;
  trades: DetectedTrade[];
}

// Store historical odds data points
interface OddsDataPoint {
  time: number;
  upOdds: number;
  downOdds: number;
}

// Module-level storage for chart data
const oddsHistory: OddsDataPoint[] = [];
let lastAddedTime = 0;

export default function OddsChart({ snapshot, trades }: OddsChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upMarkersRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downMarkersRef = useRef<any>(null);

  // Initialize chart
  const initChart = useCallback(async () => {
    if (!chartContainerRef.current || chartRef.current) return;

    const { createChart, ColorType, LineStyle, LineSeries, createSeriesMarkers } = await import('lightweight-charts');

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'Inter', sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      crosshair: {
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          style: LineStyle.Dashed,
        },
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          style: LineStyle.Dashed,
        },
      },
    });

    const upSeries = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      title: 'Up Odds',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${(price * 100).toFixed(0)}%`,
      },
    });

    const downSeries = chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 2,
      title: 'Down Odds',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${(price * 100).toFixed(0)}%`,
      },
    });

    // Initialize marker plugins (empty markers)
    const upMarkers = createSeriesMarkers(upSeries, []);
    const downMarkers = createSeriesMarkers(downSeries, []);

    chartRef.current = chart;
    upSeriesRef.current = upSeries;
    downSeriesRef.current = downSeries;
    upMarkersRef.current = upMarkers;
    downMarkersRef.current = downMarkers;

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    initChart();
  }, [initChart]);

  // Update data
  useEffect(() => {
    if (!snapshot || !upSeriesRef.current || !downSeriesRef.current) return;

    const now = snapshot.timestamp;
    if (now === lastAddedTime) return;
    lastAddedTime = now;

    const upOdds = snapshot.up?.currentPrice ?? 0;
    const downOdds = snapshot.down?.currentPrice ?? 0;

    oddsHistory.push({ time: now, upOdds, downOdds });

    // Keep max 500 data points
    if (oddsHistory.length > 500) {
      oddsHistory.splice(0, oddsHistory.length - 500);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upData = oddsHistory.map((d) => ({ time: d.time as any, value: d.upOdds }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downData = oddsHistory.map((d) => ({ time: d.time as any, value: d.downOdds }));

    upSeriesRef.current.setData(upData);
    downSeriesRef.current.setData(downData);

    // Update trade markers using the marker plugin API
    if (trades.length > 0 && upMarkersRef.current && downMarkersRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upMarkerData: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const downMarkerData: any[] = [];

      for (const trade of trades) {
        if (trade.action !== 'BUY') continue;
        const marker = {
          time: trade.timestamp,
          position: trade.side === 'Up' ? 'belowBar' : 'aboveBar',
          color: trade.side === 'Up' ? '#10b981' : '#ef4444',
          shape: trade.side === 'Up' ? 'arrowUp' : 'arrowDown',
          text: `$${trade.amountChange.toFixed(0)}`,
          size: Math.min(3, Math.max(1, trade.amountChange / 30)),
        };

        if (trade.side === 'Up') {
          upMarkerData.push(marker);
        } else {
          downMarkerData.push(marker);
        }
      }

      upMarkersRef.current.setMarkers(
        upMarkerData.sort((a: { time: number }, b: { time: number }) => a.time - b.time)
      );
      downMarkersRef.current.setMarkers(
        downMarkerData.sort((a: { time: number }, b: { time: number }) => a.time - b.time)
      );
    }
  }, [snapshot, trades]);

  return (
    <div className="glass-card">
      <div className="card-title">
        <LineChart size={14} />
        Odds Chart — Real-time
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '0.7rem' }}>
          <span style={{ color: 'var(--up)' }}>● Up</span>
          <span style={{ color: 'var(--down)' }}>● Down</span>
        </span>
      </div>
      <div className="chart-container" ref={chartContainerRef} />
    </div>
  );
}
