import React, { useState, useEffect, useRef } from 'react';
import '../styles/Header.css';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string, params?: any) => void;
  user: any;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  user,
  onLogout,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = Boolean(
    (user?.role && user.role.toLowerCase() === 'admin') ||
    (user?.is_admin === true) ||
    (user?.email && adminEmails.includes(user.email.toLowerCase()))
  );

  const handleNav = (page: string, params?: any) => {
    setMobileMenuOpen(false);
    setShowProfileMenu(false);
    onNavigate(page, params);
  };

  const getInitial = () => {
    if (user?.username) return user.username.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <header className={`app-header ${isScrolled ? 'scrolled' : ''}`}>
      <div className="header-container">
        {/* Brand Logo Only (Clean image, no extra text or pills) */}
        <div 
          className="header-logo" 
          onClick={() => handleNav(user ? 'dashboard' : 'landing')}
          title="ThinkAloud.AI Home"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleNav(user ? 'dashboard' : 'landing')}
        >
          <img 
            src="/logo.png" 
            alt="ThinkAloud AI" 
            className="header-logo-img" 
          />
        </div>

        {/* Central Clean Navigation */}
        <nav className="desktop-nav" aria-label="Main Navigation">
          <button
            className={`nav-link ${currentPage === 'interview-types' ? 'active' : ''}`}
            onClick={() => handleNav('interview-types')}
          >
            Interviews
          </button>
          <button
            className={`nav-link ${currentPage === 'practice' ? 'active' : ''}`}
            onClick={() => handleNav('practice')}
          >
            DSA Practice
          </button>
          <button
            className={`nav-link ${currentPage === 'roadmaps' ? 'active' : ''}`}
            onClick={() => handleNav('roadmaps')}
          >
            Roadmaps
          </button>
          <button
            className={`nav-link ${currentPage === 'about' ? 'active' : ''}`}
            onClick={() => handleNav('about')}
          >
            About
          </button>
        </nav>

        {/* Header Actions (Auth / Profile) */}
        <div className="header-actions">
          {user ? (
            <div className="header-profile-wrapper" ref={profileMenuRef}>
              {/* Minimalist Avatar Trigger */}
              <button
                className="header-avatar-btn"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                title="Account Menu"
                aria-label="User Profile Menu"
              >
                <span className="header-avatar-letter">{getInitial()}</span>
                <span className="header-avatar-status" />
              </button>

              {/* Obsidian Glass Profile Dropdown */}
              {showProfileMenu && (
                <div className="header-profile-dropdown" role="menu">
                  <div className="dropdown-user-header">
                    <div className="dropdown-user-avatar">
                      {getInitial()}
                    </div>
                    <div className="dropdown-user-details">
                      <span className="dropdown-user-name">{user.username || 'Candidate'}</span>
                      <span className="dropdown-user-email" title={user.email}>{user.email || 'candidate@thinkaloud.ai'}</span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    className="dropdown-item"
                    onClick={() => handleNav('dashboard')}
                    role="menuitem"
                  >
                    <div className="dropdown-item-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                      </svg>
                    </div>
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-title">Dashboard</span>
                      <span className="dropdown-item-subtitle">Interview workspace &amp; stats</span>
                    </div>
                  </button>

                  <button
                    className="dropdown-item"
                    onClick={() => handleNav('profile')}
                    role="menuitem"
                  >
                    <div className="dropdown-item-icon">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-title">Profile Settings</span>
                      <span className="dropdown-item-subtitle">DSA heatmaps &amp; achievements</span>
                    </div>
                  </button>

                  {isAdmin && (
                    <button
                      className="dropdown-item dropdown-item-admin"
                      onClick={() => handleNav('admin')}
                      role="menuitem"
                    >
                      <div className="dropdown-item-icon text-amber-400">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </div>
                      <div className="dropdown-item-text">
                        <span className="dropdown-item-title text-amber-400">Admin Console</span>
                        <span className="dropdown-item-subtitle">Problems &amp; system metrics</span>
                      </div>
                    </button>
                  )}

                  <div className="dropdown-divider" />

                  <button
                    className="dropdown-item dropdown-item-logout"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onLogout();
                    }}
                    role="menuitem"
                  >
                    <div className="dropdown-item-icon text-red-400">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </div>
                    <div className="dropdown-item-text">
                      <span className="dropdown-item-title text-red-400">Log Out</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="header-auth-group">
              <button
                className="btn-login-ghost"
                onClick={() => handleNav('login')}
              >
                Log in
              </button>
              <button
                className="btn-cta-luxury"
                onClick={() => handleNav('signup')}
              >
                <span>Get Started</span>
                <span className="btn-cta-arrow" aria-hidden="true">↗</span>
              </button>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button 
            className="mobile-menu-btn md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation drawer"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 8h16M4 16h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <div className="mobile-nav-links">
            <button 
              className={`mobile-nav-link ${currentPage === 'interview-types' ? 'active' : ''}`} 
              onClick={() => handleNav('interview-types')}
            >
              <span>Interviews</span>
              <span className="mobile-nav-arrow">→</span>
            </button>
            <button 
              className={`mobile-nav-link ${currentPage === 'practice' ? 'active' : ''}`} 
              onClick={() => handleNav('practice')}
            >
              <span>DSA Practice</span>
              <span className="mobile-nav-arrow">→</span>
            </button>
            <button 
              className={`mobile-nav-link ${currentPage === 'roadmaps' ? 'active' : ''}`} 
              onClick={() => handleNav('roadmaps')}
            >
              <span>Roadmaps</span>
              <span className="mobile-nav-arrow">→</span>
            </button>
            <button 
              className={`mobile-nav-link ${currentPage === 'about' ? 'active' : ''}`} 
              onClick={() => handleNav('about')}
            >
              <span>About</span>
              <span className="mobile-nav-arrow">→</span>
            </button>
          </div>

          <div className="mobile-drawer-divider" />

          {user ? (
            <div className="mobile-user-section">
              <button className="mobile-nav-link" onClick={() => handleNav('dashboard')}>
                <span>Go to Dashboard</span>
                <span className="mobile-nav-arrow">→</span>
              </button>
              <button className="mobile-nav-link" onClick={() => handleNav('profile')}>
                <span>Profile Settings</span>
                <span className="mobile-nav-arrow">→</span>
              </button>
              {isAdmin && (
                <button className="mobile-nav-link text-amber-400" onClick={() => handleNav('admin')}>
                  <span>Admin Console</span>
                  <span className="mobile-nav-arrow">→</span>
                </button>
              )}
              <button className="mobile-nav-link text-red-400" onClick={() => { setMobileMenuOpen(false); onLogout(); }}>
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <div className="mobile-auth-section">
              <button className="mobile-btn-login" onClick={() => handleNav('login')}>
                Log In
              </button>
              <button className="mobile-btn-signup" onClick={() => handleNav('signup')}>
                <span>Get Started Free</span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
