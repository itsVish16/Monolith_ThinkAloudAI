import React, { useRef, useEffect, useMemo } from 'react';
import { useTranscriptions, useLocalParticipant } from "@livekit/components-react";

export const LiveTranscript: React.FC = () => {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  const containerRef = useRef<HTMLDivElement>(null);

  // Deduplicate live transcript segments by segment.id so interim tokens don't duplicate speech bubbles
  const deduplicatedTranscriptions = useMemo(() => {
    const map = new Map<string, typeof transcriptions[0]>();
    transcriptions.forEach((t, i) => {
      const segmentId = (t as any)?.segment?.id || (t as any)?.id || t.streamInfo?.id || `seg-${i}`;
      map.set(segmentId, t);
    });
    return Array.from(map.values());
  }, [transcriptions]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [deduplicatedTranscriptions]);

  if (deduplicatedTranscriptions.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: '0.9rem' }}>
        Transcript will appear here...
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
      {deduplicatedTranscriptions.map((t, i) => {
        const isLocal = t.participantInfo?.identity === localParticipant?.identity;
        const key = (t as any)?.segment?.id || (t as any)?.id || t.streamInfo?.id || i;
        return (
          <div key={key} style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: isLocal ? '#00D084' : '#FF6B00', fontWeight: 'bold' }}>
              {isLocal ? 'You' : 'AI'}
            </span>
            <span style={{ flex: 1, color: '#ccc', lineHeight: 1.4 }}>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
};
