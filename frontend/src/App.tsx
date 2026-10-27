import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { authService } from './services/authService';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AboutPage } from './pages/AboutPage';
import { InterviewTypesPage } from './pages/InterviewTypesPage';
import { InterviewCompleteScreen } from './components/interview/InterviewCompleteScreen';

// Lazy loaded heavy workspace and track routes for optimized initial bundle
const DSAPractice = lazy(() => import('./pages/DSAPractice'));
const DSAInterview = lazy(() => import('./pages/DSAInterview').then(m => ({ default: m.DSAInterview })));
const GeneralInterview = lazy(() => import('./pages/GeneralInterview'));
const SystemDesignInterview = lazy(() => import('./pages/SystemDesignInterview'));
const ChatScreen = lazy(() => import('./components/chat/ChatScreen').then(m => ({ default: m.ChatScreen })));
const PreJoinInterview = lazy(() => import('./pages/PreJoinInterview'));
const CodeArenaPage = lazy(() => import('./pages/CodeArenaPage').then(m => ({ default: m.CodeArenaPage })));
const RoadmapsPage = lazy(() => import('./pages/RoadmapsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const InterviewAnalysis = lazy(() => import('./pages/InterviewAnalysis').then(m => ({ default: m.InterviewAnalysis })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const CandidateInviteLanding = lazy(() => import('./pages/CandidateInviteLanding'));
const GuestCandidateReport = lazy(() => import('./pages/GuestCandidateReport'));
const VoicePoweredOrbPage = lazy(() => import('./pages/VoicePoweredOrbPage'));

const PageLoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#888' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: '32px', height: '32px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: '0.85rem' }}>Loading workspace...</span>
    </div>
  </div>
);

type Page = 'landing' | 'about' | 'interview-types' | 'code-arena' | 'roadmaps' | 'dashboard' | 'practice' | 'dsa-interview' | 'general-interview' | 'system-design-interview' | 'discussion' | 'chat' | 'login' | 'signup' | 'pre-join' | 'profile' | 'analysis' | 'admin' | 'candidate-invite' | 'candidate-report' | 'voice-orb';

interface NavParams {
  questionId?: string;
  templateId?: string;
  templateName?: string;
  targetPage?: string;
  sessionId?: string;
  domain?: string;
  role?: string;
  username?: string;
  inviteToken?: string;
  adminTab?: string;
}

// ---- URL <-> Page mapping helpers ----

// Pages that live under a non-root path. The landing page maps to "/".
const PAGE_TO_PATH: Record<Page, string> = {
  'landing': '/',
  'about': '/about',
  'interview-types': '/interview-types',
  'code-arena': '/code-arena',
  'roadmaps': '/roadmaps',
  'dashboard': '/dashboard',
  'practice': '/practice',
  'dsa-interview': '/dsa-interview',
  'general-interview': '/general-interview',
  'system-design-interview': '/system-design-interview',
  'discussion': '/discussion',
  'chat': '/chat',
  'login': '/login',
  'signup': '/signup',

  'pre-join': '/pre-join',
  'profile': '/profile',
  'analysis': '/analysis',
  'admin': '/admin',
  'candidate-invite': '/interview/invite',
  'candidate-report': '/interview/invite/report',
  'voice-orb': '/voice-orb',
};

const PATH_TO_PAGE: Record<string, Page> = Object.fromEntries(
  Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page as Page])
);

const VALID_PAGES = new Set(Object.keys(PAGE_TO_PATH));

/** Parse the current browser URL into a route state pair. */
function parseLocation(): { currentPage: Page; navParams: NavParams } {
  let path = window.location.pathname;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  let currentPage: Page = 'landing';
  const navParams: NavParams = {};

  if (path.startsWith('/interview/invite/') && path.endsWith('/report')) {
    currentPage = 'candidate-report';
    const sub = path.replace('/interview/invite/', '').replace('/report', '');
    navParams.inviteToken = sub;
  } else if (path.startsWith('/interview/invite/')) {
    currentPage = 'candidate-invite';
    navParams.inviteToken = path.replace('/interview/invite/', '');
  } else if (path === '/admin/interviews') {
    currentPage = 'admin';
    navParams.adminTab = 'scheduled';
  } else if (path.startsWith('/profile/') && path.length > '/profile/'.length) {
    currentPage = 'profile';
    navParams.username = path.replace('/profile/', '');
  } else {
    currentPage = (PATH_TO_PAGE[path] || 'landing') as Page;
  }
  
  const search = new URLSearchParams(window.location.search);
  navParams.questionId = search.get('questionId') || undefined;
  navParams.templateId = search.get('templateId') || undefined;
  navParams.templateName = search.get('templateName') || undefined;
  navParams.targetPage = search.get('targetPage') || undefined;
  navParams.sessionId = search.get('sessionId') || undefined;
  navParams.domain = search.get('domain') || undefined;
  navParams.role = search.get('role') || undefined;
  navParams.username = navParams.username || search.get('username') || undefined;
  return { currentPage, navParams };
}

/** Build the full URL string (path + query) for a page + params. */
function buildUrl(page: Page, params?: NavParams): string {
  let path = PAGE_TO_PATH[page] || '/';
  
  if (page === 'candidate-invite' && params?.inviteToken) {
    path = `/interview/invite/${params.inviteToken}`;
  } else if (page === 'candidate-report' && params?.inviteToken) {
    path = `/interview/invite/${params.inviteToken}/report`;
  } else if (page === 'admin' && params?.adminTab === 'scheduled') {
    path = '/admin/interviews';
  } else if (page === 'profile' && params?.username) {
    path = `/profile/${params.username}`;
  }

  const search = new URLSearchParams();
  if (params?.questionId) search.set('questionId', params.questionId);
  if (params?.templateId) search.set('templateId', params.templateId);
  if (params?.templateName) search.set('templateName', params.templateName);
  if (params?.targetPage) search.set('targetPage', params.targetPage);
  if (params?.sessionId) search.set('sessionId', params.sessionId);
  if (params?.domain) search.set('domain', params.domain);
  if (params?.role) search.set('role', params.role);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function App() {
  // Initialize page state from the REAL browser URL instead of sessionStorage.
  const [{ currentPage, navParams }, setRoute] = useState<{ currentPage: Page; navParams: NavParams }>(() => parseLocation());

  // Auth State Management
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const [isInitializingAuth, setIsInitializingAuth] = useState(true);

  // Auto-Login on Mount
  useEffect(() => {
    const storedAccess = localStorage.getItem('access_token');
    if (storedAccess) {
      authService.getMe(storedAccess)
        .then(userData => {
          setAccessToken(storedAccess);
          setUser(userData);
        })
        .catch(err => {
          console.error("Auto-login failed:", err);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        })
        .finally(() => setIsInitializingAuth(false));
    } else {
      setIsInitializingAuth(false);
    }
  }, []);

  // Sync React state with browser Back/Forward (popstate) events.
  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global Auth Event Listeners (e.g. from apiClient)
  useEffect(() => {
    const onAuthLogout = () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setAccessToken(null);
      setUser(null);
      window.history.pushState({}, '', '/login');
      setRoute({ currentPage: 'login', navParams: {} });
    };

    const onAuthRefresh = (e: any) => {
      if (e.detail?.token) {
        setAccessToken(e.detail.token);
      }
    };

    window.addEventListener('auth:logout', onAuthLogout);
    window.addEventListener('auth:refresh', onAuthRefresh);
    return () => {
      window.removeEventListener('auth:logout', onAuthLogout);
      window.removeEventListener('auth:refresh', onAuthRefresh);
    };
  }, []);

  // Re-sync the URL on first load if the URL path doesn't match our pages
  // (e.g. someone landed on an unknown path). Keeps the address bar truthful.
  useEffect(() => {
    if (!VALID_PAGES.has(currentPage)) {
      window.history.replaceState({}, '', '/');
    }
  }, [currentPage]);

  const handleNavigate = useCallback((page: string, params?: NavParams) => {
    const protectedPages: Page[] = ['dashboard', 'dsa-interview', 'general-interview', 'system-design-interview', 'discussion', 'chat', 'analysis', 'admin'];
    const currentToken = accessToken || localStorage.getItem('access_token');

    let targetPage = (VALID_PAGES.has(page) ? page : 'landing') as Page;

    const isPublicProfile = targetPage === 'profile' && Boolean(params?.username);
    const isGuestInterview = Boolean(sessionStorage.getItem('guest_interview_token') || sessionStorage.getItem('guest_invite_token'));
    if (protectedPages.includes(targetPage) && !currentToken && !isPublicProfile && !isGuestInterview) {
      // Redirect to login if user is not authenticated
      targetPage = 'login';
    }

    const url = buildUrl(targetPage, params);

    // Push a new entry into browser history so Back/Forward work.
    window.history.pushState({}, '', url);

    setRoute({ currentPage: targetPage, navParams: params || {} });
    window.scrollTo(0, 0); // Reset scroll position on navigate
  }, [accessToken]);

  const handleLoginSuccess = useCallback((tokens: any, userData: any) => {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    setAccessToken(tokens.access_token);
    setUser(userData);
  }, []);

  const handleLogout = useCallback(async () => {
    const access = localStorage.getItem('access_token');
    const refresh = localStorage.getItem('refresh_token');

    if (access && refresh) {
      try {
        await authService.logout(access, refresh);
      } catch (err) {
        console.error("Backend logout failed:", err);
      }
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setAccessToken(null);
    setUser(null);

    // Navigate back to landing via the URL so history stays consistent.
    window.history.pushState({}, '', '/');
    setRoute({ currentPage: 'landing', navParams: {} });
  }, []);

  const renderPage = () => {
    // Route guard fallback on render
    const protectedPages: Page[] = ['dashboard', 'dsa-interview', 'general-interview', 'system-design-interview', 'discussion', 'chat', 'analysis', 'admin'];
    const isPublicProfile = currentPage === 'profile' && Boolean(navParams?.username);
    const isGuestInterview = Boolean(sessionStorage.getItem('guest_interview_token') || sessionStorage.getItem('guest_invite_token'));
    if (protectedPages.includes(currentPage) && !accessToken && !isPublicProfile && !isGuestInterview) {
      return <LoginPage onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
    }

    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={handleNavigate} />;
      case 'about':
        return <AboutPage onNavigate={handleNavigate} />;
      case 'interview-types':
        return <InterviewTypesPage onNavigate={handleNavigate} user={user} />;
      case 'code-arena':
        return <CodeArenaPage onNavigate={handleNavigate} />;
      case 'roadmaps':
        return <RoadmapsPage onNavigate={handleNavigate} user={user} />;
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} user={user} onLogout={handleLogout} />;
      case 'practice':
        return <DSAPractice questionId={navParams.questionId} user={user} onNavigate={handleNavigate} />;
      case 'dsa-interview':
        return (
          <DSAInterview 
            questionId={navParams.questionId}
            templateId={navParams.templateId} 
            templateName={navParams.templateName} 
            domain={navParams.domain}
            role={navParams.role}
            accessToken={accessToken} 
            onNavigate={handleNavigate} 
          />
        );
      case 'general-interview':
        return (
          <GeneralInterview 
            templateId={navParams.templateId} 
            templateName={navParams.templateName} 
            domain={navParams.domain}
            role={navParams.role}
            accessToken={accessToken} 
            onNavigate={handleNavigate} 
          />
        );
      case 'system-design-interview':
        return <SystemDesignInterview templateId={navParams.templateId} templateName={navParams.templateName} accessToken={accessToken} onNavigate={handleNavigate} domain={navParams.domain} role={navParams.role} />;
      case 'discussion':
        return (
          <GeneralInterview 
            templateId={navParams.templateId || 'discussion'} 
            templateName={navParams.templateName || 'Discussion & Case Study'} 
            domain={navParams.domain}
            role={navParams.role}
            accessToken={accessToken} 
            onNavigate={handleNavigate} 
          />
        );
      case 'analysis': {
        const isGuestInvite = Boolean(sessionStorage.getItem('guest_invite_token'));
        if (isGuestInvite) {
          return <InterviewCompleteScreen onExit={() => handleNavigate('landing')} />;
        }
        return <InterviewAnalysis sessionId={navParams.sessionId || ''} onNavigate={handleNavigate} />;
      }
      case 'admin':
        return <AdminDashboard onNavigate={handleNavigate} user={user} initialTab={navParams.adminTab as any} />;
      case 'candidate-invite':
        return <CandidateInviteLanding token={navParams.inviteToken || ''} onNavigate={handleNavigate} />;
      case 'candidate-report':
        return <GuestCandidateReport token={navParams.inviteToken || ''} onNavigate={handleNavigate} />;
      case 'pre-join':
        return <PreJoinInterview user={user} templateId={navParams.templateId} templateName={navParams.templateName} targetPage={navParams.targetPage} onNavigate={handleNavigate} />;
      case 'chat':
        return <ChatScreen sessionId={navParams.sessionId} onNavigate={handleNavigate} />;
      case 'login':
        return <LoginPage onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignupPage onNavigate={handleNavigate} onSignupSuccess={handleLoginSuccess} />;

      case 'profile':
        return <ProfilePage onNavigate={handleNavigate} username={navParams.username} />;
      case 'voice-orb':
        return <VoicePoweredOrbPage />;
      default:
        return <LandingPage onNavigate={handleNavigate} />;
    }
  };

  // Do not show header/footer during workspace (dashboard, interview, discussion) or auth screens
  const showLayout =
                     currentPage !== 'dsa-interview' &&
                     currentPage !== 'general-interview' &&
                     currentPage !== 'system-design-interview' &&
                     currentPage !== 'discussion' &&
                     currentPage !== 'chat' &&
                     currentPage !== 'practice' &&
                     currentPage !== 'login' &&
                     currentPage !== 'signup' &&
                     currentPage !== 'dashboard' &&
                     currentPage !== 'profile' &&
                     currentPage !== 'analysis' &&
                     currentPage !== 'admin' &&
                     currentPage !== 'pre-join' &&
                     currentPage !== 'candidate-invite' &&
                     currentPage !== 'candidate-report' &&
                     currentPage !== 'voice-orb' &&
                     // Logged-in users get the app shell (own top bar) on interview types
                     !(currentPage === 'interview-types' && user);

  if (isInitializingAuth) {
    return (
      <div className="app-root-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080810', color: '#fff' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <img src="/logo.png" alt="ThinkAloudAI" style={{ height: '48px', animation: 'pulseOrb 2s infinite' }} />
          <div style={{ fontSize: '0.85rem', color: '#888' }}>Initializing...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root-layout">
      {showLayout && <Header currentPage={currentPage} onNavigate={handleNavigate} user={user} onLogout={handleLogout} />}
      <main className="app-main-content">
        <ErrorBoundary>
          <Suspense fallback={<PageLoadingFallback />}>
            {renderPage()}
          </Suspense>
        </ErrorBoundary>
      </main>
      {showLayout && <Footer onNavigate={handleNavigate} currentPage={currentPage} />}
    </div>
  );
}

export default App;
