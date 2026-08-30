// ============================================================
// API Route: /api/positions
// Direct fetch to Binance + Diff Engine
// ============================================================

import { NextResponse } from 'next/server';
import { fetchActivePositions } from '@/lib/binance';
import { normalizeToSnapshot, diffSnapshots, getAllTrades } from '@/lib/diff-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isRealTradeEnabled = searchParams.get('realTrade') === 'true';

    const activePositions = await fetchActivePositions();
    const timestamp = Math.floor(Date.now() / 1000);
    const snapshot = normalizeToSnapshot(activePositions, timestamp);
    
    if (snapshot) {
      // Diff engine keeps state in memory
      diffSnapshots(snapshot, { isRealTradeEnabled });
    }
    
    const data = {
      active: snapshot,
      trades: getAllTrades(),
      timestamp
    };
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch from Binance API',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
