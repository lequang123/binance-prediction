const axios = require('axios');
const crypto = require('crypto');

const API_KEY = 'QmtFpgGiKn5Br1KSSgBDlr2BrWq3dxsXW5xNWHUckgE4NdeiYMBKC79ttYrjHskR'; // API Key của bạn
const SECRET_KEY = 'nDRAdJFcUaGQ4wFdGpuCHicnGFkmyRsHn4XTmOxkMS6tuIIpnRp79z3Fl6v5sNmW'; // Bắt buộc phải có để tạo signature

const tokenIdBuy = '18860385606712310885812932976660828624784205774400337073069450520424955930357';
const tokenIdSell = '5122048838954413366017923879520479069692323427039891394278511941589292856743';

const qs = require('querystring');

// Hàm Helper để ký và gọi API GET
async function getBinanceApi(endpoint, queryData = {}) {
  const baseUrl = 'https://api.binance.com';
  queryData.timestamp = Date.now();

  const queryString = qs.stringify(queryData);

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(queryString)
    .digest('hex');

  const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

  return axios.get(fullUrl, {
    headers: {
      'X-MBX-APIKEY': API_KEY,
    }
  });
}

// Hàm Helper để ký và gọi API POST x-www-form-urlencoded
async function postBinanceApi(endpoint, bodyData) {
  const baseUrl = 'https://api.binance.com';
  const timestamp = Date.now();

  const queryString = `timestamp=${timestamp}`;
  const bodyString = qs.stringify(bodyData);
  // Theo docs của Binance: signature = HMAC_SHA256(secret_key, query_string + request_body) -> không có dấu & ở giữa
  const totalPayload = queryString + bodyString;

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(totalPayload)
    .digest('hex');

  const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

  return axios.post(fullUrl, bodyString, {
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
}

// BƯỚC 1: Lấy báo giá
async function getPredictionQuote(walletAddress, tokenId, side, amountIn) {
  console.log(`⏳ ${side} Đang lấy quote... `);
  const bodyData = {
    walletAddress,
    tokenId,
    side,
    amountIn,
    orderType: 'MARKET',
    slippageBps: 1200
  };

  const response = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/get-quote', bodyData);
  return response.data; // Thường sẽ có trường quoteId trong này
}

// BƯỚC 2: Khớp lệnh với Quote ID vừa lấy
async function placePredictionOrder(walletAddress, walletId, quoteId, amountIn) {
  console.log('⏳ Đang khớp lệnh với quoteId:', quoteId);
  const bodyData = {
    walletAddress,
    walletId,
    quoteId,
    timeInForce: 'FOK',
    accountType: 'SPOT',
    orderType: 'MARKET',
    slippageBps: 1200
  };

  const response = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/place-order-bundle', bodyData);
  return response.data;
}

// Lấy danh sách thị trường Prediction
async function getPredictionMarkets() {
  console.log('⏳ Đang lấy danh sách các thị trường Prediction...');
  const response = await getBinanceApi('/sapi/v1/w3w/wallet/prediction/market/list');
  return response.data;
}

// Lấy 1 Token đang hoạt động bất kỳ để test
async function getActiveTokenId() {
  const marketResult = await getPredictionMarkets();
  // Tìm chủ đề đầu tiên có chứa "BTC"
  const topic = marketResult.data.list.find(t => t.title && t.title.toLowerCase().includes('btc'));
  if (!topic) {
    // Nếu không có BTC, lấy tạm token đầu tiên
    return marketResult.data.list[0].markets[0].outcomes[0].tokenId;
  }
  return topic.markets[0].outcomes[0].tokenId;
}

// CHẠY CHUỖI GIAO DỊCH MUA
async function executeBuy() {
  try {
    const WALLET_ADDRESS = '0x7947Eb2E92537f55295119AD833F0064E35C9f42';
    const WALLET_ID = '267e0168a97846cbaa4044886323d1d7';


    console.log("👉 [BUY] Sử dụng TOKEN_ID hợp lệ:", tokenIdBuy);

    const AMOUNT_IN = '1000000000000000000'; // 1 USDT

    const [quoteSellResult, quoteBuyResult] = await Promise.all(
      [getPredictionQuote(WALLET_ADDRESS, tokenIdSell, 'BUY', AMOUNT_IN),
      getPredictionQuote(WALLET_ADDRESS, tokenIdBuy, 'BUY', AMOUNT_IN)]);

    const quoteBuyId = quoteBuyResult.data?.quoteId || quoteBuyResult.quoteId;
    if (!quoteBuyId) throw new Error("Không tìm thấy quoteId trong response báo giá.");

    const quoteSellId = quoteSellResult.data?.quoteId || quoteSellResult.quoteId;
    if (!quoteSellId) throw new Error("Không tìm thấy quoteId trong response báo giá.");
    // 2. Vào lệnh
    const [orderBuyResult, orderSellResult] = await Promise.all([
      placePredictionOrder(WALLET_ADDRESS, WALLET_ID, quoteBuyId, AMOUNT_IN),
      placePredictionOrder(WALLET_ADDRESS, WALLET_ID, quoteSellId, AMOUNT_IN)
    ]);

    console.log("🚀 Lệnh BUY đã được đẩy lên:", orderBuyResult);

    return true;
  } catch (error) {
    console.error("❌ Lỗi BUY:", error.message);
    return false;
  }
}

// Hàm lấy số dư shares hiện tại
async function getMyPositionShares(tokenId) {
  console.log('⏳ Đang kiểm tra số dư shares thực tế trong ví...');
  const body = {
    walletAddress: '0x7947Eb2E92537f55295119AD833F0064E35C9f42',
    type: 'open',
    sortBy: 'TIME',
    sortOrder: 'DESC',
    page: 1,
    pageSize: 20,
  };

  const response = await axios.post('https://www.binance.com/bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions', body, {
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
    }
  });

  const positions = response.data?.data?.entries || [];
  const targetPos = positions.find(p => p.tokenId === tokenId);

  if (!targetPos) {
    throw new Error('Không tìm thấy vị thế đang mở nào cho TokenID này!');
  }

  // Thêm dòng log này để kiểm tra cấu trúc dữ liệu thực tế Binance trả về
  console.log("🔍 Thông tin vị thế gốc từ Binance:", JSON.stringify(targetPos, null, 2));

  // Sàn trả về số đã làm tròn (ví dụ 3.16774194). 
  // Nếu ta nhân thẳng 1e18 rồi thêm số 0, nó có thể LỚN HƠN số dư thật sự ở hàng thập phân nhỏ bé.
  // Vì vậy ta bán 99% (nhân 0.999) để đảm bảo không bị lỗi "exceeded your available shares" (-9000).
  const sharesWei = BigInt(Math.floor(targetPos.shares * 0.999 * 1e18)).toString();
  console.log(`✅ Đang có ${targetPos.shares} shares thực tế trong ví. Sẽ bán ~99.9% (~ ${sharesWei} WEI).`);
  return sharesWei;
}

// CHẠY GIAO DỊCH BÁN TOÀN BỘ (Cho 1 Token)
async function executeSellToken(tokenId) {
  try {
    const WALLET_ADDRESS = '0x7947Eb2E92537f55295119AD833F0064E35C9f42';
    const WALLET_ID = '267e0168a97846cbaa4044886323d1d7';

    // 0. LẤY SỐ LƯỢNG SHARES THỰC TẾ
    let SHARES_TO_SELL;
    try {
      SHARES_TO_SELL = await getMyPositionShares(tokenId);
    } catch (e) {
      console.log(`❌ Bỏ qua TokenID ${tokenId.substring(0, 8)}...: Không có số dư để bán.`);
      return false; // Bỏ qua nếu không có shares
    }

    console.log(`👉 [SELL] Đang lấy quote bán ${SHARES_TO_SELL} WEI shares của TOKEN_ID:`, tokenId.substring(0, 8) + '...');

    // 1. XIN QUOTE SELL
    const quoteBody = {
      walletAddress: WALLET_ADDRESS,
      tokenId: tokenId,
      side: 'SELL',
      amountIn: SHARES_TO_SELL,
      orderType: 'MARKET',
      slippageBps: 1200
    };

    const quoteResult = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/get-quote', quoteBody);
    const quoteId = quoteResult.data?.quoteId || quoteResult.quoteId;
    if (!quoteId) throw new Error("Không tìm thấy quoteId.");
    console.log(`✅ Lấy quote SELL thành công cho TokenID ${tokenId.substring(0, 8)}...`);

    // 2. VÀO LỆNH SELL
    const orderBody = {
      walletAddress: WALLET_ADDRESS,
      walletId: WALLET_ID,
      quoteId: quoteId,
      timeInForce: 'FOK',
      accountType: 'SPOT',
      orderType: 'MARKET',
      slippageBps: 1200
    };
    const orderResult = await postBinanceApi('/sapi/v1/w3w/wallet/prediction/trade/place-order-bundle', orderBody);
    console.log(`🚀 Lệnh SELL TokenID ${tokenId.substring(0, 8)}... đã được đẩy lên:`, orderResult.data?.orderId || orderResult.data);
    return true;

  } catch (error) {
    console.error(`❌ Lỗi SELL TokenID ${tokenId.substring(0, 8)}... :`, error.response?.data || error.message);
    return false;
  }
}

// Hàm gộp bán cả 2 cửa cùng lúc
async function executeSellBoth() {
  console.log("=== TIẾN HÀNH BÁN CẢ 2 CỬA (SELL) CÙNG LÚC ===");
  await Promise.all([
    executeSellToken(tokenIdBuy),
    executeSellToken(tokenIdSell)
  ]);
  console.log("✅ Hoàn tất chuỗi lệnh bán 2 cửa!");
}

// ==========================================
// CHẠY CHUỖI TEST: MUA XONG BÁN LUÔN
// ==========================================
async function testFullFlow() {
  console.log("=== ĐANG TÌM MỘT KÈO ĐANG MỞ ĐỂ TEST ===");
  // const tokenId = await getActiveTokenId();
  // console.log(`✅ Đã chọn TokenID: ${tokenId}`);

  console.log("\n=== BƯỚC 1: TIẾN HÀNH MUA 1$ ===");
  const buySuccess = await executeBuy();

  if (!buySuccess) {
    console.log("❌ Mua thất bại, hủy bỏ test SELL.");
    return;
  }

  console.log("✅ Đã hoàn tất mở 2 vị thế thành công!");
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function run() {
  // 1. MUA
  await testFullFlow();

  // 2. CHỜ 2 GIÂY
  console.log("\n⏳ Đang chờ 2 giây trước khi chốt lời/cắt lỗ...");
  await delay(3000);

  // 3. BÁN
  await executeSellBoth();
}

run();