import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Search,
  BookOpen,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Lightbulb,
  Info,
  CheckCircle2,
  Workflow,
  List,
  FileText,
} from 'lucide-react';
import { useHelpStore } from '../../stores/useHelpStore';
import {
  helpArticles,
  HelpArticle,
  ContentBlock,
  getArticlesForPage,
  searchArticles,
} from '../../lib/help/helpArticles';
import ChatbotUI from './ChatbotUI';
import { useRoleAccess } from '../../hooks/useRoleAccess';

// ─── Inline Link Parser ─────────────────────────────────────
// Supports [[label|/href]] syntax anywhere inside text strings.
function parseInlineText(text: string, navigate?: (path: string) => void): React.ReactNode[] {
  const parts = text.split(/(\[\[[^\]]+\|[^\]]+\]\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[\[(.+?)\|(.+?)\]\]$/);
    if (match) {
      const [, label, href] = match;
      return (
        <span
          key={i}
          onClick={() => navigate?.(href)}
          style={{
            color: '#4f46e5',
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
          }}
        >
          {label}
        </span>
      );
    }
    return part;
  });
}

// ─── Content Block Renderer ──────────────────────────────────
function renderBlock(block: ContentBlock, idx: number, navigate?: (path: string) => void) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={idx} style={{ marginBottom: '10px', lineHeight: '1.65', color: '#374151' }}>
          {parseInlineText(block.text, navigate)}
        </p>
      );

    case 'heading':
      return (
        <h4
          key={idx}
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#111827',
            marginTop: '16px',
            marginBottom: '6px',
            borderBottom: '1px solid #f3f4f6',
            paddingBottom: '4px',
          }}
        >
          {block.text}
        </h4>
      );

    case 'list':
      return (
        <ul key={idx} style={{ marginBottom: '10px', paddingLeft: '4px' }}>
          {block.items.map((item, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                marginBottom: '5px',
                fontSize: '13px',
                color: '#374151',
                lineHeight: '1.5',
              }}
            >
              <span style={{ color: '#6366f1', marginTop: '4px', flexShrink: 0 }}>
                <List size={10} />
              </span>
              <span>{parseInlineText(item, navigate)}</span>
            </li>
          ))}
        </ul>
      );

    case 'steps':
      return (
        <ol key={idx} style={{ marginBottom: '10px', paddingLeft: '4px', counterReset: 'step' }}>
          {block.items.map((item, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                marginBottom: '6px',
                fontSize: '13px',
                color: '#374151',
                lineHeight: '1.5',
              }}
            >
              <span
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                {i + 1}
              </span>
              <span>{parseInlineText(item, navigate)}</span>
            </li>
          ))}
        </ol>
      );

    case 'warning':
      return (
        <div
          key={idx}
          style={{
            display: 'flex',
            gap: '10px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '10px',
          }}
        >
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>{parseInlineText(block.text, navigate)}</span>
        </div>
      );

    case 'tip':
      return (
        <div
          key={idx}
          style={{
            display: 'flex',
            gap: '10px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '10px',
          }}
        >
          <Lightbulb size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>{parseInlineText(block.text, navigate)}</span>
        </div>
      );

    case 'workflow':
      return (
        <div key={idx} style={{ marginBottom: '12px' }}>
          {block.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#6366f1',
                    marginTop: '5px',
                  }}
                />
                {i < block.steps.length - 1 && (
                  <div
                    style={{
                      width: '2px',
                      flex: 1,
                      minHeight: '16px',
                      background: 'linear-gradient(to bottom, #6366f1, #e5e7eb)',
                      marginTop: '2px',
                    }}
                  />
                )}
              </div>
              <p
                style={{
                  fontSize: '13px',
                  color: '#374151',
                  lineHeight: '1.5',
                  paddingBottom: i < block.steps.length - 1 ? '8px' : 0,
                }}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      );

    case 'link':
      return (
        <button
          key={idx}
          onClick={() => navigate?.(block.href)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#4f46e5',
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: '6px',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '10px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e0e7ff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#eef2ff'; }}
        >
          ↗ {block.text}
        </button>
      );

    default:
      return null;
  }
}

// ─── Article Card ────────────────────────────────────────────
function ArticleCard({
  article,
  onSelect,
}: {
  article: HelpArticle;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect(article.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        textAlign: 'left',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid',
        borderColor: hovered ? '#c7d2fe' : '#e5e7eb',
        background: hovered ? '#eef2ff' : '#fff',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <FileText size={16} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#111827',
            marginBottom: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {article.title}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#6b7280',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {article.summary}
        </div>
        <span
          style={{
            display: 'inline-block',
            marginTop: '4px',
            background: '#eef2ff',
            color: '#4f46e5',
            borderRadius: '4px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {article.module}
        </span>
      </div>
      <ChevronRight size={14} color={hovered ? '#6366f1' : '#9ca3af'} />
    </button>
  );
}

// ─── Article Reader ───────────────────────────────────────────
function ArticleReader({
  article,
  onBack,
  onAskAI,
}: {
  article: HelpArticle;
  onBack: () => void;
  onAskAI: () => void;
}) {
  const { closeHelp } = useHelpStore();
  const navigate = useNavigate();

  const handleNavLink = (href: string) => {
    closeHelp();
    navigate(href);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6366f1',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <span style={{ color: '#d1d5db' }}>|</span>
        <span
          style={{
            fontSize: '11px',
            background: '#eef2ff',
            color: '#4f46e5',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 600,
          }}
        >
          {article.module}
        </span>
      </div>

      {/* Article content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#111827',
              margin: 0,
            }}
          >
            {article.title}
          </h3>
          {article.relatedPages && article.relatedPages.length > 0 && (
            <button
              onClick={() => handleNavLink(
                article.relatedPages[0] === '/overview' || article.relatedPages[0] === '/dashboard'
                  ? '/dashboard'
                  : `/dashboard${article.relatedPages[0]}`
              )}
              style={{
                background: '#eef2ff',
                color: '#4f46e5',
                border: '1px solid #c7d2fe',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap'
              }}
            >
              Navigate to Page ↗
            </button>
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
          {article.summary}
        </p>
        {article.content.map((block, idx) => renderBlock(block, idx, navigate))}

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
          {article.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '10px',
                background: '#f3f4f6',
                color: '#6b7280',
                borderRadius: '4px',
                padding: '2px 8px',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge Base View ─────────────────────────────────────
function KnowledgeBase({ currentPageContext, isEmployee }: { currentPageContext: string, isEmployee: boolean }) {
  const { searchQuery, setSearchQuery, selectedArticleId, setSelectedArticle, setActiveTab } =
    useHelpStore();

  const contextArticles = getArticlesForPage(currentPageContext, isEmployee);
  const allResults = searchArticles(searchQuery, isEmployee);
  const showContextual = !searchQuery && contextArticles.length > 0;

  const selectedArticle = selectedArticleId
    ? helpArticles.find((a) => a.id === selectedArticleId)
    : null;

  if (selectedArticle) {
    return (
      <ArticleReader
        article={selectedArticle}
        onBack={() => setSelectedArticle(null)}
        onAskAI={() => setActiveTab('chatbot')}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af',
              pointerEvents: 'none',
            }}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search help articles…"
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#fff',
            }}
          />
        </div>
      </div>

      {/* Articles list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {showContextual && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
              }}
            >
              <Info size={13} color="#6366f1" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suggested for this page
              </span>
            </div>
            {contextArticles.map((a) => (
              <ArticleCard key={a.id} article={a} onSelect={setSelectedArticle} />
            ))}
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                margin: '12px 0',
              }}
            />
          </>
        )}

        <div style={{ marginBottom: '10px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {searchQuery ? `Results (${allResults.length})` : 'All Help Articles'}
          </span>
        </div>

        {allResults.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '13px' }}>
            No articles found for "{searchQuery}". Try asking the AI Assistant.
          </div>
        ) : (
          allResults.map((a) => (
            <ArticleCard key={a.id} article={a} onSelect={setSelectedArticle} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main HelpSidebar ─────────────────────────────────────────
export default function HelpSidebar() {
  const { isOpen, activeTab, setActiveTab, closeHelp, currentPageContext } = useHelpStore();
  const { isEmployee } = useRoleAccess();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      setTimeout(() => setMounted(false), 320);
    }
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeHelp}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 9990,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Sidebar Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '380px',
          maxWidth: '95vw',
          background: '#fff',
          zIndex: 9995,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          borderTopLeftRadius: '16px',
          borderBottomLeftRadius: '16px',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={18} color="#fff" />
              <span
                style={{
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '15px',
                  letterSpacing: '0.01em',
                }}
              >
                Help & Support
              </span>
            </div>
            <button
              onClick={closeHelp}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '8px',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} color="#fff" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '3px',
            }}
          >
            {(['knowledge-base', 'chatbot'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  background: activeTab === tab ? '#fff' : 'transparent',
                  color: activeTab === tab ? '#4f46e5' : 'rgba(255,255,255,0.85)',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab === 'knowledge-base' ? (
                  <>
                    <BookOpen size={12} />
                    Knowledge Base
                  </>
                ) : (
                  <>
                    <MessageSquare size={12} />
                    Ask AI
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'knowledge-base' ? (
            <KnowledgeBase currentPageContext={currentPageContext} isEmployee={isEmployee} />
          ) : (
            <ChatbotUI />
          )}
        </div>
      </div>
    </>
  );
}
