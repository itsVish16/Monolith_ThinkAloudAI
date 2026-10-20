import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Plus,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { adminService } from '../../../services/adminService';

export interface SelectedQuestion {
  id: string;
  slug?: string;
  title: string;
  difficulty: string;
  track: string;
  description?: string;
  isCustom?: boolean;
}

export interface CustomQuestionInput {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  starter_code?: string;
}

interface QuestionPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: string;
  onConfirm: (selectedQuestions: SelectedQuestion[], customQuestions: CustomQuestionInput[]) => void;
  initialSelected?: SelectedQuestion[];
  initialCustom?: CustomQuestionInput[];
}

export const QuestionPickerModal: React.FC<QuestionPickerModalProps> = ({
  isOpen,
  onClose,
  track,
  onConfirm,
  initialSelected = [],
  initialCustom = [],
}) => {
  const [search, setSearch] = useState('');
  const [activeTrack, setActiveTrack] = useState(track || 'dsa');
  const [loading, setLoading] = useState(false);
  const [availableQuestions, setAvailableQuestions] = useState<any[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedQuestion>>({});
  const [customList, setCustomList] = useState<CustomQuestionInput[]>([]);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customForm, setCustomForm] = useState<CustomQuestionInput>({
    title: '',
    description: '',
    difficulty: 'Medium',
    starter_code: '# Write solution here\n',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setActiveTrack(track || 'dsa');
      const initialMap: Record<string, SelectedQuestion> = {};
      initialSelected.forEach((q) => {
        initialMap[q.id] = q;
      });
      setSelectedMap(initialMap);
      setCustomList(initialCustom);
      setIsAddingCustom(false);
      setErrorMsg(null);
    }
  }, [isOpen, track]);

  // Fetch available questions when activeTrack or search changes
  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await adminService.getAvailableQuestions(activeTrack, search);
        if (isCurrent) {
          setAvailableQuestions(data.questions || []);
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        if (isCurrent) setLoading(false);
      }
    }, 200);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isOpen, activeTrack, search]);

  const totalSelectedCount = useMemo(() => {
    return Object.keys(selectedMap).length + customList.length;
  }, [selectedMap, customList]);

  const toggleSelect = (q: any) => {
    const id = String(q.id || q.slug || q.title);
    if (selectedMap[id]) {
      const next = { ...selectedMap };
      delete next[id];
      setSelectedMap(next);
      setErrorMsg(null);
    } else {
      if (totalSelectedCount >= 3) {
        setErrorMsg('You can select a maximum of 3 questions per interview session.');
        return;
      }
      setSelectedMap({
        ...selectedMap,
        [id]: {
          id,
          slug: q.slug || id,
          title: q.title,
          difficulty: q.difficulty || 'Medium',
          track: q.track || activeTrack,
          description: q.description,
        },
      });
      setErrorMsg(null);
    }
  };

  const handleAddCustomQuestion = () => {
    if (!customForm.title.trim()) {
      setErrorMsg('Custom question title is required.');
      return;
    }
    if (totalSelectedCount >= 3) {
      setErrorMsg('You can select a maximum of 3 questions per interview session.');
      return;
    }

    setCustomList([...customList, { ...customForm }]);
    setCustomForm({
      title: '',
      description: '',
      difficulty: 'Medium',
      starter_code: '# Write solution here\n',
    });
    setIsAddingCustom(false);
    setErrorMsg(null);
  };

  const handleRemoveCustom = (idx: number) => {
    const updated = customList.filter((_, i) => i !== idx);
    setCustomList(updated);
    setErrorMsg(null);
  };

  const handleConfirm = () => {
    onConfirm(Object.values(selectedMap), customList);
    onClose();
  };

  if (!isOpen) return null;

  const trackTabs = [
    { id: 'dsa', label: 'DSA & Algorithms' },
    { id: 'system_design', label: 'System Design' },
    { id: 'behavioral', label: 'Behavioral & STAR' },
    { id: 'pm', label: 'Product Management' },
    { id: 'ai_ml', label: 'AI & Machine Learning' },
  ];

  const diffChipClass = (difficulty?: string) => {
    const d = (difficulty || '').toLowerCase();
    if (d.includes('easy')) return 'sch-chip sch-chip-easy';
    if (d.includes('hard')) return 'sch-chip sch-chip-hard';
    return 'sch-chip sch-chip-med';
  };

  const modal = (
    <div className="sch-modal-overlay sch-modal-overlay-2">
      <div className="sch-modal sch-modal-xl">

        {/* Header */}
        <div className="sch-modal-head">
          <div className="sch-modal-head-main">
            <div className="sch-modal-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 className="sch-modal-title">Select Specific Questions</h2>
                <span className={`sch-chip ${totalSelectedCount > 0 ? 'sch-chip-custom' : ''}`}>
                  <span>{totalSelectedCount}/3 Selected</span>
                </span>
              </div>
              <p className="sch-modal-sub">
                Choose 1 to 3 problems for the candidate. If left empty, AI selects optimal track problems automatically.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="sch-modal-close" title="Close">
            <X size={17} />
          </button>
        </div>

        {/* Track Pills & Search */}
        <div className="sch-modal-toolbar">
          <div className="sch-pills sch-pills-start">
            {trackTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTrack(t.id)}
                className={`sch-pill ${activeTrack === t.id ? 'is-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="sch-search">
            <Search size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by problem title, topic, or keyword..."
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="sch-modal-body">

          {/* Error Alert */}
          {errorMsg && (
            <div className="sch-alert sch-alert-err sch-fade">
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Custom Questions Section */}
          <div>
            <div className="sch-subpanel-head" style={{ marginBottom: 10 }}>
              <span className="sch-section-title">Custom Problems ({customList.length})</span>
              <button
                type="button"
                onClick={() => setIsAddingCustom(!isAddingCustom)}
                className="sch-linkbtn"
              >
                <Plus size={14} />
                <span>Add Custom Question</span>
                {isAddingCustom ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* Custom Question Form Drawer */}
            {isAddingCustom && (
              <div className="sch-qform sch-fade" style={{ marginBottom: 12 }}>
                <div className="sch-qform-grid">
                  <div className="sch-field sch-field-span-3">
                    <label className="sch-label">Problem Title</label>
                    <input
                      type="text"
                      value={customForm.title}
                      onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                      placeholder="e.g. Rate Limiter with Token Bucket"
                      className="sch-input"
                    />
                  </div>
                  <div className="sch-field">
                    <label className="sch-label">Difficulty</label>
                    <select
                      value={customForm.difficulty}
                      onChange={(e) => setCustomForm({ ...customForm, difficulty: e.target.value as any })}
                      className="sch-input"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="sch-field">
                  <label className="sch-label">Problem Description</label>
                  <textarea
                    rows={3}
                    value={customForm.description}
                    onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                    placeholder="Describe problem statement, input constraints, and expectations..."
                    className="sch-input"
                  />
                </div>

                <div className="sch-field">
                  <label className="sch-label">Optional Starter Code</label>
                  <textarea
                    rows={2}
                    value={customForm.starter_code}
                    onChange={(e) => setCustomForm({ ...customForm, starter_code: e.target.value })}
                    className="sch-input sch-input-mono"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="sch-btn sch-btn-ghost sch-btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomQuestion}
                    className="sch-btn sch-btn-primary sch-btn-sm"
                  >
                    Save Custom Problem
                  </button>
                </div>
              </div>
            )}

            {/* Custom Questions List */}
            {customList.length > 0 && (
              <div className="sch-qgrid" style={{ marginBottom: 16 }}>
                {customList.map((cq, idx) => (
                  <div key={`custom-${idx}`} className="sch-qcard sch-qcard-custom">
                    <div className="sch-qbody">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="sch-chip sch-chip-custom" style={{ height: 20 }}>
                          <span>Custom</span>
                        </span>
                        <span className="sch-qtitle" style={{ margin: 0 }}>{cq.title}</span>
                      </div>
                      <p className="sch-qdesc">{cq.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustom(idx)}
                      className="sch-chip-remove"
                      title="Remove custom question"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Standard Catalog Questions */}
          <div>
            <span className="sch-section-title" style={{ marginBottom: 10 }}>Catalog Problems ({availableQuestions.length})</span>

            {loading ? (
              <div className="sch-loading-block">
                <div className="sch-spinner" />
                <span>Loading available problems...</span>
              </div>
            ) : availableQuestions.length === 0 ? (
              <div className="sch-empty-dashed">
                <HelpCircle size={22} />
                <span style={{ fontSize: 12 }}>No questions found matching your search.</span>
              </div>
            ) : (
              <div className="sch-qgrid" style={{ marginTop: 10 }}>
                {availableQuestions.map((q) => {
                  const qId = String(q.id || q.slug || q.title);
                  const isSelected = Boolean(selectedMap[qId]);

                  return (
                    <div
                      key={qId}
                      onClick={() => toggleSelect(q)}
                      className={`sch-qcard ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="sch-qbody">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className={diffChipClass(q.difficulty)} style={{ height: 20 }}>
                            <span>{q.difficulty || 'Medium'}</span>
                          </span>
                          {q.category && (
                            <span className="sch-chip" style={{ height: 20 }}>
                              <span>{q.category}</span>
                            </span>
                          )}
                        </div>
                        <h4 className="sch-qtitle">{q.title}</h4>
                        <p className="sch-qdesc">{q.description}</p>
                      </div>
                      <div className="sch-qcheck">
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sch-modal-foot">
          <div>
            {totalSelectedCount === 0 ? (
              <span className="sch-foot-note" style={{ fontStyle: 'italic' }}>
                No specific problems selected (AI will choose automatically)
              </span>
            ) : (
              <span className="sch-foot-note-active">
                {totalSelectedCount} of 3 problems chosen for candidate
              </span>
            )}
          </div>
          <div className="sch-modal-foot-right">
            <button
              type="button"
              onClick={onClose}
              className="sch-btn sch-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="sch-btn sch-btn-primary"
            >
              Confirm Selection ({totalSelectedCount})
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
