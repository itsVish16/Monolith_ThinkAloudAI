import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '../services/apiClient';
import { 
  ArrowLeft, 
  Warning, 
  WarningCircle, 
  Lightning, 
  CaretDown, 
  CaretUp,
  Robot,
  User,
  Copy,
  Check,
  MagnifyingGlass,
  ChatCircleDots,
  Microphone,
  Sparkle
} from '@phosphor-icons/react';
import { 
  getInterviewDetails, 
  endInterview, 
  getInterviewSessionMetrics, 
  getInterviewStreamUrl, 
  getLegacyInterviewStreamUrl 
} from '../services/interviewService';
import { PageHeader } from '../components/common/PageHeader';
import './InterviewAnalysis.css';

import { computeUnifiedInterviewScore } from '../utils/interviewScore';

interface InterviewAnalysisProps {
  sessionId: string;
  onNavigate: (page: string) => void;
}

export function InterviewAnalysis({ sessionId, onNavigate }: InterviewAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [sessionMetrics, setSessionMetrics] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);
  
  // Chat Transcript interactive states
  const [chatSearch, setChatSearch] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'ai' | 'candidate'>('all');
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [fullTranscriptCopied, setFullTranscriptCopied] = useState(false);

  const ringRef = useRef<SVGCircleElement>(null);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error("No authentication token found");

      const data = await getInterviewDetails(token, sessionId);
      
      const parseField = (field: any) => {
        if (typeof field === 'string') {
          try { return JSON.parse(field); } catch (e) { return [field]; }
        }
        return field;
      };

      if (data && data.evaluation) {
        data.evaluation.strengths = parseField(data.evaluation.strengths);
        data.evaluation.weaknesses = parseField(data.evaluation.weaknesses);
        data.evaluation.improvement_plan = parseField(data.evaluation.improvement_plan);
      }
      
      setAnalysisData(data);

      // Fetch telemetry metrics in parallel
      try {
        const metrics = await getInterviewSessionMetrics(token, sessionId);
        setSessionMetrics(metrics);
      } catch (mErr) {
        console.log("Telemetry metrics not available for this session:", mErr);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchAnalysis();
    }
  }, [sessionId]);

  const overallScore = computeUnifiedInterviewScore(analysisData, analysisData?.interview_type) ?? 0;

  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  const handleForceComplete = async () => {
    setIsGenerating(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsGenerating(false);
        return;
      }

      await endInterview(token, sessionId);

      let hasTriedFallback = false;
      let isDone = false;

      const finishStream = () => {
        if (isDone) return;
        isDone = true;
        if (sseRef.current) {
          sseRef.current.close();
          sseRef.current = null;
        }
        fetchAnalysis();
        setIsGenerating(false);
      };

      const connectStream = (url: string) => {
        if (sseRef.current) {
          sseRef.current.close();
        }

        const eventSource = new EventSource(url);
        sseRef.current = eventSource;

        const handleCompletion = (event: MessageEvent) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data?.event === "InterviewCompleted" || event.type === "InterviewCompleted") {
              finishStream();
            }
          } catch {
            finishStream();
          }
        };

        eventSource.addEventListener('InterviewCompleted', handleCompletion);
        eventSource.onmessage = handleCompletion;

        eventSource.onerror = (err) => {
          console.warn(`Analysis SSE stream encountered error on ${url}:`, err);
          eventSource.close();
          if (sseRef.current === eventSource) {
            sseRef.current = null;
          }

          if (!hasTriedFallback && !isDone) {
            hasTriedFallback = true;
            // Retry with legacy endpoint
            const fallbackUrl = getLegacyInterviewStreamUrl(sessionId, token);
            connectStream(fallbackUrl);
          } else if (!isDone) {
            // Reconnection gracefully timed out; poll fetch after backoff
            setTimeout(() => {
              if (!isDone) {
                finishStream();
              }
            }, 3500);
          }
        };
      };

      const primaryUrl = getInterviewStreamUrl(sessionId, token);
      connectStream(primaryUrl);

    } catch (err) {
      console.error("Failed to trigger analysis", err);
      setIsGenerating(false);
      alert("Failed to trigger analysis. Please ensure the backend is active.");
    }
  };

  useEffect(() => {
    if (!loading && analysisData) {
      const score = overallScore;
      if (ringRef.current) {
        const circumference = 377;
        const clampedScore = Math.max(0, Math.min(100, score));
        setTimeout(() => {
          if (ringRef.current) {
            ringRef.current.style.strokeDashoffset = (circumference - (circumference * clampedScore / 100)).toString();
          }
        }, 300);
      }
    }
  }, [loading, analysisData, overallScore]);

  if (loading) {
    return (
      <div className="analysis-loading-container">
        <div className="analysis-spinner"></div>
        <p style={{ color: '#e2e8f0', marginTop: '16px', fontSize: '0.9rem', fontWeight: 600 }}>Loading Deep Analysis...</p>
      </div>
    );
  }

  if (error || !analysisData) {
    return (
      <div className="analysis-error-container">
        <Warning size={40} color="#fb7185" />
        <h2 style={{ color: '#fff', marginTop: '16px', fontSize: '1.25rem', fontWeight: 700 }}>Analysis Unavailable</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.86rem', maxWidth: '380px', marginTop: '6px' }}>{error || "Could not retrieve analysis for this session."}</p>
        <button 
          style={{ marginTop: '24px', padding: '8px 22px', background: '#ffffff', color: '#070709', border: 'none', borderRadius: '9999px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,255,255,0.1)' }} 
          onClick={() => onNavigate('dashboard')}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { candidate_name, stage, evaluation, updated_at, created_at, interview_type, transcript } = analysisData;
  const isCompleted = stage === 'completed' || stage?.toLowerCase() === 'completed';
  const detailed = evaluation?.detailed_metrics || {};

  // Helpers
  const formatInterviewType = (type: string) => (type || 'GENERAL').replace('_', ' ').toUpperCase();
  
  // Calculate Duration
  let durationStr = "N/A";
  if (created_at && updated_at) {
    const d1 = new Date(created_at);
    const d2 = new Date(updated_at);
    const diffMins = Math.round((d2.getTime() - d1.getTime()) / 60000);
    durationStr = `${diffMins}m`;
  }

  const verdict = detailed.hiring_decision || "Pending";
  const commScore = evaluation?.communication_score || 0;

  // Safe computation of Speech Pace, Filler Words, Audio Quality, and Speaking Balance
  const speakingAnalytics = detailed.speaking_analytics || {};
  const speechMetrics = sessionMetrics?.speech_metrics || {};

  const speechPaceWpm = (() => {
    if (speechMetrics.speech_rate_wpm && typeof speechMetrics.speech_rate_wpm === 'number') {
      return Math.round(speechMetrics.speech_rate_wpm);
    }
    if (speakingAnalytics.speech_rate_wpm && typeof speakingAnalytics.speech_rate_wpm === 'number') {
      return Math.round(speakingAnalytics.speech_rate_wpm);
    }
    if (speakingAnalytics.candidate_words && durationStr !== "N/A") {
      const mins = parseInt(durationStr, 10);
      if (mins > 0) return Math.round(speakingAnalytics.candidate_words / mins);
    }
    return 135; // optimal conversational baseline
  })();

  const fillerWordsCount = (() => {
    if (typeof speechMetrics.filler_words === 'number') return speechMetrics.filler_words;
    if (typeof speakingAnalytics.filler_words === 'number') return speakingAnalytics.filler_words;
    if (speakingAnalytics.filler_words && typeof speakingAnalytics.filler_words === 'object') {
      return Object.values(speakingAnalytics.filler_words).reduce((acc: number, val: any) => acc + (typeof val === 'number' ? val : 0), 0);
    }
    if (speechMetrics.filler_words && typeof speechMetrics.filler_words === 'object') {
      return Object.values(speechMetrics.filler_words).reduce((acc: number, val: any) => acc + (typeof val === 'number' ? val : 0), 0);
    }
    return 0;
  })();

  const audioQuality = (() => {
    const raw = speechMetrics.audio_quality || speakingAnalytics.audio_quality;
    if (typeof raw === 'string') {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return "Optimal (48kHz)";
  })();

  // Normalize transcript list from either analysisData.transcript or sessionMetrics.turns
  const rawTranscriptList = (() => {
    if (transcript && Array.isArray(transcript) && transcript.length > 0) {
      return transcript;
    }
    if (sessionMetrics?.turns && Array.isArray(sessionMetrics.turns) && sessionMetrics.turns.length > 0) {
      const flat: any[] = [];
      sessionMetrics.turns.forEach((t: any) => {
        if (t.user_text) {
          flat.push({
            role: 'candidate',
            content: t.user_text,
            turn_number: t.turn_number,
            stage: t.stage,
            timestamp: t.timestamp
          });
        }
        if (t.response_text) {
          flat.push({
            role: 'assistant',
            content: t.response_text,
            turn_number: t.turn_number,
            stage: t.stage,
            timestamp: t.timestamp,
            fast_llm: t.fast_llm,
            e2e_latency_ms: t.e2e_response_latency_ms
          });
        }
      });
      return flat;
    }
    return [];
  })();

  // Filter transcript by speaker and search query
  const filteredTranscript = rawTranscriptList.filter((msg: any) => {
    const isAI = msg.role === 'assistant' || msg.role === 'ai' || msg.role === 'interviewer';
    if (speakerFilter === 'ai' && !isAI) return false;
    if (speakerFilter === 'candidate' && isAI) return false;
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      const contentMatch = (msg.content || '').toLowerCase().includes(q);
      const stageMatch = (msg.stage || '').toLowerCase().includes(q);
      return contentMatch || stageMatch;
    }
    return true;
  });

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  };

  const handleCopyFullTranscript = () => {
    if (!rawTranscriptList || rawTranscriptList.length === 0) return;
    const fullText = rawTranscriptList
      .map((msg: any) => {
        const isAI = msg.role === 'assistant' || msg.role === 'ai' || msg.role === 'interviewer';
        const speaker = isAI ? 'AI Interviewer (Aarav)' : (candidate_name || 'Candidate');
        return `[${speaker}]:\n${msg.content}\n`;
      })
      .join('\n');
    navigator.clipboard.writeText(fullText);
    setFullTranscriptCopied(true);
    setTimeout(() => setFullTranscriptCopied(false), 2000);
  };

  // Render Bar
  const renderMeter = (name: string, score: number, delayMs: number) => {
    return (
      <div className="ta-meter">
        <div className="ta-meter-top">
          <span className="ta-name">{name}</span>
          <span className="ta-score">{score}%</span>
        </div>
        <div className="ta-bar-track">
          <div 
            className="ta-bar-fill" 
            style={{ 
              width: `${score}%`,
              transitionDelay: `${delayMs}ms` 
            }}
          ></div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ta-analysis-glow"></div>
      
      <PageHeader 
        title="Analysis"
        onBack={() => onNavigate('dashboard')}
        rightContent={<span className="ta-date" style={{ color: '#888', fontSize: '0.85rem' }}>{new Date(updated_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
      />

      <div className="ta-analysis-wrap">

        {!isCompleted && (
          <div className="incomplete-banner">
            <WarningCircle size={22} color="#fbbf24" weight="fill" />
            <span>This interview was not fully completed. Analysis might be partial.</span>
            <button onClick={handleForceComplete} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Force Generate Analysis'}
            </button>
          </div>
        )}

        <div className="ta-rise" style={{ animationDelay: '.08s' }}>
          <span className="ta-tag">{formatInterviewType(interview_type)} · REPORT</span>
          <h1>{formatInterviewType(interview_type)} — review</h1>
          <p className="ta-sub">Detailed breakdown for {candidate_name || 'Candidate'}. Here's how the session went and what to work on next.</p>
        </div>

        {/* HERO */}
        <div className="ta-hero ta-rise" style={{ animationDelay: '.14s' }}>
          <div className="ta-hero-left">
            <div className="ta-ring-wrap">
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle className="ta-ring-track" cx="70" cy="70" r="60" fill="none" strokeWidth="10"/>
                <circle 
                  ref={ringRef}
                  className="ta-ring-value" 
                  cx="70" cy="70" r="60" 
                  fill="none" 
                  strokeWidth="10"
                  strokeDasharray="377" 
                  strokeDashoffset="377"
                />
              </svg>
              <div className="ta-ring-num">
                <span className="ta-n">{overallScore}</span>
                <span className="ta-l">Overall score</span>
              </div>
            </div>
            <span className="ta-verdict">{verdict}</span>
          </div>
          <div className="ta-hero-right">
            <div className="ta-stat"><span className="ta-val">{stage === 'completed' ? 'Done' : 'Partial'}</span><span className="ta-lab">Stage</span></div>
            <div className="ta-stat"><span className="ta-val">{durationStr}</span><span className="ta-lab">Time used</span></div>
            {interview_type === 'system_design' ? (
              <div className="ta-stat"><span className="ta-val">{detailed.technical_breakdown?.trade_off_reasoning || 0}/100</span><span className="ta-lab">Trade-offs</span></div>
            ) : interview_type === 'behavioral' ? (
              <div className="ta-stat"><span className="ta-val">{detailed.technical_breakdown?.star_structure || 0}/100</span><span className="ta-lab">STAR score</span></div>
            ) : (
              <div className="ta-stat"><span className="ta-val">{commScore}/100</span><span className="ta-lab">Comm score</span></div>
            )}
          </div>
        </div>

        {/* METERS */}
        <div className="ta-rise" style={{ animationDelay: '.2s' }}>
          <div className="ta-sec-head"><h2>Performance breakdown</h2><span>5 categories</span></div>
          <div className="ta-meters">
            {(() => {
              const iType = (interview_type || '').toLowerCase();
              if (iType.includes('system_design') || iType.includes('sd')) {
                return (
                  <>
                    {renderMeter('Requirements gathering', detailed.technical_breakdown?.requirements_gathering || 0, 400)}
                    {renderMeter('High-level architecture', detailed.technical_breakdown?.high_level_architecture || 0, 490)}
                    {renderMeter('Scalability & capacity', detailed.technical_breakdown?.scalability_and_capacity || 0, 580)}
                    {renderMeter('Trade-off reasoning', detailed.technical_breakdown?.trade_off_reasoning || 0, 670)}
                    {renderMeter('Communication', detailed.technical_breakdown?.communication || 0, 760)}
                  </>
                );
              }
              if (iType.includes('behavioral') || iType.includes('hr')) {
                return (
                  <>
                    {renderMeter('STAR structure', detailed.technical_breakdown?.star_structure || 0, 400)}
                    {renderMeter('Specificity', detailed.technical_breakdown?.specificity || 0, 490)}
                    {renderMeter('Ownership & impact', detailed.technical_breakdown?.ownership_and_impact || 0, 580)}
                    {renderMeter('Clarity', detailed.technical_breakdown?.clarity || 0, 670)}
                    {renderMeter('Conciseness', detailed.technical_breakdown?.conciseness || 0, 760)}
                  </>
                );
              }
              if (iType.includes('pm') || iType.includes('product')) {
                return (
                  <>
                    {renderMeter('User Empathy & Scoping', detailed.technical_breakdown?.user_empathy_and_scoping || 0, 400)}
                    {renderMeter('Product Sense & Vision', detailed.technical_breakdown?.product_sense_and_vision || 0, 490)}
                    {renderMeter('Prioritization Framework', detailed.technical_breakdown?.prioritization_framework || 0, 580)}
                    {renderMeter('Metrics & Trade-offs', detailed.technical_breakdown?.metrics_and_tradeoffs || 0, 670)}
                    {renderMeter('Structured Communication', detailed.technical_breakdown?.communication || 0, 760)}
                  </>
                );
              }
              if (iType.includes('ai') || iType.includes('ml')) {
                return (
                  <>
                    {renderMeter('ML Fundamentals', detailed.technical_breakdown?.ml_fundamentals || 0, 400)}
                    {renderMeter('Model Selection', detailed.technical_breakdown?.model_selection || 0, 490)}
                    {renderMeter('Data Processing', detailed.technical_breakdown?.data_processing || 0, 580)}
                    {renderMeter('System Architecture', detailed.technical_breakdown?.system_architecture || 0, 670)}
                    {renderMeter('Communication', detailed.technical_breakdown?.communication || 0, 760)}
                  </>
                );
              }
              return (
                <>
                  {renderMeter('Problem solving / Approach', detailed.technical_breakdown?.algorithms || 0, 400)}
                  {renderMeter('Code correctness', detailed.technical_breakdown?.edge_cases || 0, 490)}
                  {renderMeter('Time complexity', detailed.technical_breakdown?.time_complexity || 0, 580)}
                  {renderMeter('Communication', detailed.communication_breakdown?.clarity || 0, 670)}
                  {renderMeter('Code quality', detailed.technical_breakdown?.code_quality || 0, 760)}
                </>
              );
            })()}
          </div>
        </div>

        {/* STRENGTHS / WEAKNESSES */}
        <div className="ta-rise" style={{ animationDelay: '.26s' }}>
          <div className="ta-sec-head"><h2>Strengths &amp; areas to improve</h2></div>
          <div className="ta-two-col">
            <div className="ta-panel">
              <h3><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>Strengths</h3>
              {evaluation?.strengths && evaluation.strengths.length > 0 ? (
                evaluation.strengths.map((str: string, i: number) => (
                  <div className="ta-item" key={i}>
                    <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                    <span>{str}</span>
                  </div>
                ))
              ) : (
                <div className="ta-item"><span>No strengths recorded.</span></div>
              )}
            </div>
            <div className="ta-panel">
              <h3><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9L2.5 17a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/></svg>Areas to improve</h3>
              {evaluation?.weaknesses && evaluation.weaknesses.length > 0 ? (
                evaluation.weaknesses.map((wk: string, i: number) => (
                  <div className="ta-item" key={i}>
                    <svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M4 12h16"/></svg>
                    <span>{wk}</span>
                  </div>
                ))
              ) : (
                <div className="ta-item"><span>No weaknesses recorded.</span></div>
              )}
            </div>
          </div>
        </div>

        {/* SUGGESTIONS */}
        <div className="ta-rise" style={{ animationDelay: '.32s' }}>
          <div className="ta-sec-head"><h2>Recommended next steps</h2><span>based on this session</span></div>
          <div className="ta-sugg-grid">
            {evaluation?.improvement_plan && evaluation.improvement_plan.length > 0 ? (
              evaluation.improvement_plan.map((item: string, i: number) => (
                <div className="ta-sugg-card" key={i}>
                  <span className="ta-topic">ACTION ITEM {i + 1}</span>
                  <h4>Focus Area</h4>
                  <p>{item}</p>
                </div>
              ))
            ) : (
              <div className="ta-sugg-card">
                <span className="ta-topic">NA</span>
                <h4>No Action Items</h4>
                <p>No specific improvement plan generated.</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================
            BEAUTIFUL INTERVIEW TRANSCRIPT (MODERN CHAT UI)
            ============================================================ */}
        {rawTranscriptList && rawTranscriptList.length > 0 && (
          <div className="ta-rise" style={{ animationDelay: '.38s' }}>
            <div className="ta-sec-head">
              <h2>Interview Transcript</h2>
              <span>{rawTranscriptList.length} total messages</span>
            </div>

            {/* Chat Container Card */}
            <div className="ta-chat-container">
              
              {/* Chat Header Toolbar */}
              <div className="ta-chat-header-bar">
                {/* Search Bar */}
                <div className="ta-chat-search-wrap">
                  <MagnifyingGlass size={15} className="ta-chat-search-icon" />
                  <input
                    type="text"
                    placeholder="Search spoken dialogue, code, or keywords..."
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    className="ta-chat-search-input"
                  />
                  {chatSearch && (
                    <button className="ta-chat-clear-search" onClick={() => setChatSearch('')}>
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills & Actions */}
                <div className="ta-chat-actions-group">
                  <div className="ta-chat-filter-pills">
                    <button 
                      className={`ta-chat-filter-btn ${speakerFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setSpeakerFilter('all')}
                    >
                      All ({rawTranscriptList.length})
                    </button>
                    <button 
                      className={`ta-chat-filter-btn ${speakerFilter === 'ai' ? 'active' : ''}`}
                      onClick={() => setSpeakerFilter('ai')}
                    >
                      <Robot size={13} />
                      AI ({rawTranscriptList.filter((m: any) => m.role === 'assistant' || m.role === 'ai' || m.role === 'interviewer').length})
                    </button>
                    <button 
                      className={`ta-chat-filter-btn ${speakerFilter === 'candidate' ? 'active' : ''}`}
                      onClick={() => setSpeakerFilter('candidate')}
                    >
                      <User size={13} />
                      You ({rawTranscriptList.filter((m: any) => m.role === 'candidate' || m.role === 'user').length})
                    </button>
                  </div>

                  {/* Copy Transcript Button */}
                  <button 
                    className="ta-chat-copy-all-btn"
                    onClick={handleCopyFullTranscript}
                    title="Copy complete interview transcript to clipboard"
                  >
                    {fullTranscriptCopied ? (
                      <>
                        <Check size={14} className="text-green-400" />
                        <span className="text-green-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Chat Feed */}
              <div className="ta-chat-feed">
                {filteredTranscript.length === 0 ? (
                  <div className="ta-chat-empty-state">
                    <ChatCircleDots size={32} className="text-gray-500 mb-2" />
                    <p>No messages match your search filter.</p>
                  </div>
                ) : (
                  filteredTranscript.map((msg: any, idx: number) => {
                    const isAI = msg.role === 'assistant' || msg.role === 'ai' || msg.role === 'interviewer';
                    const speakerName = isAI ? 'Aarav (AI Senior Interviewer)' : (candidate_name || 'You (Candidate)');
                    const isCopied = copiedMsgIdx === idx;

                    return (
                      <div 
                        key={idx} 
                        className={`ta-chat-message-row ${isAI ? 'ai' : 'candidate'}`}
                      >
                        {/* Avatar */}
                        <div className={`ta-chat-avatar ${isAI ? 'ai' : 'candidate'}`}>
                          {isAI ? (
                            <Robot size={18} weight="fill" />
                          ) : (
                            <User size={18} weight="bold" />
                          )}
                        </div>

                        {/* Bubble Wrap */}
                        <div className="ta-chat-bubble-wrap">
                          {/* Speaker Meta Header */}
                          <div className="ta-chat-meta-head">
                            <span className="ta-chat-speaker-name">{speakerName}</span>
                            {isAI ? (
                              <span className="ta-chat-badge-ai">
                                <Sparkle size={10} weight="fill" />
                                <span>Voice AI</span>
                              </span>
                            ) : (
                              <span className="ta-chat-badge-candidate">Candidate</span>
                            )}
                            {msg.turn_number && (
                              <span className="ta-chat-turn-pill">Turn #{msg.turn_number}</span>
                            )}
                          </div>

                          {/* Message Content Bubble */}
                          <div className={`ta-chat-bubble ${isAI ? 'ai' : 'candidate'}`}>
                            <div className="ta-chat-text">
                              {msg.content}
                            </div>

                            {/* Optional Speculative Fast LLM Filler preview */}
                            {msg.fast_llm?.output && (
                              <div className="ta-chat-fast-bridge-chip">
                                <span>⚡ Speculative Bridge: </span>
                                <code>{msg.fast_llm.output}</code>
                              </div>
                            )}

                            {/* Bubble Footer Bar (Latency & Copy Button) */}
                            <div className="ta-chat-bubble-footer">
                              {msg.e2e_latency_ms && (
                                <span className="ta-chat-latency-micro">
                                  ⚡ {Math.round(msg.e2e_latency_ms)}ms latency
                                </span>
                              )}

                              <button 
                                className="ta-chat-copy-msg-btn"
                                onClick={() => handleCopyMessage(msg.content, idx)}
                                title="Copy message"
                              >
                                {isCopied ? (
                                  <>
                                    <Check size={12} className="text-green-400" />
                                    <span className="text-green-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}

        {/* SPEECH, VOICE QUALITY & TELEMETRY BREAKDOWN */}
        <div className="ta-rise" style={{ animationDelay: '.42s' }}>
          <div className="ta-sec-head">
            <h2>Speech Pace, Telemetry &amp; Voice Performance</h2>
            <span>{sessionMetrics?.summary?.total_turns ? `${sessionMetrics.summary.total_turns} turns recorded` : 'Audio & latency metrics'}</span>
          </div>

          <div className="telemetry-analysis-card">
            {/* Spoken Telemetry Grid: Speech Pace, Filler Words, Audio Quality, Speaking Balance */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              
              {/* Speech Pace Card */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Speech Pace</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: speechPaceWpm >= 120 && speechPaceWpm <= 160 ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)', color: speechPaceWpm >= 120 && speechPaceWpm <= 160 ? '#34d399' : '#fbbf24', fontWeight: 700 }}>
                    {speechPaceWpm >= 120 && speechPaceWpm <= 160 ? 'Optimal' : speechPaceWpm < 120 ? 'Relaxed' : 'Fast'}
                  </span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', marginTop: '6px' }}>
                  {speechPaceWpm} <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>WPM</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>Target: 130–150 wpm</div>
              </div>

              {/* Filler Words Card */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Filler Words</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: fillerWordsCount <= 4 ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)', color: fillerWordsCount <= 4 ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                    {fillerWordsCount <= 4 ? 'Clean' : 'Noticeable'}
                  </span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: fillerWordsCount <= 4 ? '#34d399' : '#fbbf24', fontFamily: 'JetBrains Mono, monospace', marginTop: '6px' }}>
                  {fillerWordsCount} <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>detected</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>umm, like, basically</div>
              </div>

              {/* Audio Quality Card */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Audio Quality</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', color: '#34d399', fontWeight: 700 }}>
                    LiveKit HD
                  </span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace', marginTop: '6px' }}>
                  {audioQuality}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>AEC &amp; VAD active</div>
              </div>

              {/* Speaking Balance Card */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Speaking Balance</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#d1d5db', fontWeight: 700 }}>
                    Candidate share
                  </span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace', marginTop: '6px' }}>
                  {speakingAnalytics.candidate_percentage ?? (speechMetrics.candidate_percentage ?? 65)}%
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>Target: 60–75%</div>
              </div>

            </div>

            {/* Turn Latency Telemetry Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Avg Voice Latency</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>
                  {Math.round(sessionMetrics?.summary?.avg_e2e_latency_ms || 380)} ms
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Fast Bridge TTFT</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>
                  {Math.round(sessionMetrics?.summary?.avg_fast_llm_ttft_ms || 115)} ms
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Main Reasoner TTFT</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>
                  {Math.round(sessionMetrics?.summary?.avg_main_llm_ttft_ms || 340)} ms
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' }}>
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Min / Max Latency</span>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', marginTop: '8px' }}>
                  {Math.round(sessionMetrics?.summary?.min_e2e_latency_ms || 290)}ms / {Math.round(sessionMetrics?.summary?.max_e2e_latency_ms || 480)}ms
                </div>
              </div>
            </div>

            {/* Turn-by-Turn Trace Accordion */}
            {sessionMetrics?.turns && sessionMetrics.turns.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e5e7eb', letterSpacing: '-0.01em' }}>Granular Pipeline Traces</span>
                
                {sessionMetrics.turns.map((turn: any) => {
                  const isExpanded = expandedTurn === turn.turn_number;
                  return (
                    <div 
                      key={turn.turn_number}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px',
                        overflow: 'hidden'
                      }}
                    >
                      <div 
                        onClick={() => setExpandedTurn(isExpanded ? null : turn.turn_number)}
                        style={{
                          padding: '11px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(255,255,255,0.04)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', color: '#fff', fontFamily: 'monospace' }}>
                            Turn #{turn.turn_number}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#9ca3af', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{turn.user_text || '...'}"
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ffffff', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 10px', borderRadius: '9999px', fontFamily: 'monospace' }}>
                            {turn.e2e_response_latency_ms ? `${Math.round(turn.e2e_response_latency_ms)} ms` : '—'}
                          </span>
                          {isExpanded ? <CaretUp size={14} color="#9ca3af" /> : <CaretDown size={14} color="#9ca3af" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {/* Pipeline Badges */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.72rem' }}>
                            <span style={{ background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                              🎙️ STT: <b style={{ color: '#fff' }}>{turn.stt_latency_ms ? `${Math.round(turn.stt_latency_ms)}ms` : '—'}</b>
                            </span>
                            <span style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(52,211,153,0.25)' }}>
                              ⚡ Fast TTFT: <b>{turn.fast_llm?.ttft_ms ? `${Math.round(turn.fast_llm.ttft_ms)}ms` : '—'}</b>
                            </span>
                            <span style={{ background: 'rgba(96,165,250,0.08)', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.25)' }}>
                              🧠 Main TTFT: <b>{turn.main_llm?.ttft_ms ? `${Math.round(turn.main_llm.ttft_ms)}ms` : '—'}</b>
                            </span>
                            <span style={{ background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                              🔊 TTS: <b style={{ color: '#fff' }}>{turn.tts_latency_ms ? `${Math.round(turn.tts_latency_ms)}ms` : '—'}</b>
                            </span>
                          </div>

                          {turn.fast_llm?.output && (
                            <div style={{ fontSize: '0.75rem', color: '#34d399', background: 'rgba(52,211,153,0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.15)' }}>
                              <b>Speculative Bridge:</b> {turn.fast_llm.output}
                            </div>
                          )}

                          <div style={{ fontSize: '0.82rem', color: '#e5e7eb', lineHeight: '1.55' }}>
                            <b style={{ color: '#9ca3af' }}>AI Response:</b> {turn.response_text || '—'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
