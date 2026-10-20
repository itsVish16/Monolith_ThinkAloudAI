import React, { useEffect, useState, useRef } from 'react';
import { 
  Trophy, 
  Flame, 
  VideoCamera, 
  Target, 
  CheckCircle, 
  ChartLineUp, 
  Crown, 
  MapTrifold, 
  ClockCounterClockwise, 
  ArrowUpRight, 
  Lightning, 
  ArrowRight,
  Code,
  Check,
  X,
  Pulse,
  ChartDonut
} from '@phosphor-icons/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getMyInterviews } from '../services/interviewService';
import { getRoadmaps } from '../services/roadmapService';
import { getLiveLeaderboard } from '../services/leaderboardService';
import type { LeaderboardUser } from '../services/leaderboardService';
import { computeUnifiedInterviewScore } from '../utils/interviewScore';
import './DashboardOverview.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

interface DashboardOverviewProps {
  user: any;
  langgraphProfile?: any;
  onNavigate?: (section: string, params?: any) => void;
  onSelectSection?: (section: string) => void;
}

export function DashboardOverview({ user, langgraphProfile, onNavigate, onSelectSection }: DashboardOverviewProps) {
  const handleNav = (target: string, params?: any) => {
    if (params) {
      onNavigate?.(target, params);
    } else if (onSelectSection && ['home', 'chat', 'practice', 'interview', 'schedules', 'progress'].includes(target)) {
      onSelectSection(target);
    } else {
      onNavigate?.(target, params);
    }
  };

  const [isDemoEmpty, setIsDemoEmpty] = useState(false);
  
  // Count-up stats
  const statRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const [interviewsTaken, setInterviewsTaken] = useState(0);
  const [averageScore, setAverageScore] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [problemsSolved, setProblemsSolved] = useState(0);
  const [dayStreak, setDayStreak] = useState(0);
  const [activeDays, setActiveDays] = useState<Set<number>>(new Set());
  const [weekData, setWeekData] = useState([{d:'M', h:0},{d:'T', h:0},{d:'W', h:0},{d:'T', h:0},{d:'F', h:0},{d:'S', h:0},{d:'S', h:0}]);
  const [recentInterviews, setRecentInterviews] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  
  // Category Percentages & Multi-Track Scores
  const [dsaPct, setDsaPct] = useState(0);
  const [sdPct, setSdPct] = useState(0);
  const [behPct, setBehPct] = useState(0);
  const [dsaScores, setDsaScores] = useState<number[]>([]);
  const [sdScores, setSdScores] = useState<number[]>([]);
  const [behScores, setBehScores] = useState<number[]>([]);
  const [chartTrackFilter, setChartTrackFilter] = useState<'all' | 'dsa' | 'sd' | 'behavioral'>('all');
  
  const [lbData, setLbData] = useState<LeaderboardUser[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      // Fetch interviews for chart and stats
      getMyInterviews(token).then(data => {
        setInterviewsTaken(data.length);
        const validInterviews = data.filter((d: any) => d.stage === 'completed' && d.feedback);
        if (validInterviews.length > 0) {
          const pastScores = validInterviews.map((d: any) => {
            return computeUnifiedInterviewScore(d, d.interview_type) || 0;
          })
          .filter((s: number) => s > 0) // Filter out zero-score entries (incomplete feedback)
          .reverse()
          .slice(-10);
          setScores(pastScores);
          
          const sum = pastScores.reduce((a, b) => a + b, 0);
          setAverageScore(pastScores.length > 0 ? Math.round(sum / pastScores.length) : 0);

          // Track-specific score arrays for 3 distinct curves
          const dsaList = validInterviews
            .filter((d: any) => ['dsa', 'swe', 'coding'].some(t => (d.interview_type || '').toLowerCase().includes(t)))
            .map((d: any) => computeUnifiedInterviewScore(d, d.interview_type) || 0)
            .filter((s: number) => s > 0)
            .reverse()
            .slice(-10);

          const sdList = validInterviews
            .filter((d: any) => ['system', 'sd', 'system_design'].some(t => (d.interview_type || '').toLowerCase().includes(t)))
            .map((d: any) => computeUnifiedInterviewScore(d, d.interview_type) || 0)
            .filter((s: number) => s > 0)
            .reverse()
            .slice(-10);

          const behList = validInterviews
            .filter((d: any) => ['behavioral', 'hr', 'pm', 'product', 'general', 'discussion', 'aiml', 'ai'].some(t => (d.interview_type || '').toLowerCase().includes(t)))
            .map((d: any) => computeUnifiedInterviewScore(d, d.interview_type) || 0)
            .filter((s: number) => s > 0)
            .reverse()
            .slice(-10);

          setDsaScores(dsaList);
          setSdScores(sdList);
          setBehScores(behList);
          
          // Calculate Category Percentages
          const calcCategoryAvg = (typeMatches: string[]) => {
            const matches = validInterviews.filter((d: any) => typeMatches.some(t => d.interview_type?.toLowerCase().includes(t)));
            
            // Calculate valid scores for each matched interview
            const validScores = matches.map((d: any) => {
              return computeUnifiedInterviewScore(d, d.interview_type) || 0;
            }).filter((s: number) => s > 0); // Only include non-zero scores!
            
            if (validScores.length === 0) return 0;
            
            const catSum = validScores.reduce((acc: number, s: number) => acc + s, 0);
            return Math.round(catSum / validScores.length);
          };
          
          // No more hardcoded fallbacks — show 0 if no data
          setDsaPct(calcCategoryAvg(['dsa', 'swe']));
          setSdPct(calcCategoryAvg(['system', 'sd']));
          setBehPct(calcCategoryAvg(['behavioral', 'hr', 'pm', 'general']));
        } else {
          setIsDemoEmpty(true);
        }

        // Calculate unique problems solved from interviews
        const uniqueProblems = new Set<string>();
        data.forEach((d: any) => {
          if (d.state_data?.ai_selected_questions && Array.isArray(d.state_data.ai_selected_questions)) {
            d.state_data.ai_selected_questions.forEach((q: any) => {
              if (q.id) uniqueProblems.add(`${d.interview_type}-${q.id}`);
            });
          } else if (d.ai_selected_questions && Array.isArray(d.ai_selected_questions)) {
            d.ai_selected_questions.forEach((q: any) => {
              if (q.id) uniqueProblems.add(`${d.interview_type}-${q.id}`);
            });
          }
        });
        // Use langgraphProfile total_solved (DSA problems) if it's larger
        const dsaSolved = langgraphProfile?.total_solved || 0;
        const interviewProblems = uniqueProblems.size;
        setProblemsSolved(Math.max(dsaSolved, interviewProblems));

      }).catch(console.error);

      // Fetch live leaderboard
      getLiveLeaderboard(token).then(res => {
        setLbData(res.leaderboard || []);
        setMyRank(res.me?.rank || null);
      }).catch(err => {
        console.error("Leaderboard fetch error:", err);
        setLbData([]);
      });
      // Fetch roadmaps
      getRoadmaps().then(data => setRoadmaps(data)).catch(console.error);
      
    }
  }, []);

  useEffect(() => {
    if (langgraphProfile) {
      // Set Streak
      setDayStreak(langgraphProfile.current_streak || 0);
      
      // Set active days and this week from heatmap
      if (langgraphProfile.heatmap) {
        const mActive = new Set<number>();
        const currentMonth = new Date().getMonth() + 1; // 1-indexed
        const currentYear = new Date().getFullYear();
        
        const newWeekData: {d: string, h: number, date?: Date}[] = [];
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const todayObj = new Date();
        todayObj.setHours(0,0,0,0);
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date(todayObj);
          d.setDate(todayObj.getDate() - i);
          newWeekData.push({ d: dayNames[d.getDay()], h: 0, date: d });
        }
        
        langgraphProfile.heatmap.forEach((item: any) => {
          if (!item.date) return;
          const [yStr, mStr, dStr] = item.date.split('-');
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          const d = parseInt(dStr, 10);
          
          if (y === currentYear && m === currentMonth) {
            mActive.add(d);
          }
          
          const dateObj = new Date(y, m - 1, d);
          dateObj.setHours(0,0,0,0);
          
          const match = newWeekData.find(w => w.date && w.date.getTime() === dateObj.getTime());
          if (match) {
             match.h += (item.count * 20);
          }
        });
        
        // Cap height at 100
        newWeekData.forEach(w => w.h = Math.min(100, w.h));
        
        setActiveDays(mActive);
        setWeekData(newWeekData);
      }
      
      // Update problems solved with DSA data
      if (langgraphProfile.total_solved) {
        setProblemsSolved(prev => Math.max(prev, langgraphProfile.total_solved));
      }
    }
  }, [langgraphProfile]);

  // Update statRefs when data changes
  useEffect(() => {
    if (statRefs.current[0]) statRefs.current[0].setAttribute('data-count', interviewsTaken.toString());
    if (statRefs.current[1]) statRefs.current[1].setAttribute('data-count', averageScore.toString());
    if (statRefs.current[2]) statRefs.current[2].setAttribute('data-count', problemsSolved.toString());
    if (statRefs.current[3]) statRefs.current[3].setAttribute('data-count', dayStreak.toString());

    // Respect reduced-motion: render final values without the count-up sweep
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      statRefs.current.forEach((el) => {
        if (el) el.textContent = el.getAttribute('data-count') || '0';
      });
      return;
    }
    
    statRefs.current.forEach((el, i) => {
      if (!el) return;
      const target = parseInt(el.getAttribute('data-count') || '0', 10);
      const dur = 900;
      const start = performance.now() + i * 90;
      
      const tick = (now: number) => {
        const p = Math.min(1, Math.max(0, (now - start) / dur));
        if (p <= 0) { requestAnimationFrame(tick); return; }
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, [interviewsTaken, averageScore, problemsSolved, dayStreak]);

  // Multi-Track Score Progress Chart Setup
  const maxSessions = Math.max(dsaScores.length, sdScores.length, behScores.length, scores.length, 1);
  const chartLabels = Array.from({ length: maxSessions }, (_, i) => `Session ${i + 1}`);

  const allScoresCombined = [
    ...(chartTrackFilter === 'all' || chartTrackFilter === 'dsa' ? dsaScores : []),
    ...(chartTrackFilter === 'all' || chartTrackFilter === 'sd' ? sdScores : []),
    ...(chartTrackFilter === 'all' || chartTrackFilter === 'behavioral' ? behScores : []),
    ...(dsaScores.length === 0 && sdScores.length === 0 && behScores.length === 0 ? scores : [])
  ].filter(s => s > 0);

  const scoreMin = allScoresCombined.length > 0 ? Math.max(0, Math.min(...allScoresCombined) - 15) : 0;
  const scoreMax = allScoresCombined.length > 0 ? Math.min(100, Math.max(...allScoresCombined) + 10) : 100;

  // Build the 3 distinct datasets
  const activeDatasets: any[] = [];

  if (chartTrackFilter === 'all' || chartTrackFilter === 'dsa') {
    if (dsaScores.length > 0 || chartTrackFilter === 'dsa') {
      activeDatasets.push({
        label: 'DSA & Coding',
        data: dsaScores,
        borderColor: '#f97316',
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart;
          const { ctx: canvasCtx, chartArea } = chart;
          if (!chartArea) return 'rgba(249, 115, 22, 0.1)';
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
          gradient.addColorStop(1, 'rgba(249, 115, 22, 0.01)');
          return gradient;
        },
        fill: chartTrackFilter === 'dsa',
        tension: 0.42,
        pointBackgroundColor: '#0a0a0c',
        pointBorderColor: '#f97316',
        pointBorderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#f97316',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2.5,
        borderWidth: 2.5,
        spanGaps: true,
      });
    }
  }

  if (chartTrackFilter === 'all' || chartTrackFilter === 'sd') {
    if (sdScores.length > 0 || chartTrackFilter === 'sd') {
      activeDatasets.push({
        label: 'System Design',
        data: sdScores,
        borderColor: '#38bdf8',
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart;
          const { ctx: canvasCtx, chartArea } = chart;
          if (!chartArea) return 'rgba(56, 189, 248, 0.1)';
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
          gradient.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
          return gradient;
        },
        fill: chartTrackFilter === 'sd',
        tension: 0.42,
        pointBackgroundColor: '#0a0a0c',
        pointBorderColor: '#38bdf8',
        pointBorderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#38bdf8',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2.5,
        borderWidth: 2.5,
        spanGaps: true,
      });
    }
  }

  if (chartTrackFilter === 'all' || chartTrackFilter === 'behavioral') {
    if (behScores.length > 0 || chartTrackFilter === 'behavioral') {
      activeDatasets.push({
        label: 'Behavioral & STAR',
        data: behScores,
        borderColor: '#10b981',
        backgroundColor: (ctx: any) => {
          const chart = ctx.chart;
          const { ctx: canvasCtx, chartArea } = chart;
          if (!chartArea) return 'rgba(16, 185, 129, 0.1)';
          const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)');
          return gradient;
        },
        fill: chartTrackFilter === 'behavioral',
        tension: 0.42,
        pointBackgroundColor: '#0a0a0c',
        pointBorderColor: '#10b981',
        pointBorderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#10b981',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2.5,
        borderWidth: 2.5,
        spanGaps: true,
      });
    }
  }

  // Fallback if none matched but overall scores exist
  if (activeDatasets.length === 0 && scores.length > 0) {
    activeDatasets.push({
      label: 'All Sessions',
      data: scores,
      borderColor: '#FF7A00',
      backgroundColor: 'rgba(255, 122, 0, 0.1)',
      fill: true,
      tension: 0.45,
      pointBackgroundColor: '#0a0a0c',
      pointBorderColor: '#FF7A00',
      pointBorderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      borderWidth: 2.5,
    });
  }

  const chartData = {
    labels: chartLabels,
    datasets: activeDatasets,
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12, 12, 18, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#f6f6f3',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        titleFont: { family: 'Space Grotesk', weight: 'bold' as const, size: 13 },
        bodyFont: { family: 'Inter', size: 12 },
        callbacks: {
          title: function(items: any) {
            return items[0]?.label || '';
          },
          label: function(context: any) {
            return ` ${context.dataset.label}: ${context.parsed.y}/100`;
          }
        }
      }
    },
    scales: {
      x: { 
        display: true, 
        grid: { display: false },
        ticks: { 
          color: 'rgba(141,141,146,0.5)', 
          font: { size: 10, family: 'JetBrains Mono' },
          callback: function(_: any, i: number) { return i + 1; }
        },
        border: { display: false }
      },
      y: { 
        display: true, 
        min: scoreMin, 
        max: scoreMax,
        grid: { 
          color: 'rgba(255,255,255,0.04)',
          drawTicks: false,
        },
        ticks: { 
          color: 'rgba(141,141,146,0.4)', 
          font: { size: 10, family: 'JetBrains Mono' },
          stepSize: 10,
          padding: 8,
        },
        border: { display: false }
      }
    },
    animation: {
      duration: 1800,
      easing: 'easeOutQuart' as const,
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    }
  };

  const initials = (name: string) => (name || '').split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase();

  // Calendar
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), todayDate = today.getDate();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const calEmptyCells = Array.from({length: firstDay});
  const calDays = Array.from({length: daysInMonth}, (_, i) => i + 1);

  // Helper for delayed fill
  const DelayedFill = ({ width, delay }: { width: number, delay: number }) => {
    const [w, setW] = useState(0);
    useEffect(() => {
      const t = setTimeout(() => setW(width), delay);
      return () => clearTimeout(t);
    }, [width, delay]);
    return <div className="overview-bar-fill" style={{ width: `${w}%` }}></div>;
  };

  const DelayedHeight = ({ height, delay }: { height: number, delay: number }) => {
    const [h, setH] = useState(0);
    useEffect(() => {
      const t = setTimeout(() => setH(height), delay);
      return () => clearTimeout(t);
    }, [height, delay]);
    return <div className="overview-week-bar" style={{ height: `${h}%` }}></div>;
  };

  const AnimatedRing = ({ pct }: { pct: number }) => {
    const ringRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!ringRef.current) return;
      // Respect reduced-motion: paint the final ring immediately
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        ringRef.current.style.background = `conic-gradient(var(--orange) ${pct}%, rgba(255,255,255,0.07) 0)`;
        return;
      }
      let cur = 0;
      const dur = 1000, start = performance.now();
      const frame = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        cur = pct * (1 - Math.pow(1 - p, 3));
        if (ringRef.current) {
          ringRef.current.style.background = `conic-gradient(var(--orange) ${cur}%, rgba(255,255,255,0.07) 0)`;
        }
        if (p < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, [pct]);
    return (
      <div className="overview-ring-mini" ref={ringRef} data-pct={pct}>
        <span>{pct}%</span>
      </div>
    );
  };

  // Week label helper — calculate which calendar dates map to M/T/W/T/F/S/S
  const getWeekLabel = (dayIndex: number) => {
    const d = new Date();
    d.setHours(0,0,0,0);
    const dayMap = [6, 0, 1, 2, 3, 4, 5];
    const todayIdx = dayMap[d.getDay()];
    const diff = todayIdx - dayIndex;
    const targetDate = new Date(d);
    targetDate.setDate(d.getDate() - diff);
    return targetDate.getDate();
  };

  return (
    <div className={`dashboard-overview-page ${isDemoEmpty ? 'demo-empty' : ''}`}>
      <div className="dashboard-overview-glow"></div>
      
      <div className="overview-topbar overview-rise" style={{ animationDelay: '.02s' }}>
        <div>
          <div className="overview-eyebrow-pill">
            <span className="overview-status-dot" />
            <span>CANDIDATE COCKPIT</span>
          </div>
          <h1 className="overview-hero-heading">
            Welcome back, <span className="overview-serif-name">{user?.full_name?.split(' ')?.[0] || 'there'}</span>
          </h1>
          <p className="overview-sub">Real-time interview readiness index, track trajectory, and active velocity.</p>
        </div>
        <div className="overview-header-right">
          <div className="overview-chip">
            <Trophy size={15} weight="duotone" className="overview-chip-icon trophy" />
            <span>Global rank</span>
            <b className="overview-chip-val">{myRank ? `#${myRank}` : '—'}</b>
          </div>
          <div className="overview-chip">
            <Flame size={15} weight="fill" className="overview-chip-icon flame" />
            <span>Streak</span>
            <b className="overview-chip-val">{dayStreak}d</b>
          </div>
        </div>
      </div>

      <div className="overview-stats-row overview-rise" style={{ animationDelay: '.06s' }}>
        <div className="overview-stat-card">
          <div className="overview-stat-icon"><VideoCamera size={20} weight="duotone" /></div>
          <div className="overview-stat-info">
            <span className="overview-val" ref={el => { statRefs.current[0] = el; }}>0</span>
            <span className="overview-lab">Interviews taken</span>
          </div>
        </div>
        <div className="overview-stat-card">
          <div className="overview-stat-icon"><Target size={20} weight="duotone" /></div>
          <div className="overview-stat-info">
            <span className="overview-val" ref={el => { statRefs.current[1] = el; }}>0</span>
            <span className="overview-lab">Avg score <span className="overview-unit">/100</span></span>
          </div>
        </div>
        <div className="overview-stat-card">
          <div className="overview-stat-icon"><CheckCircle size={20} weight="duotone" /></div>
          <div className="overview-stat-info">
            <span className="overview-val" ref={el => { statRefs.current[2] = el; }}>0</span>
            <span className="overview-lab">Problems solved</span>
          </div>
        </div>
        <div className="overview-stat-card">
          <div className="overview-stat-icon"><Flame size={20} weight="duotone" /></div>
          <div className="overview-stat-info">
            <span className="overview-val" ref={el => { statRefs.current[3] = el; }}>0</span>
            <span className="overview-lab">Day streak</span>
          </div>
        </div>
      </div>

      <div className="overview-dashboard-grid">
        <div className="overview-main-col">

          <section className="overview-card overview-rise" style={{ animationDelay: '.1s' }}>
            <div className="overview-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2><ChartLineUp size={18} weight="bold" /> Score progress</h2>
                <span className="overview-meta">Track Trends</span>
              </div>

              {/* Multi-Track Interactive Filters */}
              <div className="overview-chart-track-pills">
                <button 
                  className={`overview-track-pill ${chartTrackFilter === 'all' ? 'active all' : ''}`}
                  onClick={() => setChartTrackFilter('all')}
                  title="View all 3 tracks simultaneously"
                >
                  All tracks
                </button>
                <button 
                  className={`overview-track-pill ${chartTrackFilter === 'dsa' ? 'active dsa' : ''}`}
                  onClick={() => setChartTrackFilter('dsa')}
                  title="Filter to DSA & Coding track"
                >
                  <span className="track-pill-dot dsa" />
                  DSA {dsaScores.length > 0 ? `(${dsaScores.length})` : ''}
                </button>
                <button 
                  className={`overview-track-pill ${chartTrackFilter === 'sd' ? 'active sd' : ''}`}
                  onClick={() => setChartTrackFilter('sd')}
                  title="Filter to System Design track"
                >
                  <span className="track-pill-dot sd" />
                  System Design {sdScores.length > 0 ? `(${sdScores.length})` : ''}
                </button>
                <button 
                  className={`overview-track-pill ${chartTrackFilter === 'behavioral' ? 'active beh' : ''}`}
                  onClick={() => setChartTrackFilter('behavioral')}
                  title="Filter to Behavioral & Leadership track"
                >
                  <span className="track-pill-dot beh" />
                  Behavioral {behScores.length > 0 ? `(${behScores.length})` : ''}
                </button>
              </div>
            </div>

            {scores.length > 0 || dsaScores.length > 0 || sdScores.length > 0 || behScores.length > 0 ? (
              <>
                <div className="overview-chart-wrap">
                  <Line data={chartData} options={chartOptions} />
                </div>
                
                {/* 3-Track Live Legend Bar */}
                <div className="overview-chart-legend-bar">
                  <div className="overview-legend-item">
                    <span className="track-pill-dot dsa" />
                    <span>DSA: <strong className="overview-legend-val">{dsaScores.length > 0 ? `${dsaScores[dsaScores.length - 1]}/100` : '—'}</strong></span>
                  </div>
                  <div className="overview-legend-item">
                    <span className="track-pill-dot sd" />
                    <span>System Design: <strong className="overview-legend-val">{sdScores.length > 0 ? `${sdScores[sdScores.length - 1]}/100` : '—'}</strong></span>
                  </div>
                  <div className="overview-legend-item">
                    <span className="track-pill-dot beh" />
                    <span>Behavioral: <strong className="overview-legend-val">{behScores.length > 0 ? `${behScores[behScores.length - 1]}/100` : '—'}</strong></span>
                  </div>
                </div>
              </>
            ) : (
              <div className="overview-empty-inline">
                <ChartLineUp size={28} weight="duotone" />
                <p>Complete your first interview to see score trends across DSA, System Design, and Behavioral tracks.</p>
                <button className="overview-empty-cta" onClick={() => handleNav('interview')}>Start an interview</button>
              </div>
            )}
          </section>

          <section className="overview-card overview-rise" style={{ animationDelay: '.14s' }}>
            <div className="overview-card-head">
              <h2><ChartDonut size={18} weight="bold" /> Rank by category</h2>
              <span className="overview-meta">Average score per category</span>
            </div>
            <div className="overview-rings-row">
              <div className="overview-ring-block">
                <AnimatedRing pct={dsaPct} />
                <span className="overview-rlab">DSA</span>
                <span className="overview-rsub">{dsaPct > 0 ? `Avg ${dsaPct}/100` : 'No data'}</span>
              </div>
              <div className="overview-ring-block">
                <AnimatedRing pct={sdPct} />
                <span className="overview-rlab">System Design</span>
                <span className="overview-rsub">{sdPct > 0 ? `Avg ${sdPct}/100` : 'No data'}</span>
              </div>
              <div className="overview-ring-block">
                <AnimatedRing pct={behPct} />
                <span className="overview-rlab">Behavioral</span>
                <span className="overview-rsub">{behPct > 0 ? `Avg ${behPct}/100` : 'No data'}</span>
              </div>
            </div>
          </section>

          <section className="overview-card overview-rise" style={{ animationDelay: '.18s' }}>
            <div className="overview-card-head">
              <h2><Crown size={18} weight="duotone" /> Live leaderboard</h2>
              <span className="overview-meta">Top Performers</span>
            </div>
            <div className="overview-lb-list">
              {(lbData || []).length > 0 ? lbData.map((row, i) => (
                <div key={i} className={`overview-lb-row ${row.candidate_name === user?.full_name?.split(' ')?.[0] ? 'me' : ''}`}>
                  <span className="overview-lb-rank">#{row.rank}</span>
                  <span className="overview-lb-avatar">{initials(row.candidate_name)}</span>
                  <div className="overview-lb-name">
                    <span className="overview-n">{row.candidate_name}</span>
                    <span className="overview-t">{row.candidate_name === user?.full_name?.split(' ')?.[0] ? "That's you" : "Top Candidate"}</span>
                  </div>
                  <span className="overview-lb-score">{row.score}</span>
                  <span className="overview-lb-delta up">
                    <ArrowUpRight size={13} weight="bold" />
                  </span>
                </div>
              )) : (
                <div className="overview-lb-empty">
                  <Crown size={28} weight="duotone" />
                  <p>Complete interviews to appear on the leaderboard!</p>
                </div>
              )}
            </div>
          </section>

          <section className="overview-card overview-rise" style={{ animationDelay: '.22s' }}>
            <div className="overview-card-head">
              <h2><MapTrifold size={18} weight="bold" /> Your roadmaps</h2>
              <span className="overview-meta">{roadmaps.length} active</span>
            </div>
            <div className="overview-roadmap-list">
              {roadmaps.length > 0 ? roadmaps.slice(0, 3).map((rm, i) => {
                const totalItems = rm.topics?.reduce((acc: number, t: any) => acc + (t.items?.length || 0), 0) || 1;
                const completedItems = rm.topics?.reduce((acc: number, t: any) => acc + (t.items?.filter((item: any) => item.is_completed).length || 0), 0) || 0;
                const pct = Math.round((completedItems / totalItems) * 100);
                
                let nextUp = "All topics completed!";
                for (const t of rm.topics || []) {
                  const uncomp = t.items?.find((item: any) => !item.is_completed);
                  if (uncomp) {
                    nextUp = `Next up: ${uncomp.title}`;
                    break;
                  }
                }
                
                return (
                  <div key={rm.id || i} className="overview-roadmap-item" style={{cursor: 'pointer'}} onClick={() => handleNav('schedules')}>
                    <div className="overview-rm-top"><h4>{rm.title}</h4><span className="overview-rm-pct">{pct}%</span></div>
                    <p className="overview-rm-desc">{nextUp}</p>
                    <div className="overview-bar-track"><DelayedFill width={pct} delay={300 + i * 120} /></div>
                  </div>
                );
              }) : (
                 <div className="overview-lb-empty">
                   <MapTrifold size={28} weight="duotone" />
                   <p>Create a study roadmap to track your progress.</p>
                   <button className="overview-empty-cta" onClick={() => handleNav('schedules')}>Create roadmap</button>
                 </div>
              )}
            </div>
          </section>

          <section className="overview-card overview-rise" style={{ animationDelay: '.26s' }}>
            <div className="overview-card-head">
              <h2><ClockCounterClockwise size={18} weight="bold" /> Recent submissions</h2>
              <span className="overview-meta">Last 5</span>
            </div>
            <div className="overview-prob-list">
              {langgraphProfile?.recent_submissions?.length > 0 ? langgraphProfile.recent_submissions.slice(0, 5).map((sub: any, i: number) => {
                const date = new Date(sub.created_at);
                const diffDays = Math.floor((new Date().getTime() - date.getTime()) / 86400000);
                let timeText = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
                const isAccepted = sub.status === 'Accepted';
                const qTitle = sub.question_title || 'Unknown Problem';
                
                return (
                  <div key={i} className="overview-prob-row" style={{cursor: 'pointer'}} onClick={() => handleNav('practice', { questionId: sub.question_id })}>
                    <div className={`overview-prob-status ${isAccepted ? 'solved' : 'pending'}`}>
                      {isAccepted ? <Check size={12} weight="bold" /> : <X size={12} weight="bold" />}
                    </div>
                    <div className="overview-prob-name">
                      <span className="overview-n">{qTitle}</span>
                      <span className="overview-t">{timeText} · {sub.language}</span>
                    </div>
                    <span className={`overview-prob-diff ${isAccepted ? 'overview-diff-accepted' : 'overview-diff-failed'}`}>
                      {isAccepted ? 'Accepted' : sub.status || 'Failed'}
                    </span>
                  </div>
                );
              }) : (
                <div className="overview-lb-empty">
                  <Code size={28} weight="duotone" />
                  <p>Solve a DSA problem to see your submissions here.</p>
                  <button className="overview-empty-cta" onClick={() => handleNav('practice')}>Go to practice</button>
                </div>
              )}
            </div>
          </section>

        </div>

        <aside className="overview-right-col">

          <section className="overview-card overview-streak-card overview-rise" style={{ animationDelay: '.1s' }}>
            <div className="overview-streak-head">
              <div className="overview-flame-badge">
                <Flame size={22} weight="fill" />
              </div>
              <div><span className="overview-n">{langgraphProfile?.current_streak || 0} day{(langgraphProfile?.current_streak || 0) !== 1 ? 's' : ''}</span><span className="overview-l">Current streak</span></div>
            </div>
            <div className="overview-cal-month">{monthNames[m]} {y}</div>
            <div className="overview-cal-grid">
              {['S','M','T','W','T','F','S'].map((d, i) => <div key={`dow-${i}`} className="overview-cal-dow">{d}</div>)}
              {calEmptyCells.map((_, i) => <div key={`empty-${i}`} className="overview-cal-cell overview-empty"></div>)}
              {calDays.map(d => {
                const isActive = activeDays.has(d);
                const isToday = d === todayDate;
                const isPast = d < todayDate;
                return (
                  <div 
                    key={d} 
                    className={`overview-cal-cell ${isActive ? 'active' : ''} ${isToday ? 'today' : ''} ${isPast && !isActive ? 'past' : ''}`}
                    title={isActive ? `${d} ${monthNames[m]} — practiced!` : undefined}
                  >
                    {isActive ? (
                      <Flame size={14} weight="fill" />
                    ) : (
                      <span>{d}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {activeDays.size > 0 && (
              <div className="overview-cal-legend">
                <span className="overview-cal-legend-dot active"></span> Practiced
                <span className="overview-cal-legend-dot today"></span> Today
              </div>
            )}
          </section>

          <section className="overview-card overview-rise" style={{ animationDelay: '.16s' }}>
            <div className="overview-card-head">
              <h2><Pulse size={16} weight="bold" /> This week</h2>
              <span className="overview-meta">
                {weekData.reduce((s, w) => s + (w.h > 0 ? 1 : 0), 0)} active days
              </span>
            </div>
            <div className="overview-week-bars">
              {weekData.map((w, i) => (
                <div key={i} className="overview-week-bar-col">
                  <DelayedHeight height={w.h || 4} delay={200 + i * 80} />
                  <span className="overview-week-lab">{w.d}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="overview-nudge overview-rise" style={{ animationDelay: '.22s' }}>
            {(() => {
              const cats = [
                { name: 'System Design', score: sdPct, key: 'system_design_core' },
                { name: 'DSA', score: dsaPct, key: 'dsa_core' },
                { name: 'Behavioral', score: behPct, key: 'behavioral_core' }
              ].sort((a, b) => a.score - b.score);
              const weakest = cats[0];
              const hasAnyData = cats.some(c => c.score > 0);
              return (
                <>
                  <Lightning size={20} weight="fill" style={{ color: '#fbbf24', marginBottom: '8px' }} />
                  <h4>{hasAnyData ? `Focus on ${weakest.name}` : 'Start your journey'}</h4>
                  <p>{hasAnyData ? `Your ${weakest.name} average is ${weakest.score}/100 — prioritize this domain for high yield.` : 'Take your first interview to get personalized AI recommendations!'}</p>
                  <button className="overview-nudge-btn" onClick={() => handleNav(hasAnyData ? 'interview' : 'interview')}>
                    {hasAnyData ? `Practice ${weakest.name}` : 'Start interview'} <ArrowRight size={13} weight="bold" />
                  </button>
                </>
              );
            })()}
          </section>

        </aside>
      </div>
    </div>
  );
}
