import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import '../styles/ChatToolCall.css';

export interface ToolCallState {
  id: string;
  toolName: string;
  status: 'running' | 'complete' | 'error';
  output?: string;
}

interface ChatToolCallProps {
  toolCall: ToolCallState;
  isTyping: boolean; // True if LLM is streaming text after tool
}

export const ChatToolCall: React.FC<ChatToolCallProps> = ({ toolCall, isTyping }) => {
  const isRunning = toolCall.status === 'running';
  const isError = toolCall.status === 'error';
  const [isOpen, setIsOpen] = useState(isRunning);

  // Auto-collapse when tool finishes AND LLM starts typing
  useEffect(() => {
    if (isRunning) {
      setIsOpen(true);
    } else if (isTyping) {
      setIsOpen(false);
    }
  }, [isRunning, isTyping]);

  const label = isRunning ? "Using tool" : isError ? "Tool failed" : "Used tool";
  const displayName = toolCall.toolName.replace(/_/g, ' ');

  return (
    <div className={`tool-fallback-root ${isRunning ? 'running' : isError ? 'error' : 'completed'}`}>
      <div 
        className="tool-fallback-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="tool-fallback-icon-wrapper">
          {isRunning ? (
            <Loader2 size={14} className="spin-anim tool-status-icon-running" />
          ) : isError ? (
            <span className="tool-status-icon-error">✕</span>
          ) : (
            <CheckCircle2 size={14} className="tool-status-icon-completed" />
          )}
        </div>
        
        <div className={`tool-fallback-label ${!isRunning ? 'completed' : ''}`}>
          <span className="block truncate">
            {label}: <span className="tool-name-highlight">{displayName}</span>
          </span>
          {isRunning && (
            <span className="shimmer-text block truncate" aria-hidden="true">
              {label}: <span className="tool-name-highlight">{displayName}</span>
            </span>
          )}
        </div>

        <div className="tool-fallback-icon-wrapper" style={{ marginLeft: 'auto' }}>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {isOpen && (
        <div className="tool-fallback-content">
          <div className="tool-console-header">
            <Terminal size={12} className="console-icon" />
            <span className="console-title">Console Output</span>
            <span className={`status-badge ${isRunning ? 'running' : 'completed'}`}>
              {isRunning ? 'active' : 'success'}
            </span>
          </div>
          <pre className="tool-console-output">
            {isRunning ? (
              <span className="running-indicator-text">Executing remote call...</span>
            ) : (
              toolCall.output || "Execution completed with no return data."
            )}
          </pre>
        </div>
      )}
    </div>
  );
};
