import React from 'react';
import { ArrowLeft } from '@phosphor-icons/react';

interface PageHeaderProps {
  title: string;
  onBack: () => void;
  backLabel?: string;
  rightContent?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, onBack, backLabel = "Back to Dashboard", rightContent }) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 2rem',
      background: 'rgba(9, 10, 14, 0.94)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <button 
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '9999px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '5px 14px',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          }}
        >
          <ArrowLeft size={14} />
          {backLabel}
        </button>
        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.08)' }} />
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.1rem', 
          fontWeight: 600, 
          color: '#ffffff',
          letterSpacing: '-0.02em',
          fontFamily: 'var(--font-sans, "Public Sans", sans-serif)'
        }}>
          {title}
        </h2>
      </div>
      {rightContent && (
        <div>
          {rightContent}
        </div>
      )}
    </header>
  );
};
