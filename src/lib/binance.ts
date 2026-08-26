// ============================================================
// Binance API Client
// ============================================================

import type { BinanceApiResponse, BinancePosition } from './types';

const BINANCE_API_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions';

const WALLET_ADDRESS = '0x6da6cb464f92ae7ad4ec3d239c81719cb1d0ae03';
const EVENT_SLUG = 'btc-up-or-down-5m';

const HEADERS: Record<string, string> = {
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
};

/**
 * Fetch positions from Binance Prediction API.
 * @param type - "open" for active, "closed" for historical
 * @param page - page number
 * @param pageSize - entries per page
 */
export async function fetchPositions(
  type: 'open' | 'closed' = 'open',
  page: number = 1,
  pageSize: number = 20
): Promise<BinancePosition[]> {
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
    headers: HEADERS,
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

  return data.data.entries;
}

/**
 * Fetch active BTC Up/Down 5m positions (marketStatus == 1)
 */
export async function fetchActivePositions(): Promise<BinancePosition[]> {
  const entries = await fetchPositions('open', 1, 20);
  return entries.filter(
    (e) => e.eventSlug === EVENT_SLUG && e.marketStatus === 1
  );
}

/**
 * Fetch closed BTC Up/Down 5m positions for win/loss history
 */
export async function fetchClosedPositions(
  page: number = 1,
  pageSize: number = 50
): Promise<BinancePosition[]> {
  const entries = await fetchPositions('closed', page, pageSize);
  return entries.filter((e) => e.eventSlug === EVENT_SLUG);
}

export { WALLET_ADDRESS, EVENT_SLUG };
