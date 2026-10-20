import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Send, 
  Brain, 
  Play, 
  Maximize2, 
  Settings, 
  Bookmark, 
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Sparkles,
  Code2,
  ArrowRight,
  AlertTriangle,
  X,
  Volume2,
  UserCircle
} from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';
import { Room, RoomEvent } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant, useRoomContext, useLocalParticipant } from "@livekit/components-react";
import "@livekit/components-styles";
import { CameraFeed } from '../components/CameraFeed';
import { AiVisualizer } from '../components/AiVisualizer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { getLatestSubmission, submitDSACode, runDSACode } from '../services/dsaService';
import { formatDescription } from '../utils/formatDescription';
import { endInterview } from '../services/interviewService';
import { apiClient } from '../services/apiClient';
import { API_BASE_URL } from '../config/api';
import '../styles/MockInterview.css';

interface DSAInterviewProps {
  questionId?: string;
  templateId?: string;
  templateName?: string;
  accessToken?: string | null;
  onNavigate: (page: string, params?: any) => void;
  domain?: string;
  role?: string;
}

const DEFAULT_FALLBACK_DSA_QUESTION = {
  id: 'dsa_default_two_sum',
  title: 'Two Sum',
  difficulty: 'Easy',
  category: 'Arrays & Hashing',
  description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.

### Example 1:
\`\`\`
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
\`\`\`

### Example 2:
\`\`\`
Input: nums = [3,2,4], target = 6
Output: [1,2]
\`\`\`

### Example 3:
\`\`\`
Input: nums = [3,3], target = 6
Output: [0,1]
\`\`\`

### Constraints:
* \`2 <= nums.length <= 10^4\`
* \`-10^9 <= nums[i] <= 10^9\`
* \`-10^9 <= target <= 10^9\`
* Only one valid answer exists.
`,
  python_starter_code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        lookup = {}
        for i, num in enumerate(nums):
            diff = target - num
            if diff in lookup:
                return [lookup[diff], i]
            lookup[num] = i
        return []
`,
  cpp_starter_code: `#include <vector>
#include <unordered_map>

class Solution {
public:
    std::vector<int> twoSum(std::vector<int>& nums, int target) {
        std::unordered_map<int, int> lookup;
        for (int i = 0; i < nums.size(); ++i) {
            int complement = target - nums[i];
            if (lookup.find(complement) != lookup.end()) {
                return {lookup[complement], i};
            }
            lookup[nums[i]] = i;
        }
        return {};
    }
};
`,
  examples: [
    { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] == 9" },
    { input: "nums = [3,2,4], target = 6", output: "[1,2]", explanation: "nums[1] + nums[2] == 6" }
  ],
  test_cases: [
    { input: "[2,7,11,15]\n9", expected_output: "[0,1]" },
    { input: "[3,2,4]\n6", expected_output: "[1,2]" }
  ]
};

const getDifficultyColor = (difficulty: string) => {
  const d = (difficulty || '').toLowerCase();
  if (d === 'easy') {
    return { bg: 'rgba(52, 211, 153, 0.12)', text: '#34d399', border: 'rgba(52, 211, 153, 0.25)' };
  }
  if (d === 'medium') {
    return { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.25)' };
  }
  return { bg: 'rgba(244, 63, 94, 0.12)', text: '#f43f5e', border: 'rgba(244, 63, 94, 0.25)' };
};

const IDESync = ({ 
  code, 
  language,
  consoleOutput, 
  onNextQuestion, 
  onRevealProblem, 
  onInterviewCompleted,
  isSubmissionLocked,
  onOpenCodeEditor,
  onCloseCodeEditor,
  onUpdateCodeEditor,
  onHighlightLine,
  onRunCandidateCode,
  onCaptureCandidatePhoto,
  onSetInterviewStage,
  onSendDirectiveRef
}: { 
  code: string, 
  language: string,
  consoleOutput: any, 
  onNextQuestion: (targetIdx?: number) => void, 
  onRevealProblem: () => void, 
  onInterviewCompleted: () => void,
  isSubmissionLocked?: boolean,
  onOpenCodeEditor: (payload: any) => void,
  onCloseCodeEditor: () => void,
  onUpdateCodeEditor: (payload: any) => void,
  onHighlightLine: (payload: any) => void,
  onRunCandidateCode: () => void,
  onCaptureCandidatePhoto: (reason?: string) => void,
  onSetInterviewStage: (stage: string) => void,
  onSendDirectiveRef: React.MutableRefObject<((text: string) => Promise<void>) | null>
}) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  // Expose sendDirective to parent component
  useEffect(() => {
    onSendDirectiveRef.current = async (directiveText: string) => {
      if (!localParticipant) return;
      try {
        const payload = JSON.stringify({
          type: "candidate_directive",
          text: directiveText,
          prompt: directiveText,
          timestamp: Date.now()
        });
        await localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      } catch (err) {
        console.warn("Failed to publish candidate directive:", err);
      }
    };
  }, [localParticipant, onSendDirectiveRef]);

  // Debounced 3.2s live code synchronization with Obsidian protocol summary
  useEffect(() => {
    if (!localParticipant || !code) return;
    const timer = setTimeout(async () => {
      try {
        const timestamp = Date.now();
        const summary = `[SILENT LIVE EDITOR SNAPSHOT — Candidate updated code in ${language}]:\n\`\`\`${language}\n${code}\n\`\`\`\n(Note: Only speak up if you notice a critical bug, milestone, or if the candidate asks a question.)`;
        
        const payloadCodeSync = JSON.stringify({ type: "code_sync", code, summary, timestamp });
        const payloadCodeUpdate = JSON.stringify({ type: "code_update", code, timestamp });
        const payloadEditorChange = JSON.stringify({ type: "editor_change", code, timestamp });

        await localParticipant.publishData(new TextEncoder().encode(payloadCodeSync), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadCodeUpdate), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadEditorChange), { reliable: true });
      } catch (err) {
        console.warn("Failed to publish debounced code sync:", err);
      }
    }, 3200);
    return () => clearTimeout(timer);
  }, [code, language, localParticipant]);

  // Immediate code execution event stream
  useEffect(() => {
    if (!localParticipant || !consoleOutput) return;
    const sendExec = async () => {
      try {
        const timestamp = Date.now();
        const triggeredBy = consoleOutput.triggeredBy || "user";
        const summary = `[LIVE CODE EXECUTION EVENT — Triggered by ${String(triggeredBy).toUpperCase()}]
Language: ${language}
Current Candidate Code:
\`\`\`${language}
${code}
\`\`\`
Execution Result:
Status: ${consoleOutput?.status || 'Executed'}
Runtime: ${consoleOutput?.runtime || 'N/A'}
Memory: ${consoleOutput?.memory || 'N/A'}
Raw Output: ${JSON.stringify(consoleOutput?.raw || consoleOutput)}

Please review this execution output and give brief, constructive verbal feedback to the candidate.`;

        const payload = JSON.stringify({ 
          type: "code_execution", 
          execution: consoleOutput, 
          result: consoleOutput, 
          code, 
          summary,
          timestamp 
        });
        await localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      } catch (err) {
        console.warn("Failed to publish execution output:", err);
      }
    };
    sendExec();
  }, [consoleOutput, code, language, localParticipant]);

  // Solution locked notification
  useEffect(() => {
    if (!localParticipant || !isSubmissionLocked) return;
    const notifyLock = async () => {
      try {
        const payload = JSON.stringify({ 
          type: "solution_submitted", 
          code, 
          timestamp: Date.now() 
        });
        await localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      } catch (e) {
        console.warn("Failed to publish solution lock event:", e);
      }
    };
    notifyLock();
  }, [isSubmissionLocked, localParticipant, code]);

  // Room incoming data channel messages & tool call execution
  useEffect(() => {
    if (!room) return;
    const handleData = async (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        
        if (msg.type === "ai_tool_call") {
          const tool = msg.tool;
          const data = msg.payload || {};

          if (tool === "open_code_editor") {
            onOpenCodeEditor(data);
          } else if (tool === "close_code_editor") {
            onCloseCodeEditor();
          } else if (tool === "update_code_editor") {
            onUpdateCodeEditor(data);
          } else if (tool === "highlight_line") {
            onHighlightLine(data);
          } else if (tool === "run_candidate_code") {
            onRunCandidateCode();
          } else if (tool === "capture_candidate_photo") {
            onCaptureCandidatePhoto(data?.reason);
            // Directly capture frame from video element and reply
            if (localParticipant) {
              const videoEl = document.querySelector('.camera-video-element') as HTMLVideoElement;
              if (videoEl && videoEl.videoWidth > 0) {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(videoEl.videoWidth || 640, 640);
                canvas.height = Math.min(videoEl.videoHeight || 360, 360);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                  const base64Data = canvas.toDataURL('image/jpeg', 0.7);
                  const respPayload = JSON.stringify({
                    type: "candidate_photo",
                    data: base64Data,
                    reason: data?.reason || "Candidate webcam observation"
                  });
                  await localParticipant.publishData(new TextEncoder().encode(respPayload), { reliable: true });
                  console.log("Published candidate webcam photo back to AI voice worker");
                }
              }
            }
          } else if (tool === "set_interview_stage") {
            onSetInterviewStage(data?.stage);
          }
        } else if (msg.type === "next_question") {
          onNextQuestion(typeof msg.question_index === 'number' ? msg.question_index : undefined);
        } else if (msg.type === "reveal_problem") {
          onRevealProblem();
        } else if (msg.type === "interview_completed") {
          onInterviewCompleted();
        }
      } catch (e) {
        console.warn("Failed to parse room data packet:", e);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [
    room, 
    localParticipant,
    onOpenCodeEditor, 
    onCloseCodeEditor, 
    onUpdateCodeEditor, 
    onHighlightLine, 
    onRunCandidateCode, 
    onCaptureCandidatePhoto, 
    onSetInterviewStage, 
    onNextQuestion, 
    onRevealProblem, 
    onInterviewCompleted
  ]);

  return null;
};

type AgentState = 'talking' | 'listening' | 'thinking';

// Module-scope component so it isn't recreated (and remounted) on every render.
const AgentVisualizer = ({ 
  variant = 'compact'
}: { 
  variant?: 'compact' | 'large';
  enableVoice?: boolean;
  onVoiceDetected?: (detected: boolean) => void;
}) => {
  const { state } = useVoiceAssistant();
  const [previewState, setPreviewState] = useState<AgentState | null>(null);

  // Stable, non-flickering state derivation directly from LiveKit Voice Assistant
  const activeState: AgentState = useMemo(() => {
    if (previewState) return previewState;
    if (state === 'speaking') return 'talking';
    if (state === 'listening') return 'listening';
    return 'thinking'; // Steady, tranquil analyzing baseline
  }, [state, previewState]);

  const isLarge = variant === 'large';

  // Toggle state manually for interactive testing & preview
  const cycleState = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeState === 'thinking') setPreviewState('talking');
    else if (activeState === 'talking') setPreviewState('listening');
    else setPreviewState('thinking');
  };

  const stateTheme = useMemo(() => {
    switch (activeState) {
      case 'talking':
        return {
          label: 'Speaking',
          color: '#f8fafc',
          glow: 'rgba(226, 232, 240, 0.45)',
          border: 'rgba(226, 232, 240, 0.35)',
          bg: 'rgba(226, 232, 240, 0.12)',
          subtitle: 'Aarav is speaking & walking through the challenge...',
        };
      case 'listening':
        return {
          label: 'Listening',
          color: '#38bdf8',
          glow: 'rgba(56, 189, 248, 0.4)',
          border: 'rgba(56, 189, 248, 0.25)',
          bg: 'rgba(2, 132, 199, 0.12)',
          subtitle: 'Listening to your thought process & explanation...',
        };
      case 'thinking':
      default:
        return {
          label: 'Analyzing',
          color: '#c084fc',
          glow: 'rgba(168, 85, 247, 0.4)',
          border: 'rgba(168, 85, 247, 0.25)',
          bg: 'rgba(99, 102, 241, 0.12)',
          subtitle: 'Evaluating algorithmic approach & complexity...',
        };
    }
  }, [activeState]);

  return (
    <div className="camera-feed-box" style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative', 
      background: 'radial-gradient(circle at center, rgba(17, 24, 39, 0.7) 0%, #070709 85%)', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      overflow: 'hidden',
      borderRadius: isLarge ? '16px' : '8px',
      border: '1px solid rgba(255, 255, 255, 0.08)'
    }}>
      {/* Professional Interviewer Person Avatar Card */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isLarge ? '12px' : '6px',
        zIndex: 5,
      }}>
        {/* Person Avatar Frame with Speaking Glow */}
        <div style={{
          position: 'relative',
          width: isLarge ? 130 : 68,
          height: isLarge ? 130 : 68,
          borderRadius: '50%',
          padding: 3,
          background: activeState === 'talking'
            ? 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.04) 100%)',
          boxShadow: activeState === 'talking'
            ? '0 0 25px rgba(16, 185, 129, 0.4), inset 0 0 15px rgba(16, 185, 129, 0.2)'
            : '0 10px 25px rgba(0, 0, 0, 0.6)',
          transition: 'all 0.4s ease',
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 30%, #1e2230 0%, #0d0f17 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.1)',
          }}>
            <UserCircle 
              size={isLarge ? 104 : 54} 
              color={activeState === 'talking' ? '#34d399' : '#cbd5e1'} 
              strokeWidth={1.4}
            />
          </div>

          {/* Active Speaking Status Indicator */}
          {activeState === 'talking' && (
            <div style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: isLarge ? 20 : 12,
              height: isLarge ? 20 : 12,
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid #070709',
              boxShadow: '0 0 8px #10b981',
            }} />
          )}
        </div>

        {/* Name and State Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: isLarge ? '0.90rem' : '0.74rem',
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-0.01em',
          }}>
            Aarav
          </div>
          <div style={{
            fontSize: isLarge ? '0.70rem' : '0.62rem',
            color: stateTheme.color,
            fontWeight: 500,
            marginTop: 1,
          }}>
            {stateTheme.label}
          </div>
        </div>

        {/* Subtle Voice Spectrum Equalizer Bars */}
        <div className="ai-voice-spectrum" style={{ height: isLarge ? 18 : 12, gap: 3 }}>
          {[0.08, 0.22, 0.38, 0.18, 0.05].map((delay, idx) => (
            <div
              key={idx}
              className="ai-voice-bar"
              style={{
                width: 3,
                backgroundColor: stateTheme.color,
                boxShadow: `0 0 6px ${stateTheme.glow}`,
                animation: activeState === 'talking'
                  ? `voiceBarRhythm 0.8s ease-in-out infinite alternate ${delay}s`
                  : activeState === 'listening'
                  ? `voiceBarGentle 1.4s ease-in-out infinite alternate ${delay * 1.5}s`
                  : `voiceBarRest 2.2s ease-in-out infinite alternate ${delay * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Floating Aarav Pill Top-Left */}
      <div style={{ 
        position: 'absolute', 
        top: isLarge ? 16 : 8, 
        left: isLarge ? 16 : 8, 
        background: 'rgba(7, 7, 9, 0.8)', 
        backdropFilter: 'blur(12px)', 
        WebkitBackdropFilter: 'blur(12px)',
        padding: isLarge ? '5px 14px' : '3px 8px', 
        borderRadius: '9999px', 
        fontSize: isLarge ? '0.78rem' : '0.70rem', 
        zIndex: 10, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        color: '#fff', 
        border: '1px solid rgba(255,255,255,0.12)' 
      }}>
        <div style={{ 
          width: 7, 
          height: 7, 
          borderRadius: '50%', 
          background: stateTheme.color, 
          boxShadow: `0 0 8px ${stateTheme.color}`,
          transition: 'all 0.3s ease'
        }} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>Aarav (AI Interviewer)</span>
      </div>

      {/* Interactive State Chip Top-Right */}
      <button 
        onClick={cycleState}
        title="Click to cycle AI consciousness state (preview)"
        style={{ 
          position: 'absolute', 
          top: isLarge ? 16 : 8, 
          right: isLarge ? 16 : 8, 
          background: stateTheme.bg,
          backdropFilter: 'blur(12px)', 
          WebkitBackdropFilter: 'blur(12px)',
          padding: isLarge ? '4px 12px' : '2px 8px', 
          borderRadius: '9999px', 
          fontSize: isLarge ? '0.75rem' : '0.68rem', 
          zIndex: 10, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px', 
          color: stateTheme.color, 
          border: `1px solid ${stateTheme.border}`,
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'all 0.3s ease'
        }}
      >
        {activeState === 'talking' && <Volume2 size={isLarge ? 12 : 10} />}
        {activeState === 'listening' && <Mic size={isLarge ? 12 : 10} />}
        {activeState === 'thinking' && <Sparkles size={isLarge ? 12 : 10} />}
        <span>{stateTheme.label}</span>
      </button>

      {/* Subtitle status banner at bottom */}
      <div style={{ 
        position: 'absolute', 
        bottom: isLarge ? 18 : 8, 
        zIndex: 10,
        background: 'rgba(7, 7, 9, 0.8)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: isLarge ? '5px 18px' : '2px 10px',
        borderRadius: '9999px',
        border: `1px solid ${stateTheme.border}`,
        transition: 'all 0.3s ease'
      }}>
        <span style={{ 
          fontSize: isLarge ? '0.82rem' : '0.70rem', 
          color: stateTheme.color, 
          fontWeight: 600, 
          letterSpacing: '0.01em',
          transition: 'color 0.2s' 
        }}>
          {stateTheme.subtitle}
        </span>
      </div>
    </div>
  );
};

export const DSAInterview: React.FC<DSAInterviewProps> = ({ questionId, templateId, templateName, domain, role, accessToken, onNavigate }) => {
  const API_URL = API_BASE_URL;

  const [questions, setQuestions] = useState<any[]>([DEFAULT_FALLBACK_DSA_QUESTION]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = questions[questionIndex] || questions[0] || DEFAULT_FALLBACK_DSA_QUESTION;
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [roomName] = useState(`dsa-int-${Math.floor(Math.random() * 100000)}`);
  const [connectionDetails, setConnectionDetails] = useState<{ url: string, token: string } | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60 * 60);
  const [code, setCode] = useState('');
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});

  // Phased interview journey: 'intro' (2 video boxes) -> 'coding' (IDE + challenge) -> 'defense' (complexity analysis)
  const [interviewPhase, setInterviewPhase] = useState<'intro' | 'coding' | 'defense'>('intro');
  const [isProblemRevealed, setIsProblemRevealed] = useState(false);
  const [isQuestionCollapsed, setIsQuestionCollapsed] = useState(false);

  // AI Tool Call State & Directives
  const [aiNotification, setAiNotification] = useState<string | null>(null);
  const [aiHighlightLine, setAiHighlightLine] = useState<number | null>(null);
  const [aiHighlightReason, setAiHighlightReason] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const onSendDirectiveRef = useRef<((text: string) => Promise<void>) | null>(null);

  const triggerBanner = (message: string) => {
    setAiNotification(message);
    setTimeout(() => {
      setAiNotification((prev) => (prev === message ? null : prev));
    }, 4500);
  };

  const handleSendDirective = (prompt: string, label: string) => {
    triggerBanner(`Directive: "${label}" sent to Aarav`);
    if (onSendDirectiveRef.current) {
      onSendDirectiveRef.current(prompt);
    }
  };

  // Sync Monaco Line Decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (aiHighlightLine) {
      try {
        editor.revealLineInCenter(aiHighlightLine);
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
          {
            range: new monaco.Range(aiHighlightLine, 1, aiHighlightLine, 1),
            options: {
              isWholeLine: true,
              className: 'monaco-ai-highlight-line',
              glyphMarginClassName: 'monaco-ai-highlight-glyph',
              overviewRuler: {
                color: '#f59e0b',
                position: monaco.editor.OverviewRulerLane.Full
              }
            }
          }
        ]);
      } catch (err) {
        console.warn("Failed to apply Monaco decorations:", err);
      }
    } else {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [aiHighlightLine]);

  // Dedicated coding window countdown timer (25 minutes)
  const CODING_DURATION_SECONDS = 25 * 60;
  const [codingTimeRemaining, setCodingTimeRemaining] = useState(CODING_DURATION_SECONDS);
  const [isCodingTimerActive, setIsCodingTimerActive] = useState(false);
  const [isSubmissionLocked, setIsSubmissionLocked] = useState(false);

  const updateCode = (newCode: string) => {
    setCode(newCode);
    if (question) {
      setCodeMap((prev) => ({ ...prev, [`${question.id}_${language}`]: newCode }));
    }
  };

  // Main interview overall session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Coding phase countdown timer
  useEffect(() => {
    if (!isCodingTimerActive || isSubmissionLocked) return;
    const timer = setInterval(() => {
      setCodingTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsSubmissionLocked(true);
          setInterviewPhase('defense');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isCodingTimerActive, isSubmissionLocked]);

  const [language, setLanguage] = useState('python');
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);

  useEffect(() => {
    async function loadCode() {
      if (question) {
        const cacheKey = `${question.id}_${language}`;
        if (codeMap[cacheKey] !== undefined) {
          setCode(codeMap[cacheKey]);
          return;
        }
        try {
          const submission = await getLatestSubmission(question.id, language);
          if (submission && submission.code) {
            setCode(submission.code);
            setCodeMap((prev) => ({ ...prev, [cacheKey]: submission.code }));
            setSubmissionStatus(submission.status);
            return;
          }
        } catch (error) {
          console.error("Failed to load latest submission", error);
        }

        // Fallback to starter code
        let starter = 'class Solution:\n    def solve(self):\n        pass';
        if (language === 'python' && question.python_starter_code) {
          starter = question.python_starter_code;
        } else if (language === 'cpp' && question.cpp_starter_code) {
          starter = question.cpp_starter_code;
        }
        setCode(starter);
        setCodeMap((prev) => ({ ...prev, [cacheKey]: starter }));
        setSubmissionStatus(null);
      }
    }
    loadCode();
  }, [question?.id, language]);

  const [activeTab, setActiveTab] = useState<'problem' | 'editorial'>('problem');
  const [testTab, setTestTab] = useState<'case1' | 'case2' | 'case3'>('case1');
  const [consoleOutput, setConsoleOutput] = useState<{ status: string, runtime?: string, memory?: string, raw?: any, triggeredBy?: 'user' | 'ai' } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNextQuestion = React.useCallback((targetIdx?: number) => {
    setQuestionIndex((prev) => {
      const nextIdx = typeof targetIdx === 'number' ? targetIdx : prev + 1;
      if (questions[nextIdx]) {
        setConsoleOutput(null);
        return nextIdx;
      }
      return prev; // no more questions
    });
  }, [questions]);

  // Connect to LiveKit Room API
  const isConnectingRef = useRef(false);

  const handleConnect = async () => {
    if (isConnectingRef.current) return;
    try {
      isConnectingRef.current = true;
      setIsConnecting(true);
      // Check if guest candidate credentials already exist in sessionStorage
      const guestRaw = sessionStorage.getItem('guest_interview_data');
      if (guestRaw) {
        try {
          const guestData = JSON.parse(guestRaw);
          if (guestData.token && guestData.url) {
            setConnectionDetails({ url: guestData.url, token: guestData.token });
            if (guestData.ai_selected_questions && guestData.ai_selected_questions.length > 0) {
              setQuestions(guestData.ai_selected_questions);
              setQuestionIndex(0);
            }
            setIsConnecting(false);
            return;
          }
        } catch (e) {
          console.warn("Could not parse guest interview data:", e);
        }
      }

      const headers: any = { 'Content-Type': 'application/json' };
      const token = accessToken || localStorage.getItem('access_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          room_name: roomName, 
          interview_type: templateId || 'dsa',
          question_ids: questionId ? [String(questionId)] : undefined,
          domain,
          role
        })
      });

      if (!response.ok && response.status === 404) {
        response = await apiClient.fetchWithAuth(`${API_URL}/api/token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            room_name: roomName, 
            interview_type: templateId || 'dsa',
            question_ids: questionId ? [String(questionId)] : undefined,
            domain,
            role
          })
        });
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned status ${response.status}`);
      }
      const connectionData = await response.json();

      setConnectionDetails({ url: connectionData.url, token: connectionData.token });

      if (connectionData.ai_selected_questions && connectionData.ai_selected_questions.length > 0) {
        setQuestions(connectionData.ai_selected_questions);
        setQuestionIndex(0);
        setLanguage('python');
      } else {
        console.warn("No ai_selected_questions returned by server; providing graceful fallback problem.");
        setQuestions([DEFAULT_FALLBACK_DSA_QUESTION]);
        setQuestionIndex(0);
        setLanguage('python');
      }
    } catch (err: any) {
      console.error("Connection failed:", err);
      setConnectionError(err?.message || "Failed to connect to the interview server. Please try again later.");
    } finally {
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  };

  useEffect(() => {
    handleConnect();
    return () => {
      // Eagerly unmount LiveKit room to disconnect WebRTC
      setConnectionDetails(null);
    };
  }, []);

  const handleOpenCodeWorkspace = (payload?: any) => {
    setIsProblemRevealed(true);
    setInterviewPhase('coding');
    setIsCodingTimerActive(true);
    if (payload?.language) {
      setLanguage(payload.language.toLowerCase());
    }
    if (payload?.starter_code) {
      setCode(payload.starter_code);
    }
    triggerBanner(payload?.problem_title ? `Aarav opened workspace: ${payload.problem_title}` : "Aarav opened the coding workspace");
  };

  const handleCloseCodeWorkspace = () => {
    setInterviewPhase('intro');
    triggerBanner("Aarav closed the editor — Switched to face-to-face discussion");
  };

  useEffect(() => {
    (window as any).__openCodeWorkspace = handleOpenCodeWorkspace;
    (window as any).__closeCodeWorkspace = handleCloseCodeWorkspace;
    (window as any).__collapseQuestion = setIsQuestionCollapsed;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (interviewPhase === 'intro') {
          handleOpenCodeWorkspace();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      delete (window as any).__openCodeWorkspace;
      delete (window as any).__closeCodeWorkspace;
      delete (window as any).__collapseQuestion;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [interviewPhase]);

  const handleUpdateCodeFromAi = (payload: any) => {
    if (payload?.code) {
      setCode(payload.code);
    }
    if (payload?.language) {
      setLanguage(payload.language.toLowerCase());
    }
    if (payload?.highlight_line) {
      setAiHighlightLine(Number(payload.highlight_line));
      setAiHighlightReason(payload.reason || "Review requested by Aarav");
    }
    triggerBanner("Aarav updated your code workspace");
  };

  const handleHighlightLineFromAi = (payload: any) => {
    if (payload?.line) {
      const lineNum = Number(payload.line);
      setAiHighlightLine(lineNum);
      setAiHighlightReason(payload.reason || "Interviewer pointed out this line");
      triggerBanner(`Aarav highlighted Line ${lineNum}: ${payload.reason || "Review needed"}`);
    }
  };

  const handleRunCode = async (triggeredBy: 'user' | 'ai' = 'user') => {
    setIsRunning(true);
    setConsoleOutput(null);
    if (!question) return;
    try {
      const data = await runDSACode(question.id, code, language, roomName);
      setConsoleOutput({
        status: data.status,
        runtime: data.execution_time_ms ? `${data.execution_time_ms.toFixed(2)} ms` : 'N/A',
        memory: data.memory_mb ? `${data.memory_mb} MB` : (data.memory_kb ? `${(data.memory_kb / 1024).toFixed(1)} MB` : 'N/A'),
        raw: data,
        triggeredBy
      });
      if (triggeredBy === 'ai') {
        triggerBanner("Aarav executed your code");
      }
    } catch (err: any) {
      console.error("Code run error:", err);
      setConsoleOutput({
        status: 'Error',
        runtime: 'N/A',
        memory: 'N/A',
        raw: { error_message: err.message || 'Execution error' },
        triggeredBy
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunCodeFromAi = () => {
    handleRunCode('ai');
  };

  const handleCapturePhotoNotification = (reason?: string) => {
    triggerBanner(`Aarav evaluated webcam frame: ${reason || "Focus observation"}`);
  };

  const handleSetStageFromAi = (stage: string) => {
    if (stage === 'coding' || stage === 'dsa_coding') {
      setInterviewPhase('coding');
      setIsCodingTimerActive(true);
    } else if (stage === 'defense' || stage === 'dsa_testing' || stage === 'evaluation') {
      setInterviewPhase('defense');
    } else if (stage === 'intro' || stage === 'greeting') {
      setInterviewPhase('intro');
    }
  };

  const handleSubmitCode = async () => {
    if (isSubmissionLocked) return;
    setIsSubmitting(true);
    setConsoleOutput(null);
    if (!question) return;
    try {
      const data = await submitDSACode(question.id, code, language, roomName);
      setSubmissionStatus(data.status);
      setConsoleOutput({
        status: data.status,
        runtime: data.execution_time_ms ? `${data.execution_time_ms.toFixed(2)} ms` : 'N/A',
        memory: data.memory_mb ? `${data.memory_mb} MB` : (data.memory_kb ? `${(data.memory_kb / 1024).toFixed(1)} MB` : 'N/A'),
        raw: data
      });
      if (data.status === 'Accepted') {
        setIsSubmissionLocked(true);
        setInterviewPhase('defense');
      }
    } catch (err: any) {
      console.error("Code submission error:", err);
      setConsoleOutput({
        status: 'Error',
        runtime: 'N/A',
        memory: 'N/A',
        raw: { error_message: err.message || 'Submission error' }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [isEnding, setIsEnding] = useState(false);

  const handleEndInterview = async () => {
    setIsEnding(true);
    try {
      const token = accessToken || localStorage.getItem('access_token');
      if (token && roomName) {
        await endInterview(token, roomName);
      }
    } catch (err) {
      console.error("Failed to end interview:", err);
    } finally {
      setIsEnding(false);
      const guestInviteToken = sessionStorage.getItem('guest_invite_token');
      if (guestInviteToken) {
        onNavigate('candidate-report', { inviteToken: guestInviteToken });
      } else {
        onNavigate('analysis', { sessionId: roomName });
      }
    }
  };

  const testCasesList = React.useMemo(() => {
    if (!question || !question.test_cases) return [];
    try {
      const parsed = typeof question.test_cases === 'string' ? JSON.parse(question.test_cases) : question.test_cases;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.cases)) return parsed.cases;
      return [];
    } catch {
      return [];
    }
  }, [question]);

  if (isConnecting) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#080810', color: '#fff', gap: '1rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(52, 211, 153, 0.2)', borderTopColor: '#34d399', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.95rem', color: '#94a3b8' }}>Establishing secure connection to AI Interviewer...</span>
      </div>
    );
  }

  if (connectionError || !connectionDetails) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#080810', color: '#fff', gap: '1rem' }}>
        <h2 style={{ color: '#ef4444', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Connection Error</h2>
        <p style={{ color: '#94a3b8', maxWidth: '440px', textAlign: 'center', lineHeight: 1.5, fontSize: '0.88rem' }}>{connectionError || 'Failed to connect to the interview room.'}</p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
          <button 
            onClick={() => {
              isConnectingRef.current = false;
              handleConnect();
            }}
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            Retry Connection
          </button>
          <button 
            onClick={() => onNavigate('dashboard')}
            style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const activeCaseIndex = testTab === 'case1' ? 0 : testTab === 'case2' ? 1 : 2;
  const activeCase = testCasesList[activeCaseIndex];

  return (
    <LiveKitRoom
      serverUrl={connectionDetails.url}
      token={connectionDetails.token}
      connect={true}
      audio={true}
      video={true}
      className="workspace-layout dsa-layout"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080810' }}
    >
      <RoomAudioRenderer />
      <IDESync 
        code={code} 
        language={language}
        consoleOutput={consoleOutput} 
        onNextQuestion={handleNextQuestion} 
        onRevealProblem={() => handleOpenCodeWorkspace()} 
        onInterviewCompleted={() => {
          const guestInviteToken = sessionStorage.getItem('guest_invite_token');
          if (guestInviteToken) {
            onNavigate('candidate-report', { inviteToken: guestInviteToken });
          } else {
            onNavigate('analysis', { sessionId: roomName });
          }
        }}
        isSubmissionLocked={isSubmissionLocked}
        onOpenCodeEditor={handleOpenCodeWorkspace}
        onCloseCodeEditor={handleCloseCodeWorkspace}
        onUpdateCodeEditor={handleUpdateCodeFromAi}
        onHighlightLine={handleHighlightLineFromAi}
        onRunCandidateCode={handleRunCodeFromAi}
        onCaptureCandidatePhoto={handleCapturePhotoNotification}
        onSetInterviewStage={handleSetStageFromAi}
        onSendDirectiveRef={onSendDirectiveRef}
      />

      {/* FLOATING AI TOOL NOTIFICATION TOAST */}
      {aiNotification && (
        <div className="ai-notification-banner">
          <Sparkles size={14} color="#34d399" />
          <span>{aiNotification}</span>
        </div>
      )}

      {/* OBSIDIAN STUDIO TOPBAR */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0.75rem 1.75rem', 
        background: 'rgba(7, 7, 9, 0.9)', 
        backdropFilter: 'blur(16px)', 
        WebkitBackdropFilter: 'blur(16px)', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        zIndex: 50
      }}>
        {/* Brand Logo & Interview Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            onClick={() => onNavigate('dashboard')}
            title="Return to Dashboard"
          >
            <img src="/logo.png" alt="ThinkAloudAI" style={{ height: '26px' }} />
          </div>
          <span style={{ 
            fontSize: '0.84rem', 
            fontWeight: 600, 
            color: 'rgba(255, 255, 255, 0.65)', 
            letterSpacing: '-0.01em',
            paddingLeft: '0.75rem',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            DSA Technical Interview
          </span>
        </div>

        {/* Right: Timer & End Interview Option Only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '0.8rem', 
            color: '#34d399', 
            background: 'rgba(52, 211, 153, 0.08)', 
            border: '1px solid rgba(52, 211, 153, 0.25)', 
            padding: '4px 14px', 
            borderRadius: '9999px', 
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
            <span>Session: {formatTime(timeRemaining)}</span>
            {interviewPhase !== 'intro' && (
              <>
                <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>|</span>
                <Clock size={12} color={codingTimeRemaining < 180 ? '#fca5a5' : '#38bdf8'} />
                <span style={{ color: codingTimeRemaining < 180 ? '#fca5a5' : '#38bdf8' }}>
                  Coding: {formatTime(codingTimeRemaining)}
                </span>
              </>
            )}
          </div>

          <button
            style={{ 
              background: 'rgba(239, 68, 68, 0.12)', 
              color: '#fca5a5', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              padding: '6px 16px', 
              borderRadius: '9999px', 
              fontSize: '0.8rem', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              cursor: isEnding ? 'wait' : 'pointer', 
              opacity: isEnding ? 0.7 : 1,
              transition: 'all 0.2s ease'
            }}
            onClick={handleEndInterview}
            disabled={isEnding}
          >
            {isEnding ? 'Wrapping up...' : 'End Interview'}
          </button>
        </div>
      </header>

      {/* PHASE 1: INTRO MODE (Clean 2-Box Stage With Rounded Glowing Aura) */}
      {interviewPhase === 'intro' ? (
        <div className="dsa-intro-stage">
          {/* Ambient Satisfying Dark Background Blooms */}
          <div className="dsa-ambient-nebula-left" />
          <div className="dsa-ambient-nebula-right" />

          <div className="dsa-intro-video-grid">
            {/* CANDIDATE VIDEO CARD */}
            <div className="dsa-intro-card">
              <div style={{ 
                position: 'absolute', 
                top: 16, 
                left: 16, 
                background: 'rgba(7, 7, 10, 0.75)', 
                backdropFilter: 'blur(12px)', 
                padding: '5px 14px', 
                borderRadius: '9999px', 
                fontSize: '0.78rem', 
                zIndex: 10, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                color: '#fff', 
                border: '1px solid rgba(255,255,255,0.12)' 
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e2e8f0', boxShadow: '0 0 8px rgba(226,232,240,0.8)' }} />
                <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>You (Candidate)</span>
              </div>
              <div style={{ position: 'absolute', bottom: 18, left: 0, width: '100%', display: 'flex', justifyContent: 'center', gap: '0.85rem', zIndex: 10 }}>
                <button 
                  style={{ 
                    background: isMuted ? 'rgba(239, 68, 68, 0.8)' : 'rgba(10, 11, 16, 0.75)', 
                    backdropFilter: 'blur(12px)', 
                    border: '1px solid rgba(255,255,255,0.18)', 
                    borderRadius: '50%', 
                    width: 44, 
                    height: 44, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#fff', 
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    transition: 'all 0.2s ease'
                  }} 
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} color="#e2e8f0" />}
                </button>
                <button 
                  style={{ 
                    background: !isCameraActive ? 'rgba(239, 68, 68, 0.8)' : 'rgba(10, 11, 16, 0.75)', 
                    backdropFilter: 'blur(12px)', 
                    border: '1px solid rgba(255,255,255,0.18)', 
                    borderRadius: '50%', 
                    width: 44, 
                    height: 44, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#fff', 
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    transition: 'all 0.2s ease'
                  }} 
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  title={isCameraActive ? "Turn off camera" : "Turn on camera"}
                >
                  {isCameraActive ? <Video size={18} color="#e2e8f0" /> : <VideoOff size={18} />}
                </button>
              </div>
              <CameraFeed isActive={isCameraActive} isMuted={isMuted} />
            </div>

            {/* AI INTERVIEWER CARD */}
            <div className="dsa-intro-card">
              <AgentVisualizer variant="large" enableVoice={!isMuted} />
            </div>
          </div>
        </div>
      ) : (
        /* PHASE 2 & 3: TECHNICAL CODING WORKSPACE */
        <div style={{ flex: 1, overflow: 'hidden', padding: '0.5rem', display: 'flex', width: '100%', height: '100%' }}>
          <PanelGroup id="dsa-workspace-group" orientation="horizontal" style={{ width: '100%', height: '100%' }}>

            {/* PANEL 1: DUAL VIDEOS (DOCKED SIDEBAR) */}
            <Panel id="sidebar-panel" defaultSize="20%" minSize="16%" maxSize="28%">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
                {/* CANDIDATE VIDEO FEED */}
                <div style={{ 
                  position: 'relative', 
                  background: '#090a10', 
                  borderRadius: '14px', 
                  border: '1px solid rgba(255,255,255,0.08)', 
                  overflow: 'hidden', 
                  flex: 1, 
                  minHeight: 0, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                }}>
                  <div style={{ 
                    position: 'absolute', 
                    top: 10, 
                    left: 10, 
                    background: 'rgba(7,7,10,0.75)', 
                    backdropFilter: 'blur(8px)', 
                    padding: '3px 10px', 
                    borderRadius: '9999px', 
                    fontSize: '0.72rem', 
                    zIndex: 10, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '5px', 
                    color: '#fff', 
                    border: '1px solid rgba(255,255,255,0.1)' 
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e2e8f0', boxShadow: '0 0 6px #e2e8f0' }} />
                    <span style={{ fontWeight: 600 }}>You</span>
                  </div>
                  <div style={{ position: 'absolute', bottom: 10, left: 0, width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', zIndex: 10 }}>
                    <button 
                      style={{ 
                        background: isMuted ? 'rgba(239, 68, 68, 0.8)' : 'rgba(10, 11, 16, 0.75)', 
                        backdropFilter: 'blur(8px)', 
                        border: '1px solid rgba(255,255,255,0.15)', 
                        borderRadius: '50%', 
                        width: 32, 
                        height: 32, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#fff', 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }} 
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    </button>
                    <button 
                      style={{ 
                        background: !isCameraActive ? 'rgba(239, 68, 68, 0.8)' : 'rgba(10, 11, 16, 0.75)', 
                        backdropFilter: 'blur(8px)', 
                        border: '1px solid rgba(255,255,255,0.15)', 
                        borderRadius: '50%', 
                        width: 32, 
                        height: 32, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#fff', 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }} 
                      onClick={() => setIsCameraActive(!isCameraActive)}
                    >
                      {isCameraActive ? <Video size={14} /> : <VideoOff size={14} />}
                    </button>
                  </div>
                  <CameraFeed isActive={isCameraActive} isMuted={isMuted} />
                </div>

                {/* AI AGENT VISUALIZER */}
                <div style={{ 
                  position: 'relative', 
                  background: '#090a10', 
                  borderRadius: '14px', 
                  border: '1px solid rgba(255,255,255,0.08)', 
                  overflow: 'hidden', 
                  flex: 1, 
                  minHeight: 0, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                }}>
                  <AgentVisualizer variant="compact" enableVoice={!isMuted} />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="panel-resize-handle horizontal" />

            {/* PANEL 2: PROBLEM PANEL (COLLAPSIBLE) */}
            {!isQuestionCollapsed ? (
              <>
                <Panel id="problem-panel" defaultSize="34%" minSize="20%" maxSize="50%">
                  <div style={{ background: '#111', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem', borderBottom: '1px solid #222', background: '#0A0A12' }}>
                      <div style={{ display: 'flex' }}>
                        <button style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'problem' ? '2px solid #34d399' : '2px solid transparent', color: activeTab === 'problem' ? '#fff' : '#888', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }} onClick={() => setActiveTab('problem')}>Problem</button>
                        <button style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'editorial' ? '2px solid #34d399' : '2px solid transparent', color: activeTab === 'editorial' ? '#fff' : '#888', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }} onClick={() => setActiveTab('editorial')}>Editorial</button>
                      </div>

                      <button 
                        onClick={() => setIsQuestionCollapsed(true)}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid rgba(255, 255, 255, 0.08)', 
                          borderRadius: '6px', 
                          color: '#94a3b8', 
                          padding: '4px 8px', 
                          fontSize: '0.75rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px', 
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        title="Minimize Question Panel"
                      >
                        <ChevronLeft size={14} />
                        <span>Minimize</span>
                      </button>
                    </div>

                    <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                      {!isProblemRevealed ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', gap: '1rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 500, color: '#ccc' }}>Waiting for the interviewer...</div>
                          <div style={{ fontSize: '0.9rem' }}>The problem will be revealed when the interviewer is ready.</div>
                        </div>
                      ) : question ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', color: '#fff' }}>
                              {question.title}
                              {submissionStatus === 'Accepted' && (
                                <CheckCircle size={22} color="#34d399" style={{ marginLeft: '8px' }} />
                              )}
                            </h1>
                            <Bookmark size={18} color="#888" />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            {(() => {
                              const dc = getDifficultyColor(question.difficulty);
                              return (
                                <span style={{ padding: '2px 10px', borderRadius: '12px', background: dc.bg, color: dc.text, border: `1px solid ${dc.border}`, fontSize: '0.75rem', fontWeight: 600 }}>
                                  {question.difficulty}
                                </span>
                              );
                            })()}
                            <span style={{ padding: '2px 10px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.75rem' }}>
                              {question.category || 'Algorithms'}
                            </span>
                          </div>

                          <div className="prose-content" style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.6 }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{formatDescription(question.description)}</ReactMarkdown>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>Loading question...</div>
                      )}
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="panel-resize-handle horizontal" />
              </>
            ) : (
              /* COLLAPSED QUESTION VERTICAL RIBBON */
              <div 
                className="collapsed-question-ribbon"
                onClick={() => setIsQuestionCollapsed(false)}
                title="Click to expand question panel"
              >
                <div className="ribbon-icon-btn">
                  <ChevronRight size={16} />
                </div>
                {(() => {
                  const dc = getDifficultyColor(question.difficulty);
                  return (
                    <span 
                      className="ribbon-difficulty-pill"
                      style={{ background: dc.bg, color: dc.text, border: `1px solid ${dc.border}` }}
                    >
                      {question.difficulty}
                    </span>
                  );
                })()}
                <span className="ribbon-title-vertical">
                  {question.title}
                </span>
              </div>
            )}

            {/* PANEL 3: MONACO CODE EDITOR & TESTCASES (VERTICALLY FLEXIBLE) */}
            <Panel id="editor-panel" defaultSize={isQuestionCollapsed ? "78%" : "44%"} minSize="25%">
              <PanelGroup id="editor-vertical-group" orientation="vertical" style={{ width: '100%', height: '100%' }}>
                {/* SUBPANEL 1: CODE EDITOR */}
                <Panel id="monaco-subpanel" defaultSize="62%" minSize="25%" maxSize="85%">
                  <div style={{ height: '100%', background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: '#0A0A12', borderBottom: '1px solid #222' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{ background: '#12131f', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                      >
                        <option value="python">Python 3</option>
                        <option value="cpp">C++ 20</option>
                      </select>
                      
                      {/* Coding Countdown Timer */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        background: codingTimeRemaining < 180 ? 'rgba(239, 68, 68, 0.15)' : codingTimeRemaining < 600 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(52, 211, 153, 0.1)',
                        border: `1px solid ${codingTimeRemaining < 180 ? 'rgba(239, 68, 68, 0.4)' : codingTimeRemaining < 600 ? 'rgba(56, 189, 248, 0.35)' : 'rgba(52, 211, 153, 0.25)'}`,
                        color: codingTimeRemaining < 180 ? '#fca5a5' : codingTimeRemaining < 600 ? '#38bdf8' : '#34d399'
                      }}>
                        <Clock size={13} />
                        <span>Coding: {formatTime(codingTimeRemaining)}</span>
                        {isSubmissionLocked && <span style={{ opacity: 0.8 }}>(Closed)</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', color: '#888' }}>
                      <Settings size={14} />
                      <Maximize2 size={14} />
                    </div>
                  </div>

                  {/* AI Bug / Line Highlight Banner above Editor */}
                  {aiHighlightLine && (
                    <div className="ai-bug-highlight-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={14} color="#fbbf24" />
                        <span>AI Review Notice on Line {aiHighlightLine}: {aiHighlightReason || "Interviewer highlighted this line"}</span>
                      </div>
                      <button onClick={() => setAiHighlightLine(null)} title="Dismiss Highlight">
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <div style={{ flex: 1, padding: '0.5rem 0' }}>
                    <Editor
                      height="100%"
                      language={language}
                      theme="vs-dark"
                      value={code}
                      onChange={(v) => updateCode(v || '')}
                      onMount={(editor, monaco) => {
                        editorRef.current = editor;
                        monacoRef.current = monaco;
                      }}
                      options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 16 }, automaticLayout: true }}
                    />
                  </div>

                  {/* BOTTOM ACTION BAR */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: '#08080c' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)' }}></div>
                      <span>Auto-Saved • Ln 1, Col 1</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ 
                          padding: '6px 14px', 
                          fontSize: '0.85rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#e2e8f0',
                          borderRadius: '8px',
                          transition: 'all 0.2s'
                        }} 
                        onClick={() => handleRunCode('user')} 
                        disabled={isRunning || isSubmitting}
                      >
                        <Play size={14} color="#e2e8f0" />
                        <span>{isRunning ? 'Running...' : 'Run Code'}</span>
                      </button>

                      {isSubmissionLocked ? (
                        <div style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '6px 14px', 
                          borderRadius: '8px', 
                          background: submissionStatus === 'Accepted' ? 'rgba(226, 232, 240, 0.08)' : 'rgba(239, 68, 68, 0.12)', 
                          border: `1px solid ${submissionStatus === 'Accepted' ? 'rgba(226, 232, 240, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, 
                          color: submissionStatus === 'Accepted' ? '#f8fafc' : '#fca5a5', 
                          fontSize: '0.8rem', 
                          fontWeight: 600,
                          fontFamily: 'JetBrains Mono, monospace'
                        }}>
                          {submissionStatus === 'Accepted' ? <CheckCircle size={14} color="#e2e8f0" /> : <Lock size={14} />}
                          <span>{submissionStatus === 'Accepted' ? 'Solution Submitted' : 'Submission Closed'}</span>
                        </div>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          style={{ 
                            padding: '6px 16px', 
                            fontSize: '0.85rem', 
                            background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 45%, #cbd5e1 100%)', 
                            color: '#09090b', 
                            border: '1px solid rgba(255, 255, 255, 0.8)', 
                            borderRadius: '8px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            fontWeight: 600,
                            boxShadow: '0 0 20px rgba(255, 255, 255, 0.22)',
                            transition: 'all 0.2s',
                            cursor: isRunning || isSubmitting ? 'not-allowed' : 'pointer'
                          }} 
                          onClick={handleSubmitCode} 
                          disabled={isRunning || isSubmitting}
                        >
                          <Send size={14} color="#09090b" />
                          <span>{isSubmitting ? 'Submitting...' : 'Submit Solution'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* VERTICAL SPLIT RESIZE HANDLE */}
              <PanelResizeHandle className="panel-resize-handle vertical" />

              {/* SUBPANEL 2: TESTCASES & OUTPUT CONSOLE */}
              <Panel id="testcases-subpanel" defaultSize="38%" minSize="15%" maxSize="75%">
                <div style={{ height: '100%', background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', padding: '0 1rem', borderBottom: '1px solid #222', background: '#0A0A12' }}>
                    <button style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', borderBottom: '2px solid #34d399', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Testcase</button>
                    {consoleOutput && (
                      <button style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', color: consoleOutput.status === 'Accepted' ? '#34d399' : '#ef4444', cursor: 'default', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        {consoleOutput.status === 'Accepted' ? '✔ Test Result' : '✖ Test Result'}
                      </button>
                    )}
                  </div>

                  <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                    {consoleOutput && (consoleOutput.status === 'Runtime Error' || consoleOutput.status === 'Compilation Error') ? (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                        <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '0.5rem' }}>{consoleOutput.status}</div>
                        <pre style={{ margin: 0, color: '#fca5a5', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                          {consoleOutput.raw?.error_message || "An error occurred during execution."}
                        </pre>
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <button style={{ padding: '4px 12px', background: testTab === 'case1' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)', color: testTab === 'case1' ? '#34d399' : '#94a3b8', border: testTab === 'case1' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => setTestTab('case1')}>Case 1</button>
                      <button style={{ padding: '4px 12px', background: testTab === 'case2' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)', color: testTab === 'case2' ? '#34d399' : '#94a3b8', border: testTab === 'case2' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => setTestTab('case2')}>Case 2</button>
                      <button style={{ padding: '4px 12px', background: testTab === 'case3' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)', color: testTab === 'case3' ? '#34d399' : '#94a3b8', border: testTab === 'case3' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => setTestTab('case3')}>Case 3</button>
                    </div>

                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <div style={{ flex: 1 }}>
                        {activeCase ? (
                          <>
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem' }}>Input</div>
                              <div style={{ background: '#1A1A24', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', color: '#ccc', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                {activeCase.args && typeof activeCase.args === 'object'
                                  ? Object.entries(activeCase.args).map(([k, v]) => `${k} = ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`).join('\n')
                                  : (activeCase.input ? (Array.isArray(activeCase.input) ? activeCase.input.join('\n') : (typeof activeCase.input === 'string' ? activeCase.input : JSON.stringify(activeCase.input))) : 'None')}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem' }}>Expected</div>
                              <div style={{ background: '#1A1A24', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', color: '#ccc', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                {activeCase.expected !== undefined
                                  ? (typeof activeCase.expected === 'string' ? activeCase.expected : JSON.stringify(activeCase.expected))
                                  : (activeCase.expected_output !== undefined ? (typeof activeCase.expected_output === 'string' ? activeCase.expected_output : JSON.stringify(activeCase.expected_output)) : 'None')}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#888', fontSize: '0.85rem' }}>Test case not found.</div>
                        )}
                      </div>

                      <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#0A0A12', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        {consoleOutput ? (
                          <>
                            <div style={{ color: consoleOutput.status === 'Accepted' ? '#34d399' : '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              {consoleOutput.status === 'Accepted' ? '✔ Accepted' : '✖ ' + consoleOutput.status}
                            </div>
                            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Tests Passed: {consoleOutput.raw?.passed_tests || 0}/{consoleOutput.raw?.total_tests || 0}</div>
                            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Runtime: {consoleOutput.runtime}</div>
                            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Memory: {consoleOutput.memory}</div>
                          </>
                        ) : (
                          <div style={{ color: '#888', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>Run code to see results</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          </PanelGroup>
        </div>
      )}
    </LiveKitRoom>
  );
};
