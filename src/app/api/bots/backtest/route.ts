import { NextResponse } from 'next/server';
import { runBotBacktest } from '@/lib/bot-engine';
import {
  getResults,
  getBucketEntries,
  syncDataFromDisk,
} from '@/lib/odds-collector';
import type { BotConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const config = (await request.json()) as BotConfig;

    // Đảm bảo dữ liệu mới nhất được nạp từ logs
    syncDataFromDisk();
    const results = getResults();
    const entries = getBucketEntries();

    const backtestResult = runBotBacktest(config, results, entries);

    return NextResponse.json({
      ok: true,
      result: backtestResult,
    });
  } catch (err: any) {
    console.error('[API BOTS BACKTEST] Error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi chạy backtest' },
      { status: 500 }
    );
  }
}
