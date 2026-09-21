import { NextResponse } from 'next/server';
import {
  getBacktestHistorySummary,
  getBacktestRunDetail,
  deleteBacktestRun,
  clearAllBacktestHistory,
} from '@/lib/backtest-storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const botId = searchParams.get('botId') || undefined;

    if (runId) {
      const detail = getBacktestRunDetail(runId);
      if (!detail) {
        return NextResponse.json(
          { ok: false, message: 'Không tìm thấy phiên kiểm thử này' },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, record: detail });
    }

    const historyList = getBacktestHistorySummary(botId);
    return NextResponse.json({
      ok: true,
      history: historyList,
      total: historyList.length,
    });
  } catch (err: any) {
    console.error('[API BOTS BACKTEST HISTORY GET] Error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi tải lịch sử kiểm thử' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      clearAllBacktestHistory();
      return NextResponse.json({ ok: true, message: 'Đã xóa toàn bộ lịch sử kiểm thử' });
    }

    if (runId) {
      const success = deleteBacktestRun(runId);
      return NextResponse.json({
        ok: success,
        message: success ? 'Đã xóa phiên kiểm thử' : 'Không tìm thấy phiên cần xóa',
      });
    }

    return NextResponse.json(
      { ok: false, message: 'Thiếu tham số runId hoặc clearAll' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[API BOTS BACKTEST HISTORY DELETE] Error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi xóa lịch sử kiểm thử' },
      { status: 500 }
    );
  }
}
