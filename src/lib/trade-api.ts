import crypto from 'crypto';

const API_KEY = 'QmtFpgGiKn5Br1KSSgBDlr2BrWq3dxsXW5xNWHUckgE4NdeiYMBKC79ttYrjHskR';
const SECRET_KEY = 'nDRAdJFcUaGQ4wFdGpuCHicnGFkmyRsHn4XTmOxkMS6tuIIpnRp79z3Fl6v5sNmW';

export const WALLET_ADDRESS = '0x7947Eb2E92537f55295119AD833F0064E35C9f42';
export const WALLET_ID = '267e0168a97846cbaa4044886323d1d7';

// Helper POST
async function postBinanceApi(endpoint: string, bodyData: any) {
  const baseUrl = 'https://api.binance.com';
  const timestamp = Date.now();

  const queryString = `timestamp=${timestamp}`;
  // X-www-form-urlencoded format
  const bodyString = Object.keys(bodyData)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(bodyData[key])}`)
    .join('&');

  const totalPayload = queryString + bodyString;

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(totalPayload)
    .digest('hex');

  const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: bodyString,
  });

  const data = await response.json();
  if (!response.ok || (data.code && data.code !== 200 && data.code !== 0 && data.code < 0)) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

// BƯỚC 1: Lấy báo giá
async function getPredictionQuote(walletAddress: string, tokenId: string, side: string, amountIn: string) {
  const bodyData: any = {
    walletAddress,
    tokenId,
    side,
    amountIn,
    orderType: 'MARKET',
    slippageBps: 1200
  };

  // Xóa logic transfer CEX theo yêu cầu người dùng
  // if (side === 'BUY') {
  //   bodyData.fundingSource = 'CEX';
  //   bodyData.fundTransferAmount = amountIn;
  // }

  const data = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/get-quote', bodyData);
  return data;
}

// BƯỚC 2: Khớp lệnh
async function placePredictionOrder(walletAddress: string, walletId: string, quoteId: string, side: string, amountIn: string) {
  const bodyData: any = {
    walletAddress,
    walletId,
    quoteId,
    timeInForce: 'FOK',
    accountType: 'SPOT',
    orderType: 'MARKET',
    slippageBps: 1200
  };

  // Xóa logic transfer CEX theo yêu cầu người dùng
  // if (side === 'BUY') {
  //   bodyData.fundingSource = 'CEX';
  //   bodyData.fundTransferAmount = amountIn;
  // }

  const data = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/place-order-bundle', bodyData);
  return data;
}

// Hàm execute chính để gọi từ mock-trader
export async function executeLiveTrade(tokenId: string, side: 'BUY' | 'SELL', amountIn: string = '1000000000000000000', traderOdds?: number) {
  console.log(`\n[LIVE TRADE DISABLED] ĐÃ TẮT ĐÁNH THẬT! Bỏ qua lệnh ${side} cho Token: ${tokenId.substring(0, 8)}..., Amount: ${amountIn}\n`);
  return { data: { orderId: 'DISABLED_MOCK_ORDER' } };

  /* 
  // CODE ĐÁNH THẬT ĐÃ ĐƯỢC ẨN BÊN DƯỚI
  try {
    console.log(`[LIVE TRADE] ⏳ Xin quote cho Token: ${tokenId}, Side: ${side}, Amount: ${amountIn}...`);
    const quoteResult = await getPredictionQuote(WALLET_ADDRESS, tokenId, side, amountIn);

    const quoteId = quoteResult.data?.quoteId || quoteResult.quoteId;
    if (!quoteId) {
      throw new Error(`Không tìm thấy quoteId trong response: ${JSON.stringify(quoteResult)}`);
    }

    console.log(`[LIVE TRADE] ⏳ Đang khớp lệnh quoteId: ${quoteId}...`);
    const orderResult = await placePredictionOrder(WALLET_ADDRESS, WALLET_ID, quoteId, side, amountIn);

    // Tính toán số lượng shares và giá khớp thực tế từ báo giá (Quote)
    const amountOutStr = quoteResult.data?.amountOut || quoteResult.amountOut || '0';
    const estimatedShares = Number(amountOutStr) / 1e18;
    const inputUsdt = Number(amountIn) / 1e18;
    const estimatedFillPrice = estimatedShares > 0 ? inputUsdt / estimatedShares : 0;

    console.log(`\n==============================================`);
    console.log(`[CHI TIẾT LỆNH COPY THÀNH CÔNG] 🚀 TokenID: ${tokenId}`);
    console.log(`- Mã lệnh (OrderID):  ${orderResult.data?.orderId || orderResult.orderId || 'N/A'}`);
    console.log(`- Trader Fill Price:  ${traderOdds !== undefined ? traderOdds.toFixed(4) : 'N/A'}`);
    console.log(`- Của bạn Fill Price: ${estimatedFillPrice.toFixed(4)}`);
    console.log(`- Số Shares nhận đc:  +${estimatedShares.toFixed(2)} Shares`);
    console.log(`- Lệch (Slippage):    ${traderOdds ? Math.abs(traderOdds - estimatedFillPrice).toFixed(4) : 'N/A'}`);
    console.log(`==============================================\n`);

    // TỰ ĐỘNG BÁN NGAY LẬP TỨC (Dùng cho mục đích test)
    if (side === 'BUY') {
      console.log(`[LIVE TRADE] 🚀 Chờ 3 giây để sàn cập nhật số dư, sau đó sẽ tự động BÁN hết toàn bộ để test...`);
      setTimeout(() => {
        testSellAll(tokenId).catch(err => console.error('[AUTO SELL ERROR]', err));
      }, 3000);
    }

    return orderResult;
  } catch (error: any) {
    console.error(`[LIVE TRADE] ❌ Lỗi khi trade:`, error.message);
    throw error;
  }
  */
}

// ====================================================
// HÀM TEST ĐỂ SELL ALL VỊ THẾ VỪA MUA
// ====================================================
import { fetchActivePositions } from './binance';

export async function testSellAll(tokenId: string) {
  try {
    console.log(`[TEST SELL ALL] Đang tìm vị thế cho TokenID: ${tokenId}...`);
    const positions = await fetchActivePositions();
    const targetPos = positions.find(p => p.tokenId === tokenId);

    if (!targetPos) {
      console.log(`[TEST SELL ALL] ❌ Không tìm thấy vị thế đang mở nào cho TokenID này.`);
      return;
    }

    // shares trả về là số thực (ví dụ 14.0285). JS có sai số dấu phẩy động.
    // Thực tế số dư có thể thấp hơn 1 chút xíu ở hàng thập phân WEI. 
    // Do đây là lệnh test bán luôn, ta giảm số lượng bán xuống 99.9% để đảm bảo không bao giờ bị vượt quá số dư (lỗi -9000).
    const sharesToSell = BigInt(Math.floor(targetPos.shares * 0.999 * 1e18)).toString();
    console.log(`[TEST SELL ALL] Có ${targetPos.shares} shares. Sẽ bán ~99.9%: ${sharesToSell} wei để tránh lỗi sai số...`);

    // Gọi lệnh SELL
    const result = await executeLiveTrade(tokenId, 'SELL', sharesToSell);
    console.log(`[TEST SELL ALL] ✅ Đã bán thành công vị thế!`, result);
  } catch (error: any) {
    console.error(`[TEST SELL ALL] ❌ Lỗi khi bán:`, error.message);
  }
}
