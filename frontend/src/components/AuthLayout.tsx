import React from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import '../styles/AuthPages.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  onNavigate?: (page: string) => void;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, onNavigate }) => {
  return (
    <div className="auth-root">
      {/* Background Texture & Ambient Glow */}
      <div className="auth-texture-grid" />
      <div className="auth-ambient-glow" />

      {/* Top Floating/Minimal Bar */}
      <header className="auth-header">
        <div 
          className="auth-brand-logo"
          onClick={() => onNavigate && onNavigate('landing')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onNavigate && onNavigate('landing')}
          aria-label="ThinkAloud.AI Home"
        >
          <img src="/logo.png" alt="ThinkAloud.AI" className="auth-logo-img" />
        </div>

        <button 
          className="auth-back-pill"
          onClick={() => onNavigate && onNavigate('landing')}
          type="button"
        >
          <ArrowLeft size={13} weight="bold" />
          <span>Back</span>
        </button>
      </header>

      {/* Centered Form Area */}
      <main className="auth-main-container">
        <div className="auth-form-wrapper">
          {children}
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="auth-page-footer">
        <div className="auth-footer-copy">
          &copy; {new Date().getFullYear()} ThinkAloud.AI
        </div>
        <div className="auth-footer-links">
          <button type="button" onClick={() => onNavigate && onNavigate('practice')}>Practice</button>
          <span className="auth-footer-sep">&bull;</span>
          <button type="button" onClick={() => onNavigate && onNavigate('roadmaps')}>Roadmaps</button>
          <span className="auth-footer-sep">&bull;</span>
          <button type="button" onClick={() => onNavigate && onNavigate('about')}>About</button>
          <span className="auth-footer-sep">&bull;</span>
          <a href="mailto:support@thinkaloudai.tech">Support</a>
        </div>
      </footer>
    </div>
  );
};

