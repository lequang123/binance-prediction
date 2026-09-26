import { NextResponse } from 'next/server';
import {
  getBinanceAiStats,
  fetchAiAnalysisForMarket,
  initAiStorage,
} from '@/lib/binance-ai-service';

export async function GET(request: Request) {
  try {
    initAiStorage();
    const { searchParams } = new URL(request.url);
    const mtidParam = searchParams.get('marketTopicId');

    if (mtidParam) {
      const mtid = parseInt(mtidParam, 10);
      if (!isNaN(mtid)) {
        await fetchAiAnalysisForMarket(mtid);
      }
    }

    const stats = getBinanceAiStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get AI stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, marketTopicId } = body;

    if (action === 'refresh' && marketTopicId) {
      const updated = await fetchAiAnalysisForMarket(Number(marketTopicId));
      const stats = getBinanceAiStats();
      return NextResponse.json({ success: true, latest: updated, stats });
    }

    const stats = getBinanceAiStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}
