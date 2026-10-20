import React, { useState, useEffect } from 'react';
import { 
  Code2, 
  Terminal, 
  Map, 
  CheckCircle2, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  X, 
  RefreshCw,
  FileCode,
  AlertTriangle
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { CodingStats, RoadmapStats, DSAQuestionItem, DSASubmissionItem } from '../../services/adminService';
import '../../styles/AdminAnalytics.css';

interface CodingAnalyticsProps {
  initialCodingStats?: CodingStats;
  initialRoadmapStats?: RoadmapStats;
}

export const CodingAnalytics: React.FC<CodingAnalyticsProps> = ({ initialCodingStats, initialRoadmapStats }) => {
  const [codingStats, setCodingStats] = useState<CodingStats | null>(initialCodingStats || null);
  const [roadmapStats, setRoadmapStats] = useState<RoadmapStats | null>(initialRoadmapStats || null);

  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'submissions'>('catalog');

  // 1. Question Catalog State
  const [questions, setQuestions] = useState<DSAQuestionItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [qSearch, setQSearch] = useState('');
  const [qDiffFilter, setQDiffFilter] = useState<string>('all');
  const [qPage, setQPage] = useState(1);
  const [qTotalPages, setQTotalPages] = useState(1);
  const [qTotalCount, setQTotalCount] = useState(0);

  // Question Modal (Create / Edit)
  const [isQModalOpen, setIsQModalOpen] = useState(false);
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [qForm, setQForm] = useState<Partial<DSAQuestionItem>>({
    title: '',
    description: '',
    difficulty: 'Easy',
    function_name: '',
    hints: '',
    optimal_time_complexity: 'O(N)',
    optimal_space_complexity: 'O(1)',
    test_cases: '[{"args": [], "expected": null}]',
    python_starter_code: 'def solution():\n    pass',
    cpp_starter_code: 'void solution() {\n    \n}'
  });

  // 2. Submissions Feed State
  const [submissions, setSubmissions] = useState<DSASubmissionItem[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);
  const [subTotalCount, setSubTotalCount] = useState(0);

  // Submission Inspector Modal
  const [selectedSub, setSelectedSub] = useState<DSASubmissionItem | null>(null);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const loadStats = async () => {
    try {
      const [c, r] = await Promise.all([
        adminService.getCodingStats().catch(() => null),
        adminService.getRoadmapStats().catch(() => null)
      ]);
      if (c) setCodingStats(c);
      if (r) setRoadmapStats(r);
    } catch (e) {
      console.warn("Could not load stats:", e);
    }
  };

  const loadQuestions = async () => {
    try {
      setLoadingQuestions(true);
      const data = await adminService.getDSAQuestions({
        page: qPage,
        limit: 15,
        difficulty: qDiffFilter === 'all' ? undefined : qDiffFilter,
        search: qSearch.trim() || undefined
      });
      setQuestions(data.items || []);
      setQTotalPages(data.pages || 1);
      setQTotalCount(data.total || (data.items ? data.items.length : 0));
    } catch (e) {
      console.error("Failed to load questions:", e);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const loadSubmissions = async () => {
    try {
      setLoadingSubmissions(true);
      const data = await adminService.getDSASubmissions({
        page: subPage,
        limit: 15,
        status: subStatusFilter === 'all' ? undefined : subStatusFilter
      });
      setSubmissions(data.items || []);
      setSubTotalPages(data.pages || 1);
      setSubTotalCount(data.total || (data.items ? data.items.length : 0));
    } catch (e) {
      console.error("Failed to load submissions:", e);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'catalog') {
      loadQuestions();
    } else {
      loadSubmissions();
    }
  }, [activeSubTab, qPage, qDiffFilter, subPage, subStatusFilter]);

  const handleQSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQPage(1);
    loadQuestions();
  };

  const handleOpenCreateModal = () => {
    setEditingQId(null);
    setQForm({
      title: '',
      description: '',
      difficulty: 'Easy',
      function_name: '',
      hints: '',
      optimal_time_complexity: 'O(N)',
      optimal_space_complexity: 'O(1)',
      test_cases: '[{"args": [], "expected": null}]',
      python_starter_code: 'def solution():\n    pass',
      cpp_starter_code: 'void solution() {\n    \n}'
    });
    setIsQModalOpen(true);
  };

  const handleOpenEditModal = async (qId: number) => {
    try {
      const q = await adminService.getDSAQuestion(qId);
      setEditingQId(qId);
      setQForm({
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        function_name: q.function_name || '',
        hints: q.hints || '',
        optimal_time_complexity: q.optimal_time_complexity || 'O(N)',
        optimal_space_complexity: q.optimal_space_complexity || 'O(1)',
        test_cases: q.test_cases || '[]',
        python_starter_code: q.python_starter_code || '',
        cpp_starter_code: q.cpp_starter_code || ''
      });
      setIsQModalOpen(true);
    } catch (e: any) {
      alert("Failed to load question details: " + e.message);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingQId) {
        await adminService.updateDSAQuestion(editingQId, qForm);
        alert("Question updated successfully!");
      } else {
        await adminService.createDSAQuestion(qForm);
        alert("New question created successfully!");
      }
      setIsQModalOpen(false);
      loadQuestions();
      loadStats();
    } catch (e: any) {
      alert("Failed to save question: " + e.message);
    }
  };

  const handleDeleteQuestion = async (qId: number) => {
    setConfirmState({
      title: 'Delete DSA Problem',
      message: `Are you sure you want to permanently delete question #${qId}?`,
      confirmLabel: 'Delete Problem',
      onConfirm: async () => {
        try {
          await adminService.deleteDSAQuestion(qId);
          setQuestions(questions.filter(q => q.id !== qId));
          loadStats();
        } catch (e: any) {
          alert("Failed to delete question: " + e.message);
        }
      }
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="admin-tab-content ana-tab-content">
      {/* 0. Page header block */}
      <div className="ana-tab-header">
        <div className="ana-tab-header-main">
          <div className="ana-tab-title-row">
            <h2 className="ana-tab-title">DSA Catalog &amp; Submissions</h2>
            <span className="ana-count-chip">{codingStats?.total_questions ?? qTotalCount} problems</span>
          </div>
          <p className="ana-tab-subtitle">
            Problem bank with optimal-complexity metadata, plus the live code submission feed.
          </p>
        </div>
        <div className="ana-tab-header-actions">
          <button
            className="ana-icon-refresh"
            title="Refresh coding data"
            aria-label="Refresh coding data"
            onClick={() => {
              loadStats();
              if (activeSubTab === 'catalog') {
                loadQuestions();
              } else {
                loadSubmissions();
              }
            }}
          >
            <RefreshCw size={16} className={(activeSubTab === 'catalog' ? loadingQuestions : loadingSubmissions) ? 'ana-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 1. Header Metrics Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon orange">
            <Code2 size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Problem Catalogue</span>
            <span className="admin-stat-val">{codingStats?.total_questions ?? qTotalCount}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon green">
            <Terminal size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Code Runs Executed</span>
            <span className="admin-stat-val">{codingStats?.runs ?? '-'}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon amber">
            <CheckCircle2 size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Passed Submissions</span>
            <span className="admin-stat-val">{codingStats?.passed_submissions ?? '-'}</span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon gold">
            <Map size={20} />
          </div>
          <div className="admin-stat-info">
            <span className="admin-stat-label">Active Roadmaps</span>
            <span className="admin-stat-val">{roadmapStats?.total_roadmaps ?? '-'}</span>
          </div>
        </div>
      </div>

      {/* 2. Sub-tab switcher */}
      <div className="admin-subtabs-row">
        <button 
          className={`admin-subtab-btn ${activeSubTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('catalog')}
        >
          <FileCode size={15} />
          <span>DSA Problem Catalog ({qTotalCount})</span>
        </button>
        <button 
          className={`admin-subtab-btn ${activeSubTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('submissions')}
        >
          <Terminal size={15} />
          <span>Live Code Submissions Feed</span>
        </button>
      </div>

      {/* ============================================================
          TAB 1: PROBLEM CATALOG & EDITOR
          ============================================================ */}
      {activeSubTab === 'catalog' && (
        <div className="admin-table-header-card">
          <div className="admin-filter-row ana-toolbar">
            <form onSubmit={handleQSearchSubmit} className="admin-search-box ana-toolbar-search">
              <Search size={16} className="text-gray-400" />
              <input 
                type="text" 
                placeholder="Search problems by title or keywords..."
                aria-label="Search problems by title or keywords"
                value={qSearch}
                onChange={e => setQSearch(e.target.value)}
              />
            </form>

            <div className="admin-filter-group ana-toolbar-actions">
              <select 
                value={qDiffFilter} 
                onChange={(e: any) => { setQDiffFilter(e.target.value); setQPage(1); }}
                className="admin-select"
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <button className="admin-btn-secondary" onClick={() => { setQPage(1); loadQuestions(); }}>
                <RefreshCw size={14} className={loadingQuestions ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button className="admin-btn-primary" onClick={handleOpenCreateModal}>
                <Plus size={15} />
                <span>New Problem</span>
              </button>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table ana-table-mid">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Problem Title</th>
                  <th>Difficulty</th>
                  <th>Function Entry</th>
                  <th>Time / Space</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingQuestions ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="ana-empty">
                        <RefreshCw size={14} className="ana-spin" />
                        <span>Loading problem catalogue...</span>
                      </div>
                    </td>
                  </tr>
                ) : questions.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="ana-empty">
                        <FileCode size={15} />
                        <span>No questions found matching criteria.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  questions.map(q => (
                    <tr key={q.id}>
                      <td className="font-mono text-gray-400">#{q.id}</td>
                      <td>
                        <span className="font-semibold text-white">{q.title}</span>
                      </td>
                      <td>
                        <span className={`admin-stage-pill ${q.difficulty?.toLowerCase() || 'medium'}`}>
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-orange-300">{q.function_name || 'solution'}()</td>
                      <td className="font-mono text-xs text-gray-400">
                        {q.optimal_time_complexity || 'O(N)'} / {q.optimal_space_complexity || 'O(1)'}
                      </td>
                      <td className="text-xs text-gray-400">{formatDate(q.created_at)}</td>
                      <td>
                        <div className="admin-action-btns">
                          <button 
                            className="admin-icon-btn edit" 
                            title="Edit Problem" 
                            onClick={() => handleOpenEditModal(q.id)}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            className="admin-icon-btn delete" 
                            title="Delete Problem"
                            onClick={() => handleDeleteQuestion(q.id)}
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

          <div className="admin-pagination">
            <span className="text-xs text-gray-400">Page <span className="ana-mono">{qPage}</span> of <span className="ana-mono">{qTotalPages}</span> (<span className="ana-mono">{qTotalCount}</span> problems)</span>
            <div className="flex gap-2">
              <button 
                disabled={qPage <= 1} 
                onClick={() => setQPage(p => p - 1)}
                className="admin-btn-page"
              >
                Previous
              </button>
              <button 
                disabled={qPage >= qTotalPages} 
                onClick={() => setQPage(p => p + 1)}
                className="admin-btn-page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: LIVE SUBMISSIONS FEED
          ============================================================ */}
      {activeSubTab === 'submissions' && (
        <div className="admin-table-header-card">
          <div className="admin-filter-row ana-toolbar">
            <div className="admin-filter-group">
              <select 
                value={subStatusFilter} 
                onChange={(e: any) => { setSubStatusFilter(e.target.value); setSubPage(1); }}
                className="admin-select"
                aria-label="Filter submissions by status"
              >
                <option value="all">All Submission Statuses</option>
                <option value="Accepted">Accepted Only</option>
                <option value="Wrong Answer">Wrong Answer</option>
                <option value="Runtime Error">Runtime Error</option>
                <option value="Time Limit Exceeded">Time Limit Exceeded</option>
              </select>

              <button className="admin-btn-secondary" onClick={() => { setSubPage(1); loadSubmissions(); }}>
                <RefreshCw size={14} className={loadingSubmissions ? 'animate-spin' : ''} />
                <span>Refresh Feed</span>
              </button>
            </div>

            <div className="ana-toolbar-end">
              <span className="ana-live-chip">
                <span className="ana-live-dot" />
                Live Feed
              </span>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table ana-table-mid">
              <thead>
                <tr>
                  <th>Submission ID</th>
                  <th>Session / Candidate</th>
                  <th>Question ID</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>Submitted At</th>
                  <th className="text-right">Inspect Code</th>
                </tr>
              </thead>
              <tbody>
                {loadingSubmissions ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="ana-empty">
                        <RefreshCw size={14} className="ana-spin" />
                        <span>Loading code submissions...</span>
                      </div>
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="ana-empty">
                        <Terminal size={15} />
                        <span>No code submissions found.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  submissions.map(s => (
                    <tr key={s.id}>
                      <td className="font-mono text-gray-400">#{s.id}</td>
                      <td className="font-mono text-xs text-white">{s.session_id || 'guest_run'}</td>
                      <td className="font-mono text-xs text-orange-300">Problem #{s.question_id}</td>
                      <td>
                        <span className="admin-track-pill">{s.language || 'python'}</span>
                      </td>
                      <td>
                        <span className={`admin-stage-pill ${s.status === 'Accepted' ? 'completed' : 'in_progress'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="text-xs text-gray-400">{formatDate(s.created_at)}</td>
                      <td>
                        <div className="admin-action-btns">
                          <button 
                            className="admin-icon-btn view" 
                            title="Inspect Code" 
                            onClick={() => setSelectedSub(s)}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span className="text-xs text-gray-400">Page <span className="ana-mono">{subPage}</span> of <span className="ana-mono">{subTotalPages}</span> (<span className="ana-mono">{subTotalCount}</span> submissions)</span>
            <div className="flex gap-2">
              <button 
                disabled={subPage <= 1} 
                onClick={() => setSubPage(p => p - 1)}
                className="admin-btn-page"
              >
                Previous
              </button>
              <button 
                disabled={subPage >= subTotalPages} 
                onClick={() => setSubPage(p => p + 1)}
                className="admin-btn-page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          CREATE / EDIT PROBLEM MODAL
          ============================================================ */}
      {isQModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card ana-modal-lg" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {editingQId ? `Edit Problem #${editingQId}` : 'Create New DSA Problem'}
              </h3>
              <button className="admin-modal-close" onClick={() => setIsQModalOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="admin-modal-form">
              <div className="grid grid-cols-2 gap-3">
                <div className="admin-form-group">
                  <label>Problem Title</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Valid Palindrome"
                    value={qForm.title || ''}
                    onChange={e => setQForm({ ...qForm, title: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Difficulty</label>
                  <select 
                    value={qForm.difficulty || 'Easy'}
                    onChange={(e: any) => setQForm({ ...qForm, difficulty: e.target.value })}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-group">
                <label>Problem Statement / Markdown Description</label>
                <textarea 
                  rows={4}
                  required
                  placeholder="Given a string s, return true if it is a palindrome..."
                  value={qForm.description || ''}
                  onChange={e => setQForm({ ...qForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="admin-form-group">
                  <label>Function Name</label>
                  <input 
                    type="text" 
                    placeholder="isPalindrome"
                    value={qForm.function_name || ''}
                    onChange={e => setQForm({ ...qForm, function_name: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Optimal Time</label>
                  <input 
                    type="text" 
                    placeholder="O(N)"
                    value={qForm.optimal_time_complexity || ''}
                    onChange={e => setQForm({ ...qForm, optimal_time_complexity: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Optimal Space</label>
                  <input 
                    type="text" 
                    placeholder="O(1)"
                    value={qForm.optimal_space_complexity || ''}
                    onChange={e => setQForm({ ...qForm, optimal_space_complexity: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label>Hints / Editorial Notes</label>
                <input 
                  type="text" 
                  placeholder="Two pointers approach from left and right."
                  value={qForm.hints || ''}
                  onChange={e => setQForm({ ...qForm, hints: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label>Test Cases (JSON Format)</label>
                <textarea 
                  rows={3}
                  className="font-mono text-xs"
                  placeholder='[{"args": ["A man, a plan, a canal: Panama"], "expected": true}]'
                  value={qForm.test_cases || ''}
                  onChange={e => setQForm({ ...qForm, test_cases: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="admin-form-group">
                  <label>Python Starter Code</label>
                  <textarea 
                    rows={4}
                    className="font-mono text-xs"
                    value={qForm.python_starter_code || ''}
                    onChange={e => setQForm({ ...qForm, python_starter_code: e.target.value })}
                  />
                </div>
                <div className="admin-form-group">
                  <label>C++ Starter Code</label>
                  <textarea 
                    rows={4}
                    className="font-mono text-xs"
                    value={qForm.cpp_starter_code || ''}
                    onChange={e => setQForm({ ...qForm, cpp_starter_code: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={() => setIsQModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary">
                  {editingQId ? 'Save Changes' : 'Publish Problem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          INSPECT CODE SUBMISSION MODAL
          ============================================================ */}
      {selectedSub && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card ana-modal-lg" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">
                  Submission #{selectedSub.id} — Problem #{selectedSub.question_id}
                </h3>
                <span className="text-xs text-gray-400">
                  Candidate: {selectedSub.session_id || 'anonymous'} • Status: {selectedSub.status}
                </span>
              </div>
              <button className="admin-modal-close" onClick={() => setSelectedSub(null)} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-code-container">
                <div className="admin-code-header">
                  <span className="font-mono text-xs text-orange-300">{selectedSub.language || 'python'}</span>
                  <span className={`admin-stage-pill ${selectedSub.status === 'Accepted' ? 'completed' : 'in_progress'}`}>
                    {selectedSub.status}
                  </span>
                </div>
                <pre className="admin-code-block ana-code-block">
                  <code>{selectedSub.code}</code>
                </pre>
              </div>

              {selectedSub.error_message && (
                <div className="admin-error-box mt-3">
                  <h5 className="text-xs font-bold text-red-400 mb-1">Execution Traceback</h5>
                  <pre className="text-xs text-red-300 font-mono">{selectedSub.error_message}</pre>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setSelectedSub(null)}>
                Close Inspector
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
