import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  getCollectorStatus,
  getResults,
  getBucketEntries,
  syncDataFromDisk,
} from '@/lib/odds-collector';
import { computeOddsStats } from '@/lib/odds-stats';
import { AI_SYSTEM_INSTRUCTION, buildStatsContext } from '@/lib/ai-context';
import type { TradingSession } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages || [];
    const clientApiKey = body.apiKey?.trim();
    const sessionParam = (body.session || 'all') as TradingSession;
    const requestedModel = body.model?.trim();

    // 1. Resolve API Key
    const apiKey = process.env.GEMINI_API_KEY || clientApiKey;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'MISSING_API_KEY',
          message:
            'Chưa có Gemini API Key. Vui lòng nhập API Key ở ô phía trên hoặc cấu hình GEMINI_API_KEY trong file .env.local',
        },
        { status: 400 }
      );
    }

    if (!messages.length) {
      return NextResponse.json(
        { ok: false, message: 'Danh sách tin nhắn trống' },
        { status: 400 }
      );
    }

    // 2. Lấy dữ liệu thống kê mới nhất
    syncDataFromDisk();
    const status = getCollectorStatus();
    const entries = getBucketEntries();
    const results = getResults();
    const stats = computeOddsStats(
      entries,
      results,
      status.snapshotCount,
      status.collectingSince,
      sessionParam
    );

    // 3. Xây dựng System Instruction kèm dữ liệu thị trường
    const dataContext = buildStatsContext(stats);
    const systemInstruction = `${AI_SYSTEM_INSTRUCTION}\n\n${dataContext}`;

    // 4. Model fallback sequence
    // Khuyên dùng: gemini-3.6-flash (Interactions API chuẩn của Google từ tháng 6/2026)
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const primaryModel = requestedModel || defaultModel;
    const candidateModels = [
      primaryModel,
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    // Chuẩn bị nội dung hội thoại
    // Nếu có lịch sử hội thoại, gộp các câu trước thành context để AI hiểu luồng hỏi đáp
    const lastUserMessage = messages[messages.length - 1].content;
    let fullInput = lastUserMessage;
    if (messages.length > 1) {
      const historyContext = messages
        .slice(0, -1)
        .map((m) => `${m.role === 'user' ? 'Người dùng' : 'AI Advisor'}: ${m.content}`)
        .join('\n\n');
      fullInput = `[LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ]:\n${historyContext}\n\n[CÂU HỎI HIỆN TẠI]:\n${lastUserMessage}`;
    }

    const ai = new GoogleGenAI({ apiKey });

    let lastErrorMsg = '';
    let successReply = '';
    let usedModel = primaryModel;

    for (const model of candidateModels) {
      try {
        // Gọi Interactions API: chuẩn interface mặc định của Google Gen AI SDK
        const interaction = await ai.interactions.create({
          model,
          system_instruction: systemInstruction,
          input: fullInput,
        });

        const reply = interaction.output_text;
        if (reply) {
          successReply = reply;
          usedModel = model;
          break;
        }
      } catch (err: any) {
        lastErrorMsg = err?.message || String(err);
        console.warn(`[AI ADVISOR - Interactions API] Model ${model} failed:`, lastErrorMsg);
      }
    }

    if (!successReply) {
      let friendlyMessage = lastErrorMsg;
      if (lastErrorMsg.includes('prepayment credits are depleted') || lastErrorMsg.includes('429')) {
        friendlyMessage = `⚠️ **Tài khoản hết Credit trả phí (Prepay depleted):** Project Google Cloud chứa API Key này đang bật chế độ Billing nhưng số dư credit đã về 0$.\n\n👉 **Cách giải quyết đơn giản nhất (Miễn phí):**\n1. Truy cập [Google AI Studio (aistudio.google.com/apikey)](https://aistudio.google.com/apikey)\n2. Bấm **"Create API key in new project"** (tạo ở project mới chưa bật billing để dùng gói Free Tier 100% miễn phí).\n3. Dán key mới vào file \`.env.local\` hoặc ô **⚙️ 🔑 Nhập API Key** trên trang này.`;
      }

      return NextResponse.json(
        {
          ok: false,
          error: 'API_CALL_FAILED',
          message: friendlyMessage,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      reply: successReply,
      model: usedModel,
      dataPoints: {
        resolvedRounds: stats.resolvedRounds,
        totalRounds: stats.totalRounds,
        session: stats.session,
      },
    });
  } catch (err: any) {
    console.error('[AI ADVISOR ROUTE] Error:', err);
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi server nội bộ' },
      { status: 500 }
    );
  }
}
