import React, { useState, useEffect, useMemo, Component, useRef } from 'react';
import type { ReactNode } from 'react';
import { 
  ArrowLeft,
  CaretLeft,
  CaretRight,
  CaretDown,
  CaretUp,
  BookmarkSimple,
  Play,
  UploadSimple,
  Code,
  Lightbulb,
  ClockCounterClockwise,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  Copy,
  Check,
  ArrowCounterClockwise,
  SlidersHorizontal,
  TerminalWindow,
  Sparkle,
  Stack,
  ArrowsClockwise,
  X,
  MagicWand,
  ArrowsOutSimple,
  ArrowsInSimple,
  FileCode
} from '@phosphor-icons/react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import '../styles/DSAPractice.css';
import { dsaQuestions } from '../data/dsaQuestions';
import { 
  getDSAQuestions, 
  getDSAQuestionById, 
  submitDSACode, 
  runDSACode, 
  getQuestionSubmissions, 
  getLatestSubmission
} from '../services/dsaService';
import type { APIDSAQuestion } from '../services/dsaService';
import { formatDescription } from '../utils/formatDescription';

interface DSAPracticeProps {
  questionId?: string;
  user?: any;
  onNavigate: (page: string, params?: any) => void;
}

// Resilient Markdown Error Boundary to prevent AST or KaTeX parse crashes from crashing the whole app
interface MarkdownBoundaryProps {
  children: ReactNode;
  fallbackText: string;
}

class MarkdownBoundary extends Component<MarkdownBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    console.warn("Markdown rendering fallback:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#d1d1dc', fontSize: '0.88rem' }}>
          {this.props.fallbackText}
        </div>
      );
    }
    return this.props.children;
  }
}

export const DSAPractice: React.FC<DSAPracticeProps> = ({ questionId, user, onNavigate }) => {
  const [allQuestions, setAllQuestions] = useState<APIDSAQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [question, setQuestion] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Tabs State
  const [activeLeftTab, setActiveLeftTab] = useState<'problem' | 'hints' | 'submissions'>('problem');
  const [activeRightTab, setActiveRightTab] = useState<'testcase' | 'result'>('testcase');
  const [activeCaseIdx, setActiveCaseIdx] = useState<number>(0);

  // Editor State
  const [language, setLanguage] = useState<string>('python');
  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>({});
  const [editorFontSize, setEditorFontSize] = useState<number>(13);
  const [copiedCode, setCopiedCode] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const editorRef = useRef<any>(null);

  // Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<any>({ logs: [], raw: null, status: null });
  const [submissionsList, setSubmissionsList] = useState<any[]>([]);
  const [modalSubmission, setModalSubmission] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hints Accordion
  const [expandedHints, setExpandedHints] = useState<Record<number, boolean>>({});

  // Bookmarking
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);

  // Define custom luxury obsidian theme for Monaco Editor (Obsidian & Warm Tangerine)
  const handleEditorWillMount = (monaco: any) => {
    monaco.editor.defineTheme('thinkaloud-obsidian', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'fafafa', background: '070709' },
        { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'fb923c', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: 'fb923c', fontStyle: 'bold' },
        { token: 'keyword.operator', foreground: 'f97316' },
        { token: 'identifier', foreground: 'fafafa' },
        { token: 'identifier.function', foreground: 'ffffff', fontStyle: 'bold' },
        { token: 'string', foreground: 'e4e4e7' },
        { token: 'string.escape', foreground: 'fdba74' },
        { token: 'number', foreground: 'fb923c' },
        { token: 'type', foreground: 'd4d4d8' },
        { token: 'type.identifier', foreground: 'd4d4d8' },
        { token: 'delimiter', foreground: '71717a' },
        { token: 'operator', foreground: 'd4d4d8' },
      ],
      colors: {
        'editor.background': '#070709',
        'editor.foreground': '#fafafa',
        'editor.lineHighlightBackground': '#111116',
        'editor.lineHighlightBorder': '#18181f',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#f97316',
        'editorCursor.foreground': '#f97316',
        'editor.selectionBackground': '#f9731633',
        'editor.inactiveSelectionBackground': '#ffffff0a',
        'editorIndentGuide.background1': '#18181b',
        'editorIndentGuide.activeBackground1': '#27272a',
        'editorBracketMatch.background': '#f9731622',
        'editorBracketMatch.border': '#f9731666',
        'scrollbarSlider.background': '#27272a40',
        'scrollbarSlider.hoverBackground': '#3f3f4660',
        'scrollbarSlider.activeBackground': '#52525b80',
      },
    });
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  const handleFormatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  // Load catalog on mount
  useEffect(() => {
    let isCancelled = false;
    async function loadCatalog() {
      try {
        const list = await getDSAQuestions(150);
        if (!isCancelled && list && list.length > 0) {
          setAllQuestions(list);
          if (questionId) {
            const idx = list.findIndex(q => String(q.id) === String(questionId));
            if (idx !== -1) setCurrentIndex(idx);
          }
        }
      } catch (e) {
        console.warn("Failed to load catalog, using fallback", e);
      }
    }
    loadCatalog();
    return () => { isCancelled = true; };
  }, [questionId]);

  // Load active question
  useEffect(() => {
    let isCancelled = false;
    async function loadQuestion() {
      setIsLoading(true);
      try {
        const targetId = questionId || (allQuestions[currentIndex]?.id);
        if (targetId) {
          const data = await getDSAQuestionById(targetId);
          if (!isCancelled) {
            let safeHints: string[] = [];
            if (data.hints) {
              if (Array.isArray(data.hints)) {
                safeHints = data.hints;
              } else if (typeof data.hints === 'string') {
                try {
                  const parsed = JSON.parse(data.hints);
                  safeHints = Array.isArray(parsed) ? parsed : [data.hints];
                } catch {
                  safeHints = [data.hints];
                }
              }
            }

            setQuestion({
              ...data,
              category: data.category || 'Algorithms',
              starterCode: {
                python: data.python_starter_code || '# Write your Python code here\n',
                cpp: data.cpp_starter_code || '// Write your C++ code here\n'
              },
              hints: safeHints,
              optimalComplexity: {
                time: data.optimal_time_complexity || 'O(N)',
                space: data.optimal_space_complexity || 'O(1)'
              }
            });
          }
        } else {
          const fallback = dsaQuestions[0];
          if (!isCancelled) {
            setQuestion({
              ...fallback,
              category: fallback.category || 'Algorithms',
              hints: Array.isArray(fallback.hints) ? fallback.hints : [],
              test_cases: fallback.testCases || []
            });
          }
        }
      } catch (err) {
        console.error("Failed to load question in DSAPractice:", err);
        if (!isCancelled) {
          const fallback = (questionId ? dsaQuestions.find((q) => String(q.id) === String(questionId)) : null) || dsaQuestions[0];
          setQuestion({
            ...fallback,
            category: fallback.category || 'Algorithms',
            hints: Array.isArray(fallback.hints) ? fallback.hints : [],
            test_cases: fallback.testCases || []
          });
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    loadQuestion();
    return () => { isCancelled = true; };
  }, [questionId, currentIndex, allQuestions]);

  // Bookmark sync
  useEffect(() => {
    if (question?.id) {
      const saved = localStorage.getItem(`bookmark_dsa_${question.id}`);
      setIsBookmarked(saved === 'true');
    }
  }, [question?.id]);

  const toggleBookmark = () => {
    if (!question?.id) return;
    const next = !isBookmarked;
    setIsBookmarked(next);
    localStorage.setItem(`bookmark_dsa_${question.id}`, String(next));
  };

  // Draft code sync
  useEffect(() => {
    let isCancelled = false;
    async function loadInitialCode() {
      if (!question?.id) return;
      const defaults: Record<string, string> = {
        python: question.starterCode?.python || question.python_starter_code || '# Write your Python code here\n',
        cpp: question.starterCode?.cpp || question.cpp_starter_code || '// Write your C++ code here\n',
      };

      // Only attempt remote draft load if question ID is numeric or valid backend ID
      if (!isNaN(Number(question.id))) {
        try {
          const [pySub, cppSub] = await Promise.allSettled([
            getLatestSubmission(question.id, 'python'),
            getLatestSubmission(question.id, 'cpp')
          ]);
          if (pySub.status === 'fulfilled' && pySub.value?.code) {
            defaults.python = pySub.value.code;
          }
          if (cppSub.status === 'fulfilled' && cppSub.value?.code) {
            defaults.cpp = cppSub.value.code;
          }
        } catch (e) {
          console.warn("Could not load latest submission code", e);
        }
      }

      if (!isCancelled) {
        setCodeByLanguage((prev) => ({
          ...defaults,
          ...prev,
        }));
      }
    }
    loadInitialCode();
    return () => { isCancelled = true; };
  }, [question?.id]);

  // Submissions history
  useEffect(() => {
    async function loadHistory() {
      if (question?.id && !isNaN(Number(question.id))) {
        try {
          const sessionId = user?.email || (user?.id ? String(user.id) : null) || 'guest_session';
          const subs = await getQuestionSubmissions(question.id, sessionId);
          setSubmissionsList(subs || []);
        } catch (error) {
          console.warn("Failed to load submissions history", error);
        }
      }
    }
    loadHistory();
  }, [question?.id, user]);

  // Parse structured test cases safely
  const parsedTestCases = useMemo(() => {
    const source = question?.test_cases || question?.testCases;
    if (!source) return [];
    try {
      const raw = typeof source === 'string' ? JSON.parse(source) : source;
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray(raw.cases)) return raw.cases;
      return [];
    } catch {
      return [];
    }
  }, [question?.test_cases, question?.testCases]);

  // Active code
  const currentCode = codeByLanguage[language] ?? (
    language === 'cpp'
      ? (question?.starterCode?.cpp || question?.cpp_starter_code || '// Write your C++ code here\n')
      : (question?.starterCode?.python || question?.python_starter_code || '# Write your Python code here\n')
  );

  const handleCodeChange = (value: string | undefined) => {
    setCodeByLanguage((prev) => ({
      ...prev,
      [language]: value || '',
    }));
  };

  const handleResetCode = () => {
    if (!question) return;
    const starter = language === 'cpp'
      ? (question.starterCode?.cpp || question.cpp_starter_code || '// Write your C++ code here\n')
      : (question.starterCode?.python || question.python_starter_code || '# Write your Python code here\n');
    setCodeByLanguage(prev => ({ ...prev, [language]: starter }));
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Run Code
  const triggerRunCode = async () => {
    if (!question) return;
    setIsRunning(true);
    setActiveRightTab('result');
    setConsoleOutput({ logs: ['➔ Compiling and running in sandbox...'], raw: null, status: 'Running' });

    try {
      const sessionId = user?.email || (user?.id ? String(user.id) : null) || 'guest_session';
      const response = await runDSACode(question.id, currentCode, language, sessionId);
      
      setConsoleOutput({
        status: response.status,
        passed_tests: response.passed_tests,
        total_tests: response.total_tests,
        execution_time_ms: response.execution_time_ms,
        memory_mb: response.memory_mb || (response.memory_kb ? (response.memory_kb / 1024).toFixed(1) : undefined),
        error_message: response.error_message,
        raw: response,
        logs: [
          `➔ Status: ${response.status}`,
          `➔ Passed Tests: ${response.passed_tests} / ${response.total_tests}`,
          response.error_message ? `➔ Error: ${response.error_message}` : `➔ Execution Time: ${response.execution_time_ms}ms`,
          response.status === 'Accepted' ? '🎉 All run test cases passed!' : '❌ Some test cases failed in run.'
        ]
      });
    } catch (error: any) {
      setConsoleOutput({
        status: 'Error',
        error_message: error.message,
        logs: [`❌ Run Failed: ${error.message}`],
        raw: null
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Submit Code
  const triggerSubmitCode = async () => {
    if (!question) return;
    setIsSubmitting(true);
    setActiveRightTab('result');
    setConsoleOutput({ logs: ['➔ Submitting solution for complete grading...'], raw: null, status: 'Submitting' });

    try {
      const sessionId = user?.email || (user?.id ? String(user.id) : null) || 'guest_session';
      const response = await submitDSACode(question.id, currentCode, language, sessionId);
      
      setConsoleOutput({
        status: response.status,
        passed_tests: response.passed_tests,
        total_tests: response.total_tests,
        execution_time_ms: response.execution_time_ms,
        memory_mb: response.memory_mb || (response.memory_kb ? (response.memory_kb / 1024).toFixed(1) : undefined),
        error_message: response.error_message,
        raw: response,
        logs: [
          `➔ Status: ${response.status}`,
          `➔ Passed Tests: ${response.passed_tests} / ${response.total_tests}`,
          response.error_message ? `➔ Error: ${response.error_message}` : `➔ Execution Time: ${response.execution_time_ms}ms`,
          response.status === 'Accepted' ? '🎉 Accepted! All tests passed!' : '❌ Submission Rejected.'
        ]
      });

      if (!isNaN(Number(question.id))) {
        const subs = await getQuestionSubmissions(question.id, sessionId);
        setSubmissionsList(subs || []);
      }
    } catch (error: any) {
      setConsoleOutput({
        status: 'Error',
        error_message: error.message,
        logs: [`❌ Submission Failed: ${error.message}`],
        raw: null
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcuts: Cmd/Ctrl + Enter (Run), Shift + Cmd/Ctrl + Enter (Submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!isRunning && !isSubmitting) triggerSubmitCode();
        } else {
          if (!isRunning && !isSubmitting) triggerRunCode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isSubmitting, currentCode, language, question]);

  // Prev / Next Question Navigation
  const handlePrevQuestion = () => {
    if (currentIndex > 0 && allQuestions[currentIndex - 1]) {
      const prevQ = allQuestions[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      setConsoleOutput({ logs: [], raw: null, status: null });
      onNavigate('practice', { questionId: String(prevQ.id) });
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < allQuestions.length - 1 && allQuestions[currentIndex + 1]) {
      const nextQ = allQuestions[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      setConsoleOutput({ logs: [], raw: null, status: null });
      onNavigate('practice', { questionId: String(nextQ.id) });
    }
  };

  const hintsList: string[] = useMemo(() => {
    if (!question?.hints) return [];
    if (Array.isArray(question.hints)) return question.hints;
    if (typeof question.hints === 'string') {
      try {
        const parsed = JSON.parse(question.hints);
        return Array.isArray(parsed) ? parsed : [question.hints];
      } catch {
        return [question.hints];
      }
    }
    return [];
  }, [question?.hints]);

  if (isLoading || !question) {
    return (
      <div className="dsa-arena-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', color: 'rgba(255,255,255,0.6)' }}>
          <ArrowsClockwise size={28} color="#f97316" className="animate-spin" />
          <span style={{ fontSize: '0.86rem', letterSpacing: '0.02em', fontFamily: 'var(--font-mono, monospace)' }}>
            Loading Coding Workspace...
          </span>
        </div>
      </div>
    );
  }

  const difficultyClass = (question.difficulty || 'Easy').toLowerCase();
  const currentCase = parsedTestCases.length > 0 ? (parsedTestCases[activeCaseIdx] || parsedTestCases[0]) : null;

  const numId = Number(question.id);
  const formattedTitle = (!isNaN(numId) && numId > 0) ? `#${numId}. ${question.title}` : question.title;

  return (
    <div className={`dsa-arena-page ${isEditorFullscreen ? 'fullscreen-editor' : ''}`}>
      
      {/* 1. TOPBAR */}
      <header className="arena-topbar">
        <div className="topbar-left">
          <button 
            className="topbar-back-btn" 
            onClick={() => onNavigate('dashboard')}
            title="Return to Problems Catalog"
          >
            <ArrowLeft size={13} weight="bold" />
            <span>Problems</span>
          </button>

          <div className="topbar-divider" />

          <div className="topbar-nav-arrows">
            <button 
              className="topbar-arrow-btn" 
              onClick={handlePrevQuestion}
              disabled={currentIndex <= 0}
              title="Previous Problem"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <button 
              className="topbar-arrow-btn" 
              onClick={handleNextQuestion}
              disabled={currentIndex >= allQuestions.length - 1}
              title="Next Problem"
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>

          <div className="problem-title-wrapper">
            <span className="problem-display-title">
              {formattedTitle}
            </span>
            <button 
              className={`bookmark-icon-btn ${isBookmarked ? 'bookmarked' : ''}`}
              onClick={toggleBookmark}
              title={isBookmarked ? "Remove bookmark" : "Bookmark problem"}
            >
              <BookmarkSimple size={15} weight={isBookmarked ? "fill" : "regular"} />
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button 
            className="btn-action-run"
            onClick={triggerRunCode}
            disabled={isRunning || isSubmitting}
            title="Run solution (Ctrl/Cmd + Enter)"
          >
            <Play size={12} weight="fill" color="#f97316" />
            <span>{isRunning ? 'Running...' : 'Run'}</span>
            <kbd className="topbar-kbd">⌘↵</kbd>
          </button>

          <button 
            className="btn-action-submit"
            onClick={triggerSubmitCode}
            disabled={isRunning || isSubmitting}
            title="Submit solution for evaluation (Shift + Ctrl/Cmd + Enter)"
          >
            <UploadSimple size={13} weight="bold" />
            <span>{isSubmitting ? 'Evaluating...' : 'Submit'}</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT ARENA (FULL SCREEN WIDTH) */}
      <div className="arena-main-layout">
        <PanelGroup orientation="horizontal" style={{ width: '100%', height: '100%' }}>
          
          {/* LEFT PANEL: Problem Description, Hints, Submissions */}
          {!isEditorFullscreen && (
            <>
              <Panel defaultSize={45} minSize={25} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="arena-panel-card">
                  
                  {/* Tab Navigation */}
                  <div className="arena-tab-nav">
                    <button 
                      className={`arena-tab-item ${activeLeftTab === 'problem' ? 'active' : ''}`}
                      onClick={() => setActiveLeftTab('problem')}
                    >
                      <Code size={14} weight={activeLeftTab === 'problem' ? 'bold' : 'regular'} />
                      <span>Problem</span>
                    </button>
                    <button 
                      className={`arena-tab-item ${activeLeftTab === 'hints' ? 'active' : ''}`}
                      onClick={() => setActiveLeftTab('hints')}
                    >
                      <Lightbulb size={14} weight={activeLeftTab === 'hints' ? 'bold' : 'regular'} />
                      <span>Hints</span>
                      {hintsList.length > 0 && (
                        <span className="tab-badge">{hintsList.length}</span>
                      )}
                    </button>
                    <button 
                      className={`arena-tab-item ${activeLeftTab === 'submissions' ? 'active' : ''}`}
                      onClick={() => setActiveLeftTab('submissions')}
                    >
                      <ClockCounterClockwise size={14} weight={activeLeftTab === 'submissions' ? 'bold' : 'regular'} />
                      <span>Submissions</span>
                      {submissionsList.length > 0 && (
                        <span className="tab-badge">{submissionsList.length}</span>
                      )}
                    </button>
                  </div>

                  {/* Tab Content Body */}
                  <div className="arena-tab-body">
                    {activeLeftTab === 'problem' && (
                      <div className="problem-statement-wrapper">
                        <div className="problem-hero-header">
                          <h1 className="problem-title-hero">
                            {formattedTitle}
                          </h1>
                          
                          <div className="problem-meta-shelf">
                            <span className={`diff-badge ${difficultyClass}`}>
                              {question.difficulty || 'Easy'}
                            </span>
                            <span className="category-pill">
                              {question.category || 'Algorithms'}
                            </span>
                            {(question.optimalComplexity?.time || question.optimalComplexity?.space) && (
                              <span className="complexity-pill">
                                Target: {question.optimalComplexity?.time || 'O(N)'} time · {question.optimalComplexity?.space || 'O(1)'} space
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="problem-description-prose">
                          <MarkdownBoundary fallbackText={question.description || ''}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm, remarkMath]} 
                              rehypePlugins={[rehypeKatex, rehypeRaw]}
                            >
                              {formatDescription(question.description || '')}
                            </ReactMarkdown>
                          </MarkdownBoundary>
                        </div>

                        {/* Bottom Topics Shelf */}
                        <div className="problem-tags-section">
                          <div className="tags-row">
                            <span className="tag-label">
                              <Stack size={13} weight="bold" /> Topics:
                            </span>
                            {(question.tags && question.tags.length > 0 ? question.tags : [question.category || 'Algorithms']).map((t: string, i: number) => (
                              <span key={i} className="topic-chip">{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeLeftTab === 'hints' && (
                      <div className="hints-container">
                        <div style={{ marginBottom: '12px' }}>
                          <h3 style={{ color: '#fff', fontSize: '0.92rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Sparkle size={15} color="#f97316" weight="fill" /> Strategic Guidance
                          </h3>
                          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', margin: 0 }}>
                            Click on any hint below to reveal progressive clues without spoiling the complete solution.
                          </p>
                        </div>

                        {hintsList.length === 0 ? (
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '24px 0', fontSize: '0.85rem' }}>
                            No hints registered for this problem yet. Think about optimal data structures and edge conditions!
                          </div>
                        ) : (
                          hintsList.map((hint: string, i: number) => {
                            const isExpanded = expandedHints[i] ?? false;
                            return (
                              <div key={i} className="hint-accordion-card">
                                <div 
                                  className="hint-header"
                                  onClick={() => setExpandedHints(prev => ({ ...prev, [i]: !isExpanded }))}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Lightbulb size={14} color="#fbbf24" weight="fill" />
                                    <span>Hint {i + 1}</span>
                                  </span>
                                  {isExpanded ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                                </div>
                                {isExpanded && (
                                  <div className="hint-body">
                                    {hint}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}

                        <div className="constraints-card" style={{ marginTop: '16px' }}>
                          <div className="constraints-header">
                            <Cpu size={14} color="#f97316" weight="duotone" />
                            <span>Optimal Target Complexity</span>
                          </div>
                          <div style={{ display: 'flex', gap: '14px', fontSize: '0.82rem', color: '#ccc' }}>
                            <div><strong>Time:</strong> <code style={{ color: '#fb923c' }}>{question.optimalComplexity?.time || 'O(N)'}</code></div>
                            <div><strong>Space:</strong> <code style={{ color: '#fb923c' }}>{question.optimalComplexity?.space || 'O(1)'}</code></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeLeftTab === 'submissions' && (
                      <div className="submissions-scroll">
                        {submissionsList.length === 0 ? (
                          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '40px 16px', fontStyle: 'italic', fontSize: '0.85rem' }}>
                            No submissions recorded for this problem yet. Submit your code to see detailed telemetry!
                          </div>
                        ) : (
                          submissionsList.map((sub: any) => (
                            <div 
                              key={sub.id}
                              className="submission-item-card"
                              onClick={() => {
                                setModalSubmission(sub);
                                setIsModalOpen(true);
                              }}
                            >
                              <div>
                                <div className={`submission-status-pill ${sub.status === 'Accepted' ? 'accepted' : 'rejected'}`}>
                                  {sub.status === 'Accepted' ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} weight="fill" />}
                                  <span>{sub.status}</span>
                                </div>
                                <div className="submission-submeta">
                                  {sub.language} • {new Date(sub.created_at).toLocaleString()}
                                </div>
                              </div>
                              <div className="submission-metrics-row">
                                <span>{(sub.passed_tests ?? sub.tests_passed ?? 0)} / {(sub.total_tests ?? 0)} passed</span>
                                {sub.execution_time_ms && (
                                  <span style={{ color: '#f97316' }}>{sub.execution_time_ms}ms</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="panel-resize-divider" />
            </>
          )}

          {/* RIGHT PANEL: Monaco Editor (Top) & Interactive Testcase/Result Panel (Bottom) */}
          <Panel defaultSize={isEditorFullscreen ? 100 : 55} minSize={30} style={{ display: 'flex', flexDirection: 'column' }}>
            <PanelGroup orientation="vertical" style={{ width: '100%', height: '100%' }}>
              
              {/* TOP: Monaco Code Editor */}
              <Panel defaultSize={65} minSize={25} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="arena-panel-card">
                  
                  {/* Editor Header Bar (IDE-Grade Tab Bar) */}
                  <div className="editor-top-bar">
                    <div className="editor-tab-and-lang">
                      {/* Active File Tab */}
                      <div className="editor-file-tab active">
                        <FileCode size={14} weight="duotone" color="#f97316" />
                        <span className="file-tab-name">Solution.{language === 'cpp' ? 'cpp' : 'py'}</span>
                        <span className="file-tab-status-dot" title="Ready to execute" />
                      </div>

                      {/* Language Picker Dropdown */}
                      <div className="editor-lang-picker">
                        <div className="custom-select-wrapper">
                          <select 
                            value={language} 
                            onChange={(e) => setLanguage(e.target.value)}
                            className="lang-select-pill"
                          >
                            <option value="python">Python 3 (v3.11)</option>
                            <option value="cpp">C++ 17 (GCC 11)</option>
                          </select>
                          <CaretDown size={11} className="lang-select-arrow" weight="bold" />
                        </div>
                      </div>
                    </div>

                    <div className="editor-toolbar-actions">
                      {/* Format Document */}
                      <button 
                        className="editor-tool-btn" 
                        onClick={handleFormatCode}
                        title="Format Code (Auto-Indent)"
                      >
                        <MagicWand size={13} color="#f97316" />
                        <span>Format</span>
                      </button>

                      {/* Font Size Adjuster Pill */}
                      <div className="editor-fontsize-pill">
                        <button 
                          onClick={() => setEditorFontSize(prev => Math.max(11, prev - 1))}
                          title="Decrease font size"
                        >
                          -
                        </button>
                        <span className="fontsize-val">{editorFontSize}px</span>
                        <button 
                          onClick={() => setEditorFontSize(prev => Math.min(20, prev + 1))}
                          title="Increase font size"
                        >
                          +
                        </button>
                      </div>

                      {/* Reset Code */}
                      <button 
                        className="editor-icon-btn" 
                        onClick={handleResetCode}
                        title="Reset code to starter template"
                      >
                        <ArrowCounterClockwise size={13} />
                      </button>

                      {/* Copy Code */}
                      <button 
                        className="editor-icon-btn" 
                        onClick={handleCopyCode}
                        title="Copy code to clipboard"
                      >
                        {copiedCode ? <Check size={13} color="#4ade80" weight="bold" /> : <Copy size={13} />}
                      </button>

                      {/* Fullscreen Toggle */}
                      <button 
                        className={`editor-icon-btn ${isEditorFullscreen ? 'active' : ''}`}
                        onClick={() => setIsEditorFullscreen(prev => !prev)}
                        title={isEditorFullscreen ? "Exit Fullscreen Editor" : "Distraction-Free Editor"}
                      >
                        {isEditorFullscreen ? <ArrowsInSimple size={13} /> : <ArrowsOutSimple size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Monaco Canvas */}
                  <div className="monaco-container">
                    <Editor
                      height="100%"
                      width="100%"
                      language={language}
                      theme="thinkaloud-obsidian"
                      beforeMount={handleEditorWillMount}
                      onMount={handleEditorDidMount}
                      value={currentCode}
                      onChange={handleCodeChange}
                      options={{
                        minimap: { enabled: false },
                        fontSize: editorFontSize,
                        lineHeight: 22,
                        fontFamily: "'JetBrains Mono', 'Geist Mono', Menlo, Monaco, Consolas, monospace",
                        fontLigatures: true,
                        padding: { top: 14, bottom: 14 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        bracketPairColorization: { enabled: true },
                        formatOnPaste: true,
                        automaticLayout: true,
                        renderLineHighlight: "all",
                        tabSize: 4,
                      }}
                    />
                  </div>

                  {/* Editor Bottom Status Bar */}
                  <div className="editor-status-bar">
                    <div className="status-bar-left">
                      <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                      <span className="status-sep">•</span>
                      <span>Spaces: 4</span>
                      <span className="status-sep">•</span>
                      <span>UTF-8</span>
                    </div>
                    <div className="status-bar-right">
                      <span className="status-runtime-badge">
                        <span className="status-runtime-dot" />
                        {language === 'cpp' ? 'C++17 GCC Sandbox' : 'CPython 3.11 Sandbox'}
                      </span>
                      <span className="status-sep">•</span>
                      <span className="status-shortcut-hint">
                        <kbd>⌘</kbd><kbd>↵</kbd> Run
                      </span>
                    </div>
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="panel-resize-divider-h" />

              {/* BOTTOM: Testcase & Test Result Sandbox */}
              <Panel defaultSize={35} minSize={15} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="arena-panel-card">
                  
                  {/* Test Panel Tabs Header */}
                  <div className="test-panel-header">
                    <div className="test-tab-group">
                      <button 
                        className={`test-tab-btn ${activeRightTab === 'testcase' ? 'active' : ''}`}
                        onClick={() => setActiveRightTab('testcase')}
                      >
                        <SlidersHorizontal size={13} weight={activeRightTab === 'testcase' ? 'bold' : 'regular'} />
                        <span>Testcase</span>
                      </button>
                      <button 
                        className={`test-tab-btn ${activeRightTab === 'result' ? 'active' : ''}`}
                        onClick={() => setActiveRightTab('result')}
                      >
                        <TerminalWindow size={13} weight={activeRightTab === 'result' ? 'bold' : 'regular'} />
                        <span>Test Result</span>
                        {consoleOutput.status && (
                          <span 
                            style={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              background: consoleOutput.status === 'Accepted' ? '#4ade80' : '#ef4444' 
                            }} 
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Test Panel Body */}
                  <div className="test-panel-body">
                    {activeRightTab === 'testcase' && (
                      <div>
                        {/* Case Selector Pills */}
                        <div className="case-selector-row">
                          {parsedTestCases.length === 0 ? (
                            <span className="case-pill-btn active">Case 1</span>
                          ) : (
                            parsedTestCases.map((_: any, i: number) => (
                              <button
                                key={i}
                                className={`case-pill-btn ${activeCaseIdx === i ? 'active' : ''}`}
                                onClick={() => setActiveCaseIdx(i)}
                              >
                                Case {i + 1}
                              </button>
                            ))
                          )}
                        </div>

                        {/* Parameter Display */}
                        {currentCase ? (
                          <div className="testcase-params-container">
                            {currentCase.args ? (
                              Object.entries(currentCase.args).map(([key, val]: any) => {
                                const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                                return (
                                  <div key={key} className="testcase-param-card">
                                    <div className="param-header-strip">
                                      <div className="param-title-wrap">
                                        <span className="param-name">{key}</span>
                                        <span className="param-badge">input</span>
                                      </div>
                                      <button 
                                        className="param-copy-action"
                                        onClick={() => navigator.clipboard.writeText(strVal)}
                                        title="Copy argument value"
                                      >
                                        <Copy size={11} />
                                      </button>
                                    </div>
                                    <div className="param-code-surface">
                                      <code>{strVal}</code>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="testcase-param-card">
                                <div className="param-header-strip">
                                  <div className="param-title-wrap">
                                    <span className="param-name">input</span>
                                    <span className="param-badge">input</span>
                                  </div>
                                </div>
                                <div className="param-code-surface">
                                  <code>
                                    {typeof currentCase.input === 'object' 
                                      ? JSON.stringify(currentCase.input) 
                                      : String(currentCase.input || '')}
                                  </code>
                                </div>
                              </div>
                            )}

                            {currentCase.expected !== undefined && (
                              <div className="testcase-param-card expected">
                                <div className="param-header-strip">
                                  <div className="param-title-wrap">
                                    <span className="param-name expected">expected output</span>
                                    <span className="param-badge expected">return</span>
                                  </div>
                                  <button 
                                    className="param-copy-action"
                                    onClick={() => navigator.clipboard.writeText(
                                      typeof currentCase.expected === 'object' 
                                        ? JSON.stringify(currentCase.expected) 
                                        : String(currentCase.expected)
                                    )}
                                    title="Copy expected output"
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                                <div className="param-code-surface expected">
                                  <code>
                                    {typeof currentCase.expected === 'object' 
                                      ? JSON.stringify(currentCase.expected) 
                                      : String(currentCase.expected)}
                                  </code>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="testcase-empty-state">
                            <span>Default test case: <code>nums = [2,7,11,15], target = 9</code></span>
                          </div>
                        )}
                      </div>
                    )}

                    {activeRightTab === 'result' && (
                      <div>
                        {isRunning || isSubmitting ? (
                          <div className="console-empty-box">
                            <ArrowsClockwise size={22} color="#f97316" className="animate-spin" />
                            <span style={{ color: '#ededed', fontSize: '0.82rem' }}>
                              {isSubmitting ? 'Grading solution against complete test suite...' : 'Executing code in secure sandbox...'}
                            </span>
                          </div>
                        ) : consoleOutput.status ? (
                          <div>
                            <div className={`result-status-banner ${consoleOutput.status === 'Accepted' ? 'accepted' : 'failed'}`}>
                              <div className="result-status-title">
                                {consoleOutput.status === 'Accepted' ? (
                                  <>
                                    <CheckCircle size={18} weight="fill" />
                                    <span>Accepted</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={18} weight="fill" />
                                    <span>{consoleOutput.status}</span>
                                  </>
                                )}
                              </div>
                              <div className="result-metrics">
                                {consoleOutput.execution_time_ms !== undefined && (
                                  <div className="metric-item">
                                    <Clock size={12} />
                                    <span>{consoleOutput.execution_time_ms} ms</span>
                                  </div>
                                )}
                                {consoleOutput.memory_mb && (
                                  <div className="metric-item">
                                    <Cpu size={12} />
                                    <span>{consoleOutput.memory_mb} MB</span>
                                  </div>
                                )}
                                <div className="metric-item">
                                  <span>{consoleOutput.passed_tests ?? 0} / {consoleOutput.total_tests ?? 0} tests</span>
                                </div>
                              </div>
                            </div>

                            {consoleOutput.error_message && (
                              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', color: '#fca5a5', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                                {consoleOutput.error_message}
                              </div>
                            )}

                            {/* Execution Logs */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {consoleOutput.logs.map((log: string, i: number) => (
                                <div 
                                  key={i} 
                                  style={{ 
                                    fontSize: '0.8rem', 
                                    fontFamily: 'var(--font-mono, monospace)', 
                                    color: log.includes('🎉') || log.includes('Accepted') ? '#4ade80' : log.includes('❌') || log.includes('Error') ? '#f87171' : 'rgba(255,255,255,0.7)' 
                                  }}
                                >
                                  {log}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="console-empty-box">
                            <TerminalWindow size={24} className="empty-icon-subtle" />
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>No execution telemetry recorded</div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.76rem' }}>
                              Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>⌘ Enter</kbd> or click <strong>Run</strong> to test your solution.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

            </PanelGroup>
          </Panel>

        </PanelGroup>
      </div>

      {/* 3. SUBMISSION DETAILS MODAL */}
      {isModalOpen && modalSubmission && (
        <div className="submission-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="submission-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar">
              <div className="modal-header-title">
                <Code size={16} color="#f97316" weight="bold" />
                <span>Submission Details — #{modalSubmission.id}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="modal-body-split">
              <div className="modal-code-pane">
                <div style={{ padding: '8px 16px', background: '#0a0a0e', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Submitted Code ({modalSubmission.language})</span>
                  <span>{new Date(modalSubmission.created_at).toLocaleString()}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <Editor
                    height="100%"
                    width="100%"
                    language={modalSubmission.language}
                    theme="thinkaloud-obsidian"
                    beforeMount={handleEditorWillMount}
                    value={modalSubmission.code}
                    options={{ 
                      readOnly: true, 
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: { top: 12, bottom: 12 },
                      automaticLayout: true 
                    }}
                  />
                </div>
              </div>

              <div className="modal-stats-pane">
                <div>
                  <div style={{ color: modalSubmission.status === 'Accepted' ? '#4ade80' : '#f87171', fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {modalSubmission.status === 'Accepted' ? <CheckCircle size={18} weight="fill" /> : <XCircle size={18} weight="fill" />}
                    <span>{modalSubmission.status}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                    Passed {(modalSubmission.passed_tests ?? modalSubmission.tests_passed ?? 0)} / {(modalSubmission.total_tests ?? 0)} tests
                  </div>
                  {modalSubmission.execution_time_ms && (
                    <div style={{ color: '#f97316', fontSize: '0.78rem', marginTop: '3px' }}>
                      Runtime: {modalSubmission.execution_time_ms} ms
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: '6px' }}>
                    Execution Log
                  </div>
                  <div style={{ background: '#0e0e14', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', color: modalSubmission.error_message ? '#fca5a5' : '#4ade80', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.76rem', whiteSpace: 'pre-wrap' }}>
                    {modalSubmission.error_message || "All test cases passed successfully."}
                  </div>
                </div>

                <button 
                  className="btn-action-submit"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setCodeByLanguage(prev => ({ ...prev, [modalSubmission.language]: modalSubmission.code }));
                    setLanguage(modalSubmission.language);
                    setIsModalOpen(false);
                  }}
                >
                  <ArrowCounterClockwise size={13} weight="bold" />
                  <span>Restore in Editor</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DSAPractice;
