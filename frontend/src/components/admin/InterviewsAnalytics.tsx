import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Trash2, 
  Eye, 
  X, 
  TrendingUp, 
  MessageSquare, 
  RefreshCw,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { InterviewStats, InterviewListItem, InterviewSessionAudit } from '../../services/adminService';
import { computeUnifiedInterviewScore } from '../../utils/interviewScore';
import '../../styles/AdminAnalytics.css';

interface InterviewsAnalyticsProps {
  initialStats?: InterviewStats;
}

export const InterviewsAnalytics: React.FC<InterviewsAnalyticsProps> = ({ initialStats }) => {
  const [stats, setStats] = useState<InterviewStats | null>(initialStats || null);
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Session Audit & Score Override Modal
  const [selectedAudit, setSelectedAudit] = useState<InterviewSessionAudit | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    technical_score: 90,
    communication_score: 85,
    english_score: 88,
    reason: ''
  });

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const loadStats = async () => {
    try {
      const s = await adminService.getInterviewStats();
      setStats(s);
    } catch (e) {
      console.warn("Could not load interview stats:", e);
    }
  };

  const loadInterviews = async () => {
    try {
      setLoading(true);
      const data = await adminService.getInterviews({
        page,
        limit: 15,
        search: search.trim() || undefined,
        interview_type: typeFilter === 'all' ? undefined : typeFilter,
        status: stageFilter === 'all' ? undefined : stageFilter
      });
      setInterviews(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalCount(data.total || (data.items ? data.items.length : 0));
    } catch (e) {
      console.error("Failed to load interviews:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadInterviews();
  }, [page, typeFilter, stageFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInterviews();
  };

  const handleOpenAudit = async (sessionId: string) => {
    try {
      setLoadingAudit(true);
      const audit = await adminService.getInterviewSessionAudit(sessionId);
      setSelectedAudit(audit);
      setOverrideForm({
        technical_score: audit.feedback?.technical_score || 85,
        communication_score: audit.feedback?.communication_score || 80,
        english_score: audit.feedback?.english_score || 85,
        reason: ''
      });
      setIsOverrideMode(false);
    } catch (e: any) {
      alert("Failed to load session audit: " + e.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleSaveScoreOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAudit) return;
    try {
      await adminService.overrideInterviewScore(selectedAudit.id, overrideForm);
      alert("Interview scores successfully updated!");
      setIsOverrideMode(false);
      // Reload audit and list
      const updatedAudit = await adminService.getInterviewSessionAudit(selectedAudit.id);
      setSelectedAudit(updatedAudit);
      loadInterviews();
    } catch (e: any) {
      alert("Failed to override score: " + e.message);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setConfirmState({
      title: 'Delete Interview Session',
      message: `Are you sure you want to permanently delete interview session ${sessionId}?`,
      confirmLabel: 'Delete Session',
      onConfirm: async () => {
        try {
          await adminService.deleteInterviewSession(sessionId);
          setInterviews(interviews.filter(i => i.id !== sessionId));
          loadStats();
        } catch (e: any) {
          alert("Failed to delete interview session: " + e.message);
        }
      }
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="admin-tab-content ana-tab-content">
      {/* 0. Page header block */}
      <div className="ana-tab-header">
        <div className="ana-tab-header-main">
          <div className="ana-tab-title-row">
            <h2 className="ana-tab-title">Mock Interviews Audit</h2>
            <span className="ana-count-chip">{stats?.total_interviews ?? totalCount} sessions</span>
          </div>
          <p className="ana-tab-subtitle">
            Every mock session with stage telemetry, rubric scores, and full conversational transcripts.
          </p>
        </div>
        <div className="ana-tab-header-actions">
          <button
            className="ana-icon-refresh"
            title="Refresh interview data"
            aria-label="Refresh interview data"
            onClick={() => { setPage(1); loadInterviews(); loadStats(); }}
          >
            <RefreshCw size={16} className={loading ? 'ana-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 1. Header Metrics Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon orange">
            <Video size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Total Mock Interviews</span>
            <span className="admin-stat-val">{stats?.total_interviews ?? totalCount}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon green">
            <Clock size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Total Voice Minutes</span>
            <span className="admin-stat-val">{Math.round(stats?.total_minutes || 0).toLocaleString()}m</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon amber">
            <TrendingUp size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">DSA Track Sessions</span>
            <span className="admin-stat-val">{stats?.categories?.dsa || 0}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon gold">
            <MessageSquare size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">System Design &amp; Others</span>
            <span className="admin-stat-val">{(stats?.categories?.system_design || 0) + (stats?.categories?.behavioral || 0)}</span>
          </div>
        </div>
      </div>

      {/* 2. Directory & Filters */}
      <div className="admin-table-header-card">
        <div className="admin-filter-row ana-toolbar">
          <form onSubmit={handleSearchSubmit} className="admin-search-box ana-toolbar-search">
            <Search size={16} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="Search candidate name or session ID..."
              aria-label="Search candidate name or session ID"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>

          <div className="admin-filter-group ana-toolbar-actions">
            <select 
              value={typeFilter} 
              onChange={(e: any) => { setTypeFilter(e.target.value); setPage(1); }}
              className="admin-select"
            >
              <option value="all">All Tracks</option>
              <option value="dsa">DSA Interview</option>
              <option value="system_design">System Design</option>
              <option value="behavioral">Behavioral</option>
              <option value="pm">Product Manager</option>
              <option value="aiml">AI / ML</option>
            </select>

            <select 
              value={stageFilter} 
              onChange={(e: any) => { setStageFilter(e.target.value); setPage(1); }}
              className="admin-select"
            >
              <option value="all">All Stages</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="abandoned">Abandoned</option>
            </select>

            <button className="admin-btn-secondary" onClick={() => { setPage(1); loadInterviews(); }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 3. Paginated Interviews Table */}
        <div className="admin-table-wrapper">
          <table className="admin-table ana-table-wide">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Candidate</th>
                <th>Track / Type</th>
                <th>Stage</th>
                <th>Duration</th>
                <th>Score</th>
                <th>Conducted</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="ana-empty">
                      <RefreshCw size={14} className="ana-spin" />
                      <span>Loading interview sessions...</span>
                    </div>
                  </td>
                </tr>
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="ana-empty">
                      <Video size={15} />
                      <span>No interview sessions found.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                interviews.map(i => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs text-gray-400">{i.id}</td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{i.candidate_name || 'Candidate'}</span>
                        <span className="text-xs text-gray-400 font-mono">{i.user_email}</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-track-pill">
                        {i.type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-stage-pill ${i.stage === 'completed' ? 'completed' : 'in_progress'}`}>
                        {i.stage}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-gray-300">{Number(i.duration_minutes || 0).toFixed(1)}m</td>
                    <td>
                      {i.score !== undefined && i.score !== null ? (
                        <span className="font-mono font-bold text-orange-400">{i.score}/100</span>
                      ) : (
                        <span className="text-gray-500 font-mono">-</span>
                      )}
                    </td>
                    <td className="text-xs text-gray-400">{formatDate(i.created_at)}</td>
                    <td>
                      <div className="admin-action-btns">
                        <button 
                          className="admin-icon-btn view" 
                          title="Audit Full Session" 
                          onClick={() => handleOpenAudit(i.id)}
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          className="admin-icon-btn delete" 
                          title="Delete Session"
                          onClick={() => handleDeleteSession(i.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="admin-pagination">
          <span className="text-xs text-gray-400">Page <span className="ana-mono">{page}</span> of <span className="ana-mono">{totalPages}</span> (<span className="ana-mono">{totalCount}</span> sessions)</span>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(p => p - 1)}
              className="admin-btn-page"
            >
              Previous
            </button>
            <button 
              disabled={page >= totalPages} 
              onClick={() => setPage(p => p + 1)}
              className="admin-btn-page"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          INTERVIEW SESSION AUDIT & SCORE OVERRIDE MODAL
          ============================================================ */}
      {selectedAudit && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card ana-modal-lg" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">
                  Session Audit — {selectedAudit.id}
                </h3>
                <span className="text-xs text-gray-400">
                  {selectedAudit.candidate_name} ({selectedAudit.user?.email || 'Guest'}) • {selectedAudit.interview_type.toUpperCase()}
                </span>
              </div>
              <button className="admin-modal-close" onClick={() => setSelectedAudit(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Score summary & Override toggle */}
              <div className="admin-audit-score-card">
                <div className="ana-score-head">
                  <div className="ana-score-grid">
                    <div className="ana-score-tile">
                      <span className="ana-score-label">Overall Score</span>
                      <span className="ana-score-val">
                        {computeUnifiedInterviewScore(selectedAudit, selectedAudit.interview_type) !== null
                          ? `${computeUnifiedInterviewScore(selectedAudit, selectedAudit.interview_type)}/100`
                          : '-/100'}
                      </span>
                    </div>

                    <div className="ana-score-tile">
                      <span className="ana-score-label">Technical</span>
                      <span className="ana-score-val accent">
                        {selectedAudit.feedback?.technical_score ?? '-'}/100
                      </span>
                    </div>

                    <div className="ana-score-tile">
                      <span className="ana-score-label">Communication</span>
                      <span className="ana-score-val accent">
                        {selectedAudit.feedback?.communication_score ?? '-'}/100
                      </span>
                    </div>

                    <div className="ana-score-tile">
                      <span className="ana-score-label">English Clarity</span>
                      <span className="ana-score-val accent">
                        {selectedAudit.feedback?.english_score ?? '-'}/100
                      </span>
                    </div>
                  </div>

                  <button 
                    className="admin-btn-secondary"
                    onClick={() => setIsOverrideMode(!isOverrideMode)}
                  >
                    <Sliders size={14} />
                    <span>{isOverrideMode ? 'Cancel Override' : 'Override Score'}</span>
                  </button>
                </div>

                {/* Score Override Form */}
                {isOverrideMode && (
                  <form onSubmit={handleSaveScoreOverride} className="admin-override-form mt-4 pt-4 border-t border-white/10">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="admin-form-group">
                        <label>Technical Score</label>
                        <input 
                          type="number" 
                          min={0} 
                          max={100}
                          value={overrideForm.technical_score}
                          onChange={e => setOverrideForm({ ...overrideForm, technical_score: Number(e.target.value) })}
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>Communication</label>
                        <input 
                          type="number" 
                          min={0} 
                          max={100}
                          value={overrideForm.communication_score}
                          onChange={e => setOverrideForm({ ...overrideForm, communication_score: Number(e.target.value) })}
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>English Clarity</label>
                        <input 
                          type="number" 
                          min={0} 
                          max={100}
                          value={overrideForm.english_score}
                          onChange={e => setOverrideForm({ ...overrideForm, english_score: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="admin-form-group mt-3">
                      <label>Audit Reason / Justification</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g. Candidate provided rigorous proof of optimality post-interview review."
                        value={overrideForm.reason}
                        onChange={e => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                      />
                    </div>

                    <div className="flex justify-end gap-2 mt-3">
                      <button type="submit" className="admin-btn-primary">
                        Save Score Override
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="admin-feedback-card">
                  <h5 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> Identified Strengths
                  </h5>
                  <ul className="text-xs text-gray-300 space-y-1 pl-4 list-disc">
                    {selectedAudit.feedback?.strengths && selectedAudit.feedback.strengths.length > 0 ? (
                      selectedAudit.feedback.strengths.map((s, idx) => <li key={idx}>{s}</li>)
                    ) : <li>No specific strengths recorded.</li>}
                  </ul>
                </div>

                <div className="admin-feedback-card">
                  <h5 className="text-sm font-bold text-orange-400 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={15} /> Areas for Improvement
                  </h5>
                  <ul className="text-xs text-gray-300 space-y-1 pl-4 list-disc">
                    {selectedAudit.feedback?.weaknesses && selectedAudit.feedback.weaknesses.length > 0 ? (
                      selectedAudit.feedback.weaknesses.map((w, idx) => <li key={idx}>{w}</li>)
                    ) : <li>No specific weaknesses recorded.</li>}
                  </ul>
                </div>
              </div>

              {/* Conversational Transcript Dialogue */}
              <div className="admin-transcript-section mt-4">
                <h5 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                  <MessageSquare size={15} className="text-orange-400" /> Conversational Transcript
                </h5>
                <div className="admin-transcript-scroller">
                  {selectedAudit.transcript && selectedAudit.transcript.length > 0 ? (
                    selectedAudit.transcript.map((msg, idx) => (
                      <div key={idx} className={`admin-msg-bubble ${msg.role}`}>
                        <span className="admin-msg-role">
                          {msg.role === 'interviewer' ? '🤖 AI Interviewer' : '👤 Candidate'}
                        </span>
                        <p className="admin-msg-text">{msg.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 py-4 text-center">No transcript available for this session.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setSelectedAudit(null)}>
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          DELETE CONFIRMATION MODAL
          ============================================================ */}
      {confirmState && (
        <div className="admin-modal-overlay" onClick={() => setConfirmState(null)}>
          <div
            className="admin-modal-card ana-modal-sm"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{confirmState.title}</h3>
              <button className="admin-modal-close" onClick={() => setConfirmState(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="ana-confirm-body">
                <span className="ana-confirm-icon">
                  <AlertTriangle size={16} />
                </span>
                <p className="ana-confirm-text">{confirmState.message}</p>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setConfirmState(null)}>
                Cancel
              </button>
              <button
                className="ana-btn-danger"
                onClick={() => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  action();
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
