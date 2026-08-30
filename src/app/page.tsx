'use client';

import useSWR from 'swr';
import Header from '@/components/Header';
import ActivePositions from '@/components/ActivePositions';
import TradeTimeline from '@/components/TradeTimeline';

import Link from 'next/link';
import CopyTradeTimeline from '@/components/CopyTradeTimeline';
import type { DashboardData } from '@/lib/types';

import { useState, useEffect } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Dashboard() {
  const [realTrade, setRealTrade] = useState(false);

  // Khôi phục trạng thái từ localStorage khi load trang
  useEffect(() => {
    const saved = localStorage.getItem('realTradeMode');
    if (saved === 'true') setRealTrade(true);
  }, []);

  const handleToggleRealTrade = (val: boolean) => {
    setRealTrade(val);
    localStorage.setItem('realTradeMode', val.toString());
  };

  const { data, error, isLoading } = useSWR<DashboardData>(
    `/api/positions?realTrade=${realTrade}`,
    fetcher,
    {
      refreshInterval: 500, // Poll every 500ms
      revalidateOnFocus: true,
      dedupingInterval: 250,
    }
  );

  if (error) {
    return (
      <main className="dashboard">
        <Header snapshot={null} isLive={false} lastUpdate={0} />
        <div className="error-state">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Connection Error</p>
          <p style={{ fontSize: '0.85rem' }}>
            {error.message || 'Failed to fetch data from API. Check console for details.'}
          </p>
        </div>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="dashboard">
        <Header snapshot={null} isLive={false} lastUpdate={0} />
        <div className="loading-state">
          <div className="spinner" />
          <p>Connecting to Binance...</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Fetching trader positions...
          </p>
        </div>
      </main>
    );
  }

  const { active, trades, timestamp } = data;

  return (
    <main className="dashboard">
      <Header
        snapshot={active}
        isLive={!error}
        lastUpdate={timestamp}
        realTrade={realTrade}
        onToggleRealTrade={handleToggleRealTrade}
      />

      {/* Active Positions — Full Width */}
      <ActivePositions snapshot={active} />


      {/* 2 columns: Trade Timeline (Trader) & Copy Trade Timeline (Bot) */}
      <div className="dashboard-grid">
        <TradeTimeline trades={trades} />
        <CopyTradeTimeline trades={trades} />
      </div>

      {/* Win/Loss History Link */}
      <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
        <Link 
          href="/history" 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 8, 
            padding: '12px 24px', 
            background: 'var(--accent)', 
            color: 'white', 
            textDecoration: 'none', 
            borderRadius: 'var(--radius)', 
            fontWeight: 600,
            transition: 'background 0.2s',
          }}
        >
          View Full Win/Loss History ➡️
        </Link>
      </div>
    </main>
  );
}
