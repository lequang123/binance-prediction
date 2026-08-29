// ============================================================
// API Route: /api/positions
// Proxy to Binance + Diff Engine + Logger
// ============================================================

import { NextResponse } from 'next/server';
import { fetchActivePositions, fetchClosedPositions } from '@/lib/binance';
import { normalizeToSnapshot, diffSnapshots, getAllTrades } from '@/lib/diff-engine';
import { logTrade, logSnapshot } from '@/lib/logger';

import type { DashboardData } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Cache the last log time outside the request handler
let lastSnapshotLogTime = 0;

export async function GET() {
  try {
    // Fetch active positions
    const activePositions = await fetchActivePositions();
    const timestamp = Math.floor(Date.now() / 1000);

    // Normalize to snapshot
    const snapshot = normalizeToSnapshot(activePositions, timestamp);

    // Diff with previous snapshot to detect trades
    let newTrades: ReturnType<typeof diffSnapshots> = [];
    if (snapshot) {
      newTrades = diffSnapshots(snapshot);

      // Avoid garbage logging: only log snapshot if there's a trade or 5 seconds have passed
      if (newTrades.length > 0 || timestamp - lastSnapshotLogTime >= 5) {
        logSnapshot(snapshot);
        lastSnapshotLogTime = timestamp;
      }

      // Log any new trades
      for (const trade of newTrades) {
        logTrade(trade);
      }
    }

    const data: DashboardData = {
      active: snapshot,
      trades: getAllTrades(),
      timestamp,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch positions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
