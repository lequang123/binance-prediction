const fs = require('fs');
const readline = require('readline');

async function runDetailedStats() {
  const entriesFile = './logs/odds_bucket_entries.jsonl';
  const resultsFile = './logs/round_results.jsonl';

  if (!fs.existsSync(entriesFile) || !fs.existsSync(resultsFile)) {
    console.log('Files not found');
    return;
  }

  const results = new Map();
  const rlRes = readline.createInterface({ input: fs.createReadStream(resultsFile) });
  for await (const line of rlRes) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      results.set(r.mtid, r);
    } catch {}
  }

  const entriesByRound = new Map();
  const rlEnt = readline.createInterface({ input: fs.createReadStream(entriesFile) });
  for await (const line of rlEnt) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const list = entriesByRound.get(e.mtid) || [];
      list.push(e);
      entriesByRound.set(e.mtid, list);
    } catch {}
  }

  console.log('=== PHÂN TÍCH THỰC TẾ CHIẾN THUẬT BẪY TRADER (TRAP TRADERS) ===');
  console.log(`- Tổng số kỳ có dữ liệu: ${results.size} kỳ`);

  for (const minPeak of [0.90, 0.85]) {
    let roundsQualified = 0;
    let favWins = 0;
    let trapReversals = 0;
    let trapWithDelta10 = 0;
    let trapWithDelta15 = 0;
    let trapWithDelta20 = 0;
    let trapTrades = [];

    // Cược thử nghiệm giả lập:
    // Cược $10 mỗi khi phát hiện Trap với lệch >= $15
    let simWins = 0;
    let simLosses = 0;
    let simNetPnl = 0;

    for (const [mtid, entries] of entriesByRound.entries()) {
      const res = results.get(mtid);
      if (!res) continue;

      const earlyEntries = entries.filter((e) => e.minuteBucket !== '1-0m');
      if (earlyEntries.length === 0) continue;

      let maxEarlyOdds = 0;
      let peakSide = 'Up';
      let peakMinute = '';
      let undAmountOut = 0;

      for (const e of earlyEntries) {
        if (e.favoriteOdds > maxEarlyOdds) {
          maxEarlyOdds = e.favoriteOdds;
          peakSide = e.favoriteSide;
          peakMinute = e.minuteBucket;
          undAmountOut = e.undAmountOut || 1 / (1 - e.favoriteOdds);
        }
      }

      if (maxEarlyOdds >= minPeak) {
        roundsQualified++;
        const priceDelta = res.endPrice - res.startPrice;
        const absDelta = Math.abs(priceDelta);

        if (res.winner === peakSide) {
          favWins++;
        } else {
          trapReversals++;
          if (absDelta >= 10) trapWithDelta10++;
          if (absDelta >= 15) {
            trapWithDelta15++;
            // Nếu đánh cửa Underdog với vốn 10 USDT
            const profit = 10 * (undAmountOut - 1);
            simWins++;
            simNetPnl += profit;
          }
          if (absDelta >= 20) trapWithDelta20++;

          trapTrades.push({
            mtid,
            peakSide,
            peakOdds: maxEarlyOdds,
            peakMinute,
            winner: res.winner,
            startPrice: res.startPrice,
            endPrice: res.endPrice,
            priceDelta,
            absDelta,
            undPayout: undAmountOut,
          });
        }
      }
    }

    console.log('\n======================================================');
    console.log(`MỐC 1: ĐỈNH ODDS BAN ĐẦU >= ${(minPeak * 100).toFixed(0)}% (ở phút 5-2m):`);
    console.log(`- Tổng số kỳ đám đông đẩy Odds lên >= ${(minPeak * 100).toFixed(0)}%: ${roundsQualified} kỳ`);
    console.log(`- Cửa trên giữ vững chiến thắng: ${favWins} kỳ (${((favWins / roundsQualified) * 100).toFixed(1)}%)`);
    console.log(`- SỐ KỲ BỊ LẬT KÈO (TRAP TRADERS): ${trapReversals} kỳ (${((trapReversals / roundsQualified) * 100).toFixed(1)}%)`);
    console.log(`  * Lật kèo & giá BTC lệch ngược chiều >= $10: ${trapWithDelta10} kỳ (${((trapWithDelta10 / trapReversals) * 100).toFixed(1)}%)`);
    console.log(`  * Lật kèo & giá BTC lệch ngược chiều >= $15: ${trapWithDelta15} kỳ (${((trapWithDelta15 / trapReversals) * 100).toFixed(1)}%)`);
    console.log(`  * Lật kèo & giá BTC lệch ngược chiều >= $20: ${trapWithDelta20} kỳ (${((trapWithDelta20 / trapReversals) * 100).toFixed(1)}%)`);

    const sortedTraps = trapTrades.filter((t) => t.absDelta >= 15).sort((a, b) => b.absDelta - a.absDelta);
    console.log(`\n--- DANH SÁCH CÁC KỲ LẬT KÈO MẠNH NHẤT (LỆCH >= $15) ---`);
    sortedTraps.slice(0, 15).forEach((t, i) => {
      console.log(
        `${i + 1}. Kỳ #${t.mtid}: Đỉnh ${t.peakSide} ${(t.peakOdds * 100).toFixed(0)}% (phút ${t.peakMinute}) -> Kết quả: ${t.winner} THẮNG! BTC: ${t.startPrice} -> ${t.endPrice} (Lệch: ${t.priceDelta > 0 ? '+' : ''}${t.priceDelta.toFixed(1)} USD). Payout: x${t.undPayout.toFixed(1)}`
      );
    });
  }
}

runDetailedStats();
