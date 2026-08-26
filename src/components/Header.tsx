'use client';

import { Activity, Wallet, Clock } from 'lucide-react';
import type { MarketSnapshot } from '@/lib/types';

interface HeaderProps {
  snapshot: MarketSnapshot | null;
  isLive: boolean;
  lastUpdate: number;
}

const WALLET = '0x6da6cb464f92ae7ad4ec3d239c81719cb1d0ae03';

export default function Header({ snapshot, isLive, lastUpdate }: HeaderProps) {
  const truncatedWallet = `${WALLET.slice(0, 6)}...${WALLET.slice(-4)}`;

  // Parse market title for countdown info
  const marketTitle = snapshot?.marketTitle ?? 'Waiting for data...';

  const lastUpdateStr = lastUpdate
    ? new Date(lastUpdate * 1000).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <Activity size={20} />
          BTC Prediction Tracker
        </div>
        <span className="header-wallet">
          <Wallet size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          {truncatedWallet}
        </span>
      </div>
      <div className="header-right">
        <div className="market-info">
          <div className="market-name">{marketTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            <Clock size={12} />
            Last update: {lastUpdateStr}
          </div>
        </div>
        <div className="live-indicator">
          <span className="live-dot" style={{ background: isLive ? 'var(--up)' : 'var(--down)' }} />
          {isLive ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>
    </header>
  );
}
