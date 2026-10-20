import React, { useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { useLocalParticipant, VideoTrack } from "@livekit/components-react";
import { Track } from 'livekit-client';
import '../styles/CameraFeed.css';

interface CameraFeedProps {
  isActive: boolean; // Managed by parent for UI state
  isMuted: boolean;  // Managed by parent for UI state
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ isActive, isMuted }) => {
  // Use LiveKit's local participant hook to get the WebRTC track
  const { localParticipant, cameraTrack } = useLocalParticipant();

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(isActive);
    }
  }, [isActive, localParticipant]);

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted);
    }
  }, [isMuted, localParticipant]);

  // Check if we successfully have a camera track published to LiveKit
  const hasVideo = !!cameraTrack;

  const trackRef = cameraTrack ? {
    participant: localParticipant,
    publication: cameraTrack,
    source: Track.Source.Camera
  } : null;

  return (
    <div className="camera-feed-box">
      {trackRef ? (
        <VideoTrack
          trackRef={trackRef as any}
          className="camera-video-element"
        />
      ) : (
        <div className="camera-placeholder">
          <div className="camera-off-avatar">
            <span>U</span>
          </div>
          <p className="placeholder-text">
            {!hasVideo ? 'Video Off / Unavailable' : 'Connecting...'}
          </p>
        </div>
      )}

      {/* Zoom-like overlay controls */}
      <div className="camera-overlay-info">
        <span className="user-name">You</span>
        <div className="status-icons">
          {isMuted ? (
            <MicOff size={12} className="status-icon mute" />
          ) : (
            <Mic size={12} className="status-icon unmute" />
          )}
          {!hasVideo ? (
            <VideoOff size={12} className="status-icon video-off" />
          ) : (
            <Video size={12} className="status-icon video-on" />
          )}
        </div>
      </div>
    </div>
  );
};
export default CameraFeed;
