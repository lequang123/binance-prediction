// ============================================================
// Odds Collector — Poll real-time odds every 1 second
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { OddsSnapshot, RoundResult, RoundOddsBucketEntry } from './types';

const EVENT_SLUG = 'btc-up-or-down-5m';
const POLL_INTERVAL_MS = 1000;
const MAX_SNAPSHOT_ROUNDS = 5;

const EVENT_DETAIL_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/web/market/event/detail';
const MARKET_DETAIL_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/market/detail';

const HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
};

// ── Global Singleton State (Persists across Next.js HMR / reloads) ──

interface GlobalCollectorState {
  isCollecting: boolean;
  collectingSince: number | null;
  currentMarketTopicId: number | null;
  snapshotCount: number;
  roundCount: number;
  resolvedCount: number;
  errorCount: number;
  lastError: string | null;
  loopRunning: boolean;
  snapshots: OddsSnapshot[];
  results: RoundResult[];
  bucketEntries: RoundOddsBucketEntry[];
  seenBuckets: Set<string>;
}

const g = globalThis as unknown as { __oddsCollectorState?: GlobalCollectorState };
if (!g.__oddsCollectorState) {
  g.__oddsCollectorState = {
    isCollecting: false,
    collectingSince: null,
    currentMarketTopicId: null,
    snapshotCount: 0,
    roundCount: 0,
    resolvedCount: 0,
    errorCount: 0,
    lastError: null,
    loopRunning: false,
    snapshots: [],
    results: [],
    bucketEntries: [],
    seenBuckets: new Set<string>(),
  };
}

const state = g.__oddsCollectorState;
const snapshots = state.snapshots;
const results = state.results;
const bucketEntries = state.bucketEntries;
const seenBuckets = state.seenBuckets;

// ── Helpers ──

function getMinuteBucket(timeRemaining: number): string {
  if (timeRemaining > 240) return '5-4m';
  if (timeRemaining > 180) return '4-3m';
  if (timeRemaining > 120) return '3-2m';
  if (timeRemaining > 60) return '2-1m';
  return '1-0m';
}

function getOddsBucket(odds: number): string {
  const pct = odds * 100;
  if (pct >= 90) return '90+';
  if (pct >= 80) return '80-90';
  if (pct >= 70) return '70-80';
  if (pct >= 60) return '60-70';
  return '50-60';
}

function ensureLogDir(): string {
  const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
  if (!fs.existsSync(/*turbopackIgnore: true*/ logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function appendToFile(filePath: string, data: object): void {
  try {
    fs.appendFileSync(filePath, JSON.stringify(data) + '\n');
  } catch (e) {
    // Silently fail on disk errors
  }
}

/**
 * Giới hạn file odds_snapshots.jsonl và bộ nhớ RAM chỉ giữ lại tối đa 5 kỳ gần nhất để trace.
 * Khi số kỳ vượt quá 5, các snapshot của các kỳ cũ hơn sẽ tự động được dọn dẹp.
 * LƯU Ý: Toàn bộ kết quả thống kê (round_results.jsonl và odds_bucket_entries.jsonl)
 *   vẫn được GIỮ NGUYÊN VĨNH VIỄN để phục vụ tính toán tỉ lệ thắng & đảo chiều!
 */
function pruneOldSnapshotsLog(currentMtid: number): void {
  try {
    const mtidOrder: number[] = [];
    for (const s of snapshots) {
      if (!mtidOrder.includes(s.mtid)) {
        mtidOrder.push(s.mtid);
      }
    }
    if (!mtidOrder.includes(currentMtid)) {
      mtidOrder.push(currentMtid);
    }

    if (mtidOrder.length > MAX_SNAPSHOT_ROUNDS) {
      const allowedMtids = new Set(mtidOrder.slice(-MAX_SNAPSHOT_ROUNDS));
      const keptSnapshots = snapshots.filter((s) => allowedMtids.has(s.mtid));

      snapshots.length = 0;
      snapshots.push(...keptSnapshots);

      const logDir = ensureLogDir();
      const snapshotFile = path.join(logDir, 'odds_snapshots.jsonl');
      const content =
        keptSnapshots.map((s) => JSON.stringify(s)).join('\n') +
        (keptSnapshots.length ? '\n' : '');
      fs.writeFileSync(snapshotFile, content, 'utf8');

      console.log(
        `[ODDS COLLECTOR] 🧹 Đã dọn dẹp log: Giữ lại ${MAX_SNAPSHOT_ROUNDS} kỳ gần nhất (${Array.from(allowedMtids).join(', ')}) để trace.`
      );

      for (const key of seenBuckets) {
        const keyMtid = parseInt(key.split(':')[0], 10);
        if (!isNaN(keyMtid) && !allowedMtids.has(keyMtid)) {
          seenBuckets.delete(key);
        }
      }
    }
  } catch (e) {
    console.error('[ODDS COLLECTOR] Lỗi dọn dẹp log snapshot 5 kỳ:', e);
  }
}

// ── API Calls ──

async function fetchEventDetail(): Promise<{
  marketTopicId: number;
  upPrice: number;
  downPrice: number;
  startDate: number;
  endDate: number;
  startPrice: number;
} | null> {
  try {
    const res = await fetch(EVENT_DETAIL_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ eventSlug: EVENT_SLUG }),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as any;
    if (!json.success || !json.data) return null;

    const data = json.data;
    const market = data.ungroupedMarkets?.[0];
    if (!market || !market.outcomes || market.outcomes.length < 2) return null;

    return {
      marketTopicId: market.marketTopicId,
      upPrice: market.outcomes[0].price,
      downPrice: market.outcomes[1].price,
      startDate: data.startDate,
      endDate: data.endDate,
      startPrice: data.eventMetadata?.extra?.startPrice ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchRoundResult(marketTopicId: number): Promise<RoundResult | null> {
  try {
    const res = await fetch(MARKET_DETAIL_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ marketTopicId }),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as any;
    if (!json.data) return null;

    const d = json.data;
    const market = d.markets?.[0];
    if (!market) return null;

    const winnerOutcome = market.outcomes?.find((o: any) => o.winner === true);
    if (!winnerOutcome) return null; // Not yet resolved

    const vd = d.variantData || {};

    return {
      mtid: marketTopicId,
      winner: winnerOutcome.name as 'Up' | 'Down',
      startPrice: vd.startPrice ?? 0,
      endPrice: vd.endPrice ?? 0,
      volume: market.tradeVolume ?? 0,
      startDate: d.startDate,
      endDate: d.endDate,
    };
  } catch {
    return null;
  }
}

// ── Core Poll ──

async function pollOnce(): Promise<void> {
  try {
    const detail = await fetchEventDetail();
    if (!detail) {
      state.errorCount++;
      return;
    }

    const now = Date.now();
    const timeRemaining = Math.max(0, Math.floor((detail.endDate - now) / 1000));
    const minuteBucket = getMinuteBucket(timeRemaining);

    // 🔔 Detect round change BEFORE recording new snapshot
    if (state.currentMarketTopicId !== null && state.currentMarketTopicId !== detail.marketTopicId) {
      state.roundCount++;
      console.log(
        `[ODDS COLLECTOR] 🔔 Kỳ mới! Old: ${state.currentMarketTopicId} → New: ${detail.marketTopicId}. Lấy kết quả kỳ trước...`
      );

      // 1. Fetch result of the old round (with retry)
      resolveRound(state.currentMarketTopicId);

      // 2. Giữ lại tối đa 5 kỳ gần nhất trong file snapshot và RAM để trace
      pruneOldSnapshotsLog(detail.marketTopicId);
    }

    if (state.currentMarketTopicId === null) {
      state.roundCount++;
    }
    state.currentMarketTopicId = detail.marketTopicId;

    // Build snapshot for current round
    const snapshot: OddsSnapshot = {
      ts: now,
      mtid: detail.marketTopicId,
      up: detail.upPrice,
      dn: detail.downPrice,
      tr: timeRemaining,
      mb: minuteBucket,
    };

    snapshots.push(snapshot);
    state.snapshotCount++;

    // Write snapshot to file (chỉ chứa snapshots của các kỳ gần nhất)
    const logDir = ensureLogDir();
    appendToFile(path.join(logDir, 'odds_snapshots.jsonl'), snapshot);

    // First-touch dedup: record bucket entry only once per round
    const favoriteOdds = Math.max(detail.upPrice, detail.downPrice);
    const favoriteSide: 'Up' | 'Down' = detail.upPrice >= detail.downPrice ? 'Up' : 'Down';

    // Only track when odds are actually different (>50%)
    if (favoriteOdds > 0.50) {
      const oddsBucket = getOddsBucket(favoriteOdds);
      const bucketKey = `${detail.marketTopicId}:${oddsBucket}:${minuteBucket}`;

      if (!seenBuckets.has(bucketKey)) {
        seenBuckets.add(bucketKey);

        const entry: RoundOddsBucketEntry = {
          mtid: detail.marketTopicId,
          oddsBucket,
          minuteBucket,
          favoriteSide,
          favoriteOdds,
          ts: now,
        };
        bucketEntries.push(entry);
        appendToFile(path.join(logDir, 'odds_bucket_entries.jsonl'), entry);
      }
    }

    state.errorCount = 0;
    state.lastError = null;
  } catch (err) {
    state.errorCount++;
    state.lastError = err instanceof Error ? err.message : 'Unknown error';
    if (state.errorCount % 10 === 1) {
      console.error(`[ODDS COLLECTOR] Error (count: ${state.errorCount}):`, state.lastError);
    }
  }
}

async function resolveRound(marketTopicId: number): Promise<void> {
  // Retry up to 5 times with 3s delay (market may take a moment to resolve)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const result = await fetchRoundResult(marketTopicId);
    if (result) {
      // Check if already in results
      if (!results.some((r) => r.mtid === result.mtid)) {
        results.push(result);
      }
      state.resolvedCount = results.length;

      const logDir = ensureLogDir();
      appendToFile(path.join(logDir, 'round_results.jsonl'), result);

      console.log(
        `[ODDS COLLECTOR] ✅ Kỳ ${marketTopicId} resolved: Winner=${result.winner} | BTC: ${result.startPrice} → ${result.endPrice} | Volume: $${result.volume.toFixed(0)}`
      );
      return;
    }
  }

  console.warn(`[ODDS COLLECTOR] ⚠️ Không lấy được kết quả kỳ ${marketTopicId} sau 5 lần thử`);
}

// ── Public API ──

export function startOddsCollector(): void {
  state.isCollecting = true;
  if (!state.collectingSince) {
    state.collectingSince = Date.now();
  }
  console.log('[ODDS COLLECTOR] Started — polling every 1s');

  if (state.loopRunning) {
    return;
  }
  state.loopRunning = true;

  const loop = async () => {
    while (state.isCollecting) {
      const start = Date.now();
      await pollOnce();
      const elapsed = Date.now() - start;
      const wait = Math.max(0, POLL_INTERVAL_MS - elapsed);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    state.loopRunning = false;
  };

  loop();
}

export function stopOddsCollector(): void {
  state.isCollecting = false;
  console.log('[ODDS COLLECTOR] Stopped');
}

export function getCollectorStatus() {
  return {
    isCollecting: state.isCollecting,
    snapshotCount: state.snapshotCount,
    roundCount: state.roundCount,
    resolvedCount: state.resolvedCount,
    errorCount: state.errorCount,
    lastError: state.lastError,
    collectingSince: state.collectingSince,
    currentMarketTopicId: state.currentMarketTopicId,
  };
}

/** Get in-memory snapshots */
export function getSnapshots(): OddsSnapshot[] {
  return snapshots;
}

/** Get in-memory results */
export function getResults(): RoundResult[] {
  return results;
}

/** Get in-memory bucket entries (first-touch dedup) */
export function getBucketEntries(): RoundOddsBucketEntry[] {
  return bucketEntries;
}

/**
 * Đồng bộ dữ liệu mới nhất từ các file disk (round_results.jsonl và odds_bucket_entries.jsonl)
 * Đảm bảo mọi worker process hoặc lần gọi API GET đều thấy dữ liệu thực tế mới nhất!
 */
export function syncDataFromDisk(): void {
  const logDir = ensureLogDir();

  // 1. Sync round_results.jsonl
  try {
    const resultFile = path.join(logDir, 'round_results.jsonl');
    if (fs.existsSync(resultFile)) {
      const lines = fs.readFileSync(resultFile, 'utf8').split('\n').filter(Boolean);
      const existingMtids = new Set(results.map((r) => r.mtid));
      for (const line of lines) {
        try {
          const r: RoundResult = JSON.parse(line);
          if (!existingMtids.has(r.mtid)) {
            results.push(r);
            existingMtids.add(r.mtid);
          }
        } catch {}
      }
      state.resolvedCount = results.length;
    }
  } catch {}

  // 2. Sync odds_bucket_entries.jsonl
  try {
    const entryFile = path.join(logDir, 'odds_bucket_entries.jsonl');
    if (fs.existsSync(entryFile)) {
      const lines = fs.readFileSync(entryFile, 'utf8').split('\n').filter(Boolean);
      const existingKeys = new Set(
        bucketEntries.map((e) => `${e.mtid}:${e.oddsBucket}:${e.minuteBucket}`)
      );
      for (const line of lines) {
        try {
          const entry: RoundOddsBucketEntry = JSON.parse(line);
          const key = `${entry.mtid}:${entry.oddsBucket}:${entry.minuteBucket}`;
          if (!existingKeys.has(key)) {
            bucketEntries.push(entry);
            existingKeys.add(key);
            seenBuckets.add(key);
          }
        } catch {}
      }
    }
  } catch {}

  // 3. Sync snapshots if empty
  if (snapshots.length === 0) {
    try {
      const snapshotFile = path.join(logDir, 'odds_snapshots.jsonl');
      if (fs.existsSync(snapshotFile)) {
        const lines = fs.readFileSync(snapshotFile, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            snapshots.push(JSON.parse(line));
          } catch {}
        }
      }
    } catch {}
  }

  state.snapshotCount = Math.max(state.snapshotCount, snapshots.length);
}

/**
 * Load previously saved data from JSONL files (for resuming after restart)
 */
export function loadSavedData(): {
  snapshots: number;
  results: number;
  entries: number;
} {
  syncDataFromDisk();
  return {
    snapshots: snapshots.length,
    results: results.length,
    entries: bucketEntries.length,
  };
}
