const EVENT_SLUG = 'btc-up-or-down-5m';
const WALLET_ADDRESS = '0x5e498154448608c826e005c93533b827cbb6377e';

async function fetchPositions(page, pageSize) {
  const r = await fetch('https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ walletAddress: WALLET_ADDRESS, type: 'closed', sortBy: 'TIME', sortOrder: 'DESC', page, pageSize })
  });
  return r.json();
}

async function countBTC() {
  const first = await fetchPositions(1, 20);
  if (!first.success) return console.log(first);
  let total = first.data.total;
  let all = [...first.data.entries];
  const maxPages = Math.min(Math.ceil(total / 20), 250);

  for (let i = 2; i <= maxPages; i += 20) {
    const batch = [];
    for (let j = i; j < i + 20 && j <= maxPages; j++) {
      batch.push(fetchPositions(j, 20).catch(() => null));
    }
    const res = await Promise.all(batch);
    for (let r of res) {
      if (r && r.data && r.data.entries) all = all.concat(r.data.entries);
    }
    process.stdout.write(`Fetched page ${Math.min(i + 19, maxPages)}/${maxPages}\r`);
  }

  const btc = all.filter(e => e.eventSlug === EVENT_SLUG);
  console.log(`\nOut of ${all.length} recent positions, found ${btc.length} BTC positions.`);
}
countBTC();
