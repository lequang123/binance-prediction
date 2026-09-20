import { NextResponse } from 'next/server';
import {
  loadBotsConfig,
  saveBotsConfig,
  loadBotsState,
  saveBotsState,
  readBotTradeLogs,
} from '@/lib/bot-engine';
import type { BotConfig, BotRuntimeState } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configs = loadBotsConfig();
    const states = loadBotsState();

    // Khởi tạo state mặc định cho các bot mới nếu chưa có
    let stateModified = false;
    for (const bot of configs) {
      if (!states[bot.id]) {
        states[bot.id] = {
          botId: bot.id,
          currentStake: bot.baseStake,
          currentStep: 1,
          cooldownRemaining: 0,
          dailyLoss: 0,
          dailyPnl: 0,
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
          lastTradeTimestamp: 0,
          lastActiveMarketId: null,
          status: 'IDLE',
        };
        stateModified = true;
      }
    }

    if (stateModified) {
      saveBotsState(states);
    }

    const tradeLogs = readBotTradeLogs(undefined, 30);

    return NextResponse.json({
      ok: true,
      bots: configs.map((cfg) => ({
        config: cfg,
        state: states[cfg.id],
      })),
      recentLogs: tradeLogs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi tải danh sách bot' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newBot = body as BotConfig;

    if (!newBot.name || !newBot.name.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Tên bot không được để trống' },
        { status: 400 }
      );
    }

    if (newBot.baseStake < 1) {
      return NextResponse.json(
        { ok: false, message: 'Số tiền cược tối thiểu là 1 USDT' },
        { status: 400 }
      );
    }

    const configs = loadBotsConfig();
    const states = loadBotsState();

    // Check xem là cập nhật bot cũ hay tạo bot mới
    const existingIndex = configs.findIndex((b) => b.id === newBot.id);

    if (existingIndex >= 0) {
      // Cập nhật
      newBot.updatedAt = Date.now();
      configs[existingIndex] = newBot;

      // Cập nhật stake nếu baseStake thay đổi và đang ở step 1
      if (states[newBot.id] && states[newBot.id].currentStep === 1) {
        states[newBot.id].currentStake = newBot.baseStake;
      }
    } else {
      // Tạo mới
      newBot.id = newBot.id || `bot_${Date.now()}`;
      newBot.createdAt = Date.now();
      newBot.updatedAt = Date.now();
      configs.push(newBot);

      states[newBot.id] = {
        botId: newBot.id,
        currentStake: newBot.baseStake,
        currentStep: 1,
        cooldownRemaining: 0,
        dailyLoss: 0,
        dailyPnl: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        lastTradeTimestamp: 0,
        lastActiveMarketId: null,
        status: 'IDLE',
      };
    }

    saveBotsConfig(configs);
    saveBotsState(states);

    return NextResponse.json({
      ok: true,
      message: 'Đã lưu cấu hình bot thành công',
      bot: newBot,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi lưu bot' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('id');

    if (!botId) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu ID bot cần xóa' },
        { status: 400 }
      );
    }

    let configs = loadBotsConfig();
    const states = loadBotsState();

    configs = configs.filter((b) => b.id !== botId);
    delete states[botId];

    saveBotsConfig(configs);
    saveBotsState(states);

    return NextResponse.json({
      ok: true,
      message: 'Đã xóa bot thành công',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi xóa bot' },
      { status: 500 }
    );
  }
}
