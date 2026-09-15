import { NextResponse } from 'next/server';
import {
  startOddsCollector,
  stopOddsCollector,
  getCollectorStatus,
  getResults,
  getBucketEntries,
  syncDataFromDisk,
} from '@/lib/odds-collector';
import { computeOddsStats } from '@/lib/odds-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // Always sync latest results and bucket entries from disk
  syncDataFromDisk();

  const status = getCollectorStatus();
  const entries = getBucketEntries();
  const results = getResults();

  const stats = computeOddsStats(
    entries,
    results,
    status.snapshotCount,
    status.collectingSince
  );

  return NextResponse.json(
    {
      collector: status,
      stats,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}

export async function POST(request: Request) {
  syncDataFromDisk();

  const body = await request.json();
  const action = body.action as string;

  switch (action) {
    case 'start':
      startOddsCollector();
      return NextResponse.json({ ok: true, message: 'Collector started' });

    case 'stop':
      stopOddsCollector();
      return NextResponse.json({ ok: true, message: 'Collector stopped' });

    case 'status':
      return NextResponse.json(getCollectorStatus());

    default:
      return NextResponse.json(
        { ok: false, message: 'Invalid action. Use: start, stop, status' },
        { status: 400 }
      );
  }
}
