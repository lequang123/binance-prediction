fetch('http://localhost:3000/api/bots/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Test Bot',
    strategy: 'MARTINGALE_FAVORITE',
    stakeMode: 'FLAT',
    baseStake: 10,
    multiplier: 1,
    maxSteps: 1,
    maxDailyLoss: 50,
    oddsMin: 0.85,
    oddsMax: 0.90,
    sessions: ['all'],
    targetMinutes: ['2-1m'],
    cooldownRounds: 1,
    minTimeRemaining: 60,
    maxTimeRemaining: 120,
    minPriceBuffer: 20,
  }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log('Backtest API Result:', data);
  })
  .catch((err) => {
    console.error('Error calling backtest API:', err);
  });
