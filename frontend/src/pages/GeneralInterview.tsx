import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Microphone, 
  MicrophoneSlash, 
  VideoCamera, 
  VideoCameraSlash, 
  WarningCircle, 
  ArrowClockwise, 
  User, 
  Robot, 
  SignOut, 
  Broadcast, 
  ChatCircleDots,
  MagnifyingGlass,
  Copy,
  Check,
  UserCircle
} from '@phosphor-icons/react';
import { RoomEvent, Track } from 'livekit-client';
import { 
  LiveKitRoom, 
  RoomAudioRenderer, 
  BarVisualizer, 
  useVoiceAssistant, 
  useRoomContext,
  useLocalParticipant,
  useTranscriptions,
  VideoTrack
} from "@livekit/components-react";
import "@livekit/components-styles";
import { endInterview } from '../services/interviewService';
import { apiClient } from '../services/apiClient';
import { API_BASE_URL } from '../config/api';
import '../styles/GeneralInterview.css';

interface GeneralInterviewProps {
  templateId?: string;
  templateName?: string;
  domain?: string;
  role?: string;
  accessToken?: string | null;
  onNavigate: (page: string, params?: any) => void;
}

// ============================================================
// 1. CANDIDATE CAMERA CARD (LEFT VIDEO)
// ============================================================
const CandidateVideoCard = ({ 
  isCameraActive, 
  isMuted, 
  onToggleCamera, 
  onToggleMic 
}: { 
  isCameraActive: boolean; 
  isMuted: boolean; 
  onToggleCamera: () => void; 
  onToggleMic: () => void; 
}) => {
  const { localParticipant, cameraTrack } = useLocalParticipant();

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(isCameraActive);
    }
  }, [isCameraActive, localParticipant]);

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted);
    }
  }, [isMuted, localParticipant]);

  const hasVideo = !!cameraTrack && isCameraActive;

  const trackRef = (cameraTrack && isCameraActive) ? {
    participant: localParticipant,
    publication: cameraTrack,
    source: Track.Source.Camera
  } : null;

  return (
    <div className={`gi-video-card candidate ${!isMuted ? 'speaking' : ''}`}>
      {/* Top Floating Pill Tag */}
      <div className="gi-video-top-tag">
        <div className={`gi-avatar-dot ${!isMuted ? 'green' : 'amber'}`} />
        <span>You</span>
      </div>

      {/* Video Content or Fallback */}
      {hasVideo && trackRef ? (
        <VideoTrack
          trackRef={trackRef as any}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
      ) : (
        <div className="gi-camera-off-state">
          <div className="gi-candidate-avatar-large">
            <User size={38} weight="bold" />
          </div>
          <span className="gi-camera-off-label">
            {isCameraActive ? 'Connecting Video Feed...' : 'Camera Paused'}
          </span>
        </div>
      )}

      {/* Candidate Floating Quick Controls */}
      <div className="gi-candidate-controls">
        <button
          className={`gi-ctrl-btn ${isMuted ? 'active-off' : ''}`}
          onClick={onToggleMic}
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {isMuted ? <MicrophoneSlash size={16} weight="bold" /> : <Microphone size={16} weight="bold" />}
        </button>

        <button
          className={`gi-ctrl-btn ${!isCameraActive ? 'active-off' : ''}`}
          onClick={onToggleCamera}
          title={isCameraActive ? "Turn off camera" : "Turn on camera"}
        >
          {!isCameraActive ? <VideoCameraSlash size={16} weight="bold" /> : <VideoCamera size={16} weight="bold" />}
        </button>
      </div>
    </div>
  );
};

// ============================================================
// 2. AI INTERVIEWER CARD (RIGHT VIDEO / AUDIO VISUALIZER)
// ============================================================
const AIAgentCard = () => {
  const { state, audioTrack } = useVoiceAssistant();
  const isSpeaking = state === 'speaking';

  return (
    <div className={`gi-video-card ai ${isSpeaking ? 'speaking' : ''}`}>
      {/* Top Floating Tag */}
      <div className="gi-video-top-tag">
        <div className="gi-avatar-dot emerald" />
        <span>Aarav · AI Interviewer</span>
      </div>

      {/* Center AI Presence Stage */}
      <div className="gi-ai-center-stage">
        {/* Person Avatar with Speaking Ring */}
        <div style={{
          position: 'relative',
          width: 96,
          height: 96,
          borderRadius: '50%',
          padding: 3,
          background: isSpeaking 
            ? 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)' 
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)',
          boxShadow: isSpeaking 
            ? '0 0 25px rgba(16, 185, 129, 0.4)' 
            : '0 8px 20px rgba(0, 0, 0, 0.5)',
          transition: 'all 0.3s ease',
          marginBottom: 8,
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
              size={80} 
              color={isSpeaking ? '#34d399' : '#cbd5e1'} 
              weight="duotone"
            />
          </div>
          {isSpeaking && (
            <div style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid #070709',
              boxShadow: '0 0 8px #10b981',
            }} />
          )}
        </div>

        {/* Audio Equalizer */}
        <div className="gi-ai-equalizer-wrap">
          <BarVisualizer 
            state={state} 
            barCount={9} 
            trackRef={audioTrack} 
            style={{ height: '22px', width: '90px' }} 
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 3. DOWNSIDE LIVE TRANSCRIPT FEED
// ============================================================
const DownsideLiveTranscript = () => {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'ai' | 'candidate'>('all');
  const [copiedAll, setCopiedAll] = useState(false);

  // Deduplicate and process live transcript segments
  const deduplicated = useMemo(() => {
    const map = new Map<string, typeof transcriptions[0]>();
    transcriptions.forEach((t, i) => {
      const segId = (t as any)?.segment?.id || (t as any)?.id || t.streamInfo?.id || `seg-${i}`;
      map.set(segId, t);
    });
    return Array.from(map.values());
  }, [transcriptions]);

  // Filter transcript segments
  const filteredTurns = useMemo(() => {
    return deduplicated.filter((t) => {
      const isLocal = t.participantInfo?.identity === localParticipant?.identity;
      if (speakerFilter === 'ai' && isLocal) return false;
      if (speakerFilter === 'candidate' && !isLocal) return false;
      if (searchQuery.trim()) {
        const text = (t.text || '').toLowerCase();
        return text.includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [deduplicated, speakerFilter, searchQuery, localParticipant]);

  // Auto-scroll to bottom on every speech update
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredTurns]);

  const handleCopyTranscript = () => {
    if (deduplicated.length === 0) return;
    const fullText = deduplicated
      .map((t) => {
        const isLocal = t.participantInfo?.identity === localParticipant?.identity;
        const speaker = isLocal ? 'You' : 'Aarav';
        return `[${speaker}]:\n${t.text}\n`;
      })
      .join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="gi-lower-section">
      {/* Transcript Header Toolbar */}
      <div className="gi-transcript-header">
        <div className="gi-transcript-title-wrap">
          <div className="gi-transcript-title">
            <ChatCircleDots size={16} weight="fill" className="text-emerald-400" />
            <span>Live Transcript</span>
          </div>
        </div>

        {/* Toolbar Controls: Search, Filters & Copy */}
        <div className="gi-transcript-toolbar-controls">
          {/* Quick Search */}
          <div className="gi-transcript-search-wrap">
            <MagnifyingGlass size={13} className="gi-transcript-search-icon" />
            <input 
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="gi-transcript-search-input"
            />
            {searchQuery && (
              <button className="gi-transcript-clear-search" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          {/* Speaker Filter Pills */}
          <div className="gi-transcript-filter-group">
            <button 
              className={`gi-filter-pill ${speakerFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSpeakerFilter('all')}
            >
              All
            </button>
            <button 
              className={`gi-filter-pill ${speakerFilter === 'ai' ? 'active' : ''}`}
              onClick={() => setSpeakerFilter('ai')}
            >
              AI
            </button>
            <button 
              className={`gi-filter-pill ${speakerFilter === 'candidate' ? 'active' : ''}`}
              onClick={() => setSpeakerFilter('candidate')}
            >
              You
            </button>
          </div>

          {/* Copy Transcript Button */}
          <button 
            className="gi-btn-copy-transcript"
            onClick={handleCopyTranscript}
            title="Copy full transcript to clipboard"
          >
            {copiedAll ? (
              <>
                <Check size={13} weight="bold" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transcript Scroll Feed */}
      <div className="gi-transcript-feed" ref={containerRef}>
        {filteredTurns.length === 0 ? (
          <div className="gi-transcript-empty">
            <Broadcast size={22} className="gi-pulse-icon" />
            <span>Your conversation will appear here as you speak.</span>
          </div>
        ) : (
          filteredTurns.map((t, idx) => {
            const isLocal = t.participantInfo?.identity === localParticipant?.identity;
            const key = (t as any)?.segment?.id || (t as any)?.id || t.streamInfo?.id || idx;

            return (
              <div 
                key={key} 
                className={`gi-transcript-row ${isLocal ? 'candidate' : 'ai'}`}
              >
                <div className={`gi-transcript-avatar ${isLocal ? 'candidate' : 'ai'}`}>
                  {isLocal ? <User size={14} weight="bold" /> : <Robot size={14} weight="fill" />}
                </div>

                <div className={`gi-transcript-bubble ${isLocal ? 'candidate' : 'ai'}`}>
                  <div className="gi-bubble-meta-head">
                    <span className="gi-speaker-label">
                      {isLocal ? 'You' : 'Aarav'}
                    </span>
                  </div>
                  <div className="gi-bubble-body">{t.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================================
// 4. ROOM DATA LISTENER
// ============================================================
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

// ============================================================
// 5. MAIN GENERAL INTERVIEW COMPONENT
// ============================================================
export const GeneralInterview: React.FC<GeneralInterviewProps> = ({ 
  templateId, 
  templateName, 
  domain, 
  role, 
  accessToken, 
  onNavigate 
}) => {
  const API_URL = API_BASE_URL;
  const [roomName] = useState(() => `gen-int-${Math.floor(Math.random() * 100000)}`);
  const [connectionDetails, setConnectionDetails] = useState<{ url: string, token: string } | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const isConnectingRef = useRef(false);

  // Live session countdown timer (default 45 minutes)
  const [timeRemaining, setTimeRemaining] = useState(45 * 60);

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

  const displayTitle = useMemo(() => {
    if (templateName) return templateName;
    const tId = (templateId || '').toLowerCase();
    if (tId.includes('behavioral')) return 'Behavioral & Leadership Studio';
    if (tId.includes('aiml') || tId.includes('ai')) return 'AI & Machine Learning Studio';
    if (tId.includes('product') || tId.includes('pm')) return 'Product Strategy Studio';
    if (tId.includes('discussion')) return 'Technical Discussion Studio';
    return 'AI Mock Interview Studio';
  }, [templateName, templateId]);

  const displayDomain = domain || (
    (templateId || '').toLowerCase().includes('pm') ? 'Product' :
    (templateId || '').toLowerCase().includes('aiml') ? 'AI / ML' :
    (templateId || '').toLowerCase().includes('behavioral') ? 'Behavioral / STAR' : 'General'
  );

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
          interview_type: templateId || 'general',
          domain: displayDomain,
          role: role || 'Software Engineer'
        })
      });

      if (!response.ok && response.status === 404) {
        response = await apiClient.fetchWithAuth(`${API_URL}/api/token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            room_name: roomName, 
            interview_type: templateId || 'general',
            domain: displayDomain,
            role: role || 'Software Engineer'
          })
        });
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned status ${response.status}`);
      }
      
      const connectionData = await response.json();
      setConnectionDetails({ url: connectionData.url, token: connectionData.token });
    } catch (err: any) {
      console.error("Connection failed:", err);
      setConnectionError(err?.message || "Failed to connect to the interview room. Please check your connection and try again.");
    } finally {
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  };

  useEffect(() => {
    handleConnect();
    return () => {
      setConnectionDetails(null);
    };
  }, []);

  return (
    <div className="gi-studio-layout">
      {/* HEADER NAVIGATION */}
      <header className="gi-header">
        <div className="gi-header-left">
          <div 
            className="gi-logo-wrap" 
            onClick={() => onNavigate('dashboard')}
            title="Return to Dashboard"
          >
            <img src="/logo.png" alt="ThinkAloudAI" className="gi-logo-img" />
          </div>

          <div className="gi-title-group">
            <h1 className="gi-track-title">{displayTitle}</h1>
            <span className="gi-domain-pill">{displayDomain}</span>
            {role && <span className="gi-role-pill">{role}</span>}
          </div>

          <div className="gi-live-badge">
            <div className="gi-live-dot" />
            <span>Live • {formatTime(timeRemaining)} / 45:00</span>
          </div>
        </div>

        <div className="gi-header-right">
          <button 
            className="gi-btn-end" 
            onClick={handleEndInterview}
            disabled={isEnding}
            title="Complete interview and view deep analysis"
          >
            <SignOut size={15} weight="bold" />
            <span>{isEnding ? 'Wrapping up...' : 'End Interview'}</span>
          </button>
        </div>
      </header>

      {/* MAIN STUDIO WORKSPACE */}
      <main className="gi-workspace-body">
        {connectionDetails ? (
          <LiveKitRoom
            serverUrl={connectionDetails.url}
            token={connectionDetails.token}
            connect={true}
            audio={true}
            video={true}
            style={{ display: 'contents' }}
          >
            <RoomAudioRenderer />
            <RoomDataListener onCompleted={handleEndInterview} />

            {/* TOP STAGE: BALANCED DUAL VIDEO DISPLAY (16:9) */}
            <div className="gi-dual-video-stage">
              {/* Left: Candidate Video Card */}
              <CandidateVideoCard 
                isCameraActive={isCameraActive}
                isMuted={isMuted}
                onToggleCamera={() => setIsCameraActive(prev => !prev)}
                onToggleMic={() => setIsMuted(prev => !prev)}
              />

              {/* Right: AI Interviewer Card */}
              <AIAgentCard />
            </div>

            {/* LOWER SECTION: BEAUTIFUL COMPACT LIVE TRANSCRIPT */}
            <DownsideLiveTranscript />
          </LiveKitRoom>
        ) : connectionError ? (
          <div className="gi-error-container">
            <div className="gi-error-card">
              <WarningCircle size={40} color="#fb7185" weight="fill" />
              <div>
                <h3 className="gi-error-title">Connection Interrupted</h3>
                <p className="gi-error-desc">{connectionError}</p>
              </div>
              <div className="gi-error-actions">
                <button 
                  onClick={handleConnect} 
                  disabled={isConnecting}
                  className="gi-btn-retry"
                >
                  <ArrowClockwise size={14} className={isConnecting ? 'animate-spin' : ''} weight="bold" />
                  <span>{isConnecting ? 'Retrying...' : 'Retry Connection'}</span>
                </button>
                <button 
                  onClick={() => onNavigate('dashboard')} 
                  className="gi-btn-return"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="gi-loading-container">
            <ArrowClockwise size={28} color="#34d399" className="animate-spin" weight="bold" />
            <span className="gi-loading-text">Connecting to Live Interview Studio...</span>
          </div>
        )}
      </main>
    </div>
  );
};

export default GeneralInterview;
