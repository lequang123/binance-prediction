const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(process.cwd(), 'logs');
const resultsPath = path.join(LOGS_DIR, 'round_results.jsonl');
const entriesPath = path.join(LOGS_DIR, 'odds_bucket_entries.jsonl');

const results = [];
for (const line of fs.readFileSync(resultsPath, 'utf8').trim().split('\n')) {
  if (line.trim()) results.push(JSON.parse(line));
}

const entries = [];
for (const line of fs.readFileSync(entriesPath, 'utf8').trim().split('\n')) {
  if (line.trim()) entries.push(JSON.parse(line));
}

const entriesByRound = new Map();
for (const e of entries) {
  const list = entriesByRound.get(e.mtid) || [];
  list.push(e);
  entriesByRound.set(e.mtid, list);
}

const sortedResults = results.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

function runHistoryTest(config) {
  const initialBalance = 1000;
  let balance = initialBalance;
  const isFlat = config.stakeMode === 'FLAT' || (!config.customLadder && (config.maxSteps === 1 || config.multiplier === 1));
  const useLadder = !isFlat && Array.isArray(config.customLadder) && config.customLadder.length > 0;
  const ladder = useLadder ? config.customLadder : [];
  const maxSteps = useLadder ? ladder.length : (config.maxSteps || 2);
  const multiplier = config.multiplier || 4.0;
  let stake = useLadder ? ladder[0] : config.baseStake;
  let cooldown = 0;
  let step = 1;
  let wins = 0;
  let losses = 0;
  let cutLossCount = 0;

  const history = [];

  for (const round of sortedResults) {
    if (cooldown > 0) {
      cooldown--;
      continue;
    }

    const roundEntries = entriesByRound.get(round.mtid) || [];
    if (roundEntries.length === 0) continue;

    let matchedEntry = null;
    let targetSide = 'Up';
    let targetOdds = 0;

    for (const e of roundEntries) {
      if (Array.isArray(config.targetMinutes) && config.targetMinutes.length > 0) {
        if (!config.targetMinutes.includes(e.minuteBucket)) continue;
      }

      const timeRemaining = e.minuteBucket === '5-4m' ? 270 :
        e.minuteBucket === '4-3m' ? 210 :
          e.minuteBucket === '3-2m' ? 150 :
            e.minuteBucket === '2-1m' ? 90 : 30;

      if (timeRemaining < config.minTimeRemaining) continue;
      if (timeRemaining > config.maxTimeRemaining) continue;

      if (config.strategy === 'MARTINGALE_FAVORITE') {
        if (e.favoriteOdds >= config.oddsMin && e.favoriteOdds < config.oddsMax) {
          matchedEntry = e;
          targetSide = e.favoriteSide;
          targetOdds = e.favoriteOdds;
          break;
        }
      }
    }

    if (!matchedEntry || targetOdds <= 0) continue;

    const priceDiff = Math.abs((round.endPrice || 0) - (round.startPrice || 0));
    if (config.minPriceBuffer > 0 && priceDiff < config.minPriceBuffer) {
      continue;
    }

    const isWin = targetSide === round.winner;

    const amountOut = 1 / targetOdds;
    const bet = stake;
    const currentStep = step;

    let pnl = 0;
    let actionNote = '';

    if (isFlat) {
      if (isWin) {
        wins++;
        pnl = bet * (amountOut - 1);
        balance += pnl;
        actionNote = `✅ Thắng (+${pnl.toFixed(2)}$) -> Tiếp tục đánh đều $${stake}`;
      } else {
        losses++;
        pnl = -bet;
        balance -= bet;
        cooldown = config.cooldownRounds;
        actionNote = cooldown > 0
          ? `❌ Thua (-$${bet}) -> Nghỉ ${cooldown} trận (Cooldown)`
          : `❌ Thua (-$${bet}) -> Tiếp tục đánh đều $${stake}`;
      }
    } else {
      if (isWin) {
        wins++;
        pnl = bet * (amountOut - 1);
        balance += pnl;
        stake = useLadder ? ladder[0] : config.baseStake;
        step = 1;
        actionNote = currentStep > 1 ? `✅ Thắng B${currentStep} -> Reset về B1 ($${stake})` : `Thắng B1 -> Giữ B1 ($${stake})`;
      } else {
        losses++;
        pnl = -bet;
        balance -= bet;

        if (step < maxSteps) {
          step++;
          stake = useLadder ? ladder[step - 1] : config.baseStake * Math.pow(multiplier, step - 1);
          cooldown = config.cooldownRounds;
          actionNote = `❌ Thua B${currentStep} -> Nghỉ ${cooldown}T, Lên B${step} ($${stake})`;
        } else {
          cutLossCount++;
          step = 1;
          stake = useLadder ? ladder[0] : config.baseStake;
          cooldown = config.cooldownRounds;
          actionNote = `⚠️ Cắt lỗ chuỗi B${currentStep} -> Reset B1 ($${stake})`;
        }
      }
    }

    history.push({
      roundId: round.mtid,
      date: new Date(round.startDate).toISOString().replace('T', ' ').slice(11, 19),
      minute: matchedEntry.minuteBucket,
      step: currentStep,
      stake: bet,
      side: targetSide,
      odds: Math.round(targetOdds * 100) + '%',
      winner: round.winner,
      isWin,
      pnl: pnl > 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2),
      balance: balance.toFixed(2),
      actionNote,
    });
  }

  console.log(`\n========================================`);
  console.log(`Cấu hình: ${config.name}`);
  console.log(`Tổng lệnh: ${history.length} | Thắng: ${wins} | Thua: ${losses} | Cắt lỗ: ${cutLossCount}`);
  console.log(`Net PnL: $${(balance - initialBalance).toFixed(2)}`);

  console.log(`\n--- 25 LỆNH GẦN NHẤT ---`);
  console.table(history.slice(-25));

  // Find some consecutive loss and ladder recovery examples
  const ladderRecovery = [];
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].step === 1 && !history[i].isWin) {
      ladderRecovery.push(history.slice(i, Math.min(i + 3, history.length)));
      if (ladderRecovery.length >= 3) break;
    }
  }

  console.log(`\n--- VÍ DỤ CÁC CHUỖI GẤP THẾP VÀ HỒI PHỤC THỰC TẾ ---`);
  ladderRecovery.forEach((chain, idx) => {
    console.log(`\nChuỗi #${idx + 1}:`);
    console.table(chain);
  });

  return history;
}

// 1. Chạy chuỗi 1, 6, 15, 40
runHistoryTest({
  name: 'Chuỗi 1$ - 6$ - 15$ - 40$',
  strategy: 'MARTINGALE_FAVORITE',
  customLadder: [1, 6, 15, 40],
  oddsMin: 0.85,
  oddsMax: 0.90,
  cooldownRounds: 2,
  minTimeRemaining: 35,
  maxTimeRemaining: 240,
  minPriceBuffer: 20,
});

// 2. Chạy Đánh Đều Tay $10 Phút 2-1m
runHistoryTest({
  name: 'Đánh Đều Tay $10 Phút 2-1m (Không Gấp)',
  strategy: 'MARTINGALE_FAVORITE',
  stakeMode: 'FLAT',
  baseStake: 10,
  multiplier: 1,
  maxSteps: 1,
  oddsMin: 0.85,
  oddsMax: 0.90,
  targetMinutes: ['2-1m'],
  cooldownRounds: 1,
  minTimeRemaining: 60,
  maxTimeRemaining: 120,
  minPriceBuffer: 20,
});

