/**
 * ============================================================================
 * 5M CRYPTO PREDICTION ENGINE - STANDALONE MODULE
 * ============================================================================
 * File: standalone5mEngine.ts
 * 
 * Module tự chứa (Self-contained) 100%, không phụ thuộc thư viện ngoài.
 * Có thể chạy trực tiếp trên: Node.js, Next.js (Server/Client), React, Bot Runner.
 * 
 * Đã tối ưu hóa:
 * - Loại bỏ các thành phần ảo/delay của Polymarket/Crypto.com.
 * - Tập trung 100% vào dữ liệu nến & tick thực tế từ Binance Spot.
 * - Tính toán sub-millisecond (< 1ms) trong bộ nhớ RAM.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. TYPE DEFINITIONS
// ----------------------------------------------------------------------------

export interface CandleOHLCV {
    time: number;   // Unix timestamp (giây)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TickPriceHistory {
    time: number;   // Timestamp (giây)
    price: number;
}

export type TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';
export type SignalType = 'UP' | 'DOWN' | 'WAIT';
export type TrajectoryType = 'STRENGTHENING' | 'WEAKENING' | 'STABLE';

export interface TechnicalIndicators {
    ema9: number;
    ema21: number;
    vwap: number;
    rsi: number;
    macd: { macdLine: number; signalLine: number; histogram: number };
    bollinger: { upper: number; middle: number; lower: number; bandwidth: number };
    atr: number;
    momentum: number;
    volatility: number; // Annualized volatility (độ biến động năm)
    distanceFromTarget: number;
    distanceFromTargetPercent: number;
    priceAcceleration: number; // Đạo hàm bậc 2 của giá (vận tốc tăng/giảm)
    trend: TrendDirection;
}

export interface TimeScenarioProbability {
    horizonLabel: '4 MIN' | '3 MIN' | '2 MIN' | '1 MIN' | '30 SEC';
    secondsRemaining: number;
    scenarioProbUp: number;   // 0 - 100%
    scenarioProbDown: number; // 0 - 100%
}

export interface EngineResult {
    signal: SignalType;          // 'UP' | 'DOWN' | 'WAIT'
    confidence: number;          // 15% - 99% (độ tin cậy của tín hiệu)
    probUp: number;              // 1% - 99% (xác suất giá finish trên target)
    probDown: number;            // 1% - 99% (xác suất giá finish dưới target)
    reason: string;              // Giải thích lý do bằng chữ
    trajectory: {
        status: TrajectoryType;    // Tín hiệu đang mạnh lên, yếu đi hay ổn định
        rateOfChange: number;      // Vận tốc đổi % mỗi giây
        acceleration: number;      // Gia tốc
        displayText: string;
    };
    timeScenarios: TimeScenarioProbability[]; // Bảng kịch bản 4m, 3m, 2m, 1m, 30s
    technicals: TechnicalIndicators;
}

export interface EngineConfig {
    upSignalThreshold: number;       // Mặc định: 0.58 (58%)
    downSignalThreshold: number;     // Mặc định: 0.42 (42%)
    minConfidenceForAction: number;  // Mặc định: 55%
    endgameSecThreshold: number;     // 30s cuối nếu sát target thì lock WAIT
}

export const DEFAULT_CONFIG: EngineConfig = {
    upSignalThreshold: 0.58,
    downSignalThreshold: 0.42,
    minConfidenceForAction: 55,
    endgameSecThreshold: 30
};

// ----------------------------------------------------------------------------
// 2. TECHNICAL ANALYSIS ENGINE (PHÂN TÍCH KỸ THUẬT)
// ----------------------------------------------------------------------------

export function calculateTechnicalIndicators(
    candles: CandleOHLCV[],
    currentPrice: number,
    targetPrice: number,
    recentTickHistory: TickPriceHistory[] = []
): TechnicalIndicators {
    const closes = candles.map(c => c.close);
    const len = closes.length;
    const safeTarget = targetPrice > 0 ? targetPrice : currentPrice;
    const dist = currentPrice - safeTarget;
    const distPct = safeTarget > 0 ? (dist / safeTarget) * 100 : 0;

    // Fallback an toàn nếu chưa đủ nến
    if (len < 5) {
        return {
            ema9: currentPrice,
            ema21: currentPrice,
            vwap: currentPrice,
            rsi: 50,
            macd: { macdLine: 0, signalLine: 0, histogram: 0 },
            bollinger: { upper: currentPrice * 1.002, middle: currentPrice, lower: currentPrice * 0.998, bandwidth: 0.004 },
            atr: currentPrice * 0.001,
            momentum: 0,
            volatility: 0.55,
            distanceFromTarget: dist,
            distanceFromTargetPercent: distPct,
            priceAcceleration: 0,
            trend: 'SIDEWAYS'
        };
    }

    // 1. EMA 9 & EMA 21
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);

    // 2. VWAP (Volume-Weighted Average Price)
    let cumulativeTypicalPriceVol = 0;
    let cumulativeVol = 0;
    candles.slice(-30).forEach(c => {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        cumulativeTypicalPriceVol += typicalPrice * c.volume;
        cumulativeVol += c.volume;
    });
    const vwap = cumulativeVol > 0 ? cumulativeTypicalPriceVol / cumulativeVol : currentPrice;

    // 3. RSI 14 (Wilder's Smoothing)
    const rsi = calculateRSI(closes, 14);

    // 4. MACD (12, 26, 9)
    const macd = calculateMACD(closes);

    // 5. Bollinger Bands (20, 2)
    const bollinger = calculateBollingerBands(closes, 20, 2);

    // 6. ATR 14 (Average True Range)
    const atr = calculateATR(candles, 14);

    // 7. Momentum (Rate of change qua 5 nến)
    const pastClose5 = closes[Math.max(0, len - 6)];
    const momentum = pastClose5 > 0 ? ((currentPrice - pastClose5) / pastClose5) * 100 : 0;

    // 8. Annualized Volatility (Độ lệch chuẩn lợi suất nến 1m quy đổi sang năm)
    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const meanReturn = logReturns.reduce((a, b) => a + b, 0) / Math.max(1, logReturns.length);
    const variance = logReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / Math.max(1, logReturns.length);
    const stdDev1m = Math.sqrt(variance);
    const annualizedVol = Math.max(0.20, stdDev1m * Math.sqrt(525600));

    // 9. Price Acceleration (Đạo hàm bậc 2 từ các tick gần nhất)
    let priceAcceleration = 0;
    if (recentTickHistory.length >= 6) {
        const p0 = recentTickHistory[recentTickHistory.length - 1].price;
        const p1 = recentTickHistory[recentTickHistory.length - 3].price;
        const p2 = recentTickHistory[recentTickHistory.length - 5].price;
        const v1 = p0 - p1;
        const v2 = p1 - p2;
        priceAcceleration = ((v1 - v2) / Math.max(0.001, currentPrice)) * 10000;
    }

    // 10. Xác định xu hướng Trend
    let trend: TrendDirection = 'SIDEWAYS';
    if (ema9 > ema21 && currentPrice > vwap && dist >= 0) {
        trend = 'UP';
    } else if (ema9 < ema21 && currentPrice < vwap && dist < 0) {
        trend = 'DOWN';
    }

    return {
        ema9,
        ema21,
        vwap,
        rsi,
        macd,
        bollinger,
        atr,
        momentum,
        volatility: annualizedVol,
        distanceFromTarget: dist,
        distanceFromTargetPercent: distPct,
        priceAcceleration,
        trend
    };
}

// ----------------------------------------------------------------------------
// 3. PROBABILITY MODEL (MÔ HÌNH XÁC SUẤT DRIFT DIFFUSION / BLACK-SCHOLES)
// ----------------------------------------------------------------------------

export function computeProbability(
    currentPrice: number,
    targetPrice: number,
    timeRemainingSec: number,
    technicals: TechnicalIndicators,
    btcMacroBias: number = 0.50 // 0.50 là trung lập, > 0.50 là BTC đang bơm
): { probUp: number; probDown: number; scenarios: TimeScenarioProbability[] } {
    const safeTarget = targetPrice > 0 ? targetPrice : currentPrice;
    const tau = Math.max(1, timeRemainingSec) / 300; // Tỷ lệ thời gian còn lại (0 -> 1.0)

    // 1. Drift-Diffusion Model (GBM)
    const priceRatio = safeTarget > 0 ? currentPrice / safeTarget : 1;
    const logReturn = Math.log(priceRatio);
    const sigma5m = technicals.volatility * Math.sqrt(5 / 525600);
    const drift = (technicals.momentum / 100) * 0.4;

    const zScore = (logReturn + (drift - 0.5 * sigma5m * sigma5m) * tau) / (sigma5m * Math.sqrt(tau) + 0.00001);
    let diffusionProbUp = 1 / (1 + Math.exp(-zScore * 1.59));
    diffusionProbUp = Math.min(0.99, Math.max(0.01, diffusionProbUp));

    // 2. High-Frequency Momentum Impulse
    let hfImpulseProbUp = 0.50;
    if (technicals.trend === 'UP') hfImpulseProbUp += 0.15;
    else if (technicals.trend === 'DOWN') hfImpulseProbUp -= 0.15;

    if (technicals.rsi > 58) hfImpulseProbUp += Math.min(0.12, (technicals.rsi - 50) * 0.004);
    else if (technicals.rsi < 42) hfImpulseProbUp -= Math.min(0.12, (50 - technicals.rsi) * 0.004);

    if (technicals.priceAcceleration > 0) hfImpulseProbUp += 0.08;
    else if (technicals.priceAcceleration < 0) hfImpulseProbUp -= 0.08;

    if (technicals.macd.histogram > 0) hfImpulseProbUp += 0.05;
    else if (technicals.macd.histogram < 0) hfImpulseProbUp -= 0.05;

    hfImpulseProbUp = Math.min(0.99, Math.max(0.01, hfImpulseProbUp));

    // 3. Tổng hợp trọng số thực tế (Thực chiến không dùng số liệu ảo)
    // - 55% trọng số cho Toán học khoảng cách & thời gian (Diffusion)
    // - 35% trọng số cho Xung lực nến và kỹ thuật (HF Impulse)
    // - 10% trọng số cho Xu hướng thị trường chung (BTC Macro)
    const finalProbUpRaw = (
        diffusionProbUp * 0.55 +
        hfImpulseProbUp * 0.35 +
        btcMacroBias * 0.10
    );

    const probUp = Math.round(Math.min(99, Math.max(1, finalProbUpRaw * 100)));
    const probDown = 100 - probUp;

    // 4. Kịch bản các mốc thời gian còn lại
    const scenarios = computeTimeRemainingScenarios(currentPrice, safeTarget, drift, sigma5m);

    return { probUp, probDown, scenarios };
}

function computeTimeRemainingScenarios(
    currentPrice: number,
    targetPrice: number,
    drift: number,
    sigma5m: number
): TimeScenarioProbability[] {
    const scenarioConfigs: Array<{ label: TimeScenarioProbability['horizonLabel']; sec: number }> = [
        { label: '4 MIN', sec: 240 },
        { label: '3 MIN', sec: 180 },
        { label: '2 MIN', sec: 120 },
        { label: '1 MIN', sec: 60 },
        { label: '30 SEC', sec: 30 }
    ];

    const priceRatio = targetPrice > 0 ? currentPrice / targetPrice : 1;
    const logReturn = Math.log(priceRatio);

    return scenarioConfigs.map(cfg => {
        const tauScenario = cfg.sec / 300;
        const z = (logReturn + (drift - 0.5 * sigma5m * sigma5m) * tauScenario) / (sigma5m * Math.sqrt(tauScenario) + 0.00001);
        let pUp = 1 / (1 + Math.exp(-z * 1.59));
        pUp = Math.round(Math.min(99, Math.max(1, pUp * 100)));
        return {
            horizonLabel: cfg.label,
            secondsRemaining: cfg.sec,
            scenarioProbUp: pUp,
            scenarioProbDown: 100 - pUp
        };
    });
}

// ----------------------------------------------------------------------------
// 4. DECISION ENGINE (BỘ RA QUYẾT ĐỊNH & TÍNH ĐỘ TIN CẬY CONFIDENCE)
// ----------------------------------------------------------------------------

export function evaluateDecision(
    probUp: number,
    currentPrice: number,
    targetPrice: number,
    timeRemainingSec: number,
    technicals: TechnicalIndicators,
    config: EngineConfig = DEFAULT_CONFIG
): { signal: SignalType; confidence: number; reason: string } {
    const probDown = 100 - probUp;
    const safeTarget = targetPrice > 0 ? targetPrice : currentPrice;

    // 1. Điểm tin cậy gốc (Độ phân kỳ so với mốc 50/50)
    const probDivergence = Math.abs(probUp - 50);
    let confidence = Math.round(50 + probDivergence * 1.0);

    // 2. Kiểm tra tính đồng thuận
    const isUpDominant = probUp >= 50;
    const isTargetBeat = currentPrice >= safeTarget;
    const isTrendAligned = (isUpDominant && technicals.trend === 'UP') || (!isUpDominant && technicals.trend === 'DOWN');
    const isMomentumAligned = (isUpDominant && technicals.momentum > 0) || (!isUpDominant && technicals.momentum < 0);

    if (isTrendAligned) confidence += 6;
    else confidence -= 8;

    if (isMomentumAligned) confidence += 5;
    else confidence -= 6;

    // Kiểm tra nghịch lý: Vị trí giá thực tế so với Target
    if (isUpDominant && isTargetBeat) confidence += 5;
    else if (!isUpDominant && !isTargetBeat) confidence += 5;
    else if (isUpDominant && !isTargetBeat && probUp < 65) confidence -= 10;
    else if (!isUpDominant && isTargetBeat && probDown < 65) confidence -= 10;

    // 3. Endgame Pin Protection: 30s cuối nếu sát sạt Target (<0.015%) thì bắt buộc WAIT
    if (timeRemainingSec <= config.endgameSecThreshold) {
        const distPct = Math.abs(technicals.distanceFromTargetPercent);
        if (distPct < 0.015) {
            return {
                signal: 'WAIT',
                confidence: Math.max(30, confidence - 25),
                reason: 'ENDGAME PIN: Giá đang nằm đè lên Target ở những giây cuối. Không an toàn để vào lệnh.'
            };
        }
    }

    confidence = Math.min(99, Math.max(15, confidence));

    // 4. Ra tín hiệu cuối cùng
    let signal: SignalType = 'WAIT';
    let reason = '';

    const upThresholdPct = config.upSignalThreshold * 100;
    const downThresholdPct = config.downSignalThreshold * 100;

    if (probUp >= upThresholdPct && confidence >= config.minConfidenceForAction) {
        signal = 'UP';
        reason = `UP bias confirmed: Model ${probUp}%, Trend ${technicals.trend}, Delta +$${technicals.distanceFromTarget.toFixed(2)}`;
    } else if (probUp <= downThresholdPct && confidence >= config.minConfidenceForAction) {
        signal = 'DOWN';
        reason = `DOWN bias confirmed: Model ${probDown}%, Trend ${technicals.trend}, Delta -$${Math.abs(technicals.distanceFromTarget).toFixed(2)}`;
    } else {
        signal = 'WAIT';
        if (confidence < config.minConfidenceForAction) {
            reason = `WAIT: Độ tin cậy (${confidence}%) chưa đạt ngưỡng tối thiểu (${config.minConfidenceForAction}%).`;
        } else {
            reason = `WAIT: Vùng giằng co cân bằng (UP ${probUp}% / DOWN ${probDown}%). Đợi nến bứt phá.`;
        }
    }

    return { signal, confidence, reason };
}

// ----------------------------------------------------------------------------
// 5. SIGNAL CHANGE & TRAJECTORY DETECTOR (GIA TỐC TÍN HIỆU)
// ----------------------------------------------------------------------------

export function detectTrajectory(
    history: Array<{ time: number; probUp: number }>,
    currentProbUp: number
): { status: TrajectoryType; rateOfChange: number; acceleration: number; displayText: string } {
    if (history.length < 4) {
        return { status: 'STABLE', rateOfChange: 0, acceleration: 0, displayText: 'TÍN HIỆU ỔN ĐỊNH' };
    }

    const pNow = currentProbUp;
    const pPrev3 = history[Math.max(0, history.length - 4)]?.probUp ?? pNow;
    const pPrev6 = history[Math.max(0, history.length - 7)]?.probUp ?? pPrev3;

    const tNow = Date.now();
    const tPrev3 = history[Math.max(0, history.length - 4)]?.time ?? (tNow - 3000);
    const dtSec = Math.max(0.5, (tNow - tPrev3) / 1000);

    const v1 = (pNow - pPrev3) / dtSec;
    const v2 = (pPrev3 - pPrev6) / dtSec;

    const acceleration = parseFloat(((v1 - v2) / dtSec).toFixed(2));
    const rateOfChange = parseFloat(v1.toFixed(2));

    let direction: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
    if (rateOfChange > 0.3) direction = 'UP';
    else if (rateOfChange < -0.3) direction = 'DOWN';

    let status: TrajectoryType = 'STABLE';
    let displayText = 'TÍN HIỆU ỔN ĐỊNH';
    const isUpDominant = pNow >= 50;

    if (isUpDominant) {
        if (direction === 'UP') {
            status = 'STRENGTHENING';
            displayText = 'LỰC TĂNG ĐANG MẠNH DẦN';
        } else if (direction === 'DOWN') {
            status = 'WEAKENING';
            displayText = 'LỰC TĂNG ĐANG SUY YẾU';
        }
    } else {
        if (direction === 'DOWN') {
            status = 'STRENGTHENING';
            displayText = 'LỰC GIẢM ĐANG MẠNH DẦN';
        } else if (direction === 'UP') {
            status = 'WEAKENING';
            displayText = 'LỰC GIẢM ĐANG SUY YẾU';
        }
    }

    return { status, rateOfChange, acceleration, displayText };
}

// ----------------------------------------------------------------------------
// 6. MAIN CONTROLLER FUNCTION: RUN ENGINE IN 1 LINE
// ----------------------------------------------------------------------------

/**
 * Hàm điều phối chính: Gọi hàm này mỗi khi có tick giá mới
 * 
 * @param currentPrice Giá hiện tại từ Binance Spot
 * @param targetPrice Giá mở cửa của chu kỳ 5m (Strike Price)
 * @param timeRemainingSec Số giây còn lại của nến 5m (300 -> 0)
 * @param candles Danh sách nến 1m từ Binance (tối thiểu 14 nến)
 * @param recentTicks Lịch sử tick gần nhất (tùy chọn)
 * @param probHistory Lịch sử xác suất gần nhất để đo gia tốc (tùy chọn)
 * @param config Cấu hình ngưỡng (tùy chọn)
 */
export function run5mPredictionEngine(
    currentPrice: number,
    targetPrice: number,
    timeRemainingSec: number,
    candles: CandleOHLCV[],
    recentTicks: TickPriceHistory[] = [],
    probHistory: Array<{ time: number; probUp: number }> = [],
    config: EngineConfig = DEFAULT_CONFIG
): EngineResult {
    // 1. Phân tích kỹ thuật
    const technicals = calculateTechnicalIndicators(candles, currentPrice, targetPrice, recentTicks);

    // 2. Tính xác suất Drift-Diffusion
    const { probUp, probDown, scenarios } = computeProbability(currentPrice, targetPrice, timeRemainingSec, technicals);

    // 3. Ra quyết định & tính điểm tin cậy
    const decision = evaluateDecision(probUp, currentPrice, targetPrice, timeRemainingSec, technicals, config);

    // 4. Đo gia tốc tín hiệu
    const trajectory = detectTrajectory(probHistory, probUp);

    return {
        signal: decision.signal,
        confidence: decision.confidence,
        probUp,
        probDown,
        reason: decision.reason,
        trajectory,
        timeScenarios: scenarios,
        technicals
    };
}

// ----------------------------------------------------------------------------
// 7. HELPER FORMULAS (MATH UTILITIES)
// ----------------------------------------------------------------------------

function calculateEMA(values: number[], period: number): number {
    if (values.length === 0) return 0;
    if (values.length < period) return values[values.length - 1];
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
    }
    return ema;
}

function calculateRSI(values: number[], period: number = 14): number {
    if (values.length <= period) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
        }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMACD(values: number[]): { macdLine: number; signalLine: number; histogram: number } {
    if (values.length < 26) return { macdLine: 0, signalLine: 0, histogram: 0 };
    // Tính chuỗi MACD trên từng điểm từ nến 26 trở đi để tính EMA 9 chuẩn
    const macdSeries: number[] = [];
    for (let i = 26; i <= values.length; i++) {
        const sub = values.slice(0, i);
        const ema12 = calculateEMA(sub, 12);
        const ema26 = calculateEMA(sub, 26);
        macdSeries.push(ema12 - ema26);
    }
    const macdLine = macdSeries[macdSeries.length - 1] ?? 0;
    const signalLine = macdSeries.length >= 9 ? calculateEMA(macdSeries, 9) : macdLine;
    const histogram = macdLine - signalLine;
    return { macdLine, signalLine, histogram };
}

function calculateBollingerBands(values: number[], period: number = 20, stdDevMultiplier: number = 2) {
    const slice = values.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / Math.max(1, slice.length);
    const stdDev = Math.sqrt(variance);
    const upper = mean + stdDevMultiplier * stdDev;
    const lower = mean - stdDevMultiplier * stdDev;
    const bandwidth = mean > 0 ? (upper - lower) / mean : 0;
    return { upper, middle: mean, lower, bandwidth };
}

function calculateATR(candles: CandleOHLCV[], period: number = 14): number {
    if (candles.length < 2) return candles[0]?.high - candles[0]?.low || 1;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i - 1];
        const tr = Math.max(
            current.high - current.low,
            Math.abs(current.high - prev.close),
            Math.abs(current.low - prev.close)
        );
        trs.push(tr);
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
}

// ----------------------------------------------------------------------------
// 8. DATA ACQUISITION & LIVE BINANCE TRACKER (TỰ ĐỘNG LẤY DATA & CHẠY REALTIME)
// ----------------------------------------------------------------------------

/**
 * Lấy nến lịch sử 1m từ REST API Binance
 * @param symbol Ví dụ: 'BTCUSDT', 'ETHUSDT'
 * @param limit Số lượng nến (mặc định 50)
 */
export async function fetchBinanceHistoricalKlines(
    symbol: string = 'BTCUSDT',
    limit: number = 50
): Promise<CandleOHLCV[]> {
    const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const endpoints = [
        `https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=1m&limit=${limit}`,
        `https://api1.binance.com/api/v3/klines?symbol=${cleanSym}&interval=1m&limit=${limit}`,
        `https://api3.binance.com/api/v3/klines?symbol=${cleanSym}&interval=1m&limit=${limit}`
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data)) {
                return data.map((item: any) => ({
                    time: Math.floor(item[0] / 1000),
                    open: parseFloat(item[1]),
                    high: parseFloat(item[2]),
                    low: parseFloat(item[3]),
                    close: parseFloat(item[4]),
                    volume: parseFloat(item[5])
                }));
            }
        } catch (e) {
            // thử mirror tiếp theo nếu bị chặn IP/CORS
        }
    }
    return [];
}

export interface LiveTrackerState {
    symbol: string;
    currentPrice: number;
    targetPrice: number;             // Giá mốc mở nến 5m
    priceChangeFromTarget: number;
    priceChangePercent: number;
    timeRemainingSec: number;        // Số giây còn lại
    formattedTimeRemaining: string;  // MM:SS
    periodStartTs: number;
    periodEndTs: number;
    prediction: EngineResult;        // Kết quả phân tích & tín hiệu
}

export type LiveTrackerCallback = (state: LiveTrackerState) => void;

/**
 * Class tự động quản lý WebSocket Binance, đồng hồ 5 phút, và chạy Engine
 */
export class Binance5mLiveTracker {
    private symbol: string;
    private ws: any = null;
    private isRunning: boolean = false;
    private candles: CandleOHLCV[] = [];
    private tickHistory: TickPriceHistory[] = [];
    private probHistory: Array<{ time: number; probUp: number }> = [];
    private currentPrice: number = 0;
    private targetPrice: number = 0;
    private currentEpochWindow: number = 0;
    private timerInterval: any = null;
    private subscribers: Set<LiveTrackerCallback> = new Set();
    private config: EngineConfig;

    constructor(symbol: string = 'BTCUSDT', config: EngineConfig = DEFAULT_CONFIG) {
        this.symbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
        this.config = config;
    }

    /**
     * Bắt đầu theo dõi: Nạp nến lịch sử -> Kết nối WS Binance -> Bật đồng hồ 5m
     */
    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // 1. Tính toán Epoch Window 5 phút hiện tại
        const nowSec = Math.floor(Date.now() / 1000);
        this.currentEpochWindow = Math.floor(nowSec / 300) * 300;

        // 2. Nạp trước 50 cây nến 1m từ Binance REST API
        try {
            this.candles = await fetchBinanceHistoricalKlines(this.symbol, 50);
            if (this.candles.length > 0) {
                const lastCandle = this.candles[this.candles.length - 1];
                this.currentPrice = lastCandle.close;

                // Tìm nến mở cửa của chu kỳ 5m hiện tại để làm Target Price chuẩn
                const open5mCandle = this.candles.find(c => c.time === this.currentEpochWindow);
                this.targetPrice = open5mCandle ? open5mCandle.open : lastCandle.close;
            }
        } catch (err) {
            console.warn('[Binance5mLiveTracker] Lỗi nạp nến khởi tạo:', err);
        }

        // 3. Khởi động WebSocket Binance Spot (ticker + kline_1m)
        this.connectWebSocket();

        // 4. Khởi động Master Clock đếm lùi từng giây
        this.startMasterClock();
    }

    /**
     * Dừng theo dõi và đóng kết nối
     */
    public stop() {
        this.isRunning = false;
        if (this.ws) {
            try { this.ws.close(); } catch (e) { }
            this.ws = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Đăng ký nhận kết quả phân tích mỗi khi có tick giá mới
     */
    public subscribe(cb: LiveTrackerCallback): () => void {
        this.subscribers.add(cb);
        return () => this.subscribers.delete(cb);
    }

    private connectWebSocket() {
        if (!this.isRunning) return;
        const sym = this.symbol.toLowerCase();
        const wsUrl = `wss://stream.binance.com:9443/ws/${sym}@ticker/${sym}@kline_1m`;

        const WSClass = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket;
        if (!WSClass) {
            console.error('[Binance5mLiveTracker] Không tìm thấy WebSocket client.');
            return;
        }

        try {
            this.ws = new WSClass(wsUrl);

            this.ws.onmessage = (event: any) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

                    // Xử lý tick giá từ 24h Ticker (@ticker)
                    if (data.e === '24hrTicker') {
                        const price = parseFloat(data.c);
                        if (price > 0) {
                            this.processNewPrice(price);
                        }
                    }

                    // Xử lý nến 1m cập nhật liên tục (@kline)
                    if (data.e === 'kline') {
                        const k = data.k;
                        const updatedCandle: CandleOHLCV = {
                            time: Math.floor(k.t / 1000),
                            open: parseFloat(k.o),
                            high: parseFloat(k.h),
                            low: parseFloat(k.l),
                            close: parseFloat(k.c),
                            volume: parseFloat(k.v)
                        };

                        const idx = this.candles.findIndex(c => c.time === updatedCandle.time);
                        if (idx >= 0) {
                            this.candles[idx] = updatedCandle;
                        } else {
                            this.candles.push(updatedCandle);
                            if (this.candles.length > 80) this.candles.shift();
                        }
                    }
                } catch (e) { }
            };

            this.ws.onclose = () => {
                if (this.isRunning) {
                    setTimeout(() => this.connectWebSocket(), 2000);
                }
            };

            this.ws.onerror = () => {
                if (this.ws) {
                    try { this.ws.close(); } catch (e) { }
                }
            };
        } catch (e) {
            setTimeout(() => this.connectWebSocket(), 3000);
        }
    }

    private processNewPrice(price: number) {
        this.currentPrice = price;
        if (this.targetPrice === 0) this.targetPrice = price;

        const now = Math.floor(Date.now() / 1000);
        this.tickHistory.push({ time: now, price });
        if (this.tickHistory.length > 50) this.tickHistory.shift();

        this.recalculateAndEmit();
    }

    private startMasterClock() {
        this.timerInterval = setInterval(() => {
            if (!this.isRunning) return;

            const nowSec = Math.floor(Date.now() / 1000);
            const activeWindowStart = Math.floor(nowSec / 300) * 300;

            // Chu kỳ 5 phút mới sang trang (Rollover)
            if (activeWindowStart !== this.currentEpochWindow) {
                this.currentEpochWindow = activeWindowStart;
                this.targetPrice = this.currentPrice; // Mốc Target mới là giá mở chu kỳ
                this.probHistory = [];
                this.tickHistory = [];
            }

            this.recalculateAndEmit();
        }, 1000);
    }

    private recalculateAndEmit() {
        if (this.currentPrice === 0 || this.candles.length === 0) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const activeWindowStart = Math.floor(nowSec / 300) * 300;
        const activeWindowEnd = activeWindowStart + 300;
        const timeRemainingSec = Math.max(0, activeWindowEnd - nowSec);

        const mins = String(Math.floor(timeRemainingSec / 60)).padStart(2, '0');
        const secs = String(timeRemainingSec % 60).padStart(2, '0');

        // Chạy Engine phân tích
        const prediction = run5mPredictionEngine(
            this.currentPrice,
            this.targetPrice,
            timeRemainingSec,
            this.candles,
            this.tickHistory,
            this.probHistory,
            this.config
        );

        // Lưu lại lịch sử xác suất để đo gia tốc
        this.probHistory.push({ time: nowSec, probUp: prediction.probUp });
        if (this.probHistory.length > 40) this.probHistory.shift();

        const priceDelta = this.currentPrice - this.targetPrice;
        const priceDeltaPct = this.targetPrice > 0 ? (priceDelta / this.targetPrice) * 100 : 0;

        const state: LiveTrackerState = {
            symbol: this.symbol,
            currentPrice: this.currentPrice,
            targetPrice: this.targetPrice,
            priceChangeFromTarget: priceDelta,
            priceChangePercent: priceDeltaPct,
            timeRemainingSec,
            formattedTimeRemaining: `${mins}:${secs}`,
            periodStartTs: activeWindowStart,
            periodEndTs: activeWindowEnd,
            prediction
        };

        // Bắn dữ liệu ra cho tất cả các bên đăng ký (UI / Bot)
        this.subscribers.forEach(cb => cb(state));
    }
}

// ----------------------------------------------------------------------------
// 9. SHARED CANDLE CACHE (BỘ NHỚ ĐỆM NẾN 1M DÀNH CHO BOT RUNNER)
// ----------------------------------------------------------------------------

export class SharedCandleCache {
    private candles: CandleOHLCV[] = [];
    private lastFetchTime: number = 0;
    private isFetching: boolean = false;

    public async getCandles(symbol: string = 'BTCUSDT', limit: number = 40): Promise<CandleOHLCV[]> {
        const now = Date.now();
        // Giữ cache trong 10 giây để không spam REST API Binance
        if (this.candles.length >= 15 && (now - this.lastFetchTime) < 10000) {
            return this.candles;
        }
        if (this.isFetching && this.candles.length > 0) {
            return this.candles;
        }
        this.isFetching = true;
        try {
            const fetched = await fetchBinanceHistoricalKlines(symbol, limit);
            if (fetched && fetched.length > 0) {
                this.candles = fetched;
                this.lastFetchTime = now;
            }
        } catch {
            // Giữ lại nến cũ nếu fetch thất bại
        } finally {
            this.isFetching = false;
        }
        return this.candles;
    }

    public getCandlesSync(): CandleOHLCV[] {
        return this.candles;
    }

    public setCandles(candles: CandleOHLCV[]) {
        this.candles = candles;
        this.lastFetchTime = Date.now();
    }
}

export const sharedCandleCache = new SharedCandleCache();

