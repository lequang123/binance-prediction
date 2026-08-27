import { NextResponse } from 'next/server';
import { setWalletAddress, WALLET_ADDRESS } from '@/lib/binance';
import { clearSession } from '@/lib/diff-engine';
import { resetPoller } from '@/lib/poller';

export async function GET() {
  return NextResponse.json({ address: WALLET_ADDRESS });
}

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    
    if (!address || typeof address !== 'string' || address.length < 20) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    // Update global wallet address
    setWalletAddress(address);
    
    // Clear diff engine history & poller cache to start fresh
    clearSession();
    resetPoller();

    return NextResponse.json({ success: true, address });
  } catch (error) {
    console.error('API Error /wallet:', error);
    return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 });
  }
}
