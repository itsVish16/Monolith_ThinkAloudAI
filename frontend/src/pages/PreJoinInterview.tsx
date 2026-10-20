import React, { useState, useEffect, useRef, useCallback } from 'react';
import '@livekit/components-styles';
import { 
  CheckCircle, 
  UserCircle, 
  VideoCamera, 
  VideoCameraSlash, 
  Microphone, 
  MicrophoneSlash, 
  SpeakerHigh, 
  XCircle, 
  Warning, 
  ArrowRight,
  Clock,
  Sparkle,
  ShieldCheck
} from '@phosphor-icons/react';
import { PageHeader } from '../components/common/PageHeader';
import { getGuestInviteDetails, joinGuestInterview } from '../services/interviewService';
import './PreJoinInterview.css';

export interface PreJoinInterviewProps {
  user?: any;
  templateId?: string;
  templateName?: string;
  targetPage?: string;
  inviteToken?: string;
  onNavigate: (page: string, params?: any) => void;
}

export const PreJoinInterview: React.FC<PreJoinInterviewProps> = ({ 
  user,
  templateId, 
  templateName, 
  targetPage,
  inviteToken,
  onNavigate 
}) => {
  // Domain & Role states for regular mock sessions
  const [domain, setDomain] = useState('Backend');
  const [role, setRole] = useState('Software Engineer');

  // Invite states (if inviteToken is provided)
  const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
  const [inviteDetails, setInviteDetails] = useState<any | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  // Hardware states
  const [cameraActive, setCameraActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [micAllowed, setMicAllowed] = useState(false);
  const [soundTested, setSoundTested] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  // Hardware devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // 1. Fetch Guest Invitation Details if inviteToken exists
  useEffect(() => {
    let isCurrent = true;
    if (!inviteToken) return;

    async function loadInvite() {
      try {
        setLoadingInvite(true);
        setInviteError(null);
        const data = await getGuestInviteDetails(inviteToken!);
        if (!isCurrent) return;
        setInviteDetails(data);
      } catch (err: any) {
        if (!isCurrent) return;
        setInviteError(err.message || 'Invitation link not found or has expired.');
      } finally {
        if (isCurrent) setLoadingInvite(false);
      }
    }

    loadInvite();
    return () => {
      isCurrent = false;
    };
  }, [inviteToken]);

  // 2. Hardware Media Stream Initialization
  const startMedia = useCallback(async (audioId?: string, videoId?: string) => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: videoId
          ? { deviceId: { exact: videoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: audioId
          ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setCameraAllowed(true);
      setMicAllowed(true);
      setCameraActive(true);
      setMicActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      if (navigator.mediaDevices.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devs.filter((d) => d.kind === 'audioinput'));
        setVideoDevices(devs.filter((d) => d.kind === 'videoinput'));
      }
    } catch (err) {
      console.warn('Hardware media stream error:', err);
      setCameraAllowed(false);
      setMicAllowed(false);
      setCameraActive(false);
      setMicActive(false);
    }
  }, []);

  useEffect(() => {
    startMedia();
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startMedia]);

  // Toggle Camera
  const toggleCamera = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraActive(videoTrack.enabled);
      }
    }
  };

  // Toggle Mic
  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicActive(audioTrack.enabled);
      }
    }
  };

  // Play Speaker Audio Check Chime (C5 -> E5 -> G5)
  const playSoundTest = () => {
    if (isPlayingSound) return;
    setIsPlayingSound(true);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const freqs = [523.25, 659.25, 783.99]; // Harmonic C-Major arpeggio
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
          gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + idx * 0.12 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.38);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
        });
      }
      setSoundTested(true);
    } catch (err) {
      console.warn('Sound test chime failed:', err);
      setSoundTested(true);
    }
    setTimeout(() => setIsPlayingSound(false), 850);
  };

  // Strict Hardware Gate
  const isCameraReady = cameraAllowed && cameraActive;
  const isMicReady = micAllowed && micActive;
  const isSoundReady = soundTested;
  const isAllVerified = isCameraReady && isMicReady && isSoundReady;

  // Handle Join Interview
  const handleJoin = async () => {
    if (!isAllVerified) return;
    setIsJoining(true);

    // Stop local preview media before entering workspace
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (inviteToken) {
      try {
        const joinData = await joinGuestInterview(inviteToken);
        sessionStorage.setItem('guest_interview_token', joinData.token);
        sessionStorage.setItem('guest_interview_url', joinData.url);
        sessionStorage.setItem('guest_session_id', joinData.session_id);
        sessionStorage.setItem('guest_invite_token', inviteToken);
        sessionStorage.setItem('guest_interview_data', JSON.stringify(joinData));

        const track = (joinData.interview_type || 'dsa').toLowerCase();
        if (track.includes('system') || track.includes('design')) {
          onNavigate('system-design-interview', {
            sessionId: joinData.session_id,
            templateId: 'system_design',
          });
        } else if (track.includes('behavioral') || track.includes('pm') || track.includes('star')) {
          onNavigate('general-interview', {
            sessionId: joinData.session_id,
            templateId: track,
            role: joinData.candidate_name,
          });
        } else {
          onNavigate('dsa-interview', {
            sessionId: joinData.session_id,
            templateId: 'dsa',
          });
        }
      } catch (err: any) {
        alert(`Could not start interview: ${err.message || 'Please check your connection and try again.'}`);
        setIsJoining(false);
      }
    } else {
      const params = { templateId, templateName, domain, role };
      if (targetPage) {
        onNavigate(targetPage, params);
      } else {
        onNavigate('general-interview', params);
      }
    }
  };

  // Determine Display Name & Title
  const userName = inviteToken
    ? inviteDetails?.candidate_name || 'Candidate'
    : user?.full_name?.split(' ')[0] || user?.username || 'Candidate';

  const formatTrackTitle = (raw: string) => {
    const t = (raw || '').toLowerCase();
    if (t.includes('dsa') || t.includes('coding')) return 'Data Structures & Algorithms';
    if (t.includes('system') || t.includes('design')) return 'System Design & Architecture';
    if (t.includes('behavioral') || t.includes('star')) return 'Behavioral & Leadership';
    if (t.includes('pm') || t.includes('product')) return 'Product Management Strategy';
    if (t.includes('aiml') || t.includes('ai') || t.includes('ml')) return 'AI & Machine Learning';
    return raw || 'Technical Interview';
  };

  const displayTitle = inviteToken
    ? formatTrackTitle(inviteDetails?.interview_type)
    : templateName || 'Interview';

  // 1. Loading State for Invite
  if (loadingInvite) {
    return (
      <div className="prejoin-page flex items-center justify-center p-6 text-white min-h-screen">
        <div className="prejoin-glow" />
        <div className="text-center space-y-3 z-10">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-sm font-semibold text-slate-300">Validating your invitation...</h2>
        </div>
      </div>
    );
  }

  // 2. Expired / Invalid State for Invite
  if (inviteToken && (inviteError || !inviteDetails || !inviteDetails.is_valid || inviteDetails.is_expired || inviteDetails.is_completed)) {
    const isCompleted = inviteDetails?.is_completed || inviteDetails?.stage === 'completed';
    return (
      <div className="prejoin-page flex items-center justify-center p-6 text-white min-h-screen">
        <div className="prejoin-glow" />
        <div className="prejoin-container max-w-md text-center z-10 p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
            {isCompleted ? <CheckCircle size={28} weight="fill" color="#34d399" /> : <Warning size={28} weight="fill" />}
          </div>
          <h2 className="text-lg font-bold text-white">
            {isCompleted ? 'Interview Session Completed' : 'Invitation Inactive or Expired'}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isCompleted
              ? 'You have already concluded this interview session. Your detailed evaluation analysis and scorecard have been sent to your email.'
              : inviteError || 'This interview invitation link has expired or been cancelled.'}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <a
              href="/"
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl transition text-center"
            >
              Return to ThinkAloudAI
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="prejoin-page">
      <div className="prejoin-glow" />
      
      <PageHeader 
        title="Interview Check-in"
        onBack={() => {
          if (inviteToken) {
            window.location.href = '/';
          } else {
            onNavigate('dashboard');
          }
        }} 
        backLabel={inviteToken ? "Home" : "Back to Dashboard"}
      />

      <main className="prejoin-main">
        <div className="prejoin-container">
          
          {/* =========================================
              LEFT COLUMN: GUIDELINES & TIPS
             ========================================= */}
          <div className="prejoin-left">
            <div className="prejoin-title">
              <h1>Interview Check-in</h1>
              <p>Quick pre-flight setup before joining your session.</p>
            </div>

            {/* Concise Guidelines List */}
            <div className="prejoin-guidelines">
              <div className="guideline-item">
                <CheckCircle size={20} weight="fill" color="#e2e8f0" />
                <div>
                  <h4>1. Quiet Environment</h4>
                  <p>Choose a quiet space with minimal background noise.</p>
                </div>
              </div>

              <div className="guideline-item">
                <CheckCircle size={20} weight="fill" color="#cbd5e1" />
                <div>
                  <h4>2. Camera &amp; Mic Active</h4>
                  <p>Verify and keep your audio and video enabled.</p>
                </div>
              </div>

              <div className="guideline-item">
                <CheckCircle size={20} weight="fill" color="#94a3b8" />
                <div>
                  <h4>3. Think Aloud</h4>
                  <p>Voice your thought process and trade-offs as you solve.</p>
                </div>
              </div>

              <div className="guideline-item">
                <CheckCircle size={20} weight="fill" color="#e2e8f0" />
                <div>
                  <h4>4. Dynamic Voice Interaction</h4>
                  <p>Aarav will guide you and reveal the editor dynamically.</p>
                </div>
              </div>
            </div>

            {/* Domain & Role selection for regular users */}
            {!inviteToken && (
              <div className="prejoin-prefs">
                <h4>Interview Focus Parameters</h4>
                <div className="prejoin-prefs-grid">
                  <div className="pref-group">
                    <label>Domain</label>
                    <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                      <option value="Backend">Backend Engineering</option>
                      <option value="Frontend">Frontend Engineering</option>
                      <option value="Fullstack">Fullstack Architecture</option>
                      <option value="System Design">Distributed Systems</option>
                      <option value="AI/ML">AI &amp; Machine Learning</option>
                    </select>
                  </div>
                  <div className="pref-group">
                    <label>Seniority Level</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="Software Engineer">Software Engineer (L4)</option>
                      <option value="Senior Software Engineer">Senior Software Engineer (L5)</option>
                      <option value="Staff Software Engineer">Staff Software Engineer (L6)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* =========================================
              RIGHT COLUMN: DEVICE SETUP & STRICT GATE
             ========================================= */}
          <div className="prejoin-right">
            
            {/* User Tag */}
            <div className="prejoin-user-tag">
              <UserCircle size={18} weight="fill" />
              <span>Joining as: <strong>{userName}</strong></span>
              {inviteToken && (
                <span style={{ marginLeft: 6, color: '#34d399', fontSize: '0.68rem', fontWeight: 600 }}>
                  • Candidate Invite
                </span>
              )}
            </div>
            
            {/* Video Viewport Container */}
            <div className="lk-video-container" style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                  display: cameraActive && cameraAllowed ? 'block' : 'none',
                }}
              />

              {(!cameraActive || !cameraAllowed) && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#94a3b8',
                  background: '#090a0f',
                  fontSize: '0.78rem',
                }}>
                  <VideoCameraSlash size={32} weight="fill" color="#f87171" />
                  <span>Camera preview is inactive</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Click &quot;Camera&quot; below to enable
                  </span>
                </div>
              )}
            </div>

            {/* Titanium Silver Button Group Controls */}
            <div className="lk-button-group-container" style={{ marginTop: '1rem' }}>
              {/* Mic Toggle Button */}
              <div className="lk-button-group">
                <button
                  type="button"
                  className="lk-button"
                  data-lk-source="microphone"
                  data-lk-enabled={micActive && micAllowed ? 'true' : 'false'}
                  onClick={toggleMic}
                  title={micActive ? 'Mute Microphone' : 'Unmute Microphone'}
                >
                  {micActive && micAllowed ? (
                    <Microphone size={14} weight="fill" />
                  ) : (
                    <MicrophoneSlash size={14} weight="fill" />
                  )}
                  <span>{micActive && micAllowed ? 'Microphone' : 'Muted'}</span>
                </button>
              </div>

              {/* Camera Toggle Button */}
              <div className="lk-button-group">
                <button
                  type="button"
                  className="lk-button"
                  data-lk-source="camera"
                  data-lk-enabled={cameraActive && cameraAllowed ? 'true' : 'false'}
                  onClick={toggleCamera}
                  title={cameraActive ? 'Disable Camera' : 'Enable Camera'}
                >
                  {cameraActive && cameraAllowed ? (
                    <VideoCamera size={14} weight="fill" />
                  ) : (
                    <VideoCameraSlash size={14} weight="fill" />
                  )}
                  <span>{cameraActive && cameraAllowed ? 'Camera' : 'Off'}</span>
                </button>
              </div>
            </div>

            {/* Optional Device Switcher Selectors */}
            {(audioDevices.length > 1 || videoDevices.length > 1) && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                {audioDevices.length > 1 && (
                  <select
                    value={selectedAudioId}
                    onChange={(e) => {
                      setSelectedAudioId(e.target.value);
                      startMedia(e.target.value, selectedVideoId);
                    }}
                    style={{
                      flex: 1,
                      background: 'rgba(18, 20, 28, 0.9)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: '0.72rem',
                      outline: 'none',
                    }}
                  >
                    {audioDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                {videoDevices.length > 1 && (
                  <select
                    value={selectedVideoId}
                    onChange={(e) => {
                      setSelectedVideoId(e.target.value);
                      startMedia(selectedAudioId, e.target.value);
                    }}
                    style={{
                      flex: 1,
                      background: 'rgba(18, 20, 28, 0.9)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: '0.72rem',
                      outline: 'none',
                    }}
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Speaker Sound Output Test Check */}
            <div className="prejoin-sound-test-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SpeakerHigh size={16} weight="fill" color={soundTested ? '#34d399' : '#cbd5e1'} />
                <div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#f8fafc' }}>
                    Speaker Check
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Confirm audio output
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`prejoin-sound-btn ${soundTested ? 'verified' : ''}`}
                onClick={playSoundTest}
                disabled={isPlayingSound}
              >
                {soundTested ? (
                  <CheckCircle size={14} weight="fill" />
                ) : (
                  <SpeakerHigh size={14} weight="fill" />
                )}
                <span>{isPlayingSound ? 'Playing...' : soundTested ? 'Verified ✓' : 'Test Sound'}</span>
              </button>
            </div>

            {/* Mandatory Hardware Gate Status Checklist */}
            <div className="prejoin-checklist">
              <div className={`prejoin-check-pill ${isCameraReady ? 'ready' : 'required'}`}>
                {isCameraReady ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} weight="fill" />}
                <span>Camera: {isCameraReady ? 'Ready' : 'Required'}</span>
              </div>

              <div className={`prejoin-check-pill ${isMicReady ? 'ready' : 'required'}`}>
                {isMicReady ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} weight="fill" />}
                <span>Mic: {isMicReady ? 'Ready' : 'Required'}</span>
              </div>

              <div className={`prejoin-check-pill ${isSoundReady ? 'ready' : 'pending'}`}>
                {isSoundReady ? <CheckCircle size={14} weight="fill" /> : <SpeakerHigh size={14} weight="fill" />}
                <span>Sound: {isSoundReady ? 'Verified' : 'Required'}</span>
              </div>
            </div>

            {/* Gate Lock Warning Notice if not all ready */}
            {!isAllVerified && (
              <div className="prejoin-lock-notice">
                <Warning size={15} weight="fill" style={{ flexShrink: 0 }} />
                <span>Camera, mic, and sound test are required before joining.</span>
              </div>
            )}

            {/* Join Interview Button (Strictly Gated) */}
            <button
              type="button"
              className="lk-join-button"
              disabled={!isAllVerified || isJoining}
              onClick={handleJoin}
              style={{ marginTop: 'auto' }}
            >
              {isJoining ? (
                <span>Connecting...</span>
              ) : !isAllVerified ? (
                <span>Camera, Mic & Sound Required</span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Join Interview</span>
                  <ArrowRight size={16} weight="bold" />
                </span>
              )}
            </button>

          </div>

        </div>
      </main>
    </div>
  );
};

export default PreJoinInterview;
