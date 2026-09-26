// ============================================================
// Binance Prediction Orderbook WebSocket Push Client
// Official Endpoint: wss://api.binance.com/sapi/wss
// Latency: < 100-200ms real-time event-driven push from Predict.fun
// ============================================================

import crypto from 'crypto';
// @ts-ignore
import WebSocket from 'ws';
import { API_KEY, SECRET_KEY } from './trade-api';

export interface OrderbookLevel {
  price: number; // 0.0 - 1.0 (USDT / Share ratio)
  size: number;
}

export interface PredictionOrderbookUpdate {
  marketId: number;
  updateTimestampMs: number;
  bestAsk: number | null; // Lowest selling price
  bestBid: number | null; // Highest buying price
  midPrice: number | null; // (bestAsk + bestBid) / 2
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
}

type OrderbookListener = (update: PredictionOrderbookUpdate) => void;

class PredictionWebSocketService {
  private ws: WebSocket | null = null;
  private currentMarketId: number | null = null;
  private lastTimestampMs = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isExplicitlyClosed = false;
  private listeners: Set<OrderbookListener> = new Set();
  private isConnected = false;
  private hasAuthError = false;

  constructor() {
    // Singleton
  }

  /**
   * Đăng ký callback nhận dữ liệu Orderbook realtime
   */
  public onOrderbook(listener: OrderbookListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Thiết lập mã kỳ (marketId) cần theo dõi
   * Tự động kết nối hoặc chuyển topic sang kỳ mới
   */
  public setMarketId(marketId: number): void {
    if (this.currentMarketId === marketId && this.isConnected) {
      return;
    }
    console.log(`[PREDICTION WSS] 🎯 Chuyển luồng Orderbook sang Kỳ #${marketId}`);
    this.currentMarketId = marketId;
    this.lastTimestampMs = 0;
    this.hasAuthError = false; // Reset auth error on new round
    this.connect();
  }

  /**
   * Khởi tạo kết nối có chữ ký HMAC SHA256 tới Binance SAPI WSS
   */
  public connect(): void {
    if (!this.currentMarketId) {
      return;
    }

    this.cleanup();
    this.isExplicitlyClosed = false;

    const topic = `web3_prediction_orderbook_${this.currentMarketId}`;
    const random = Math.floor(Math.random() * 1000000);
    const recvWindow = 30000;
    const timestamp = Date.now();

    // Query params cần sắp xếp theo thứ tự bảng chữ cái (A-Z) để tạo chữ ký HMAC SHA256
    const params: Record<string, string> = {
      random: String(random),
      recvWindow: String(recvWindow),
      timestamp: String(timestamp),
      topic,
    };

    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');

    const wssUrl = `wss://api.binance.com/sapi/wss?${queryString}&signature=${signature}`;

    try {
      this.ws = new WebSocket(wssUrl, {
        headers: {
          'X-MBX-APIKEY': API_KEY,
        },
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log(`[PREDICTION WSS] ✅ Đã kết nối WebSocket thành công tới Topic: ${topic}`);

        // Gửi nhịp tim Ping mỗi 25 giây theo chuẩn Binance SApi
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'PING' }));
            } catch (e) {
              // Ignore send error
            }
          }
        }, 25000);
      });

      this.ws.on('message', (buf: any) => {
        const raw = buf.toString();
        console.log('[PREDICTION WSS 📩 DATA BẮN VỀ]:', raw);
        this.handleMessage(raw);
      });

      this.ws.on('error', (err: Error) => {
        console.error(`[PREDICTION WSS] ⚠️ Lỗi WebSocket (${topic}):`, err.message);
      });

      this.ws.on('close', (code: number, reason: any) => {
        this.isConnected = false;
        const reasonStr = reason ? reason.toString() : 'none';
        console.log(`[PREDICTION WSS] 🔌 Đóng kết nối (code: ${code}, reason: ${reasonStr})`);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      });
    } catch (err: any) {
      console.error('[PREDICTION WSS] Lỗi khi tạo kết nối:', err.message);
      this.scheduleReconnect();
    }
  }

  /**
   * Xử lý gói tin nhận từ Binance SApi WSS
   */
  private handleMessage(msgStr: string): void {
    try {
      const parsed = JSON.parse(msgStr);

      // 1. Phản hồi đăng ký hoặc lệnh hệ thống
      if (parsed.type === 'COMMAND') {
        if (parsed.data === 'SUCCESS') {
          console.log(`[PREDICTION WSS] 🚀 Đăng ký Topic thành công [${parsed.subType || 'REGISTER'}]`);
          this.hasAuthError = false;
        } else {
          console.warn(`[PREDICTION WSS] ⚠️ Lỗi đăng ký từ Binance: ${parsed.data} [${parsed.subType || ''}]`);
          if (typeof parsed.data === 'string' && parsed.data.includes('Invalid API-key')) {
            this.hasAuthError = true;
            console.error('[PREDICTION WSS] ❌ API-Key hoặc IP không có quyền truy cập SAPI WebSocket. Vui lòng kiểm tra quyền hoặc IP whitelist trong Binance API Management. Hệ thống vẫn tiếp tục thu thập qua HTTP polling 300ms bình thường.');
          }
        }
        return;
      }

      // 2. Gói tin PUSH Orderbook theo Topic
      if (parsed.type === 'TOPIC' && parsed.data) {
        // Data là chuỗi JSON mã hóa 2 lớp theo chuẩn tài liệu Binance
        const payload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;

        if (payload.msgType === 'orderbook') {
          const marketId = Number(payload.marketId);
          const updateTimestampMs = Number(payload.updateTimestampMs);

          // Chống gói tin bị đảo lộn thứ tự (Out-of-order detection)
          if (updateTimestampMs && updateTimestampMs <= this.lastTimestampMs) {
            return;
          }
          this.lastTimestampMs = updateTimestampMs;

          const rawAsks: [string, string][] = Array.isArray(payload.asks) ? payload.asks : [];
          const rawBids: [string, string][] = Array.isArray(payload.bids) ? payload.bids : [];

          const asks: OrderbookLevel[] = rawAsks.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));
          const bids: OrderbookLevel[] = rawBids.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));

          const bestAsk = asks.length > 0 ? asks[0].price : null;
          const bestBid = bids.length > 0 ? bids[0].price : null;
          const midPrice = bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : bestAsk || bestBid;

          const update: PredictionOrderbookUpdate = {
            marketId,
            updateTimestampMs,
            bestAsk,
            bestBid,
            midPrice,
            asks,
            bids,
          };

          console.log(`[PREDICTION WSS 📊 ORDERBOOK PUSH] Kỳ #${marketId}: MidPrice=${midPrice?.toFixed(4)} | BestAsk=${bestAsk} | BestBid=${bestBid} | Depth: ${asks.length} asks, ${bids.length} bids`);

          // Bắn dữ liệu Realtime tới tất cả listeners (OddsCollector & BotEngine)
          for (const listener of this.listeners) {
            try {
              listener(update);
            } catch (err) {
              console.error('[PREDICTION WSS] Lỗi trong callback listener:', err);
            }
          }
        }
      }
    } catch (e) {
      // Bỏ qua nếu gói tin không phải JSON chuẩn
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    // Nếu lỗi quyền API Key/IP, chờ 60s thay vì spam mỗi 2s
    const delay = this.hasAuthError ? 60000 : 5000;
    if (this.hasAuthError) {
      console.warn(`[PREDICTION WSS] ⏸️ Tạm hoãn kết nối lại (${delay / 1000}s) do lỗi quyền API-Key/IP để tránh spam log.`);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.currentMarketId) {
        console.log('[PREDICTION WSS] 🔄 Đang thử kết nối lại WebSocket...');
        this.connect();
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (e) { }
      this.ws = null;
    }
    this.isConnected = false;
  }

  public close(): void {
    this.isExplicitlyClosed = true;
    this.cleanup();
  }

  public getStatus() {
    return {
      isConnected: this.isConnected,
      currentMarketId: this.currentMarketId,
      lastTimestampMs: this.lastTimestampMs,
    };
  }
}

// Global Singleton instance
export const predictionWs = new PredictionWebSocketService();
