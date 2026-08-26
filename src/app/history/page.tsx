'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Header from '@/components/Header';
import WinLossHistory from '@/components/WinLossHistory';
import type { PaginatedHistoryResponse } from '@/lib/types';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const EMPTY_SUMMARY = {
  totalRounds: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  totalProfit: 0,
  totalLoss: 0,
  netPnl: 0,
  avgWin: 0,
  avgLoss: 0,
  bestTrade: 0,
  worstTrade: 0,
  maxWin: 0,
  maxLoss: 0,
};

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const pageSize = 5000;

  const { data, error, isLoading } = useSWR<PaginatedHistoryResponse>(
    `/api/history?page=${page}&pageSize=${pageSize}`,
    fetcher,
    {
      keepPreviousData: true,
    }
  );

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <main className="dashboard">
      <Header snapshot={null} isLive={false} lastUpdate={Date.now() / 1000} />

      <div style={{ marginBottom: 'var(--space-md)' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', padding: '8px 12px', background: 'var(--surface-light)', borderRadius: 'var(--radius)' }}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="error-state">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Connection Error</p>
          <p style={{ fontSize: '0.85rem' }}>
            {error.message || 'Failed to fetch data from API. Check console for details.'}
          </p>
        </div>
      )}

      <WinLossHistory
        results={data?.results ?? []}
        summary={data?.summary ?? EMPTY_SUMMARY}
        page={page}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />
    </main>
  );
}
