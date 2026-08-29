// ============================================================
// Binance API Client
// ============================================================

import type { BinanceApiResponse, BinancePosition } from './types';

const BINANCE_API_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions';

export let WALLET_ADDRESS = '0xcfe7fd7471263f0f374bb83852fb4c351ba7b394';
const EVENT_SLUG = 'btc-up-or-down-5m';

export function setWalletAddress(address: string) {
  WALLET_ADDRESS = address;
}

const getHeaders = (): Record<string, string> => ({
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  clienttype: 'web',
  'content-type': 'application/json',
  lang: 'en',
  origin: 'https://www.binance.com',
  pragma: 'no-cache',
  referer: `https://www.binance.com/en/prediction/leaderboard/${WALLET_ADDRESS}`,
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
});

/**
 * Fetch positions from Binance Prediction API.
 * @param type - "open" for active, "closed" for historical
 * @param page - page number
 * @param pageSize - entries per page
 */
export async function fetchPositions(
  type: 'open' | 'closed',
  page: number = 1,
  pageSize: number = 20
): Promise<{ entries: BinancePosition[]; total: number }> {
  const body = {
    walletAddress: WALLET_ADDRESS,
    type,
    sortBy: 'TIME',
    sortOrder: 'DESC',
    page,
    pageSize,
  };

  const response = await fetch(BINANCE_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    // No cache — always fresh
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
  }

  const data: BinanceApiResponse = await response.json();

  if (!data.success || !data.data?.entries) {
    throw new Error(`Binance API returned error: ${data.message || 'Unknown error'}`);
  }

  return {
    entries: data.data.entries,
    total: data.data.total,
  };
}

/**
 * Fetch active BTC Up/Down 5m positions (marketStatus == 1)
 */
export async function fetchActivePositions(): Promise<BinancePosition[]> {
  const { entries } = await fetchPositions('open', 1, 20);
  return entries.filter(
    (e) => e.eventSlug === EVENT_SLUG && e.marketStatus === 1
  );
}

/**
 * Fetch closed BTC Up/Down 5m positions for win/loss history
 */
export async function fetchClosedPositions(
  page: number = 1,
  pageSize: number = 20
): Promise<{ entries: BinancePosition[]; total: number }> {
  const BINANCE_MAX_PAGE_SIZE = 20;

  if (pageSize <= BINANCE_MAX_PAGE_SIZE) {
    const { entries, total } = await fetchPositions('closed', page, pageSize);
    const filtered = entries.filter((e) => e.eventSlug === EVENT_SLUG);
    return { entries: filtered, total };
  }

  // Handle larger page sizes by fetching multiple Binance pages
  const startBinancePage = (page - 1) * Math.ceil(pageSize / BINANCE_MAX_PAGE_SIZE) + 1;
  const endBinancePage = page * Math.ceil(pageSize / BINANCE_MAX_PAGE_SIZE);

  let allEntries: BinancePosition[] = [];
  let totalItems = 0;

  for (let p = startBinancePage; p <= endBinancePage; p++) {
    const { entries, total } = await fetchPositions('closed', p, BINANCE_MAX_PAGE_SIZE);
    allEntries = allEntries.concat(entries);
    totalItems = total;
    if (entries.length < BINANCE_MAX_PAGE_SIZE) {
      break;
    }
  }

  const filtered = allEntries.filter((e) => e.eventSlug === EVENT_SLUG);
  return { entries: filtered, total: totalItems };
}

/**
 * Fetch ALL closed BTC Up/Down 5m positions
 * Used for calculating overall Win/Loss Summary accurately across all history.
 */
export async function fetchAllClosedPositions(): Promise<BinancePosition[]> {
  const BINANCE_MAX_PAGE_SIZE = 20;

  // First request to get total
  const { entries: firstPage, total } = await fetchPositions('closed', 1, BINANCE_MAX_PAGE_SIZE);
  let allEntries = [...firstPage];

  const totalPages = Math.ceil(total / BINANCE_MAX_PAGE_SIZE);
  // Cap at 250 pages (5000 items) to prevent timeouts but get enough data
  const maxPages = Math.min(totalPages, 250);

  // Fetch in batches of 20 to speed up
  for (let i = 2; i <= maxPages; i += 20) {
    const batch = [];
    for (let j = i; j < i + 20 && j <= maxPages; j++) {
      batch.push(fetchPositions('closed', j, BINANCE_MAX_PAGE_SIZE).catch(() => null));
    }
    const results = await Promise.all(batch);
    for (const res of results) {
      if (res && res.entries) {
        allEntries = allEntries.concat(res.entries);
      }
    }
  }

  return allEntries.filter((e) => e.eventSlug === EVENT_SLUG);
}

export { EVENT_SLUG };
