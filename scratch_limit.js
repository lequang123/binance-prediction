async function test() {
  const r = await fetch('https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions', { 
    method: 'POST', 
    headers: {'content-type':'application/json'}, 
    body: JSON.stringify({walletAddress: '0x6da6cb464f92ae7ad4ec3d239c81719cb1d0ae03', type: 'closed', sortBy: 'TIME', sortOrder: 'DESC', page: 11, pageSize: 20}) 
  });
  console.log(await r.json());
}
test();
