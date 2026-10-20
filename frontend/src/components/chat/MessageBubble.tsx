import React, { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  RotateCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";

import "../../styles/Chat.css";
import { ChatToolCall } from "../ChatToolCall";

import type { ToolExecution } from "../../state/chatReducer";

export type MessageRole = "user" | "assistant";

export interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  thinkingContent?: string;
  isThinking?: boolean;
  thinkingStartedAt?: number;
  thinkingEndedAt?: boolean;
  toolInvocations?: ToolExecution[];
  isStreaming?: boolean;
  stopped?: boolean;
  error?: string;
  /** Called when the user clicks Retry/Regenerate on an assistant message. */
  onRetry?: () => void;
}

function MessageBubbleImpl({
  role,
  content,
  thinkingContent,
  isThinking,
  toolInvocations,
  isStreaming,
  stopped,
  error,
  onRetry,
}: MessageBubbleProps) {
  const isUser = role === "user";

  // Legacy fallback: extract <MeshThink> blocks from old persisted content.
  let finalAnswerContent = content;
  let isLegacyThinkingActive = false;

  if (!isUser && !thinkingContent && !isThinking && content.toLowerCase().includes("<meshthink>")) {
    const thinkMatch = content.match(/<meshthink>([\s\S]*?)(?:<\/meshthink>|$)/i);
    if (thinkMatch) {
      isLegacyThinkingActive = !content.toLowerCase().includes("</meshthink>");
      finalAnswerContent = content.replace(/<meshthink>[\s\S]*?(?:<\/meshthink>|$)/i, "").trim();
    }
  }

  const actualIsThinking = isThinking !== undefined ? isThinking : isLegacyThinkingActive;

  const hasRunningTools =
    !isUser &&
    !!toolInvocations?.some((tool) => tool.status === "running" || tool.status === "pending");
  const hasAnswer = !!finalAnswerContent;
  const showThinking = !isUser && !hasAnswer && (isStreaming || actualIsThinking || hasRunningTools);

  return (
    <div className={`chat-message-row ${isUser ? "is-user" : "is-assistant"}`}>
      <div className={`chat-message-content ${isUser ? "is-user" : "is-assistant"}`}>
        {/* Avatar */}
        {!isUser && (
          <div className="chat-avatar is-assistant" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
            <span style={{ position: 'absolute', fontSize: '12px', fontWeight: 700, color: 'currentColor' }}>T</span>
          </div>
        )}

        {/* Content Bubble */}
        <div className={`chat-bubble ${isUser ? "is-user" : "is-assistant"}`}>
          <div className={`chat-prose ${isStreaming && !isUser ? "is-streaming" : ""}`}>
            {showThinking && (
              <div className="assistant-thinking-inline" aria-label="Assistant is thinking">
                <Loader2 size={14} className="assistant-thinking-spinner" />
                <span>Thinking</span>
              </div>
            )}

            {/* Answer */}
            {hasAnswer && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {finalAnswerContent}
              </ReactMarkdown>
            )}

            {/* Tool Invocations */}
            {!isUser && toolInvocations && toolInvocations.length > 0 && (
              <div className="chat-tool-invocations">
                {toolInvocations.map((tool) => {
                  let mappedStatus: 'running' | 'complete' | 'error' = 'complete';
                  if (tool.status === 'running' || tool.status === 'pending') mappedStatus = 'running';
                  if (tool.status === 'failed') mappedStatus = 'error';
                  if (tool.status === 'completed') mappedStatus = 'complete';
                  
                  const mappedTool = {
                    id: tool.id,
                    toolName: tool.title || 'Tool',
                    status: mappedStatus,
                    output: typeof tool.output === 'string' ? tool.output : tool.outputSummary,
                  };

                  return <ChatToolCall key={tool.id} toolCall={mappedTool} isTyping={!!isStreaming} />;
                })}
              </div>
            )}

            {/* Error chip */}
            {error && (
              <div className="chat-error-chip">
                <AlertTriangle size={13} />
                <span>{error}</span>
              </div>
            )}

            {/* Stopped notice */}
            {stopped && !error && (
              <div className="chat-stopped-notice">Generation stopped</div>
            )}

            {/* Action row (assistant, finished) */}
            {!isUser && !isStreaming && (hasAnswer || error) && (
              <div className="chat-action-row">
                {hasAnswer && <CopyButton text={finalAnswerContent} />}
                {onRetry && (
                  <button
                    type="button"
                    className="chat-action-btn"
                    onClick={onRetry}
                    title="Regenerate response"
                  >
                    <RotateCw size={13} />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stable markdown component map so memoized bubbles don't reparse unnecessarily.
const markdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return !inline && match ? (
      <div className="chat-code-block-wrapper">
        <div className="chat-code-block-header">
          <span>{match[1]}</span>
          <CopyButton text={String(children).replace(/\n$/, "")} />
        </div>
        <SyntaxHighlighter
          {...props}
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          className="!m-0 !bg-transparent !p-4 text-[13px]"
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code {...props} className="chat-inline-code">
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="chat-table-wrapper">
        <table className="chat-table">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th>{children}</th>;
  },
  td({ children }) {
    return <td>{children}</td>;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export const MessageBubble = memo(MessageBubbleImpl);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="chat-action-btn" title="Copy">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
