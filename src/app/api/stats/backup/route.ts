import { NextResponse } from 'next/server';
import { exportLogData, importLogData } from '@/lib/odds-collector';
import type { RoundResult, RoundOddsBucketEntry, OddsSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/stats/backup
 * Download backup of all odds statistics logs (round_results, odds_bucket_entries, snapshots)
 */
export async function GET() {
  const data = exportLogData();
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `binance-prediction-backup-${dateStr}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function parseBackupPayload(textOrObj: unknown): {
  results?: RoundResult[];
  bucketEntries?: RoundOddsBucketEntry[];
  snapshots?: OddsSnapshot[];
} {
  if (typeof textOrObj === 'object' && textOrObj !== null) {
    const obj = textOrObj as any;
    if (obj.results || obj.bucketEntries || obj.snapshots) {
      return {
        results: obj.results || [],
        bucketEntries: obj.bucketEntries || [],
        snapshots: obj.snapshots || [],
      };
    }
  }

  const text = String(textOrObj).trim();

  // Try parsing single JSON backup bundle
  if (text.startsWith('{') && text.includes('"version"')) {
    try {
      const obj = JSON.parse(text);
      if (obj.results || obj.bucketEntries || obj.snapshots) {
        return {
          results: obj.results || [],
          bucketEntries: obj.bucketEntries || [],
          snapshots: obj.snapshots || [],
        };
      }
    } catch {}
  }

  // Parse as JSON lines (.jsonl) or loose array
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const results: RoundResult[] = [];
  const bucketEntries: RoundOddsBucketEntry[] = [];
  const snapshots: OddsSnapshot[] = [];

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if (item.winner) {
        results.push(item);
      } else if (item.oddsBucket) {
        bucketEntries.push(item);
      } else if (item.up !== undefined && item.dn !== undefined) {
        snapshots.push(item);
      }
    } catch {}
  }

  return { results, bucketEntries, snapshots };
}

/**
 * POST /api/stats/backup
 * Import log data from uploaded file or JSON payload (merges and deduplicates)
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let parsedData: {
      results?: RoundResult[];
      bucketEntries?: RoundOddsBucketEntry[];
      snapshots?: OddsSnapshot[];
    } = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { ok: false, message: 'Không tìm thấy file tải lên trong form data' },
          { status: 400 }
        );
      }

      const text = await file.text();
      parsedData = parseBackupPayload(text);
    } else {
      const body = await request.json();
      parsedData = parseBackupPayload(body);
    }

    const totalToImport =
      (parsedData.results?.length ?? 0) +
      (parsedData.bucketEntries?.length ?? 0) +
      (parsedData.snapshots?.length ?? 0);

    if (totalToImport === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: 'File hoặc dữ liệu không chứa bản ghi hợp lệ (round_results hoặc odds_bucket_entries)',
        },
        { status: 400 }
      );
    }

    const importResult = importLogData(parsedData);

    return NextResponse.json({
      ok: true,
      message: `Đã nhập thành công ${importResult.importedResults} kết quả kỳ và ${importResult.importedEntries} entries (Tổng hiện có: ${importResult.totalResults} kỳ, ${importResult.totalEntries} entries).`,
      details: importResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi nhập dữ liệu';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
