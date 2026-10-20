import React from 'react';
import { Sparkles } from 'lucide-react';
import { FeatureShowcase } from '../components/landing/FeatureShowcase';
import { BackgroundBeams } from '../components/landing/BackgroundBeams';
import GradientASCII from '../components/landing/GradientASCII';
import '../styles/LandingPage.css';

interface LandingPageProps {
  onNavigate: (page: string, params?: any) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const userToken = localStorage.getItem('access_token');

  const handleStart = () => {
    if (userToken) {
      onNavigate('dashboard');
    } else {
      onNavigate('signup');
    }
  };

  return (
    <div className="landing-root">
      {/* Animated beams backdrop — curved gradient light streaks sweeping
          behind the whole page */}
      <div className="lp-beams-bg" aria-hidden="true">
        <BackgroundBeams />
      </div>

      <main className="lp-container">
        {/* ============================================================
            HERO SECTION (Editorial Clamped Big-Type + Tactile Textures)
            ============================================================ */}
        <section className="lp-hero">
          <div className="hero-grid">
            {/* Left: headline + neighbours */}
            <div className="hero-copy">
              {/* Eyebrow Pill Badge */}
              <div className="hero-pill-badge">
                <span className="hero-pill-dot" />
                <span className="hero-pill-label">Real-Time Voice AI Interviewing</span>
                <span className="hero-pill-meta">&lt; 500ms WebRTC</span>
              </div>

              {/* Masked Clamped Headline */}
              <h1 className="hero-headline">
                <span className="hero-line-mask">
                  <span className="hero-line-text">Where engineers</span>
                </span>
                <span className="hero-line-mask">
                  <span className="hero-line-text">
                    think <span className="hero-serif-accent">out loud.</span>
                  </span>
                </span>
              </h1>

              <p className="hero-subhead">
                Practice coding, explain your reasoning, and master system design with an AI interviewer built for real engineering interviews.
              </p>

              {/* Luxury CTAs */}
              <div className="hero-ctas">
                <button className="btn-hero-primary" onClick={handleStart}>
                  <span>{userToken ? 'Go to Workspace' : 'Start Mock Interview'}</span>
                  <span className="hero-btn-arrow" aria-hidden="true">↗</span>
                </button>
                <button className="btn-hero-secondary" onClick={() => onNavigate('interview-types')}>
                  <span>Explore Interview Tracks</span>
                  <span className="hero-btn-arrow" aria-hidden="true">↗</span>
                </button>
              </div>
            </div>

            {/* Right: cinematic video demo box (YouTube embed · animated silver frame) */}
            <div className="hero-video-box-wrapper">
              <div className="hero-video-glow" aria-hidden="true" />
              <div className="hero-video-frame">
                <div className="hero-video-inner">
                  <iframe
                    src="https://www.youtube.com/embed/eqOfmtTJD1A"
                    title="ThinkAloudAI — Product Demo"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* ============================================================
            SCROLL-DRIVEN FEATURE STORY
            Each capability reveals itself as the user scrolls
            ============================================================ */}
        <FeatureShowcase onNavigate={onNavigate} />

        {/* ============================================================
            INSPIRING QUOTE TRANSITION
            ============================================================ */}
        <section className="lp-quote-section">
          <div className="lp-quote-inner">
            <span className="lp-quote-spark">
              <Sparkles size={17} />
            </span>
            <p className="lp-quote-large">
              “Interviews don't test memory. They test <span className="lp-quote-serif">structured problem breakdown.</span>”
            </p>
          </div>
        </section>

        {/* ============================================================
            BOTTOM CTA SECTION
            ============================================================ */}
        <section className="lp-cta-section">
          <div className="lp-cta-card">
            <div className="lp-cta-ascii" aria-hidden="true">
              <GradientASCII
                colors={['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8']}
                shape="horizon"
                characters=" =+xX0S8#@"
                cellSize={18}
                density={0.8}
                glyphOpacity={0.85}
                glow={0.2}
                depthOfField={0}
                flicker={0.2}
                softness={0.5}
                scale={1}
                flow={0.5}
                speed={1}
                gradientOpacity={0.9}
                grain={0.08}
                variation={0}
                mouseInteraction
                scrambleRadius={0.1}
                clickEffect="wave"
                intro
                lightMode={false}
              />
            </div>
            <div className="lp-cta-eyebrow-pill">
              <span className="lp-cta-dot" />
              <span>Instant AI Access</span>
              <span className="lp-cta-meta">No Setup Required</span>
            </div>
            <h2 className="lp-cta-title">
              Start your first live mock interview in <span className="lp-cta-accent">60 seconds.</span>
            </h2>
            <p className="lp-cta-desc">
              Join thousands of engineers leveling up their coding, system design, and technical communication with real-time voice feedback.
            </p>

            <div className="lp-cta-buttons">
              <button className="btn-hero-primary lp-cta-btn-large" onClick={handleStart}>
                <span>{userToken ? 'Go to Workspace' : 'Start Mock Interview'}</span>
                <span className="hero-btn-arrow" aria-hidden="true">↗</span>
              </button>
              <button className="btn-hero-secondary lp-cta-btn-large" onClick={() => onNavigate('interview-types')}>
                <span>Explore Interview Tracks</span>
                <span className="hero-btn-arrow" aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;
