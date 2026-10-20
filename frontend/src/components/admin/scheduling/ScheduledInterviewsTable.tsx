import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Search,
  Plus,
  ExternalLink,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { CopyInviteButton } from './CopyInviteButton';
import '../../../styles/AdminScheduling.css';

interface ScheduledInterviewsTableProps {
  onNavigate?: (page: string, params?: any) => void;
}

export const ScheduledInterviewsTable: React.FC<ScheduledInterviewsTableProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchScheduled = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminService.getScheduledInterviews({
        page,
        limit: 15,
        status: statusFilter,
        search: searchQuery.trim() || undefined,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch scheduled candidate interviews.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    fetchScheduled();
  }, [fetchScheduled]);

  const handleCancelInvite = async (sessionId: string, candidateName: string) => {
    if (!window.confirm(`Are you sure you want to cancel the interview for "${candidateName}"? The candidate will no longer be able to use their invitation link.`)) {
      return;
    }

    try {
      await adminService.cancelScheduledInterview(sessionId);
      setActionSuccessMsg(`Interview for ${candidateName} has been cancelled.`);
      setTimeout(() => setActionSuccessMsg(null), 3500);
      fetchScheduled();
    } catch (err: any) {
      alert(`Failed to cancel interview: ${err.message}`);
    }
  };

  const getTrackBadge = (track: string) => {
    const t = (track || '').toLowerCase();
    if (t.includes('dsa') || t.includes('coding') || t.includes('swe')) {
      return <span className="sch-chip">DSA / Code</span>;
    }
    if (t.includes('system') || t.includes('design')) {
      return <span className="sch-chip">System Design</span>;
    }
    if (t.includes('behavioral') || t.includes('star')) {
      return <span className="sch-chip">Behavioral</span>;
    }
    if (t.includes('pm') || t.includes('product')) {
      return <span className="sch-chip">PM Strategy</span>;
    }
    return <span className="sch-chip">AI / ML</span>;
  };

  const getDifficultyChip = (difficulty?: string) => {
    if (!difficulty) return null;
    const d = difficulty.toLowerCase();
    const dotClass = d.includes('easy') ? 'sch-dot-green' : d.includes('hard') ? 'sch-dot-red' : 'sch-dot-amber';
    return (
      <span className="sch-chip" style={{ textTransform: 'capitalize', letterSpacing: '0.04em' }}>
        <span className={`sch-dot ${dotClass}`} />
        <span>{difficulty}</span>
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'in_progress':
        return (
          <span className="sch-status sch-status-progress">
            <span className="sch-status-dot sch-pulse" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="sch-status sch-status-completed">
            <span className="sch-status-dot" />
            Completed
          </span>
        );
      case 'expired':
        return (
          <span className="sch-status sch-status-expired">
            <span className="sch-status-dot" />
            Expired
          </span>
        );
      case 'cancelled':
        return (
          <span className="sch-status sch-status-cancelled">
            <span className="sch-status-dot" />
            Cancelled
          </span>
        );
      case 'scheduled':
      default:
        return (
          <span className="sch-status sch-status-scheduled">
            <span className="sch-status-dot" />
            Scheduled
          </span>
        );
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All Invites' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'expired', label: 'Expired' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="sch-root">

      {/* Page header & primary action */}
      <header className="sch-page-head">
        <div>
          <div className="sch-page-title-row">
            <h2 className="sch-page-title">Scheduled Candidate Interviews</h2>
            <span className="sch-total-chip">
              <span className="sch-total-num">{total}</span>
              <span>Total</span>
            </span>
          </div>
          <p className="sch-page-sub">
            Dispatch zero-friction interview invitation links to external candidates. Candidates can join in one click
            with live hardware checks and zero registration friction.
          </p>
        </div>

        <div className="sch-head-actions">
          <button
            type="button"
            onClick={() => fetchScheduled()}
            className="sch-icon-btn"
            title="Refresh list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setIsScheduleModalOpen(true)}
            className="sch-btn sch-btn-primary"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Schedule Candidate Interview</span>
          </button>
        </div>
      </header>

      {actionSuccessMsg && (
        <div className="sch-alert sch-alert-ok sch-fade">
          <CheckCircle2 size={16} />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="sch-alert sch-alert-err sch-fade">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Toolbar + table card */}
      <div className="sch-card">

        <div className="sch-toolbar">
          <div className="sch-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search candidate name or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="sch-pills">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`sch-pill ${statusFilter === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sch-table-scroll">
          <table className="sch-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Track &amp; Level</th>
                <th>Scheduled / Created</th>
                <th>Problems</th>
                <th>Status</th>
                <th>Score</th>
                <th className="sch-cell-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td>
                      <div className="sch-skel-cand">
                        <span className="sch-skel sch-skel-avatar" />
                        <span className="sch-skel-lines">
                          <span className="sch-skel" style={{ width: '58%' }} />
                          <span className="sch-skel" style={{ width: '40%' }} />
                        </span>
                      </div>
                    </td>
                    <td><span className="sch-skel" style={{ width: '70%' }} /></td>
                    <td><span className="sch-skel" style={{ width: '62%' }} /></td>
                    <td><span className="sch-skel" style={{ width: '48%' }} /></td>
                    <td><span className="sch-skel" style={{ width: '86%', height: 22, borderRadius: 999 }} /></td>
                    <td><span className="sch-skel" style={{ width: '44%' }} /></td>
                    <td>
                      <div className="sch-actions">
                        <span className="sch-skel" style={{ width: 32, height: 32, borderRadius: 9 }} />
                        <span className="sch-skel" style={{ width: 32, height: 32, borderRadius: 9 }} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="sch-state">
                      <div className="sch-state-icon">
                        <Calendar size={20} />
                      </div>
                      <p className="sch-state-title" style={{ margin: 0 }}>No scheduled candidate interviews found.</p>
                      <p className="sch-state-sub" style={{ margin: 0 }}>
                        Click "+ Schedule Candidate Interview" above to invite a candidate.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const createdDate = item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
                  const scheduledDate = item.scheduled_at ? new Date(item.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
                  const isFinished = item.stage === 'completed' || item.status === 'completed';

                  return (
                    <tr key={item.id}>
                      {/* Candidate */}
                      <td>
                        <div className="sch-cand">
                          <div className="sch-avatar">
                            {item.candidate_name ? item.candidate_name[0] : 'C'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="sch-cand-name">{item.candidate_name}</div>
                            <div className="sch-cand-mail">{item.candidate_email || 'No email provided'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Track & Difficulty */}
                      <td>
                        <div className="sch-stack">
                          {getTrackBadge(item.interview_type)}
                          {item.difficulty && getDifficultyChip(item.difficulty)}
                        </div>
                      </td>

                      {/* Scheduled / Created Date */}
                      <td className="sch-nw">
                        {scheduledDate ? (
                          <div>
                            <div className="sch-date-main">{scheduledDate}</div>
                            <div className="sch-date-sub">Scheduled slot</div>
                          </div>
                        ) : (
                          <div>
                            <div className="sch-date-main">{createdDate}</div>
                            <div className="sch-date-sub">On-demand link</div>
                          </div>
                        )}
                      </td>

                      {/* Questions Count */}
                      <td className="sch-nw">
                        {item.questions_count !== undefined ? (
                          <span className="sch-metric">
                            <span className="sch-mono">{item.questions_count}</span>
                            <span className="sch-metric-unit">Problems</span>
                          </span>
                        ) : (
                          <span className="sch-metric">
                            <span className="sch-mono">AI</span>
                            <span className="sch-metric-unit">Auto</span>
                          </span>
                        )}
                      </td>

                      {/* Live Status Badge */}
                      <td className="sch-nw">{getStatusBadge(item.status)}</td>

                      {/* Score */}
                      <td className="sch-nw">
                        {isFinished && item.score !== undefined && item.score !== null ? (
                          <span className="sch-metric">
                            <span className="sch-score">{item.score}</span>
                            <span className="sch-score-total">/100</span>
                          </span>
                        ) : (
                          <span className="sch-dash">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="sch-actions">
                          {/* Copy Direct Link */}
                          {item.invite_url && (
                            <CopyInviteButton
                              url={item.invite_url}
                              showIconOnly={true}
                            />
                          )}

                          {/* Open Report (if completed) or Preview Link */}
                          {isFinished && item.invite_token ? (
                            <a
                              href={`/interview/invite/${item.invite_token}/report`}
                              target="_blank"
                              rel="noreferrer"
                              title="View Candidate Scorecard Report"
                              className="sch-act-btn sch-act-report"
                            >
                              <FileCheck size={15} />
                            </a>
                          ) : (
                            item.invite_url && (
                              <a
                                href={item.invite_url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open Candidate Welcome Page"
                                className="sch-act-btn sch-act-open"
                              >
                                <ExternalLink size={15} />
                              </a>
                            )
                          )}

                          {/* Cancel Invite */}
                          {item.status !== 'cancelled' && item.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleCancelInvite(item.id, item.candidate_name)}
                              title="Cancel & Revoke Invite Link"
                              className="sch-act-btn sch-act-danger"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pages > 1 && (
          <div className="sch-pagination">
            <div className="sch-page-info">
              Showing page <span className="sch-page-num">{page}</span> of{' '}
              <span className="sch-page-num">{pages}</span>{' '}
              <span className="sch-page-dim">({total} total invitations)</span>
            </div>
            <div className="sch-page-btns">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="sch-page-btn"
              >
                <ChevronLeft size={15} />
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className="sch-page-btn"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Schedule Interview Modal Form */}
      <ScheduleInterviewModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        onSuccess={() => {
          fetchScheduled();
        }}
      />
    </div>
  );
};
