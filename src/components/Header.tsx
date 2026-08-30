'use client';

import { Activity, Wallet, Clock, Edit2, Check, X } from 'lucide-react';
import type { MarketSnapshot } from '@/lib/types';
import { useState, useEffect, useRef } from 'react';

interface HeaderProps {
  snapshot: MarketSnapshot | null;
  isLive: boolean;
  lastUpdate: number;
  realTrade?: boolean;
  onToggleRealTrade?: (val: boolean) => void;
}

export default function Header({ snapshot, isLive, lastUpdate, realTrade = false, onToggleRealTrade }: HeaderProps) {
  const [wallet, setWallet] = useState<string>('Loading...');
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch initial wallet from API
  useEffect(() => {
    fetch('/api/wallet')
      .then(res => res.json())
      .then(data => {
        if (data.address) {
          setWallet(data.address);
          setInputValue(data.address);
        }
      })
      .catch(err => console.error('Failed to fetch wallet:', err));
  }, []);

  const toggleRealTrade = () => {
    if (onToggleRealTrade) {
      onToggleRealTrade(!realTrade);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setInputValue(wallet);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputValue(wallet);
  };

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || trimmed === wallet) {
      handleCancel();
      return;
    }

    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed }),
      });
      if (res.ok) {
        setWallet(trimmed);
        setIsEditing(false);
      } else {
        alert('Failed to update wallet');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating wallet');
    }
  };

  const truncatedWallet = wallet.length > 20 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;

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

        {isEditing ? (
          <div className="header-wallet-edit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid var(--accent)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: '0.8rem',
                width: '300px'
              }}
            />
            <button onClick={handleSave} style={{ background: 'none', border: 'none', color: 'var(--up)', cursor: 'pointer', padding: 4 }}>
              <Check size={14} />
            </button>
            <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'var(--down)', cursor: 'pointer', padding: 4 }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <span
            className="header-wallet"
            onClick={handleEditClick}
            title="Click to change wallet"
            style={{ cursor: 'pointer' }}
          >
            <Wallet size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {truncatedWallet}
            <Edit2 size={10} style={{ marginLeft: 6, opacity: 0.5 }} />
          </span>
        )}
      </div>
      <div className="header-right">
        <div className="market-info">
          <div className="market-name">{marketTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            <Clock size={12} />
            Last update: {lastUpdateStr}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Toggle Real Trade / Simulator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.05)',
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${realTrade ? 'var(--up)' : 'rgba(255,255,255,0.2)'}`
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: realTrade ? 'var(--up)' : 'var(--text-muted)' }}>
              {realTrade ? 'REAL TRADE' : 'SIMULATOR'}
            </span>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: 34, height: 20 }}>
              <input
                type="checkbox"
                checked={realTrade}
                onChange={toggleRealTrade}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: realTrade ? 'var(--up)' : '#ccc',
                transition: '.4s', borderRadius: 34
              }}>
                <span style={{
                  position: 'absolute', content: '""', height: 14, width: 14, left: 3, bottom: 3,
                  backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                  transform: realTrade ? 'translateX(14px)' : 'translateX(0)'
                }} />
              </span>
            </label>
          </div>

          <div className="live-indicator">
            <span className="live-dot" style={{ background: isLive ? 'var(--up)' : 'var(--down)' }} />
            {isLive ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
      </div>
    </header>
  );
}
