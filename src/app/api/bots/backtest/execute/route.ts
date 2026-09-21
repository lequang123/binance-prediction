import { NextResponse } from 'next/server';
import { runBotBacktest, loadBotsConfig } from '@/lib/bot-engine';
import {
  getResults,
  getBucketEntries,
  syncDataFromDisk,
} from '@/lib/odds-collector';
import { saveBacktestRun } from '@/lib/backtest-storage';
import type { BotConfig, BacktestRunRecord, RealisticBacktestOptions } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface ExecuteRequest {
  botId?: string;
  config?: BotConfig;
  options?: RealisticBacktestOptions;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecuteRequest;

    let targetConfig: BotConfig | undefined = body.config;
    if (!targetConfig && body.botId) {
      const allBots = loadBotsConfig();
      targetConfig = allBots.find((b) => b.id === body.botId);
    }

    if (!targetConfig) {
      return NextResponse.json(
        { ok: false, message: 'Không tìm thấy cấu hình bot để thực thi backtest' },
        { status: 400 }
      );
    }

    // Đảm bảo dữ liệu mới nhất được nạp từ logs
    syncDataFromDisk();
    const results = getResults();
    const entries = getBucketEntries();

    const options: RealisticBacktestOptions = {
      roundLimit: body.options?.roundLimit || 0,
      initialBalance: body.options?.initialBalance || 1000,
      simulateSlippage: body.options?.simulateSlippage ?? true,
      slippageBps: body.options?.slippageBps ?? targetConfig.maxSlippageBps ?? 450,
    };

    const backtestResult = runBotBacktest(targetConfig, results, entries, options);

    const runId = `bt_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const rangeLabel = options.roundLimit && options.roundLimit > 0
      ? `${options.roundLimit} kỳ gần nhất`
      : `Toàn bộ ${backtestResult.totalRoundsEvaluated} kỳ thực tế`;

    const record: BacktestRunRecord = {
      id: runId,
      botId: targetConfig.id,
      botName: targetConfig.name,
      configSnapshot: targetConfig,
      executedAt: Date.now(),
      datasetScope: {
        totalRoundsAvailable: results.length,
        roundsTested: backtestResult.totalRoundsEvaluated,
        rangeLabel,
        initialBalance: options.initialBalance || 1000,
        simulateSlippage: Boolean(options.simulateSlippage),
      },
      summary: {
        tradesCount: backtestResult.tradesCount,
        wins: backtestResult.wins,
        losses: backtestResult.losses,
        skippedCount: backtestResult.skippedCount || 0,
        winRate: backtestResult.winRate,
        netPnl: backtestResult.netPnl,
        roiPct: backtestResult.roiPct || 0,
        finalBalance: backtestResult.finalBalance || 1000,
        peakBalance: backtestResult.peakBalance || 1000,
        maxDrawdown: backtestResult.maxDrawdown,
        maxDrawdownPct: backtestResult.maxDrawdownPct || 0,
        cutLossCount: backtestResult.cutLossCount,
        dailyLossStops: backtestResult.dailyLossStops || 0,
        maxWinStreak: backtestResult.maxWinStreak || 0,
        maxLossStreak: backtestResult.maxLossStreak || 0,
        avgProfitPerWin: backtestResult.avgProfitPerWin || 0,
        avgLossPerLoss: backtestResult.avgLossPerLoss || 0,
        rating: backtestResult.rating,
      },
      trades: backtestResult.trades || [],
    };

    // Lưu vào file backtest_history.json
    saveBacktestRun(record);

    return NextResponse.json({
      ok: true,
      record,
    });
  } catch (err: any) {
    console.error('[API BOTS BACKTEST EXECUTE] Error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi thực thi backtest' },
      { status: 500 }
    );
  }
}
