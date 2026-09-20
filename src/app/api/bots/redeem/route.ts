import { NextResponse } from 'next/server';
import { redeemAllWinningPositions } from '@/lib/trade-api';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await redeemAllWinningPositions();
    return NextResponse.json({
      ok: true,
      message: result.redeemedCount > 0
        ? `Đã gửi yêu cầu Redeem cho ${result.redeemedCount} vị thế thắng!`
        : 'Không có vị thế thắng nào đang chờ Redeem.',
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi khi gọi Redeem All' },
      { status: 500 }
    );
  }
}
