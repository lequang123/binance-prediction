'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { TradingSession } from '@/lib/types';
import styles from './stats.module.css';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

interface AiAdvisorPanelProps {
  selectedSession: TradingSession;
  resolvedRounds: number;
  totalRounds: number;
}

const QUICK_PROMPTS = [
  {
    icon: '🎯',
    label: 'Kèo ngon nhất',
    prompt: 'Dựa trên dữ liệu hiện tại, mốc Odds và khoảng phút nào đang có Tỉ lệ thắng (Win Rate) và EV cao nhất để cược Cửa Thuận?',
  },
  {
    icon: '🔄',
    label: 'Cơ hội Đảo Chiều',
    prompt: 'Phân tích các mốc Odds có cơ hội cược Đảo Chiều (Underdog). Mốc nào đang có EV dương và tỉ lệ lật kèo cao?',
  },
  {
    icon: '🛡️',
    label: 'Quản lý vốn & Chuỗi thua',
    prompt: 'Dựa vào chỉ số Max Loss (chuỗi thua liên tiếp) của các mốc, hãy gợi ý cho tôi chiến lược quản lý vốn và chia volume cược an toàn.',
  },
  {
    icon: '⚡',
    label: 'Bẫy giật giây cuối',
    prompt: 'Phân tích tỉ lệ các ca thua sát nút (< $15). Chúng thường diễn ra ở những mốc thời gian nào và có nên né cược ở phút cuối không?',
  },
  {
    icon: '📋',
    label: 'Tổng quan chiến lược',
    prompt: 'Hãy tóm tắt chiến lược tổng thể tối ưu nhất hiện tại: Nên vào lệnh ở mốc nào, tránh mốc nào và cược bao nhiêu % vốn?',
  },
];

export default function AiAdvisorPanel({
  selectedSession,
  resolvedRounds,
  totalRounds,
}: AiAdvisorPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: `Xin chào! Tôi là **AI Advisor** phân tích thị trường Binance Prediction BTC 5m.\n\nTôi đã nạp toàn bộ số liệu thống kê thực tế (${resolvedRounds} kỳ đã resolved). Bạn có thể bấm các câu hỏi gợi ý bên dưới hoặc hỏi bất kỳ câu hỏi nào về chiến lược cược!`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [serverKeyPrefix, setServerKeyPrefix] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if server (Railway or .env.local) has GEMINI_API_KEY configured
  useEffect(() => {
    fetch('/api/ai-advisor')
      .then((r) => r.json())
      .then((d) => {
        if (d?.hasServerKey) {
          setHasServerKey(true);
          setServerKeyPrefix(d.keyPrefix);
        }
      })
      .catch(() => {});
  }, []);

  // Load saved API key & model from localStorage
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('bp_gemini_api_key');
      if (savedKey) setApiKey(savedKey);

      const savedModel = localStorage.getItem('bp_gemini_model');
      if (savedModel) setSelectedModel(savedModel);
    } catch { }
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    try {
      if (key) {
        localStorage.setItem('bp_gemini_api_key', key);
      } else {
        localStorage.removeItem('bp_gemini_api_key');
      }
    } catch { }
  };

  const saveModel = (m: string) => {
    setSelectedModel(m);
    try {
      localStorage.setItem('bp_gemini_model', m);
    } catch { }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);

    try {
      // Chỉ gửi nội dung chat thực tế lên API
      const apiMessages = newHistory
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: apiKey.trim() || undefined,
          session: selectedSession,
          model: selectedModel,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errText = json?.message || 'Có lỗi xảy ra khi gọi AI';
        if (json?.error === 'MISSING_API_KEY') {
          setShowKeyInput(true);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'model',
            content: `⚠️ **Lỗi:** ${errText}`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'model',
          content: json.reply,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          content: `⚠️ **Lỗi kết nối:** ${err?.message || 'Không thể kết nối với server'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'model',
        content: `Đã làm mới cuộc trò chuyện. Bạn muốn phân tích điều gì tiếp theo?`,
        timestamp: Date.now(),
      },
    ]);
  };

  // Helper format markdown đơn giản cho message content
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Bold replace
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} style={{ margin: '12px 0 6px', color: '#fef08a' }} dangerouslySetInnerHTML={{ __html: formatted.replace('### ', '') }} />
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={idx} style={{ margin: '14px 0 8px', color: '#67e8f9' }} dangerouslySetInnerHTML={{ __html: formatted.replace('## ', '') }} />
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} style={{ paddingLeft: '14px', marginBottom: '4px' }}>
            • <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-*]\s+/, '') }} />
          </div>
        );
      }
      if (line.startsWith('|') && line.endsWith('|')) {
        // Simple table line display
        return (
          <div key={idx} style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '3px' }}>
            {line}
          </div>
        );
      }
      return (
        <p key={idx} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    });
  };

  return (
    <div className={styles.aiAdvisorContainer}>
      {/* Top Header & Setting Bar */}
      <div className={styles.aiHeaderBar}>
        <div className={styles.aiHeaderLeft}>
          <span className={styles.aiBadge}>🤖 Gemini 3.6 Flash AI</span>
          <span className={styles.aiDataContext}>
            Đang đọc data: <strong>{resolvedRounds} kỳ đã resolved</strong> ({totalRounds} kỳ chạm odds) • Phiên: <strong>{selectedSession.toUpperCase()}</strong>
          </span>
        </div>

        <div className={styles.aiHeaderRight}>
          {hasServerKey ? (
            <span
              style={{
                fontSize: '11.5px',
                padding: '4px 8px',
                borderRadius: '5px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#86efac',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={`Server đã nhận key: ${serverKeyPrefix || ''}`}
            >
              🟢 Server Key ({serverKeyPrefix || 'OK'})
            </span>
          ) : apiKey ? (
            <span
              style={{
                fontSize: '11.5px',
                padding: '4px 8px',
                borderRadius: '5px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              🔵 Browser Key
            </span>
          ) : (
            <span
              style={{
                fontSize: '11.5px',
                padding: '4px 8px',
                borderRadius: '5px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ⚪ Chưa có Key
            </span>
          )}

          <button
            className={styles.aiSettingBtn}
            onClick={() => setShowKeyInput(!showKeyInput)}
            title="Cài đặt API Key & Model"
          >
            ⚙️ {apiKey ? 'Đổi Key cá nhân' : '🔑 Nhập Key'}
          </button>
          <button
            className={styles.aiClearBtn}
            onClick={clearChat}
            title="Xóa toàn bộ lịch sử hỏi đáp"
          >
            🧹 Xóa chat
          </button>
        </div>
      </div>

      {/* Collapsible Key & Model Setting Box */}
      {showKeyInput && (
        <div className={styles.aiKeyBox}>
          <div className={styles.aiKeyRow}>
            <label className={styles.aiKeyLabel}>Gemini API Key:</label>
            <input
              type="password"
              className={styles.aiKeyInput}
              placeholder="Dán API Key (AIzaSy...) hoặc cấu hình trong .env.local"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
            />
            {apiKey && (
              <button
                className={styles.aiKeyClearBtn}
                onClick={() => saveApiKey('')}
              >
                Xóa Key
              </button>
            )}
          </div>

          <div className={styles.aiKeyRow}>
            <label className={styles.aiKeyLabel}>Model:</label>
            <select
              className={styles.aiModelSelect}
              value={selectedModel}
              onChange={(e) => saveModel(e.target.value)}
            >
              <option value="gemini-3.6-flash">gemini-3.6-flash (Interactions API - Khuyên dùng)</option>
              <option value="gemini-3.7-flash">gemini-3.7-flash</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash</option>
              <option value="gemini-flash-latest">gemini-flash-latest</option>
            </select>
            <span className={styles.aiKeyTip}>
              Lấy API Key miễn phí tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>
            </span>
          </div>
        </div>
      )}

      {/* Quick Strategy Prompts */}
      <div className={styles.aiQuickPrompts}>
        <span className={styles.aiQuickTitle}>💡 Gợi ý nhanh:</span>
        <div className={styles.aiQuickList}>
          {QUICK_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              className={styles.aiQuickBtn}
              onClick={() => handleSend(p.prompt)}
              disabled={loading}
            >
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Scroll Area */}
      <div className={styles.aiChatArea}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${styles.aiMessageWrapper} ${m.role === 'user' ? styles.msgWrapperUser : styles.msgWrapperAi
              }`}
          >
            <div className={styles.aiAvatar}>
              {m.role === 'user' ? '👤' : '🤖'}
            </div>
            <div
              className={`${styles.aiMessageBubble} ${m.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAi
                }`}
            >
              {renderFormattedContent(m.content)}
              <div className={styles.msgTime}>
                {new Date(m.timestamp).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className={`${styles.aiMessageWrapper} ${styles.msgWrapperAi}`}>
            <div className={styles.aiAvatar}>🤖</div>
            <div className={`${styles.aiMessageBubble} ${styles.msgBubbleAi}`}>
              <div className={styles.typingDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span style={{ fontSize: '13px', color: '#94a3b8', marginLeft: '8px' }}>
                Gemini đang đọc dữ liệu thống kê & phân tích...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div className={styles.aiInputBar}>
        <textarea
          ref={textareaRef}
          className={styles.aiTextarea}
          placeholder="Hỏi AI về chiến lược, mốc odds, quản lý vốn... (Nhấn Enter để gửi, Shift+Enter để xuống dòng)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
        />
        <button
          className={styles.aiSendBtn}
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
        >
          {loading ? '⏳' : 'Gửi 🚀'}
        </button>
      </div>
    </div>
  );
}
