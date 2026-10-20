import React from 'react';
import '../styles/LandingPage.css';

interface CodeArenaPageProps {
  onNavigate: (page: string) => void;
}

export const CodeArenaPage: React.FC<CodeArenaPageProps> = ({ onNavigate }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');
  return (
    <div className="ta-page-container">
      <div className="ta-ambient-bg"></div>
      <div className="ta-container" style={{paddingTop: '6rem', minHeight: '80vh', textAlign: 'center'}}>
        <div style={{display: 'inline-block', background: 'rgba(255,107,0,0.1)', color: 'var(--ta-accent-orange)', padding: '6px 16px', borderRadius: '100px', fontSize: '13px', marginBottom: '1.5rem', border: '1px solid rgba(255,107,0,0.2)'}}>Code Arena</div>
        <h1 className="text-hero" style={{fontSize: '48px', marginBottom: '1rem'}}>The Ultimate Problem Set</h1>
        <p className="text-body" style={{maxWidth: '600px', margin: '0 auto 4rem auto'}}>
          Access hundreds of curated interview questions from top tech companies. Filter by difficulty, pattern, and company.
        </p>

        <div className="bento-card" style={{padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0B0F17', border: '1px solid #1C2333'}}>
          <h2 style={{color: '#fff', fontSize: '24px', marginBottom: '1rem'}}>Ready to dive in?</h2>
          <p className="text-body" style={{marginBottom: '2rem'}}>Create a free account to access the full problem library and start tracking your progress.</p>
          <button className="ta-btn-primary ta-btn" onClick={() => onNavigate(isAuthenticated ? 'practice' : 'signup')} style={{padding: '12px 24px'}}>Browse Problems</button>
        </div>
      </div>
    </div>
  );
};
