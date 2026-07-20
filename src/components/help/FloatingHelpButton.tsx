import React from 'react';
import { HelpCircle, MessageSquare } from 'lucide-react';
import { useHelpStore } from '../../stores/useHelpStore';

export default function FloatingHelpButton() {
  const { isOpen, toggleHelp } = useHelpStore();

  if (isOpen) return null;

  return (
    <button
      id="floating-help-button"
      onClick={toggleHelp}
      title="Help & Support"
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        zIndex: 9999,
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        background: isOpen
          ? 'linear-gradient(135deg, #5b21b6, #7c3aed)'
          : 'linear-gradient(135deg, #2563eb, #4f46e5)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 24px rgba(79,70,229,0.45)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.3s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 6px 30px rgba(79,70,229,0.6)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 4px 24px rgba(79,70,229,0.45)';
      }}
      aria-label="Toggle Help System"
    >
      <MessageSquare
        size={24}
        color="#fff"
        style={{
          transform: isOpen ? 'rotate(15deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease',
        }}
      />
    </button>
  );
}
