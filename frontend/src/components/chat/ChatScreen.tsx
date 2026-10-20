import { useState, useRef, useEffect } from "react";
import { Brain, CircleCheck, MessageSquareText, Wrench } from "lucide-react";
import { MessageBubble, type MessageRole } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { RoadmapViewer } from "./RoadmapViewer";
import { useChatSession } from "../../hooks/useChatSession";

import "../../styles/Chat.css";

interface ChatScreenProps {
  sessionId?: string | null;
  onNavigate?: (page: string, params?: any) => void;
  onRenameChat?: (sessionId: string, newTitle: string) => void;
}

export function ChatScreen({ sessionId, onNavigate, onRenameChat }: ChatScreenProps) {
  const [input, setInput] = useState("");

  const { messages, status, send, stop } = useChatSession({
    sessionId,
    onRenameChat,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === "streaming";
  const activeAssistant = [...messages].reverse().find(
    (message) => message.role === "assistant" && message.isStreaming
  );
  const runningTool = activeAssistant?.toolInvocations?.find(
    (tool) => tool.status === "running" || tool.status === "pending"
  );
  const chatStatus = getChatStatus({
    isStreaming,
    isThinking: activeAssistant?.isThinking,
    hasAnswer: !!activeAssistant?.content,
    runningToolTitle: runningTool?.title,
  });
  const StatusIcon = chatStatus.icon;

  // Auto-scroll to bottom when messages change — but only if the user is
  // already near the bottom, so we don't fight manual scroll-back.
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    void send(text);
  };

  const handleRetry = () => {
    // Regenerate by resending the last user message.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void send(lastUser.content);
  };

  return (
    <div className="chat-screen-container">
      <div className="chat-main-content">


        {/* Messages area */}
        <div ref={scrollRef} className="chat-messages-area">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <h2 className="chat-empty-title">How can I help you today?</h2>
              <p className="chat-empty-subtitle">
                Your personalized study roadmap generator & AI interviewer.
              </p>
            </div>
          ) : (
            <div className="chat-messages-list">
              {messages.map((msg) => (
                <div key={msg.id} className="chat-message-wrapper">
                  {msg.role === "roadmap" && msg.roadmapData ? (
                    <RoadmapViewer roadmap={msg.roadmapData} onNavigate={onNavigate} />
                  ) : (
                    <MessageBubble
                      role={msg.role as MessageRole}
                      content={msg.content}
                      thinkingContent={msg.thinkingContent}
                      isThinking={msg.isThinking}
                      thinkingStartedAt={msg.thinkingStartedAt}
                      thinkingEndedAt={msg.thinkingEndedAt}
                      toolInvocations={msg.toolInvocations}
                      isStreaming={msg.isStreaming}
                      stopped={msg.stopped}
                      error={msg.error}
                      onRetry={handleRetry}
                    />
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="chat-input-wrapper">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            isLoading={isStreaming}
            onStop={stop}
          />
        </div>
      </div>
    </div>
  );
}

interface ChatStatusInput {
  isStreaming: boolean;
  isThinking?: boolean;
  hasAnswer?: boolean;
  runningToolTitle?: string;
}

function getChatStatus({ isStreaming, isThinking, hasAnswer, runningToolTitle }: ChatStatusInput) {
  if (runningToolTitle) {
    return {
      label: "Working",
      detail: `Working on ${runningToolTitle}`,
      tone: "working",
      icon: Wrench,
      isBusy: true,
    };
  }

  if (isThinking) {
    return {
      label: "Thinking",
      detail: "Reasoning through the next step",
      tone: "thinking",
      icon: Brain,
      isBusy: true,
    };
  }

  if (isStreaming && hasAnswer) {
    return {
      label: "Writing",
      detail: "Streaming the response",
      tone: "working",
      icon: MessageSquareText,
      isBusy: true,
    };
  }

  if (isStreaming) {
    return {
      label: "Thinking",
      detail: "Thinking through the response",
      tone: "thinking",
      icon: Brain,
      isBusy: true,
    };
  }

  return {
    label: "Ready",
    detail: "Ask a coding, system design, or interview question",
    tone: "ready",
    icon: CircleCheck,
    isBusy: false,
  };
}
