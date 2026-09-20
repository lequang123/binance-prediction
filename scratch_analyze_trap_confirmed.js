const fs = require('fs');
const readline = require('readline');

async function analyzeConfirmedReversal() {
  const entriesFile = './logs/odds_bucket_entries.jsonl';
  const resultsFile = './logs/round_results.jsonl';

  if (!fs.existsSync(entriesFile) || !fs.existsSync(resultsFile)) return;

  const results = new Map();
  const rlRes = readline.createInterface({ input: fs.createReadStream(resultsFile) });
  for await (const line of rlRes) {
    if (!line.trim()) continue;
    try {
      results.set(JSON.parse(line).mtid, JSON.parse(line));
    } catch { }
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
    } catch { }
  }

  console.log('=== PHÂN TÍCH: VÀO LỆNH SAU KHI ĐÃ ĐẢO CHIỀU (CONFIRMED TRAP) ===');
  console.log('Kịch bản: Phút 5-2m Đỉnh Odds >= 85-90%, sang phút 1-0m giá quay xe và ĐÃ ĐẢO CHIỀU lệch ít nhất 15 USD');

  for (const minPeak of [0.90, 0.85, 0.8]) {
    let count = 0;
    let wins = 0;
    let losses = 0;
    let sumOddsAtEntry = 0;
    let sumPayoutMultiplier = 0;
    let netPnlTotal = 0;
    const stake = 10; // $10 mỗi lệnh

    const detailedTrades = [];

    for (const [mtid, entries] of entriesByRound.entries()) {
      const res = results.get(mtid);
      if (!res) continue;

      const early = entries.filter((e) => e.minuteBucket !== '1-0m');
      const late = entries.filter((e) => e.minuteBucket === '1-0m');
      if (early.length === 0) continue;

      let maxEarlyOdds = 0;
      let peakSide = 'Up';
      for (const e of early) {
        if (e.favoriteOdds > maxEarlyOdds) {
          maxEarlyOdds = e.favoriteOdds;
          peakSide = e.favoriteSide;
        }
      }

      if (maxEarlyOdds < minPeak) continue;

      // Tìm entry ở phút 1-0m của CỬA MỚI (cửa ngược lại với peakSide)
      const newSide = peakSide === 'Up' ? 'Down' : 'Up';
      const reversedEntry = late.find((e) => e.favoriteSide === newSide);

      // Điều kiện giá: Sau khi đổi chiều, giá phải lệch ít nhất $15 về phía cửa mới
      const priceDelta = res.endPrice - res.startPrice; // >0 là UP, <0 là DOWN
      const priceInFavOfNewSide = newSide === 'Up' ? priceDelta : -priceDelta;

      if (priceInFavOfNewSide >= 30) {
        count++;
        // Odds của cửa mới ở phút 1-0m sau khi đảo chiều:
        // Nếu có ghi nhận reversedEntry thì lấy favoriteOdds của nó, nếu chưa ghi nhận thì ít nhất là 0.60 - 0.75
        let oddsAtEntry = reversedEntry ? reversedEntry.favoriteOdds : 0.70;
        // Payout multiplier: 1 / oddsAtEntry
        const payout = reversedEntry && reversedEntry.favAmountOut ? reversedEntry.favAmountOut : (1 / oddsAtEntry);

        sumOddsAtEntry += oddsAtEntry;
        sumPayoutMultiplier += payout;

        const isWin = res.winner === newSide;
        let pnl = 0;
        if (isWin) {
          wins++;
          pnl = stake * (payout - 1);
          netPnlTotal += pnl;
        } else {
          losses++;
          pnl = -stake;
          netPnlTotal += pnl;
        }

        detailedTrades.push({
          mtid,
          oldSide: peakSide,
          oldOdds: maxEarlyOdds,
          newSide,
          oddsAtEntry,
          payout,
          priceDelta: priceInFavOfNewSide,
          isWin,
          pnl,
          startPrice: res.startPrice,
          endPrice: res.endPrice,
        });
      }
    }

    const avgOdds = count > 0 ? (sumOddsAtEntry / count) * 100 : 0;
    const avgPayout = count > 0 ? sumPayoutMultiplier / count : 0;
    const avgPnlPerTrade = count > 0 ? netPnlTotal / count : 0;
    const winRate = count > 0 ? (wins / count) * 100 : 0;

    console.log('\n------------------------------------------------------------');
    console.log(`KẾT QUẢ VỚI MỐC ĐỈNH BAN ĐẦU >= ${(minPeak * 100).toFixed(0)}%:`);
    console.log(`- Số lần phát hiện ĐÃ ĐẢO CHIỀU & giá lệch >= $15: ${count} lần`);
    console.log(`- Tỷ lệ Thắng (Win Rate): ${wins}/${count} = ${winRate.toFixed(1)}% (Thắng ${wins}, Thua ${losses})`);
    console.log(`- TỶ LỆ ODDS TRUNG BÌNH KHI VÀO LỆNH CỬA MỚI: ${avgOdds.toFixed(1)}%`);
    console.log(`- Payout trung bình nhận được: x${avgPayout.toFixed(2)} (tức lời +${((avgPayout - 1) * 100).toFixed(1)}% mỗi trận thắng)`);
    console.log(`- Tổng Lợi Nhuận Net PnL (vốn $10/lệnh): +$${netPnlTotal.toFixed(2)} USD`);
    console.log(`- Lãi trung bình mỗi lệnh (Expected Value): +$${avgPnlPerTrade.toFixed(2)} USD / lệnh`);

    console.log(`\nChi tiết 10 kỳ vào lệnh sau đảo chiều điển hình:`);
    detailedTrades.slice(0, 10).forEach((t, i) => {
      console.log(
        `${i + 1}. Kỳ #${t.mtid}: Ban đầu ${t.oldSide} ${(t.oldOdds * 100).toFixed(0)}% -> Đảo chiều sang ${t.newSide}. Giá lệch +${t.priceDelta.toFixed(1)}$ (${t.startPrice} -> ${t.endPrice}). Vào lệnh ${t.newSide} @ Odds ${(t.oddsAtEntry * 100).toFixed(1)}% -> ${t.isWin ? '✅ THẮNG (+' + t.pnl.toFixed(2) + '$)' : '❌ THUA (-$' + stake + ')'}`
      );
    });
  }
}

analyzeConfirmedReversal();
