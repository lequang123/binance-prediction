'use client';

import useSWR from 'swr';
import Header from '@/components/Header';
import ActivePositions from '@/components/ActivePositions';
import TradeTimeline from '@/components/TradeTimeline';

import Link from 'next/link';
import HedgingInsight from '@/components/HedgingInsight';
import type { DashboardData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());



export default function Dashboard() {
  const { data, error, isLoading } = useSWR<DashboardData>(
    '/api/positions',
    fetcher,
    {
      refreshInterval: 2000, // Poll every 2 seconds
      revalidateOnFocus: true,
      dedupingInterval: 1000,
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
      />

      {/* Active Positions — Full Width */}
      <ActivePositions snapshot={active} />


      {/* Trade Timeline + Hedging Analysis — 2 columns */}
      <div className="dashboard-grid">
        <TradeTimeline trades={trades} />
        <HedgingInsight trades={trades} />
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
