import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRight,
  ArrowLeft,
  CodeBlock,
  Graph,
  UsersThree,
  ChalkboardTeacher,
  Cpu,
  Presentation,
  VideoCamera,
  MagnifyingGlass,
  Sparkle
} from '@phosphor-icons/react';
import { getScheduledInterviews, type ScheduledInterview } from '../services/roadmapService';
import '../styles/InterviewTypesPage.css';

interface InterviewTypesPageProps {
  onNavigate: (page: string, params?: any) => void;
  /** Logged-in user. When present the page renders its workspace app shell
      (slim top bar, no marketing header/footer) instead of the public page. */
  user?: any;
}

interface InterviewFormat {
  id: string;
  title: string;
  category: 'swe' | 'system' | 'behavioral' | 'pm' | 'ai' | 'discussion';
  desc: string;
  icon: React.ReactNode;
  target: string;
  targetPage: string;
  templateName: string;
  templateId: string;
  duration: string;
  format: string;
  level: 'Advanced' | 'Intermediate' | 'All levels';
}

const levelTone = (level: string) => {
  if (level === 'Advanced') return 'advanced';
  if (level === 'Intermediate') return 'intermediate';
  return 'all';
};

export const InterviewTypesPage: React.FC<InterviewTypesPageProps> = ({ onNavigate, user }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');
  const isWorkspace = Boolean(user);
  const [scheduledInterviews, setScheduledInterviews] = useState<ScheduledInterview[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const displayName = user?.full_name || user?.username || user?.email || 'Candidate';
  const initials = displayName
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  useEffect(() => {
    getScheduledInterviews().then(setScheduledInterviews).catch(console.error);
  }, []);

  const formats: InterviewFormat[] = [
    {
      id: 'dsa',
      title: 'DSA & Coding',
      category: 'swe',
      desc: 'Solve algorithmic challenges with an embedded Monaco editor and real-time AI voice feedback.',
      icon: <CodeBlock size={20} weight="duotone" />,
      target: 'pre-join',
      targetPage: 'dsa-interview',
      templateName: 'DSA & Coding',
      templateId: 'dsa',
      duration: '45 min',
      format: 'Live IDE',
      level: 'Intermediate'
    },
    {
      id: 'system_design',
      title: 'System Design',
      category: 'system',
      desc: 'Architect high-scale distributed systems and discuss trade-offs with an interactive canvas.',
      icon: <Graph size={20} weight="duotone" />,
      target: 'pre-join',
      targetPage: 'system-design-interview',
      templateName: 'System Design',
      templateId: 'system_design',
      duration: '60 min',
      format: 'Whiteboard',
      level: 'Advanced'
    },
    {
      id: 'behavioral',
      title: 'Behavioral & STAR',
      category: 'behavioral',
      desc: 'Practice culture fit, leadership stories, and conflict scenarios with adaptive follow-ups.',
      icon: <UsersThree size={20} weight="duotone" />,
      target: 'pre-join',
      targetPage: 'general-interview',
      templateName: 'Behavioral & HR',
      templateId: 'behavioral',
      duration: '35 min',
      format: 'Voice',
      level: 'All levels'
    },
    {
      id: 'product_management',
      title: 'Product Management',
      category: 'pm',
      desc: 'Practice product strategy, user segmentation, and north-star metric scenarios.',
      icon: <ChalkboardTeacher size={20} weight="duotone" />,
      target: 'pre-join',
      targetPage: 'general-interview',
      templateName: 'Product Management',
      templateId: 'product_management',
      duration: '45 min',
      format: 'Voice',
      level: 'Intermediate'
    },
    {
      id: 'aiml',
      title: 'AI & Machine Learning',
      category: 'ai',
      desc: 'Discuss model architecture, RAG pipelines, training optimizations, and ML infra.',
      icon: <Cpu size={20} weight="duotone" />,
      target: 'pre-join',
      targetPage: 'general-interview',
      templateName: 'AI & Machine Learning',
      templateId: 'aiml',
      duration: '45 min',
      format: 'Voice + Code',
      level: 'Advanced'
    },
    {
      id: 'discussion',
      title: 'Discussion & Decks',
      category: 'discussion',
      desc: 'Present technical slide decks, thesis defenses, or architecture review sessions.',
      icon: <Presentation size={20} weight="duotone" />,
      target: 'discussion',
      targetPage: 'discussion',
      templateName: 'Discussion & Presentation',
      templateId: 'discussion',
      duration: 'Flexible',
      format: 'Slides',
      level: 'All levels'
    }
  ];

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'swe', label: 'DSA & Coding' },
    { id: 'system', label: 'System Design' },
    { id: 'behavioral', label: 'Behavioral' },
    { id: 'pm', label: 'Product' },
    { id: 'ai', label: 'AI & ML' },
    { id: 'discussion', label: 'Case Study' }
  ];

  const filteredFormats = useMemo(() => {
    return formats.filter(f => {
      const matchesCat = selectedCategory === 'all' || f.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        f.title.toLowerCase().includes(q) ||
        f.desc.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className={`itp-root ${isWorkspace ? 'itp-root--workspace' : 'itp-root--public'}`}>
      <div className="itp-ambient-glow" aria-hidden="true" />

      {isWorkspace && (
        <header className="itp-appbar">
          <div className="itp-appbar-inner">
            <div className="itp-appbar-left">
              <button
                type="button"
                className="itp-wordmark"
                onClick={() => onNavigate('dashboard')}
                aria-label="ThinkAloudAI — back to dashboard"
                title="ThinkAloudAI"
              >
                <img src="/logo.png" alt="ThinkAloudAI" className="itp-wordmark-img" />
              </button>
              <span className="itp-appbar-divider" aria-hidden="true" />
              <span className="itp-appbar-crumb">Interview library</span>
            </div>

            <div className="itp-appbar-right">
              <button
                type="button"
                className="itp-back-btn"
                onClick={() => onNavigate('dashboard')}
                aria-label="Back to dashboard"
              >
                <ArrowLeft size={15} weight="bold" />
                <span className="itp-back-label">Back to dashboard</span>
              </button>

              <button
                type="button"
                className="itp-user-btn"
                onClick={() => onNavigate('profile')}
                title={`${displayName} — view profile`}
                aria-label={`${displayName} — view profile`}
              >
                <span className="itp-user-meta">
                  <span className="itp-user-name">{displayName}</span>
                  <span className="itp-user-role">Workspace</span>
                </span>
                <span className="itp-user-avatar">{initials}</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={`itp-container ${isWorkspace ? 'itp-container--workspace' : ''}`}>
        
        {/* HERO SECTION */}
        <section className="itp-hero">
          <div className="itp-hero-pill">
            <Sparkle size={13} weight="fill" />
            <span>AI Voice Interview Simulator</span>
          </div>

          <h1 className="itp-hero-title">
            Choose Your <span className="itp-hero-serif">Interview Track</span>
          </h1>

          <p className="itp-hero-subtitle">
            Practice live technical, architectural, and behavioral rounds with adaptive AI voice feedback.
          </p>
        </section>

        {/* SCHEDULED SESSIONS (IF ANY) */}
        {scheduledInterviews.length > 0 && (
          <section className="itp-scheduled-section">
            <h2 className="itp-section-title">Upcoming Roadmap Interviews</h2>
            <div className="itp-scheduled-grid">
              {scheduledInterviews.map(interview => (
                <div key={interview.id} className="itp-scheduled-card">
                  <div className="itp-scheduled-info">
                    <div className="itp-scheduled-icon">
                      <VideoCamera size={20} weight="duotone" />
                    </div>
                    <div>
                      <h4 className="itp-scheduled-name" title={interview.title}>{interview.title}</h4>
                      <p className="itp-scheduled-meta">From: {interview.roadmap_title}</p>
                    </div>
                  </div>
                  <button 
                    className="itp-btn-join"
                    onClick={() => {
                      const text = `${interview.track_type || ''} ${interview.title || ''} ${interview.category || ''}`.toLowerCase();
                      let targetPage = 'dsa-interview';
                      if (text.includes('system design') || text.includes('system_design')) {
                        targetPage = 'system-design-interview';
                      } else if (
                        text.includes('behavioral') ||
                        text.includes('hr') ||
                        text.includes('general') ||
                        text.includes('pm') ||
                        text.includes('product') ||
                        text.includes('aiml') ||
                        text.includes('ai')
                      ) {
                        targetPage = 'general-interview';
                      }
                      onNavigate('pre-join', { targetPage, templateId: interview.content_id, templateName: interview.title });
                    }}
                  >
                    Join <ArrowRight size={13} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SEARCH & FILTER BAR */}
        <section className="itp-filter-bar">
          <div className="itp-search-box">
            <MagnifyingGlass size={16} className="itp-search-icon" />
            <input 
              type="text" 
              placeholder="Search interview tracks..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="itp-search-input"
            />
          </div>

          <div className="itp-category-pills">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`itp-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={selectedCategory === cat.id}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        {/* COMPACT CARDS GRID */}
        <section className="itp-cards-grid">
          {filteredFormats.map((f) => {
            const handleSelect = () =>
              onNavigate(f.target, { targetPage: f.targetPage, templateId: f.templateId, templateName: f.templateName });

            return (
              <article
                key={f.id}
                className="itp-compact-card"
                onClick={handleSelect}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                  }
                }}
              >
                <div className="itp-card-header">
                  <div className="itp-icon-box">
                    {f.icon}
                  </div>
                  <span className={`itp-level itp-level--${levelTone(f.level)}`}>{f.level}</span>
                </div>

                <h3 className="itp-card-title">{f.title}</h3>
                <p className="itp-card-desc">{f.desc}</p>

                <div className="itp-card-meta">
                  <span className="itp-meta-item">{f.format}</span>
                  <span className="itp-meta-dot" aria-hidden="true" />
                  <span className="itp-meta-item">{f.duration}</span>
                </div>

                <div className="itp-card-footer">
                  <span className="itp-card-cta">
                    Start Interview
                    <ArrowRight size={13} weight="bold" />
                  </span>
                </div>
              </article>
            );
          })}

          {filteredFormats.length === 0 && (
            <div className="itp-empty-state">
              <MagnifyingGlass size={22} weight="duotone" />
              <p>No interview tracks match your search.</p>
              <button
                type="button"
                className="itp-btn-secondary"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        {/* MINIMAL BOTTOM CTA */}
        <section className="itp-minimal-cta">
          <p>Looking for a custom interview scenario or specific job description?</p>
          <button 
            className="itp-btn-secondary"
            onClick={() => onNavigate(isAuthenticated ? 'discussion' : 'signup')}
          >
            Launch Custom Session <ArrowRight size={14} weight="bold" />
          </button>
        </section>

      </div>
    </div>
  );
};

export default InterviewTypesPage;
