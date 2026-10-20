import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Calendar,
  Mail,
  User,
  Layers,
  Clock,
  CheckCircle2,
  Send,
  AlertCircle,
} from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { QuestionPickerModal, type SelectedQuestion, type CustomQuestionInput } from './QuestionPickerModal';
import { CopyInviteButton } from './CopyInviteButton';

interface ScheduleInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdSession: any) => void;
}

export const ScheduleInterviewModal: React.FC<ScheduleInterviewModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Form State
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [interviewType, setInterviewType] = useState('dsa');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [sendEmail, setSendEmail] = useState(true);
  const [notes, setNotes] = useState('');

  // Selected Questions State
  const [selectedQuestions, setSelectedQuestions] = useState<SelectedQuestion[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestionInput[]>([]);
  const [isQuestionPickerOpen, setIsQuestionPickerOpen] = useState(false);

  // Status & Success state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const trackOptions = [
    { id: 'dsa', label: 'DSA & Algorithms', desc: 'Coding, Data Structures, Complexity Analysis' },
    { id: 'system_design', label: 'System Design', desc: 'Distributed Systems, Architecture, Scalability' },
    { id: 'behavioral', label: 'Behavioral & STAR', desc: 'Culture fit, Leadership, Incident Response' },
    { id: 'pm', label: 'Product Management', desc: 'Product Sense, Strategy, Metric Tradeoffs' },
    { id: 'ai_ml', label: 'AI & Machine Learning', desc: 'MLOps, LLMs, Model Architecture & Training' },
  ];

  const handleReset = () => {
    setCandidateName('');
    setCandidateEmail('');
    setInterviewType('dsa');
    setDifficulty('Medium');
    setScheduledAt('');
    setExpiresInDays(7);
    setSendEmail(true);
    setNotes('');
    setSelectedQuestions([]);
    setCustomQuestions([]);
    setErrorMsg(null);
    setCreatedResult(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!candidateName.trim()) {
      setErrorMsg('Candidate full name is required.');
      return;
    }
    if (!candidateEmail.trim() || !candidateEmail.includes('@')) {
      setErrorMsg('A valid candidate email address is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        candidate_name: candidateName.trim(),
        candidate_email: candidateEmail.trim().toLowerCase(),
        interview_type: interviewType,
        difficulty,
        expires_in_days: expiresInDays,
        send_email: sendEmail,
        notes: notes.trim() || undefined,
      };

      if (scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
      }

      if (selectedQuestions.length > 0) {
        payload.question_ids = selectedQuestions.map((q) => q.id || q.slug);
      }

      if (customQuestions.length > 0) {
        payload.custom_questions = customQuestions;
      }

      const result = await adminService.scheduleInterview(payload);
      setCreatedResult(result);
      if (onSuccess) onSuccess(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to schedule candidate interview. Please check inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div className="sch-modal-overlay">
      <div className="sch-modal sch-modal-lg">

        {/* Modal Header */}
        <div className="sch-modal-head">
          <div className="sch-modal-head-main">
            <div className="sch-modal-icon">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="sch-modal-title">Schedule Candidate Interview</h2>
              <p className="sch-modal-sub">Configure zero-friction invitation link &amp; evaluation parameters</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="sch-modal-close" title="Close">
            <X size={17} />
          </button>
        </div>

        {/* If successfully created, display the Direct Link Success Card */}
        {createdResult ? (
          <>
            <div className="sch-modal-body sch-fade">
              <div className="sch-success">
                <CheckCircle2 size={20} />
                <div>
                  <div className="sch-success-title">Interview Invitation Scheduled!</div>
                  <p className="sch-success-body">
                    Session <span className="sch-mono" style={{ color: '#6ee7b7' }}>{createdResult.session_id}</span> is
                    configured and active.
                    {createdResult.email_sent ? (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        ✓ Direct invitation email dispatched to{' '}
                        <strong style={{ textDecoration: 'underline' }}>{createdResult.candidate_email}</strong>.
                      </span>
                    ) : (
                      <span className="sch-success-dim" style={{ display: 'block', marginTop: 4 }}>
                        Email dispatch was skipped. You can share the direct invite link below.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Direct Invitation Link Box */}
              <div className="sch-link-box">
                <span className="sch-section-title">Direct Candidate Invite URL (No Login Required)</span>
                <div className="sch-link-row">
                  <input
                    type="text"
                    readOnly
                    value={createdResult.invite_url}
                    className="sch-link-input"
                  />
                  <CopyInviteButton url={createdResult.invite_url} buttonText="Copy Link" />
                </div>
              </div>

              {/* Session Summary Metadata */}
              <div className="sch-kv-grid">
                <div>
                  <span className="sch-kv-label">Candidate</span>
                  <span className="sch-kv-value">{createdResult.candidate_name}</span>
                </div>
                <div>
                  <span className="sch-kv-label">Track</span>
                  <span className="sch-kv-value sch-kv-value-orange">{createdResult.interview_type}</span>
                </div>
                <div>
                  <span className="sch-kv-label">Difficulty</span>
                  <span className="sch-kv-value sch-kv-value-amber">{createdResult.difficulty || 'Medium'}</span>
                </div>
                <div>
                  <span className="sch-kv-label">Questions</span>
                  <span className="sch-kv-value">{createdResult.ai_selected_questions?.length || 0} Problems</span>
                </div>
              </div>
            </div>

            <div className="sch-modal-foot">
              <button
                type="button"
                onClick={handleReset}
                className="sch-btn sch-btn-ghost"
              >
                Schedule Another
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="sch-btn sch-btn-primary"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          /* Form Inputs */
          <form onSubmit={handleSubmit} className="sch-modal-form">
            <div className="sch-modal-body">

              {errorMsg && (
                <div className="sch-alert sch-alert-err sch-fade">
                  <AlertCircle size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Candidate Name & Email */}
              <div className="sch-form-grid-2">
                <div className="sch-field">
                  <label className="sch-label">
                    <User size={12} className="sch-label-ico" />
                    <span>Candidate Full Name <span className="sch-req">*</span></span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    className="sch-input"
                  />
                </div>

                <div className="sch-field">
                  <label className="sch-label">
                    <Mail size={12} className="sch-label-ico" />
                    <span>Candidate Email <span className="sch-req">*</span></span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sarah.connor@example.com"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    className="sch-input"
                  />
                </div>
              </div>

              {/* Track Selector */}
              <div className="sch-field">
                <label className="sch-label">
                  <Layers size={12} className="sch-label-ico" />
                  <span>Interview Track</span>
                </label>
                <div className="sch-optgrid-5">
                  {trackOptions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.desc}
                      onClick={() => {
                        setInterviewType(t.id);
                        setSelectedQuestions([]);
                      }}
                      className={`sch-opt ${interviewType === t.id ? 'is-active' : ''}`}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty & Expiration */}
              <div className="sch-form-grid-2">
                <div className="sch-field">
                  <label className="sch-label">Target Difficulty</label>
                  <div className="sch-optgrid-3">
                    {(['Easy', 'Medium', 'Hard'] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setDifficulty(diff)}
                        className={`sch-opt ${
                          diff === 'Easy' ? 'sch-opt-easy' : diff === 'Hard' ? 'sch-opt-hard' : 'sch-opt-med'
                        } ${difficulty === diff ? 'is-active' : ''}`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sch-field">
                  <label className="sch-label">
                    <Clock size={12} className="sch-label-ico" />
                    <span>Link Expiration</span>
                  </label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="sch-input"
                  >
                    <option value={1}>24 Hours</option>
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (Recommended)</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>
              </div>

              {/* Scheduled Date (Optional) */}
              <div className="sch-field">
                <label className="sch-label">Scheduled Date &amp; Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="sch-input"
                />
              </div>

              {/* Interactive Question Selector Button & Chips */}
              <div className="sch-subpanel">
                <div className="sch-subpanel-head">
                  <div>
                    <div className="sch-subpanel-title">Question Selection</div>
                    <div className="sch-subpanel-sub">
                      {selectedQuestions.length === 0 && customQuestions.length === 0
                        ? 'AI auto-selects optimal problems dynamically for track.'
                        : `${selectedQuestions.length + customQuestions.length} custom problem(s) locked.`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQuestionPickerOpen(true)}
                    className="sch-btn sch-btn-soft sch-btn-sm"
                  >
                    {selectedQuestions.length + customQuestions.length === 0
                      ? 'Select Specific Questions (Optional)'
                      : 'Modify Questions'}
                  </button>
                </div>

                {/* Chips for chosen questions */}
                {(selectedQuestions.length > 0 || customQuestions.length > 0) && (
                  <div className="sch-chip-row">
                    {selectedQuestions.map((q) => (
                      <span key={q.id} className="sch-qchip">
                        <span className="sch-qdot" />
                        <span className="sch-qchip-label">{q.title}</span>
                        <button
                          type="button"
                          className="sch-chip-remove"
                          onClick={() => setSelectedQuestions(selectedQuestions.filter((item) => item.id !== q.id))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {customQuestions.map((cq, idx) => (
                      <span key={`custom-${idx}`} className="sch-qchip sch-qchip-custom">
                        <span className="sch-qchip-tag">Custom</span>
                        <span className="sch-qchip-label">{cq.title}</span>
                        <button
                          type="button"
                          className="sch-chip-remove"
                          onClick={() => setCustomQuestions(customQuestions.filter((_, i) => i !== idx))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Interviewer Notes */}
              <div className="sch-field">
                <label className="sch-label">
                  Interviewer Focus Notes / Custom Evaluation Directives (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Focus heavily on edge case handling, concurrency tradeoffs, and Big-O explanations..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="sch-input"
                />
              </div>

              {/* Send Invitation Email Toggle */}
              <div className="sch-subpanel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <Send size={16} className="sch-label-ico" />
                  <div>
                    <div className="sch-subpanel-title">Dispatch Invitation Email</div>
                    <div className="sch-subpanel-sub">
                      Sends branded email via Resend with one-click direct access link.
                    </div>
                  </div>
                </div>
                <label className={`sch-toggle ${sendEmail ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="sch-modal-foot">
              <div className="sch-modal-foot-right">
                <button
                  type="button"
                  onClick={handleClose}
                  className="sch-btn sch-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="sch-btn sch-btn-primary"
                >
                  {submitting ? (
                    <>
                      <div className="sch-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      <span>Scheduling Session...</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={14} />
                      <span>Schedule &amp; Generate Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

      </div>

      {/* Interactive Question Selector Submodal */}
      <QuestionPickerModal
        isOpen={isQuestionPickerOpen}
        onClose={() => setIsQuestionPickerOpen(false)}
        track={interviewType}
        initialSelected={selectedQuestions}
        initialCustom={customQuestions}
        onConfirm={(selected, custom) => {
          setSelectedQuestions(selected);
          setCustomQuestions(custom);
        }}
      />
    </div>
  );

  return createPortal(modal, document.body);
};
