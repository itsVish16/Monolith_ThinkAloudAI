import React, { useRef, useEffect, useState } from "react";
import { API_BASE_URL } from '../../services/apiClient';
import { ArrowUp, StopCircle, Mic } from "lucide-react";
import "../../styles/Chat.css";

interface ChatInputProps {
  input: string;
  setInput: (value: string | ((prev: string) => string)) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onStop: () => void;
}

export function ChatInput({ input, setInput, onSubmit, isLoading, onStop }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter always sends (even on a blank-ish line).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (input.trim() && !isLoading) onSubmit();
      return;
    }
    // Plain Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) onSubmit();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const wsBase = API_BASE_URL
        ? API_BASE_URL.replace(/^http/, 'ws')
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
      const wsUrl = wsBase + '/chat/voice-stream';
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsRecording(true);
        const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
        const context = new AudioContextConstructor({ sampleRate: 16000 });
        audioContextRef.current = context;

        const source = context.createMediaStreamSource(stream);
        const processor = context.createScriptProcessor(4096, 1, 1);

        source.connect(processor);
        processor.connect(context.destination);

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              let s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            ws.send(pcm16.buffer);
          }
        };
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "final" && data.text) {
            setInput(prev => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + data.text);
          }
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      ws.onclose = () => stopRecording();
      ws.onerror = () => stopRecording();
    } catch (err) {
      console.error("Microphone access denied or error occurred", err);
    }
  };

  const stopRecording = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return (
    <div className="chat-input-container">
      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask ThinkAloud AI anything..."
          className="chat-textarea"
          rows={1}
        />
        <div className="chat-submit-actions">
          <button
            onClick={toggleRecording}
            className="chat-stop-btn"
            style={{ marginRight: '8px', color: isRecording ? '#FF6B6B' : '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title={isRecording ? "Stop dictation" : "Start dictation"}
          >
            {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
          </button>
          {isLoading ? (
            <button
              onClick={onStop}
              className="chat-stop-btn"
            >
              <StopCircle size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (input.trim()) onSubmit();
              }}
              disabled={!input.trim()}
              className={`chat-submit-btn ${input.trim() ? 'is-active' : 'is-disabled'}`}
            >
              <ArrowUp size={18} strokeWidth={input.trim() ? 3 : 2} />
            </button>
          )}
        </div>
      </div>
      <div className="chat-disclaimer">
        ThinkAloud AI can make mistakes. Verify important information.
      </div>
    </div>
  );
}
