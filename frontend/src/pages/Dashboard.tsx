import React, { useState, useRef, useEffect } from 'react';
import { 
  House as HomeIcon,
  CodeBlock,
  Users,
  Lightning,
  MagnifyingGlass,
  Sparkle,
  CheckCircle,
  CaretRight,
  Code,
  Play,
  Clock,
  Plus as PlusSign,
  ArrowRight,
  FileText,
  Info,
  Graph,
  Cpu,
  Presentation,
  List as ListIcon
} from '@phosphor-icons/react';

import { dsaQuestions, type Question } from '../data/dsaQuestions';
import { DashboardOverview } from './DashboardOverview';
import { WorkspaceSidebar } from '../components/dashboard/WorkspaceSidebar';
import { 
  getInterviewTypes, 
  getInterviewAnalytics, 
  getMyInterviews, 
  getUserSkills, 
  getUserActivity, 
  type APIInterviewType 
} from '../services/interviewService';
import '../styles/Dashboard.css';
import { 
  getDSAQuestions, 
  getDSAProfileStats, 
  getUserProblemStatus, 
  getRecommendations 
} from '../services/dsaService';
import { getSessions, deleteSession } from '../services/chatService';
import { getRoadmaps, deleteRoadmap, type Roadmap } from '../services/roadmapService';
import { RoadmapViewer } from '../components/chat/RoadmapViewer';
import { generateLanggraphToken, getUserProfile } from '../services/langgraphService';

const RoadmapsPage = React.lazy(() => import('./RoadmapsPage'));
const ChatScreen = React.lazy(() => import('../components/chat/ChatScreen').then(m => ({ default: m.ChatScreen })));

// Mock data removed, replaced with live fetched state inside component

const getInterviewPresetMeta = (template: APIInterviewType) => {
  const id = template.id.toLowerCase();
  const name = template.name.toLowerCase();

  if (id.includes('dsa') || id.includes('swe') || name.includes('coding') || name.includes('dsa')) {
    return {
      toneClass: 'coding-preset',
      label: 'Coding Round',
      duration: '45 mins',
      format: 'IDE + Voice',
      focus: 'Algorithms',
    };
  }

  if (id.includes('system') || id.includes('sd') || name.includes('system')) {
    return {
      toneClass: 'system-preset',
      label: 'Design Round',
      duration: '60 mins',
      format: 'Whiteboard',
      focus: 'Architecture',
    };
  }

  return {
    toneClass: 'behavioral-preset',
    label: 'Mock Round',
    duration: '35 mins',
    format: 'Video + Voice',
    focus: 'Communication',
  };
};

const InterviewCard = ({ children, onClick }: any) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y / rect.height) - 0.5) * -6;
    const rotateY = ((x / rect.width) - 0.5) * 6;
    cardRef.current.style.transform = `translateY(-4px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'translateY(0) rotateX(0) rotateY(0)';
  };

  return (
    <div 
      className="int-card" 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className="int-sheen"></div>
      {children}
    </div>
  );
};

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
}

export interface ChatHistory {
  id: string;
  title: string;
  messages: Message[];
  created_at?: string;
}

interface DashboardProps {
  onNavigate: (page: string, params?: { questionId?: string; templateId?: string; templateName?: string; targetPage?: string; sessionId?: string; }) => void;
  user: any | null;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user, onLogout }) => {
  // Navigation section
  const [activeSection, setActiveSection] = useState<'home' | 'chat' | 'practice' | 'interview' | 'schedules' | 'progress'>('home');
  
  // Profile State
  const [langgraphProfile, setLanggraphProfile] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [dynamicTemplates, setDynamicTemplates] = useState<APIInterviewType[]>([]);
  
  // Dynamic Analytics State
  const [trendsData, setTrendsData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [radarData, setRadarData] = useState<any[]>([]);
  
  // Analytics initial fetch effect
  useEffect(() => {
    const fetchAnalytics = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const [overviewResult, skillsResult, activityResult] = await Promise.allSettled([
            getInterviewAnalytics(token),
            getUserSkills(token),
            getUserActivity(token, 30),
          ]);

          if (overviewResult.status === 'fulfilled') {
            const data = overviewResult.value;
            setTrendsData(data.trendsData || []);
            setCategoryData(data.categoryData || []);
            if (data.weeklyData) setWeeklyData(data.weeklyData);
            if (data.radarData) setRadarData(data.radarData);
          }

          if (skillsResult.status === 'fulfilled' && skillsResult.value?.radar_data) {
            setRadarData(skillsResult.value.radar_data);
          }

          if (activityResult.status === 'fulfilled' && activityResult.value?.activities) {
            setWeeklyData(activityResult.value.activities);
          }
        } catch (e) {
          console.error("Failed to fetch analytics:", e);
        }
      }
    };
    fetchAnalytics();
  }, [user]);

  useEffect(() => {
    getInterviewTypes()
      .then(data => setDynamicTemplates(data))
      .catch(err => console.error("Failed to load interview types", err));
  }, []);

  useEffect(() => {
    if (user?.email) {
      setIsProfileLoading(true);
      const token = localStorage.getItem('access_token');
      if (token) {
        getDSAProfileStats(token)
          .then(data => setLanggraphProfile(data))
          .catch(err => console.error("Failed to load profile", err))
          .finally(() => setIsProfileLoading(false));
      } else {
        setIsProfileLoading(false);
      }
    }
  }, [activeSection, user]);
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = Boolean(
    (user?.role && user.role.toLowerCase() === 'admin') ||
    (user?.is_admin === true) ||
    (user?.email && adminEmails.includes(user.email.toLowerCase()))
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat interface states
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer with Escape
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);


  // DSA Questions State
  const [apiQuestions, setApiQuestions] = useState<Question[]>([]);
  const [solvedProblemIds, setSolvedProblemIds] = useState<Set<string>>(new Set());
  const [recommendedProblems, setRecommendedProblems] = useState<any[]>([]);
  const [isLoadingDSA, setIsLoadingDSA] = useState(true);

  // Fetch DSA questions on mount
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const token = localStorage.getItem('access_token');
        const [data, statusData, recData] = await Promise.all([
          getDSAQuestions(),
          token ? getUserProblemStatus(token).catch(() => []) : Promise.resolve([]),
          token ? getRecommendations(token).catch(() => []) : Promise.resolve([])
        ]);

        const mapped: Question[] = data.map(q => ({
          id: q.id.toString(),
          title: q.title,
          difficulty: q.difficulty as any,
          category: q.category || 'Algorithms',
          acceptance: 'N/A',
          timeLimit: '2.0s',
          memoryLimit: '256MB',
          description: q.description,
          starterCode: { javascript: '', python: q.python_starter_code || '', cpp: q.cpp_starter_code || '', java: '' },
          testCases: [],
          hints: q.hints ? [q.hints] : [],
          optimalComplexity: { time: q.optimal_time_complexity || 'O(N)', space: q.optimal_space_complexity || 'O(1)' }
        }));
        setApiQuestions(mapped);
        
        const solvedSet = new Set<string>();
        const solvedList = Array.isArray(statusData)
          ? statusData
          : (Array.isArray(statusData?.solved_questions) ? statusData.solved_questions : []);
        solvedList.forEach((q: any) => {
          const qId = q.question_id ?? q.id ?? q;
          if (qId !== undefined && qId !== null) {
            solvedSet.add(qId.toString());
          }
        });
        setSolvedProblemIds(solvedSet);
        setRecommendedProblems(recData || []);
      } catch (err) {
        console.error("Failed to load DSA questions", err);
        setApiQuestions(dsaQuestions); // Fallback
      } finally {
        setIsLoadingDSA(false);
      }
    }
    fetchQuestions();
  }, []);

  // Fetch roadmaps when schedules tab is selected or on mount
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  
  const fetchRoadmapsData = async () => {
    try {
      const data = await getRoadmaps();
      setRoadmaps(data);
    } catch (err) {
      console.error("Failed to load roadmaps", err);
    }
  };

  useEffect(() => {
    fetchRoadmapsData();
  }, []);

  useEffect(() => {
    if (activeSection === 'schedules') {
      fetchRoadmapsData();
    }
  }, [activeSection]);

  // Fetch sessions on mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessionsData = await getSessions();
        if (sessionsData.length > 0) {
          const formattedChats: ChatHistory[] = sessionsData.map(s => ({
            id: s.id,
            title: s.title || `Chat ${s.id.substring(0, 6)}`,
            messages: [],
            created_at: s.created_at
          }));
          setChats(formattedChats);
          setActiveChatId(null);
        } else {
          setActiveChatId(null);
        }
      } catch (error) {
        console.error("Failed to load sessions", error);
        setActiveChatId(null);
      }
    };
    fetchSessions();
  }, []);



  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats]);

  // Practice filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');


  const handleNewChat = () => {
    setMobileNavOpen(false);
    setActiveChatId(null);
    setActiveSection('chat');
  };

  const handleRenameChat = (chatId: string, newTitle: string) => {
    setChats(prev => {
      const exists = prev.find(c => c.id === chatId);
      if (exists) {
        return prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c);
      }
      // If it doesn't exist (new chat just created), add it to the list
      return [{ id: chatId, title: newTitle, messages: [], created_at: new Date().toISOString() }, ...prev];
    });
    
    // Automatically select the new chat in the sidebar if we just started it
    if (!activeChatId) {
      setActiveChatId(chatId);
    }
  };

  const handleSelectChat = (chatId: string) => {
    setMobileNavOpen(false);
    setActiveChatId(chatId);
    setActiveSection('chat');
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    try {
      await deleteSession(chatId);
      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);
      if (activeChatId === chatId && updatedChats.length > 0) {
        setActiveChatId(updatedChats[0].id);
      } else if (updatedChats.length === 0) {
        handleNewChat();
      }
    } catch (error) {
      console.error("Failed to delete session", error);
    }
  };

  const triggerLogout = () => {
    onLogout();
    onNavigate('landing');
  };

  // Filter and group practice questions
  const filteredQuestions = apiQuestions.filter(q => {
    const title = (q.title || '').toLowerCase();
    const category = (q.category || 'Algorithms').toLowerCase();
    const query = searchTerm.toLowerCase();
    const matchesSearch = title.includes(query) || category.includes(query);
    const matchesDiff = difficultyFilter === 'All' || q.difficulty === difficultyFilter;
    return matchesSearch && matchesDiff;
  });

  const categories = filteredQuestions.reduce((acc: Record<string, Question[]>, q) => {
    const cat = q.category || 'Algorithms';
    if (!acc[cat]) {
      acc[cat] = [];
    }
    acc[cat].push(q);
    return acc;
  }, {});

  const [pastInterviews, setPastInterviews] = useState<any[]>([]);
  useEffect(() => {
    async function fetchInterviews() {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      try {
        const data = await getMyInterviews(token);
        setPastInterviews(data);
      } catch (e) {
        console.error("Failed to load past interviews", e);
      }
    }
    fetchInterviews();
  }, []);

  const handleSectionSwitch = (section: 'home' | 'chat' | 'practice' | 'interview' | 'schedules' | 'progress') => {
    setMobileNavOpen(false);
    setActiveSection(section);
  };

  const mobileInitials = (user?.full_name || user?.username || 'Candidate')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="dashboard-workspace dark">
      {/* Mobile top bar: opens the navigation drawer */}
      <header className="dashboard-mobile-bar">
        <button
          type="button"
          className="dmb-icon-btn"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <ListIcon size={20} />
        </button>
        <img src="/logo.png" alt="ThinkAloud.AI" className="dmb-logo" />
        <button
          type="button"
          className="dmb-avatar"
          aria-label="Open profile"
          onClick={() => onNavigate('profile')}
        >
          {mobileInitials}
        </button>
      </header>

      <WorkspaceSidebar
        user={user}
        isAdmin={isAdmin}
        activeSection={activeSection}
        activeChatId={activeChatId}
        chats={chats}
        onSectionSwitch={handleSectionSwitch}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleNewChat}
        onNavigate={(page, params) => {
          setMobileNavOpen(false);
          onNavigate(page, params);
        }}
        onLogout={() => {
          setMobileNavOpen(false);
          triggerLogout();
        }}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* 2. CHAT HISTORY DRAWER removed entirely as it's now integrated */}

      <main className="workspace-main-content">
        <React.Suspense fallback={<div className="workspace-loading-state">Loading panel...</div>}>
        {activeSection === 'home' && (
          <DashboardOverview
            user={user}
            langgraphProfile={langgraphProfile}
            onNavigate={(dest, params) => {
              if (params?.questionId) {
                onNavigate('practice', params);
              } else if (['home', 'chat', 'practice', 'interview', 'schedules', 'progress'].includes(dest)) {
                setActiveSection(dest as any);
              } else {
                onNavigate(dest, params);
              }
            }}
            onSelectSection={(sec) => setActiveSection(sec as any)}
          />
        )}

        {/* PANEL 1: AI Chat Assistant */}
        {activeSection === 'chat' && (
          <ChatScreen sessionId={activeChatId} onNavigate={onNavigate} onRenameChat={handleRenameChat} />
        )}

        {/* PANEL 2: Practice Arena */}
        {activeSection === 'practice' && (
          <div className="workspace-panel-container">
            <div className="panel-header-section">
              <div>
                <h2>Practice Arena</h2>
                <p>Sharpen your skills across essential Data Structures and Algorithms modules.</p>
              </div>
              <div className="streak-tag-badge">
                <Lightning size={14} className="streak-icon" />
                <span>{langgraphProfile?.current_streak ?? langgraphProfile?.stats?.current_streak ?? 0} Day{(langgraphProfile?.current_streak ?? langgraphProfile?.stats?.current_streak ?? 0) === 1 ? '' : 's'} Streak</span>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="practice-filters-row">
              <div className="search-bar-wrapper">
                <MagnifyingGlass size={16} />
                <input 
                  type="text" 
                  placeholder="Search questions..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="filter-select-group">
                <span className="lbl">Difficulty:</span>
                <div className="difficulty-tabs-wrapper">
                  {['All', 'Easy', 'Medium', 'Hard'].map((diff) => (
                    <button
                      key={diff}
                      className={`diff-tab-btn ${difficultyFilter === diff ? 'active' : ''}`}
                      onClick={() => setDifficultyFilter(diff)}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Practice Categories */}
            <div className="panel-content-scroller">
              <div className="categories-list">
                {isLoadingDSA ? (
                  <div className="practice-loading-state">Loading practice questions...</div>
                ) : (
                  <>
                    {/* Recommendations Section */}
                    {recommendedProblems.length > 0 && searchTerm === '' && difficultyFilter === 'All' && (
                      <div className="category-group is-recommended">
                        <h3 className="category-title is-ai">
                          <Sparkle size={16} /> AI Recommended For You
                        </h3>
                        <div className="questions-grid">
                          {recommendedProblems.map((q) => {
                            const qId = q.question_id ?? q.id;
                            if (qId === undefined || qId === null) return null;
                            const fullQuestion = apiQuestions.find(aq => String(aq.id) === String(qId)) || (q.title ? q : null);
                            if (!fullQuestion) return null;
                            const diff = (fullQuestion.difficulty || 'Easy').toLowerCase();
                            const isSolved = solvedProblemIds.has(String(qId));
                            return (
                              <div key={`rec-${qId}`} className="question-list-item is-recommended">
                                <div className="q-info-block">
                                  {isSolved ? (
                                    <CheckCircle size={18} color="#00D084" className="q-solved-icon" />
                                  ) : (
                                    <CheckCircle size={18} className="q-solved-icon" />
                                  )}
                                  <div className="q-title-details">
                                    <span className="q-title">{fullQuestion.title || 'Algorithmic Challenge'}</span>
                                    <div className="q-metadata">
                                      <span className={`badge badge-${diff}`}>
                                        {fullQuestion.difficulty || 'Easy'}
                                      </span>
                                      <span className="dot-divider">•</span>
                                      <span className="q-meta-item is-ai">{q.reason || 'Curated recommendation'}</span>
                                    </div>
                                  </div>
                                </div>
                                <button 
                                  className="btn-q-action is-ai"
                                  onClick={() => onNavigate('practice', { questionId: String(qId) })}
                                >
                                  <span>Launch Code</span>
                                  <CaretRight size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {Object.keys(categories).length === 0 ? (
                      <div className="premium-empty-state">
                        <div className="premium-empty-icon">
                          <Code size={40} />
                        </div>
                        <p>No coding challenges matched your filters.</p>
                        <button className="btn-clear-filters" onClick={() => { setSearchTerm(''); setDifficultyFilter('All'); }}>Clear Filters</button>
                      </div>
                    ) : (
                      Object.entries(categories).map(([categoryName, questions]) => (
                        <div key={categoryName} className="category-group">
                          <h3 className="category-title">{categoryName}</h3>
                          <div className="questions-grid">
                            {questions.map((q) => {
                              const qId = q.id;
                              const diff = (q.difficulty || 'Easy').toLowerCase();
                              const isSolved = solvedProblemIds.has(String(qId));
                              return (
                                <div key={String(qId)} className="question-list-item">
                                  <div className="q-info-block">
                                    {isSolved ? (
                                      <CheckCircle size={18} color="#00D084" className="q-solved-icon" />
                                    ) : (
                                      <CheckCircle size={18} className="q-solved-icon" />
                                    )}
                                    <div className="q-title-details">
                                      <span className="q-title">{q.title}</span>
                                      <div className="q-metadata">
                                        <span className={`badge badge-${diff}`}>
                                          {q.difficulty || 'Easy'}
                                        </span>
                                        <span className="dot-divider">•</span>
                                        <span className="q-meta-item">Acceptance: {q.acceptance || 'N/A'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <button 
                                    className="btn-q-action"
                                    onClick={() => onNavigate('practice', { questionId: String(qId) })}
                                  >
                                    <span>Launch Code</span>
                                    <CaretRight size={14} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PANEL 3: AI Interview Simulator */}
        {activeSection === 'interview' && (
          <div className="workspace-panel-container">
            <div className="panel-header-section interview-panel-header">
              <div>
                <h2>Mock Interviews</h2>
                <p>Choose an interview track to start your AI voice practice session.</p>
              </div>
              <button className="interview-header-action" onClick={() => onNavigate('discussion')}>
                <PlusSign size={15} />
                <span>Custom Session</span>
              </button>
            </div>

            <div className="panel-content-scroller">
              {/* Compact Minimalist Grid */}
              <div className="compact-int-grid">
                {/* 1. DSA */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('pre-join', { targetPage: 'dsa-interview', templateId: 'dsa', templateName: 'DSA & Coding' })}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <CodeBlock size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Live IDE</span>
                      <span className="cic-pill cic-duration">45 min</span>
                    </div>
                  </div>
                  <h3 className="cic-title">DSA &amp; Coding</h3>
                  <p className="cic-desc">Solve algorithmic challenges with an embedded Monaco editor and real-time voice feedback.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>

                {/* 2. System Design */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('pre-join', { targetPage: 'system-design-interview', templateId: 'system_design', templateName: 'System Design' })}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <Graph size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Whiteboard</span>
                      <span className="cic-pill cic-duration">60 min</span>
                    </div>
                  </div>
                  <h3 className="cic-title">System Design</h3>
                  <p className="cic-desc">Architect scalable systems and discuss trade-offs with an interactive diagramming canvas.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>

                {/* 3. Behavioral & STAR */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('pre-join', { targetPage: 'general-interview', templateId: 'behavioral', templateName: 'Behavioral & HR' })}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <Users size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Voice</span>
                      <span className="cic-pill cic-duration">35 min</span>
                    </div>
                  </div>
                  <h3 className="cic-title">Behavioral &amp; HR</h3>
                  <p className="cic-desc">Practice STAR method responses and cultural fit questions with realistic follow-ups.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>

                {/* 4. Product Management */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('pre-join', { targetPage: 'general-interview', templateId: 'product_management', templateName: 'Product Management' })}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <FileText size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Voice</span>
                      <span className="cic-pill cic-duration">45 min</span>
                    </div>
                  </div>
                  <h3 className="cic-title">Product Management</h3>
                  <p className="cic-desc">Practice product strategy, user segmentation, and north-star metric scenarios.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>

                {/* 5. AI & Machine Learning */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('pre-join', { targetPage: 'general-interview', templateId: 'aiml', templateName: 'AI & Machine Learning' })}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <Cpu size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Voice + Code</span>
                      <span className="cic-pill cic-duration">45 min</span>
                    </div>
                  </div>
                  <h3 className="cic-title">AI &amp; Machine Learning</h3>
                  <p className="cic-desc">Discuss model architecture, RAG pipelines, training optimizations, and ML infra.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>

                {/* 6. Discussion */}
                <div 
                  className="compact-int-card"
                  onClick={() => onNavigate('discussion')}
                >
                  <div className="cic-head">
                    <div className="cic-icon-box">
                      <Presentation size={20} weight="duotone" />
                    </div>
                    <div className="cic-pills">
                      <span className="cic-pill">Slides</span>
                      <span className="cic-pill cic-duration">Flexible</span>
                    </div>
                  </div>
                  <h3 className="cic-title">Discussion &amp; Decks</h3>
                  <p className="cic-desc">Present technical slide decks, thesis defenses, or architecture review sessions.</p>
                  <div className="cic-footer">
                    <span className="cic-action-text">Start Interview</span>
                    <ArrowRight size={14} className="cic-arrow" />
                  </div>
                </div>
              </div>

              {/* Past Sessions Logs */}
              <div className="past-sessions-workspace-block">
                <h3 className="subpanel-title">Recent Mock Scorecards</h3>
                <div className="past-sessions-list">
                  {pastInterviews.length === 0 ? (
                     <div className="past-session-empty">
                       <Sparkle size={20} />
                       <span>No past interviews found. Complete a mock round to view scorecards here.</span>
                     </div>
                  ) : (
                    pastInterviews.map((interview) => (
                      <div 
                        key={interview.id} 
                        className="past-session-item"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onNavigate('analysis', { sessionId: interview.id })}
                      >
                        <div className="past-session-info">
                          <span className="past-session-title">
                            {(interview.interview_type || 'General').replace('_', ' ').toUpperCase()} Interview
                          </span>
                          <div className="past-session-meta">
                            <Clock size={12} />
                            <span>{new Date(interview.created_at).toLocaleDateString()}</span>
                            <span className="dot-divider">•</span>
                            <span style={{ color: interview.stage === 'completed' ? '#00D084' : '#FF6B00' }}>
                              {interview.stage === 'completed' ? 'Completed' : 'In Progress'}
                            </span>
                          </div>
                        </div>
                        <div className="past-session-score-badge">
                          <span className="score-val">{interview.feedback?.technical_score != null ? `${interview.feedback.technical_score}%` : '--'}</span>
                          <span className="score-lbl">Score</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PANEL 4: Schedules & Roadmaps */}
        {activeSection === 'schedules' && (
          <div className="workspace-panel-container workspace-schedules-embed">
            <RoadmapsPage 
              onNavigate={onNavigate} 
              user={user} 
              embedded={true} 
              backendRoadmaps={roadmaps}
            />
          </div>
        )}

        </React.Suspense>
      </main>
    </div>
  );
};
export default Dashboard;
