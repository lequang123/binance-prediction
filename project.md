mô tả dự án:

đây là 1 api lấy history của top trader trên binance btc updown 5m, trader này vào lệnh tần xuất rất nhanh 1 2s 1 lệnh dựa vào odd

tạo 1 project nextjs, update data realtime

tôi muốn tạo 1 project dashboard để:
- lấy data này real-time
- hiển thị dữ liệu theo thời gian, theo row, tôi muốn biết trader này đã vào bao nhiêu tiền để theo up, và theo down, tỉ lệ odd lúc đó là bao nhiêu, nếu chiến thắng thì được nhiêu tiền, thua thì thua bao nhiêu, hiển thị dữ liệu 2 bên up và down để so sánh
- tôi muốn biết pattern để vào lệnh là gì, khi nào vào, odd thay đổi thì vào bao nhiêu


POST /bapi/defi/v1/public/wallet-direct/prediction/pf/address/positions HTTP/1.1
Host: www.binance.com
accept: */*
accept-language: en-US,en;q=0.9,vi;q=0.8
bnc-level: 0
bnc-location: VN
bnc-time-zone: Asia/Bangkok
bnc-uuid: b458d85e-08a1-48a2-ab55-a209d474cc4b
cache-control: no-cache
clienttype: web
clientversion: 1.2.0
content-type: application/json
csrftoken: 1a196e51e1517807bbea67e68dfd1e2d
lang: en
origin: https://www.binance.com
pragma: no-cache
referer: https://www.binance.com/en/prediction/leaderboard/0x6da6cb464f92ae7ad4ec3d239c81719cb1d0ae03
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36
x-passthrough-token: 
x-trace-id: 63875416-3a9c-407e-acb6-debafaff511b
x-ui-request-trace: 63875416-3a9c-407e-acb6-debafaff511b
Content-Length: 166

{
  "walletAddress": "0x6da6cb464f92ae7ad4ec3d239c81719cb1d0ae03",
  "type": "open",
  "sortBy": "TIME",
  "sortOrder": "DESC",
  "page": 1,
  "pageSize": 10
}


filter data $.data.entries[?(@.eventSlug == 'btc-up-or-down-5m' && @.marketStatus == 1)]


data: [
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "70067063248891911146865889156098994109253778504550978045452504674076525591652",
        "outcomeName": "Up",
        "outcomeIndex": 0,
        "outcomeWinner": null,
        "avgPrice": 0.46225896671866046,
        "currentPrice": 0.43,
        "pnl": -9.25937015,
        "pnlPct": -0.06978549,
        "value": 123.42395213,
        "toWin": 287.03244681,
        "shares": 287.03244681,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727343
    },
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "113620596152449359237589173936261885597895897399070396105910093148185850801249",
        "outcomeName": "Down",
        "outcomeIndex": 1,
        "outcomeWinner": null,
        "avgPrice": 0.5011613751601189,
        "currentPrice": 0.57,
        "pnl": 18.09755426,
        "pnlPct": 0.1373582,
        "value": 149.85200465,
        "toWin": 262.89825378,
        "shares": 262.89825378,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727343
    }
]

[
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "70067063248891911146865889156098994109253778504550978045452504674076525591652",
        "outcomeName": "Up",
        "outcomeIndex": 0,
        "outcomeWinner": null,
        "avgPrice": 0.4629914816418916,
        "currentPrice": 0.45,
        "pnl": -4.11872121,
        "pnlPct": -0.02805987,
        "value": 142.66460107,
        "toWin": 317.03244681,
        "shares": 317.03244681,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727361
    },
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "113620596152449359237589173936261885597895897399070396105910093148185850801249",
        "outcomeName": "Down",
        "outcomeIndex": 1,
        "outcomeWinner": null,
        "avgPrice": 0.5124353310757307,
        "currentPrice": 0.55,
        "pnl": 12.38323302,
        "pnlPct": 0.07330616,
        "value": 181.30808427,
        "toWin": 329.65106232,
        "shares": 329.65106232,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727361
    }
]

[
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "113620596152449359237589173936261885597895897399070396105910093148185850801249",
        "outcomeName": "Down",
        "outcomeIndex": 1,
        "outcomeWinner": null,
        "avgPrice": 0.5147346154498675,
        "currentPrice": 0.55,
        "pnl": 12.68323302,
        "pnlPct": 0.06851178,
        "value": 197.80808427,
        "toWin": 359.65106232,
        "shares": 359.65106232,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727366
    },
    {
        "topicTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketId": 8691520,
        "marketTopicId": 5005290,
        "eventSlug": "btc-up-or-down-5m",
        "marketStatus": 1,
        "marketTitle": "Bitcoin Up or Down - August 26, 2:55AM-3AM ET",
        "marketImageUrl": "file-center/web3-prediction/S3/topic/1784874320848_0xe3ervzgq643yireveawfzwv5px5ra5_NEF_q80_64x64",
        "tokenId": "70067063248891911146865889156098994109253778504550978045452504674076525591652",
        "outcomeName": "Up",
        "outcomeIndex": 0,
        "outcomeWinner": null,
        "avgPrice": 0.4632923482300448,
        "currentPrice": 0.45,
        "pnl": -4.26157836,
        "pnlPct": -0.02869106,
        "value": 144.27174392,
        "toWin": 320.60387539,
        "shares": 320.60387539,
        "result": null,
        "closeType": null,
        "totalBoughtShares": null,
        "totalBoughtAmount": null,
        "totalSoldShares": null,
        "totalSoldAmount": null,
        "avgSoldPrice": null,
        "realizedPnlFromSells": null,
        "sellRoi": null,
        "settleAmount": null,
        "claimedShares": null,
        "realizedPnlFromSettle": null,
        "settleRoi": null,
        "settledPrice": null,
        "lastActiveTime": 1787727364
    }
]