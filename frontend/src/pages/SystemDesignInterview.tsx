import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Send,
  Brain,
  Bookmark,
  Check,
  FileText,
  Clock,
  Monitor,
  MonitorOff,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Network,
  MessageSquareText,
  RefreshCw,
  AlertCircle,
  X,
  Lightbulb,
  CheckCircle2,
  UserCircle
} from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Room, RoomEvent } from 'livekit-client';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  BarVisualizer, 
  useVoiceAssistant, 
  useRoomContext, 
  useLocalParticipant 
} from "@livekit/components-react";
import "@livekit/components-styles";
import { CameraFeed } from '../components/CameraFeed';
import { LiveTranscript } from '../components/LiveTranscript';
import { endInterview } from '../services/interviewService';
import { submitSystemDesign } from '../services/dsaService';
import { apiClient } from '../services/apiClient';
import { useExcaliflowBridge, type ElementLike, type ExcaliflowBridgeApi } from '../utils/excaliflowBridge';
import '../styles/MockInterview.css';
import ReactMarkdown from 'react-markdown';
import { API_BASE_URL } from '../config/api';

// Fallback question when none is returned by backend
const DEFAULT_SD_QUESTION = {
  id: 1,
  title: 'Design a URL Shortening Service like bit.ly',
  description: `Design a scalable URL shortening service similar to bit.ly.

### Requirements:
- **Functional Requirements:**
  - Given a long URL, generate a shorter and unique alias (e.g. \`https://sho.rt/abc123\`).
  - Redirect users from the short URL to the original URL with minimal latency (<20ms).
  - Support custom short link aliases and expiration timestamps.
  - Collect telemetry: click analytics, referrers, and geo-distribution.
- **Non-Functional Requirements:**
  - High availability (99.99%) — redirect reads should never fail.
  - Read-heavy workload (100:1 Read-to-Write ratio).
  - 100 million new URLs created per month, 10 billion redirects per month.
- **Key Architectural Components to Address:**
  - **API Gateway & Routing:** Rate limiting, authentication, load balancing.
  - **Key Generation Service (KGS):** Base62 encoding, pre-generated key tokens to prevent database collision locks.
  - **Storage Tier:** Relational vs NoSQL for URL mappings; Redis / Memcached cluster for the top 20% hot links.
  - **Data Partitioning:** Range vs Consistent Hashing strategies to avoid hot-spot partitions.
  - **Analytics Pipeline:** Asynchronous message queue (Apache Kafka) feeding analytical clickhouse/data lakes.`
};

const DEFAULT_HINTS = [
  "Estimate scale: 100M writes/month ≈ 40 writes/sec; 10B reads/month ≈ 4,000 reads/sec.",
  "Consider a standalone Key Generation Service (KGS) that generates random 7-character Base62 keys in batches to avoid runtime collisions.",
  "Apply the 80/20 Pareto rule for caching: caching 20% of the daily read volume can satisfy 80% of traffic.",
  "Use HTTP 302 (Found) instead of 301 (Permanent Redirect) if you need click analytics on every hit."
];

// Sub-component: Syncs typed architecture notes to AI Interviewer over LiveKit DataChannel
const NoteSync = ({ notes }: { notes: string }) => {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;
    const timer = setTimeout(async () => {
      try {
        const timestamp = Date.now();
        // Emit both design_update and canvas_state formats
        const payloadDesign = JSON.stringify({ 
          type: "design_update", 
          content: notes, 
          code: notes,
          notes,
          timestamp 
        });
        const payloadCanvas = JSON.stringify({ 
          type: "canvas_state", 
          content: notes, 
          code: notes,
          notes,
          timestamp 
        });
        await localParticipant.publishData(new TextEncoder().encode(payloadDesign), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadCanvas), { reliable: true });
      } catch (err) {
        console.warn("Failed to publish design notes update:", err);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [notes, localParticipant]);

  return null;
};

const NODE_TYPES = ['rectangle', 'ellipse', 'diamond', 'sticky'];

const shapeLabelOf = (el: ElementLike): string => {
  const raw = typeof el.text === 'string' ? el.text.trim().replace(/\s+/g, ' ') : '';
  return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
};

// Extracts structured architectural elements, labels, and bound component→component
// flows from the ExcaliFlow whiteboard scene (arrow bindings make real edges possible)
export function extractWhiteboardGraph(elements: readonly ElementLike[]): string {
  if (!elements || elements.length === 0) return '';

  const activeElements = elements.filter((el) => el && !el.isDeleted);
  if (activeElements.length === 0) return '';

  const idToLabel = new Map<string, string>();
  for (const el of activeElements) {
    if (NODE_TYPES.includes(el.type || '')) {
      idToLabel.set(el.id || '', shapeLabelOf(el) || `${el.type}`);
    }
  }

  const nodeLabels: string[] = [];
  const stickyNotes: string[] = [];
  const textNodes: string[] = [];

  for (const el of activeElements) {
    if (NODE_TYPES.includes(el.type || '')) {
      const label = shapeLabelOf(el);
      if (el.type === 'sticky') {
        if (label) stickyNotes.push(label);
      } else {
        nodeLabels.push(label ? `${el.type}: ${label}` : `${el.type}`);
      }
    } else if (el.type === 'text' && el.text && el.text.trim().length > 0) {
      textNodes.push(el.text.trim().replace(/\s+/g, ' ').slice(0, 48));
    }
  }

  const edges: string[] = [];
  for (const el of activeElements) {
    if (el.type !== 'arrow') continue;
    const flowLabel = typeof el.text === 'string' ? el.text.trim().replace(/\s+/g, ' ') : '';
    const from = el.startBinding?.elementId ? idToLabel.get(el.startBinding.elementId) : undefined;
    const to = el.endBinding?.elementId ? idToLabel.get(el.endBinding.elementId) : undefined;
    if (from && to) {
      edges.push(`${from} → ${to}${flowLabel ? ` (${flowLabel})` : ''}`);
    } else if (flowLabel) {
      edges.push(flowLabel);
    }
  }

  const parts: string[] = [];
  if (nodeLabels.length > 0) parts.push(`Components / Blocks (${nodeLabels.length}): ${nodeLabels.slice(0, 20).join(', ')}`);
  if (edges.length > 0) parts.push(`Directed Flows (${edges.length}): ${edges.slice(0, 24).join(' | ')}`);
  if (stickyNotes.length > 0) parts.push(`Sticky Notes: [${stickyNotes.slice(0, 12).join(', ')}]`);
  if (textNodes.length > 0) parts.push(`Labels & Notes: [${textNodes.slice(0, 16).join(', ')}]`);

  return parts.join(' | ');
}

// Sub-component: Periodically publishes structured whiteboard graph over DataChannel to AI
const WhiteboardGraphSync = ({ bridge }: { bridge: ExcaliflowBridgeApi }) => {
  const { localParticipant } = useLocalParticipant();
  const { ready, getElements } = bridge;
  const lastGraphRef = useRef<string>("");

  useEffect(() => {
    if (!localParticipant || !ready) return;
    let cancelled = false;

    const publishGraph = async () => {
      try {
        const elements = await getElements();
        if (cancelled || !elements || elements.length === 0) return;

        const summary = extractWhiteboardGraph(elements);
        if (!summary || summary === lastGraphRef.current) return;
        lastGraphRef.current = summary;

        const timestamp = Date.now();
        // Emit both whiteboard_graph and whiteboard_update formats
        const payloadGraph = JSON.stringify({
          type: "whiteboard_graph",
          graph: summary,
          elements_count: elements.length,
          timestamp
        });
        const payloadUpdate = JSON.stringify({
          type: "whiteboard_update",
          graph: summary,
          elements_count: elements.length,
          timestamp
        });
        // Emit design_update and canvas_state with latest whiteboard graph
        const payloadDesign = JSON.stringify({
          type: "design_update",
          content: summary,
          code: summary,
          timestamp
        });
        const payloadCanvas = JSON.stringify({
          type: "canvas_state",
          graph: summary,
          elements_count: elements.length,
          timestamp
        });

        await localParticipant.publishData(new TextEncoder().encode(payloadGraph), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadUpdate), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadDesign), { reliable: true });
        await localParticipant.publishData(new TextEncoder().encode(payloadCanvas), { reliable: true });
      } catch (err) {
        // Silent ignore — the frame may be re-booting
      }
    };

    publishGraph();
    const interval = setInterval(publishGraph, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [localParticipant, ready, getElements]);

  return null;
};

// Sub-component: Listens for agent-dispatched events (e.g. interview_completed)
const RoomDataListener = ({ onCompleted }: { onCompleted: () => void }) => {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array) => {
      try {
        const str = new TextDecoder().decode(payload);
        const data = JSON.parse(str);
        if (data.type === 'interview_completed') {
          onCompleted();
        }
      } catch {
        // Ignore unparseable non-JSON packets
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, onCompleted]);

  return null;
};

// Sub-component: Synchronizes screen share state with native browser stream track events
const ScreenShareButton = ({ onShareChange }: { onShareChange: (isSharing: boolean) => void }) => {
  const { localParticipant } = useLocalParticipant();
  const isSharing = localParticipant?.isScreenShareEnabled ?? false;

  useEffect(() => {
    onShareChange(isSharing);
  }, [isSharing, onShareChange]);

  const toggleShare = async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setScreenShareEnabled(!isSharing);
    } catch (e) {
      console.error("Screen share toggle failed:", e);
    }
  };

  return (
    <button 
      style={{ 
        background: isSharing ? 'rgba(0, 208, 132, 0.7)' : 'rgba(255, 255, 255, 0.1)', 
        border: isSharing ? '1px solid #00D084' : '1px solid rgba(255, 255, 255, 0.2)', 
        borderRadius: '50%', 
        width: 32, 
        height: 32, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: '#fff', 
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }} 
      onClick={toggleShare}
      title={isSharing ? "Stop sharing whiteboard screen" : "Share screen with AI interviewer"}
    >
      {isSharing ? <Monitor size={14} color="#fff" /> : <MonitorOff size={14} color="#ccc" />}
    </button>
  );
};

// Sub-component: Renders AI Interviewer audio pulse and status
const AgentVisualizer = () => {
  const { state, audioTrack } = useVoiceAssistant();
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  
  return (
    <div className="camera-feed-box" style={{ width: '100%', height: '100%', position: 'relative', background: '#090a10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ 
        position: 'absolute', 
        top: 8, 
        left: 8, 
        background: 'rgba(0,0,0,0.65)', 
        backdropFilter: 'blur(8px)',
        padding: '3px 8px', 
        borderRadius: '9999px', 
        fontSize: '0.72rem', 
        zIndex: 10, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
        <span style={{ fontWeight: 600 }}>Aarav (AI Architect)</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <div style={{ 
          width: 60,
          height: 60,
          borderRadius: '50%',
          boxShadow: isSpeaking ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none', 
          transition: 'all 0.3s ease', 
          background: isSpeaking ? 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)' : 'rgba(255, 255, 255, 0.08)',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: '#0d0f17',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <UserCircle size={44} color={isSpeaking ? '#34d399' : '#cbd5e1'} strokeWidth={1.5} />
          </div>
        </div>
        <div style={{ height: '22px', display: 'flex', alignItems: 'center' }}>
          <BarVisualizer state={state} barCount={7} trackRef={audioTrack} style={{ height: '20px', width: '70px' }} />
        </div>
        <span style={{ fontSize: '0.72rem', color: isSpeaking ? '#ffffff' : '#9ca3af', fontWeight: 600, transition: 'color 0.2s' }}>
          {isSpeaking ? 'Aarav is reviewing architecture...' : isListening ? 'Listening to your explanation...' : 'Analyzing tradeoffs...'}
        </span>
      </div>
    </div>
  );
};

interface SystemDesignInterviewProps {
  templateId?: string;
  templateName?: string;
  accessToken: string | null;
  onNavigate: (page: string, params?: any) => void;
  domain?: string;
  role?: string;
}

export const SystemDesignInterview: React.FC<SystemDesignInterviewProps> = ({ 
  templateId, 
  templateName, 
  accessToken, 
  onNavigate, 
  domain, 
  role 
}) => {
  const API_URL = API_BASE_URL;
  const [roomName] = useState(() => `sd-int-${Math.floor(Math.random() * 100000)}`);
  const [connectionDetails, setConnectionDetails] = useState<{ url: string, token: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const isConnectingRef = useRef(false);

  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [sysDesignAnswer, setSysDesignAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [isProblemCollapsed, setIsProblemCollapsed] = useState(false);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const whiteboardIframeRef = useRef<HTMLIFrameElement | null>(null);
  const whiteboard = useExcaliflowBridge(whiteboardIframeRef);
  const [activeProblemTab, setActiveProblemTab] = useState<'problem' | 'hints'>('problem');
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`bookmark_sd_${roomName}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [timeRemaining, setTimeRemaining] = useState(50 * 60); // 50 minutes standard
  const [question, setQuestion] = useState<any>(DEFAULT_SD_QUESTION);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleBookmark = () => {
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      localStorage.setItem(`bookmark_sd_${roomName}`, String(next));
    } catch {}
    showToast(next ? "Question bookmarked to your review list" : "Bookmark removed");
  };

  const handleAskAI = () => {
    showToast("Speak aloud into your microphone to ask the AI Interviewer for guidance.");
  };

  const handleEndInterview = useCallback(async () => {
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
  }, [accessToken, roomName, onNavigate]);

  const handleConnect = async () => {
    if (isConnectingRef.current) return;
    setIsConnecting(true);
    setConnectionError(null);
    try {
      isConnectingRef.current = true;
      // Check if guest candidate credentials already exist in sessionStorage
      const guestRaw = sessionStorage.getItem('guest_interview_data');
      if (guestRaw) {
        try {
          const guestData = JSON.parse(guestRaw);
          if (guestData.token && guestData.url) {
            setConnectionDetails({ url: guestData.url, token: guestData.token });
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
          interview_type: templateId || 'system_design',
          domain: domain || 'Backend',
          role: role || 'Senior Software Engineer'
        })
      });

      if (!response.ok && response.status === 404) {
        response = await apiClient.fetchWithAuth(`${API_URL}/api/token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            room_name: roomName, 
            interview_type: templateId || 'system_design',
            domain: domain || 'Backend',
            role: role || 'Senior Software Engineer'
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
        const qData = connectionData.ai_selected_questions[0];
        if (typeof qData === 'string') {
          setQuestion({
            id: 1,
            title: qData,
            description: `Design a scalable architecture for **${qData}**.\n\n### Requirements:\n- **Functional Requirements:** Core user capabilities, APIs, and access patterns.\n- **Non-Functional Requirements:** High availability (99.99%), low-latency reads, data durability, and horizontal scalability.\n- **Architecture Components:** API Gateway, Data Model, Caching Strategy, Sharding/Partitioning, and Trade-offs.`
          });
        } else if (qData && typeof qData === 'object') {
          setQuestion({
            id: qData.id || 1,
            title: qData.title || qData.name || DEFAULT_SD_QUESTION.title,
            description: qData.description || qData.content || qData.problem_statement || DEFAULT_SD_QUESTION.description,
            ...qData
          });
        }
      }
    } catch (err: any) {
      console.error("Connection failed:", err);
      setConnectionError(err?.message || "Failed to establish connection to AI Interviewer server.");
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

  // Match the whiteboard canvas to the dark studio chrome once ExcaliFlow boots
  useEffect(() => {
    if (!whiteboard.ready) return;
    whiteboard.setCanvasTheme('#000000').catch(() => {
      /* frame may already be gone — ignore */
    });
  }, [whiteboard.ready, whiteboard.setCanvasTheme]);

  // Escape key handler for evaluation modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && evaluationResult) {
        setEvaluationResult(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [evaluationResult]);

  // Diagram & Design Submission handler
  const handleEvaluationSubmit = async () => {
    const hasNotes = sysDesignAnswer.trim().length > 0;
    let hasDrawing = false;
    let base64Image: string | undefined = undefined;

    if (whiteboard.ready) {
      try {
        const elements = await whiteboard.getElements();
        const nonDeletedElements = (elements || []).filter((el) => el && !el.isDeleted);
        if (nonDeletedElements.length > 0) {
          hasDrawing = true;
          base64Image = await whiteboard.getExport({ scale: 2, mime: 'image/jpeg', quality: 0.85 });
          if (!base64Image) base64Image = undefined;
        }
      } catch (err) {
        console.warn("Failed to export ExcaliFlow diagram:", err);
      }
    }

    if (!hasNotes && !hasDrawing) {
      alert("Please provide architecture notes in the summary box or draw your diagram on the whiteboard before submitting.");
      return;
    }

    const effectiveAnswer = hasNotes 
      ? sysDesignAnswer 
      : `[Candidate submitted architectural whiteboard diagram for ${question?.title || 'System Design'}]`;

    setIsEvaluating(true);
    try {
      const token = accessToken || localStorage.getItem('access_token') || '';
      const rawQuestionId = question?.id || 1;
      const numericQuestionId = typeof rawQuestionId === 'number' 
        ? rawQuestionId 
        : (parseInt(String(rawQuestionId).replace(/\D/g, ''), 10) || 1);
      
      const result = await submitSystemDesign(numericQuestionId, effectiveAnswer, token, base64Image);
      
      const parseField = (field: any): string[] => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map(String);
        if (typeof field === 'string') {
          try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
          } catch {
            return [field];
          }
        }
        return [String(field)];
      };
      
      if (result) {
        result.strengths = parseField(result.strengths);
        result.improvements = parseField(result.improvements || result.improvement_plan);
      }
      
      setEvaluationResult(result);
    } catch (e: any) {
      console.error("Evaluation failed", e);
      alert(e.message || "Failed to evaluate answer. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="workspace-layout dsa-layout sd-dsa-match-layout" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080810' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 72,
          right: 24,
          background: 'rgba(20, 20, 30, 0.95)',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(8px)'
        }}>
          <Sparkles size={15} color="#f97316" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* OBSIDIAN STUDIO TOPBAR */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0.65rem 1.5rem', 
        background: 'rgba(7, 7, 9, 0.85)', 
        backdropFilter: 'blur(16px)', 
        WebkitBackdropFilter: 'blur(16px)', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} 
            onClick={() => onNavigate('dashboard')}
            title="Return to Dashboard"
          >
            <img src="/logo.png" alt="ThinkAloudAI" style={{ height: '24px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
              {templateName || 'System Design Studio'}
            </h2>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(255, 255, 255, 0.05)', color: '#d1d5db', border: '1px solid rgba(255, 255, 255, 0.08)', fontFamily: 'JetBrains Mono, monospace' }}>
              {domain || 'Architecture'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', padding: '3px 10px', borderRadius: '9999px', fontFamily: 'JetBrains Mono, monospace' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
            <span>Live • {formatTime(timeRemaining)} / 50:00</span>
          </div>
        </div>

        <button 
          style={{ 
            background: 'rgba(239, 68, 68, 0.12)', 
            color: '#fca5a5', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            padding: '6px 16px', 
            borderRadius: '9999px', 
            fontSize: '0.82rem', 
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
      </header>

      {/* MAIN WORKSPACE */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0.5rem' }}>
        <PanelGroup orientation="horizontal">
          
          {/* PANEL 1: AI Coach, Camera, & Transcript */}
          <Panel defaultSize={22} minSize={15}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
              {connectionDetails ? (
                <LiveKitRoom
                  serverUrl={connectionDetails.url}
                  token={connectionDetails.token}
                  connect={true}
                  audio={true}
                  video={true}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.5rem' }}
                >
                  <RoomAudioRenderer />
                  <NoteSync notes={sysDesignAnswer} />
                  <WhiteboardGraphSync bridge={whiteboard} />
                  <RoomDataListener onCompleted={handleEndInterview} />

                  {/* Candidate Feed */}
                  <div style={{ position: 'relative', background: '#111', borderRadius: '8px', overflow: 'hidden', flex: '0 0 auto', aspectRatio: '16/9' }}>
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', backdropFilter: 'blur(4px)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D084' }} />
                      <span>You</span>
                    </div>

                    <div style={{ position: 'absolute', bottom: 8, left: 0, width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', zIndex: 10 }}>
                      <button 
                        style={{ 
                          background: isMuted ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0,0,0,0.6)', 
                          border: isMuted ? '1px solid #ef4444' : 'none', 
                          borderRadius: '50%', 
                          width: 32, 
                          height: 32, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#fff', 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }} 
                        onClick={() => setIsMuted(!isMuted)}
                        title={isMuted ? "Unmute microphone" : "Mute microphone"}
                      >
                        {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                      </button>

                      <button 
                        style={{ 
                          background: !isCameraActive ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0,0,0,0.6)', 
                          border: !isCameraActive ? '1px solid #ef4444' : 'none', 
                          borderRadius: '50%', 
                          width: 32, 
                          height: 32, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#fff', 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }} 
                        onClick={() => setIsCameraActive(!isCameraActive)}
                        title={isCameraActive ? "Turn off camera" : "Turn on camera"}
                      >
                        {!isCameraActive ? <VideoOff size={14} /> : <Video size={14} />}
                      </button>

                      <ScreenShareButton onShareChange={setIsScreenSharing} />
                    </div>

                    <CameraFeed isActive={isCameraActive} isMuted={isMuted} />
                  </div>

                  {/* AI Interviewer Visualizer */}
                  <div style={{ position: 'relative', background: '#111', borderRadius: '8px', overflow: 'hidden', flex: '0 0 auto', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AgentVisualizer />
                  </div>

                  {/* Live Turn Transcript */}
                  <div style={{ flex: 1, background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0A0A12' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Live Transcript</span>
                      <FileText size={14} color="#888" />
                    </div>
                    <div style={{ flex: 1, padding: '0.75rem', overflow: 'hidden', fontSize: '0.85rem' }}>
                      <LiveTranscript />
                    </div>
                  </div>
                </LiveKitRoom>
              ) : connectionError ? (
                <div style={{ 
                  background: '#12121a', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(239, 68, 68, 0.3)', 
                  padding: '2rem 1.5rem', 
                  textAlign: 'center', 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '1rem' 
                }}>
                  <AlertCircle size={36} color="#ef4444" />
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Connection Error</h3>
                    <p style={{ color: '#aaa', fontSize: '0.82rem', margin: 0, lineHeight: 1.4 }}>{connectionError}</p>
                  </div>
                  <button 
                    onClick={handleConnect}
                    disabled={isConnecting}
                    style={{
                      background: '#f97316',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={14} className={isConnecting ? 'animate-spin' : ''} />
                    <span>{isConnecting ? 'Retrying...' : 'Retry Connection'}</span>
                  </button>
                </div>
              ) : (
                <div style={{ 
                  color: '#888', 
                  fontSize: '0.9rem', 
                  textAlign: 'center', 
                  padding: '2rem 0',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  background: '#12121a',
                  borderRadius: '8px'
                }}>
                  <RefreshCw size={24} color="#f97316" className="animate-spin" />
                  <span>Connecting to AI Interviewer...</span>
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle style={{ width: '8px', cursor: 'col-resize' }} />

          {/* PANEL 2: Problem Description & Architecture Rubric */}
          {isProblemCollapsed ? (
            <Panel defaultSize={4} minSize={4} maxSize={4}>
              <button
                className="sd-problem-collapsed-rail"
                onClick={() => setIsProblemCollapsed(false)}
                title="Expand problem"
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  color: '#f97316',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px 0'
                }}
              >
                <PanelLeftOpen size={16} />
                <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.85rem', letterSpacing: '1px' }}>Problem</span>
              </button>
            </Panel>
          ) : (
            <Panel defaultSize={35} minSize={22}>
              <div style={{ background: '#111', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem', borderBottom: '1px solid #222', background: '#0A0A12' }}>
                  <div style={{ display: 'flex' }}>
                    <button 
                      style={{ 
                        padding: '0.75rem 1rem', 
                        background: 'transparent', 
                        border: 'none', 
                        borderBottom: activeProblemTab === 'problem' ? '2px solid #FF6B00' : '2px solid transparent', 
                        color: activeProblemTab === 'problem' ? '#fff' : '#888', 
                        cursor: 'pointer', 
                        fontSize: '0.85rem',
                        fontWeight: activeProblemTab === 'problem' ? 600 : 400
                      }}
                      onClick={() => setActiveProblemTab('problem')}
                    >
                      Problem
                    </button>
                    <button 
                      style={{ 
                        padding: '0.75rem 1rem', 
                        background: 'transparent', 
                        border: 'none', 
                        borderBottom: activeProblemTab === 'hints' ? '2px solid #FF6B00' : '2px solid transparent', 
                        color: activeProblemTab === 'hints' ? '#fff' : '#888', 
                        cursor: 'pointer', 
                        fontSize: '0.85rem',
                        fontWeight: activeProblemTab === 'hints' ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => setActiveProblemTab('hints')}
                    >
                      <Lightbulb size={13} color={activeProblemTab === 'hints' ? "#f97316" : "#888"} />
                      <span>Hints</span>
                    </button>
                  </div>
                  <button className="sd-panel-icon-btn" onClick={() => setIsProblemCollapsed(true)} title="Collapse problem">
                    <PanelLeftClose size={16} />
                  </button>
                </div>

                <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                  {activeProblemTab === 'problem' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h1 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', color: '#fff', fontWeight: 700 }}>
                          {question?.title || DEFAULT_SD_QUESTION.title}
                        </h1>
                        <button 
                          onClick={toggleBookmark}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
                          title={isBookmarked ? "Remove bookmark" : "Bookmark question"}
                        >
                          <Bookmark size={18} color={isBookmarked ? "#f97316" : "#888"} fill={isBookmarked ? "#f97316" : "none"} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', fontSize: '0.75rem', fontWeight: 600 }}>
                          High Level Design
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', background: '#222', color: '#aaa', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> 45-50 mins
                        </span>
                      </div>

                      <div className="prose-content" style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.6 }}>
                        <ReactMarkdown>{question?.description || DEFAULT_SD_QUESTION.description}</ReactMarkdown>
                      </div>

                      <div className="sd-design-checklist" style={{ marginTop: '1.5rem', borderTop: '1px solid #222', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '0.8rem', marginBottom: '6px' }}>
                          <Network size={14} color="#f97316" /> Requirements &amp; Scale Estimations
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '0.8rem', marginBottom: '6px' }}>
                          <Sparkles size={14} color="#f97316" /> APIs, Storage Schema &amp; Caching Strategy
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '0.8rem' }}>
                          <MessageSquareText size={14} color="#f97316" /> Trade-offs, Partitioning &amp; Failure Modes
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                        <Lightbulb size={20} color="#f97316" />
                        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>Architectural Hints</h3>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {DEFAULT_HINTS.map((hint, idx) => (
                          <div 
                            key={idx}
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.03)', 
                              border: '1px solid rgba(255, 255, 255, 0.08)', 
                              borderRadius: '8px', 
                              padding: '12px 16px',
                              fontSize: '0.88rem',
                              color: '#ddd',
                              lineHeight: 1.5
                            }}
                          >
                            <span style={{ color: '#f97316', fontWeight: 600, marginRight: '6px' }}>Hint {idx + 1}:</span>
                            {hint}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <PanelResizeHandle style={{ width: '8px', cursor: 'col-resize' }} />

          {/* PANEL 3: ExcaliFlow Whiteboard & Design Notes */}
          <Panel defaultSize={isProblemCollapsed ? 74 : 43} minSize={30}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.5rem' }}>
              
              {/* Whiteboard Container */}
              <div style={{ flex: 2, background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: '#0A0A12', borderBottom: '1px solid #222' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Architecture Whiteboard</span>
                    <span style={{ color: '#888', fontSize: '0.82rem' }}>ExcaliFlow Engine · Animated Flows</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', color: '#888' }}>
                    <span style={{ fontSize: '0.75rem', color: whiteboard.ready ? '#00D084' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: whiteboard.ready ? '#00D084' : '#f59e0b' }} />
                      {whiteboard.ready
                        ? (isScreenSharing ? '⚡ Live AI Sync + Screen Share Active' : '⚡ Live AI Architecture Sync Active')
                        : 'Whiteboard booting…'}
                    </span>
                  </div>
                </div>

                <div className="sd-dsa-whiteboard-frame" style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                  <iframe
                    ref={whiteboardIframeRef}
                    src="/excaliflow/index.html"
                    title="Architecture Whiteboard — ExcaliFlow"
                    allow="clipboard-read; clipboard-write"
                  />
                </div>

                {/* Whiteboard Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderTop: '1px solid #222', background: '#0A0A12' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: whiteboard.ready ? '#00D084' : '#f59e0b', fontSize: '0.75rem' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: whiteboard.ready ? '#00D084' : '#f59e0b' }} />
                    <span>{whiteboard.ready ? 'Whiteboard ready' : 'Whiteboard booting…'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.82rem' }} 
                      onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                    >
                      {isSummaryCollapsed ? 'Show Notes' : 'Hide Notes'}
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={handleAskAI}
                    >
                      <Brain size={14} color="#f97316" /> Ask AI
                    </button>
                    <button 
                      className="btn btn-primary" 
                      style={{ 
                        padding: '6px 16px', 
                        fontSize: '0.82rem', 
                        background: '#FF6B00', 
                        color: '#fff', 
                        border: 'none', 
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: isEvaluating ? 'wait' : 'pointer'
                      }} 
                      onClick={handleEvaluationSubmit} 
                      disabled={isEvaluating}
                    >
                      <Send size={14} />
                      <span>{isEvaluating ? 'Evaluating Diagram...' : 'Submit Design'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Design Notes Area */}
              {!isSummaryCollapsed && (
                <div style={{ flex: 1, background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem', borderBottom: '1px solid #222', background: '#0A0A12' }}>
                    <div style={{ display: 'flex' }}>
                      <button style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', borderBottom: '2px solid #FF6B00', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Design Summary &amp; Trade-offs</button>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#888' }}>{sysDesignAnswer.trim().length} characters</span>
                  </div>
                  <div style={{ padding: '0.75rem 1rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea
                      placeholder="Type your APIs, data models, capacity estimates, partition keys, cache strategies, and trade-off rationales..."
                      className="sd-dsa-summary-input"
                      value={sysDesignAnswer}
                      onChange={(e) => setSysDesignAnswer(e.target.value)}
                      style={{
                        flex: 1,
                        background: '#09090e',
                        border: '1px solid #222',
                        borderRadius: '6px',
                        color: '#fff',
                        padding: '10px',
                        fontSize: '0.85rem',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'monospace'
                      }}
                    />
                    <div className="sd-summary-hint-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#777' }}>
                      <span>Include bottlenecks, consistency trade-offs, and failure recovery.</span>
                      <span style={{ color: '#00D084' }}>Auto-syncs with AI Interviewer</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* EVALUATION MODAL */}
      {evaluationResult && (
        <div 
          onClick={() => setEvaluationResult(null)}
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.85)', 
            zIndex: 1000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backdropFilter: 'blur(6px)'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="glass-panel" 
            style={{ 
              width: '640px', 
              maxWidth: '92%', 
              background: '#0B0B13', 
              border: '1px solid #2a2a3e', 
              borderRadius: '12px', 
              padding: '2rem',
              boxShadow: '0 16px 40px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                <Brain color="#FF6B00" size={22} /> System Design Evaluation
              </h2>
              <button 
                onClick={() => setEvaluationResult(null)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', alignItems: 'center', background: '#12121c', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1f1f2e' }}>
              <div style={{ textAlign: 'center', minWidth: '90px' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: evaluationResult.score >= 70 ? '#00D084' : '#FF6B00', fontFamily: 'monospace' }}>
                  {evaluationResult.score}/100
                </div>
                <div style={{ color: '#888', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Architecture Score</div>
              </div>
              <div style={{ flex: 1, color: '#ddd', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {evaluationResult.feedback || "Evaluation completed."}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1, background: 'rgba(0, 208, 132, 0.08)', border: '1px solid rgba(0, 208, 132, 0.3)', padding: '1rem', borderRadius: '8px' }}>
                <h4 style={{ color: '#00D084', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                  <CheckCircle2 size={14}/> Key Strengths
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#ccc', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  {evaluationResult.strengths && evaluationResult.strengths.length > 0 ? (
                    evaluationResult.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)
                  ) : (
                    <li>Clear baseline understanding of components</li>
                  )}
                </ul>
              </div>
              
              <div style={{ flex: 1, background: 'rgba(255, 107, 0, 0.08)', border: '1px solid rgba(255, 107, 0, 0.3)', padding: '1rem', borderRadius: '8px' }}>
                <h4 style={{ color: '#FF6B00', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                  <Sparkles size={14}/> Areas to Deepen
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#ccc', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  {evaluationResult.improvements && evaluationResult.improvements.length > 0 ? (
                    evaluationResult.improvements.map((s: string, i: number) => <li key={i}>{s}</li>)
                  ) : (
                    <li>Discuss detailed partition strategy &amp; database replication trade-offs</li>
                  )}
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setEvaluationResult(null)} 
                style={{ 
                  background: '#222', 
                  color: '#fff', 
                  border: '1px solid #333', 
                  padding: '8px 18px', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  fontSize: '0.85rem' 
                }}
              >
                Continue Designing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemDesignInterview;
