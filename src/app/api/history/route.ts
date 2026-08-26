import { NextResponse } from 'next/server';
import { fetchAllClosedPositions } from '@/lib/binance';
import { processClosedPositions } from '@/lib/analysis';
import type { PaginatedHistoryResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // Fetch ALL closed positions to accurately calculate the overall summary
    const allEntries = await fetchAllClosedPositions();
    const { results, summary } = processClosedPositions(allEntries);

    // Paginate the grouped results in-memory
    const totalGroupedRounds = results.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedResults = results.slice(startIndex, startIndex + pageSize);

    const data: PaginatedHistoryResponse = {
      results: paginatedResults,
      summary,
      total: totalGroupedRounds,
      page,
      pageSize,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('History API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch history',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
