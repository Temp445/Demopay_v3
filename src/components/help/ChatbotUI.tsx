import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Trash2, Bot, User, Loader2 } from 'lucide-react';
import { useHelpStore, ChatMessage } from '../../stores/useHelpStore';
import { helpArticles, HelpArticle, EMPLOYEE_ALLOWED_ARTICLES } from '../../lib/help/helpArticles';
import { useRoleAccess } from '../../hooks/useRoleAccess';

const STOP_WORDS = new Set(['how', 'to', 'do', 'i', 'the', 'a', 'an', 'what', 'where', 'when', 'why', 'is', 'are', 'in', 'on', 'at', 'for', 'of', 'and', 'or', 'can', 'you', 'my', 'me', 'please', 'with', '?']);

function renderHelpArticleToMarkdown(article: HelpArticle): string {
  let redirectHtml = '';
  if (article.relatedPages && article.relatedPages.length > 0) {
    const path = article.relatedPages[0] === '/overview' || article.relatedPages[0] === '/dashboard' 
      ? '/dashboard' 
      : `/dashboard${article.relatedPages[0]}`;
    redirectHtml = `<a href="${path}" style="float: right; font-size: 11px; background: #eef2ff; color: #4f46e5; padding: 4px 8px; border-radius: 6px; text-decoration: none; font-weight: 600; border: 1px solid #c7d2fe; cursor: pointer; margin-left: 10px;"> Navigate to Page ↗</a>`;
  }

  let md = `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;"><div>**${article.title}**</div>${redirectHtml}</div>\n\n`;
  md += `${article.summary}\n\n`;
  
  const linkReplacer = (match: string, label: string, path: string) => `<a href="${path}" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">${label}</a>`;

  for (const block of article.content) {
    if (block.type === 'paragraph') {
      const cleanText = block.text.replace(/\[\[([^|]+)\|([^\]]+)\]\]/g, linkReplacer);
      md += `${cleanText}\n\n`;
    } else if (block.type === 'heading') {
      md += `**${block.text}**\n\n`;
    } else if (block.type === 'list' || block.type === 'steps') {
      for (let i = 0; i < block.items.length; i++) {
        const cleanText = block.items[i].replace(/\[\[([^|]+)\|([^\]]+)\]\]/g, linkReplacer);
        md += block.type === 'steps' ? `${i+1}. ${cleanText}\n` : `- ${cleanText}\n`;
      }
      md += '\n';
    } else if (block.type === 'warning') {
      const cleanText = block.text.replace(/\[\[([^|]+)\|([^\]]+)\]\]/g, linkReplacer);
      md += `⚠️ **Warning:** ${cleanText}\n\n`;
    } else if (block.type === 'tip') {
      const cleanText = block.text.replace(/\[\[([^|]+)\|([^\]]+)\]\]/g, linkReplacer);
      md += `💡 **Tip:** ${cleanText}\n\n`;
    } else if (block.type === 'workflow') {
      md += `**Workflow**: ${block.steps.join(' → ')}\n\n`;
    }
  }
  return md.trim();
}

/**
 * Finds the best matching response entry by scoring keywords against the helpArticles DB.
 */
function getSimulatedResponse(userMessage: string, isEmployee: boolean): string {
  const normalizedUserMessage = userMessage.toLowerCase().trim();
  const rawWords = normalizedUserMessage.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const words = rawWords.filter(w => !STOP_WORDS.has(w));
  
  if (rawWords.length === 0) {
    return _fallbackMessage(isEmployee);
  }

  let bestArticle: HelpArticle | null = null;
  let bestScore = 0;

  for (const article of helpArticles) {
    if (isEmployee && !EMPLOYEE_ALLOWED_ARTICLES.has(article.id)) {
      continue;
    }

    let score = 0;
    
    const titleLower = article.title.toLowerCase();
    const modLower = article.module.toLowerCase();
    
    // 1. Exact or strong phrase matching
    if (normalizedUserMessage === titleLower) score += 50;
    else if (normalizedUserMessage.includes(titleLower)) score += 20;
    
    if (normalizedUserMessage === modLower) score += 30;
    else if (normalizedUserMessage.includes(modLower)) score += 10;

    // 2. Tags matching
    for (const tag of article.tags) {
       const lowerTag = tag.toLowerCase();
       if (normalizedUserMessage === lowerTag) {
           score += 40;
       } else if (normalizedUserMessage.includes(lowerTag)) {
           // Reduce bias for single-word tags matching in large sentences
           const tagWordCount = lowerTag.split(/\s+/).length;
           if (tagWordCount > 1) {
               score += 20;
           } else {
               score += 5;
           }
       }
    }

    // Prepare full searchable text
    let contentText = '';
    for (const block of article.content) {
       if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'warning' || block.type === 'tip') {
           contentText += ' ' + block.text;
       } else if (block.type === 'list' || block.type === 'steps') {
           contentText += ' ' + block.items.join(' ');
       }
    }
    contentText = contentText.toLowerCase();

    const tagText = article.tags.join(' ').toLowerCase();
    const summaryText = article.summary.toLowerCase();
    const fullText = `${titleLower} ${modLower} ${tagText} ${summaryText} ${contentText}`;

    if (fullText.includes(normalizedUserMessage)) {
       score += 15; // Exact user phrase found anywhere
    }

    // 3. Word-by-word intersection scoring
    let matchedWordCount = 0;
    for (const w of words) {
       // Avoid false positive matches on tiny words like "ot" acting as a substring (e.g. inside "not")
       if (w.length < 3) {
           const isStandalone = new RegExp(`\\b${w}\\b`).test(fullText);
           if (!isStandalone) continue;
       }
       
       let wordScore = 0;
       
       if (titleLower.includes(w)) {
           wordScore += 10;
       } else if (tagText.includes(w)) {
           wordScore += 5;
       } else if (summaryText.includes(w)) {
           wordScore += 3;
       } else if (contentText.includes(w)) {
           wordScore += 1;
       }

       if (wordScore > 0) {
           score += wordScore;
           matchedWordCount++;
       }
    }

    // 4. Synergy bonus for matching multiple distinct keywords
    if (matchedWordCount > 1) {
        score += (matchedWordCount * 5);
    }

    if (score > bestScore) {
      bestScore = score;
      bestArticle = article;
    }
  }

  // Require a minimum threshold indicating a meaningful intersection
  if (bestArticle && bestScore >= 5) {
    return renderHelpArticleToMarkdown(bestArticle);
  }

  return _fallbackMessage(isEmployee);
}

function _fallbackMessage(isEmployee: boolean) {
  if (isEmployee) {
    return [
      "I couldn't find an exact answer for that. Try using keywords from the screens, for example:",
      "",
      "- \"how to apply leave\"",
      "- \"request permission\"",
      "- \"how to get advance\"",
      "- \"my work location\""
    ].join('\n');
  }

  return [
    "I couldn't find an exact answer for that. Try using keywords from the screens, for example:",
    "",
    "- \"timestamp mismatch report\"",
    "- \"attendance sync issue\"",
    "- \"shift attendance report\"",
    "- \"report sender settings\"",
    "- \"send payslip\"",
    "- \"auto send payslip\"",
    "- \"how to allocate overtime\"",
    "- \"sync hikvision device\"",
    "- \"add new employee\"",
    "- \"salary formula\"",
    "- \"missing payroll\"",
    "- \"work location assignment\""
  ].join('\n');
}

// ─── Markdown-lite renderer ──────────────────────────────────────────
function renderMessage(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold text **text**
    const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Numbered list
    if (/^\d+\./.test(line)) {
      return (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
          <span style={{ color: '#6366f1', fontWeight: 600, minWidth: '18px' }}>
            {line.match(/^(\d+)\./)?.[1]}.
          </span>
          <span dangerouslySetInnerHTML={{ __html: boldParsed.replace(/^\d+\.\s*/, '') }} />
        </div>
      );
    }
    // Bullet list
    if (/^-/.test(line)) {
      return (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
          <span style={{ color: '#6366f1', fontSize: '10px', marginTop: '3px' }}>●</span>
          <span dangerouslySetInnerHTML={{ __html: boldParsed.replace(/^-\s*/, '') }} />
        </div>
      );
    }
    // Warning prefix ⚠️
    if (line.startsWith('⚠️')) {
      return (
        <div
          key={i}
          style={{
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '6px',
            padding: '6px 10px',
            marginTop: '6px',
            fontSize: '12px',
          }}
          dangerouslySetInnerHTML={{ __html: boldParsed }}
        />
      );
    }
    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
    return <div key={i} dangerouslySetInnerHTML={{ __html: boldParsed }} />;
  });
}

export default function ChatbotUI() {
  const { chatbotMessages, isTyping, addChatMessage, setIsTyping, clearChat, closeHelp } = useHelpStore();
  const { isEmployee } = useRoleAccess();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatbotMessages, isTyping]);

  const handleLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('/')) {
        e.preventDefault();
        closeHelp();
        navigate(href);
      }
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addChatMessage({ role: 'user', content: trimmed });
    setInput('');
    setIsTyping(true);

    // Simulate network latency
    const delay = 800 + Math.random() * 900;
    setTimeout(() => {
      const response = getSimulatedResponse(trimmed, isEmployee);
      addChatMessage({ role: 'assistant', content: response });
      setIsTyping(false);
    }, delay);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const s = styles;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.botAvatar}>
            <Bot size={16} color="#fff" />
          </div>
          <div>
            <div style={s.botName}>Payroll Assistant</div>
            <div style={s.botStatus}>
              <span style={s.statusDot} />
              AI-powered help
            </div>
          </div>
        </div>
        <button
          style={s.clearBtn}
          onClick={clearChat}
          title="Clear conversation"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={s.messagesArea} onClick={handleLinkClick}>
        {chatbotMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
            <div style={s.smallBotAvatar}>
              <Bot size={12} color="#fff" />
            </div>
            <div style={s.typingBubble}>
              <Loader2 size={14} className="animate-spin" style={{ color: '#6366f1' }} />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={s.inputArea}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about payroll, attendance, OT…"
          rows={2}
          style={s.textarea}
        />
        <button
          style={{
            ...s.sendBtn,
            opacity: input.trim() ? 1 : 0.5,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
          }}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          <Send size={16} color="#fff" />
        </button>
      </div>
      <div style={s.hint}>Press Enter to send · Shift+Enter for new line</div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const s = styles;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        marginBottom: '14px',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div style={isUser ? s.userAvatar : s.smallBotAvatar}>
        {isUser ? <User size={12} color="#fff" /> : <Bot size={12} color="#fff" />}
      </div>
      <div
        style={{
          ...s.bubble,
          ...(isUser ? s.userBubble : s.aiBubble),
        }}
      >
        <div style={{ lineHeight: '1.6', fontSize: '13px' }}>
          {isUser ? msg.content : renderMessage(msg.content)}
        </div>
        <div style={s.timestamp}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#f9fafb',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  botAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBotAvatar: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  userAvatar: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  botName: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#111827',
  },
  botStatus: {
    fontSize: '11px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#10b981',
    display: 'inline-block',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  bubble: {
    maxWidth: '78%',
    padding: '10px 14px',
    borderRadius: '12px',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  userBubble: {
    background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
    color: '#fff',
    borderTopRightRadius: '4px',
  },
  aiBubble: {
    background: '#fff',
    color: '#111827',
    border: '1px solid #e5e7eb',
    borderTopLeftRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  typingBubble: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    borderTopLeftRadius: '4px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  timestamp: {
    fontSize: '10px',
    opacity: 0.6,
    marginTop: '4px',
    textAlign: 'right',
  },
  inputArea: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s, transform 0.2s',
    flexShrink: 0,
  },
  hint: {
    fontSize: '10px',
    color: '#9ca3af',
    textAlign: 'center',
    paddingBottom: '8px',
    background: '#fff',
  },
};
