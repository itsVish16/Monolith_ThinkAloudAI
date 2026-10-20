import React from 'react';
import { GithubLogo, LinkedinLogo, XLogo, YoutubeLogo } from '@phosphor-icons/react';
import GridDistortion from './landing/GridDistortion';
import { TextHoverEffect } from './velora/text-hover-effect';
import '../styles/Footer.css';

interface FooterProps {
  onNavigate: (page: string) => void;
  currentPage?: string;
}

/* Social profile links — replace href values with the official profiles */
const SOCIAL_LINKS = [
  { label: 'X (Twitter)', href: '#', Icon: XLogo },
  { label: 'GitHub', href: '#', Icon: GithubLogo },
  { label: 'YouTube', href: '#', Icon: YoutubeLogo },
  { label: 'LinkedIn', href: '#', Icon: LinkedinLogo },
];

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="landing-footer" aria-label="Site Footer">
      <div className="footer-shell-wrap">
        <div className="footer-shell">
          <div className="footer-shell-inner">
            {/* Night-sky distortion field — reacts to the pointer */}
            <div className="footer-distortion" aria-hidden="true">
              <GridDistortion
                imageSrc="/textures/night-sky.png"
                grid={15}
                radius={0.18}
                strength={0.15}
                relaxation={0.96}
                mode="drag"
                softness={0}
                chroma={0}
                idle={0.3}
                clickRipple
                intro
              />
            </div>

            <div className="footer-inner">
              {/* Top Grid: Brand Statement + Navigation Columns */}
              <div className="footer-top-grid">
          {/* Brand & Mission */}
          <div className="footer-brand-col">
            <div
              className="footer-logo-btn"
              onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'landing')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate(isAuthenticated ? 'dashboard' : 'landing')}
              title="ThinkAloud.AI Home"
            >
              <img
                src="/logo.png"
                alt="ThinkAloud AI"
                className="footer-logo-img"
              />
            </div>

            <p className="footer-mission-text">
              Real-time voice AI technical interviews with live code synchronization,
              system architecture canvas, and instant post-session performance telemetry.
            </p>

            <div className="footer-status-pill">
              <span className="footer-status-dot" />
              <span className="footer-status-label">LiveKit WebRTC · Sub-500ms Audio</span>
            </div>

            <div className="footer-social-row">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  className="footer-social-btn"
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  aria-label={label}
                  title={label}
                >
                  <Icon weight="bold" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Column: Tracks */}
          <nav className="footer-nav-col" aria-label="Tracks">
            <span className="footer-col-heading">Tracks</span>
            <ul className="footer-link-list">
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate('interview-types')}>
                  Mock Interviews
                </button>
              </li>
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate('practice')}>
                  DSA Practice
                </button>
              </li>
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate('roadmaps')}>
                  Roadmaps
                </button>
              </li>
            </ul>
          </nav>

          {/* Column: Platform */}
          <nav className="footer-nav-col" aria-label="Platform">
            <span className="footer-col-heading">Platform</span>
            <ul className="footer-link-list">
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}>
                  {isAuthenticated ? 'Candidate Workspace' : 'Log In'}
                </button>
              </li>
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate(isAuthenticated ? 'profile' : 'signup')}>
                  {isAuthenticated ? 'Profile & Achievements' : 'Create Free Account'}
                </button>
              </li>
            </ul>
          </nav>

          {/* Column: Company */}
          <nav className="footer-nav-col" aria-label="Company">
            <span className="footer-col-heading">Company</span>
            <ul className="footer-link-list">
              <li>
                <button className="footer-nav-item" onClick={() => onNavigate('about')}>
                  Architecture &amp; About
                </button>
              </li>
            </ul>
          </nav>
        </div>

        {/* Giant Wordmark — draws in on load, glows in brand colours
            under the pointer */}
        <TextHoverEffect text="THINKALOUD.AI" className="footer-wordmark-svg" />

        {/* Bottom Bar */}
        <div className="footer-bottom-bar">
          <div className="footer-meta-left">
            <span>© {new Date().getFullYear()} ThinkAloud.AI</span>
            <span className="footer-meta-sep">/</span>
            <span>Built for engineering interview excellence</span>
          </div>

          <div className="footer-meta-right">
            <button
              type="button"
              className="footer-back-to-top-btn"
              onClick={scrollToTop}
              aria-label="Back to top"
              title="Back to top"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </footer>
  );
};
