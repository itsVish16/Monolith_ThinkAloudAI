// src/hooks/useChatSession.ts
//
// Wires together the chatReducer + chatStream + persistence (session messages)
// + roadmap side-effects. This is the single hook ChatScreen consumes, so
// ChatScreen becomes a thin presentational orchestrator.

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  chatReducer,
  initialChatState,
  type ChatState,
  type ChatAction,
  type Message,
  type ToolExecution,
} from "../state/chatReducer";
import { startChatStream, type StreamEvent } from "../state/chatStream";
import { getSessionMessages, type APIMessage } from "../services/chatService";
import { getRoadmaps, getRoadmapById, type Roadmap } from "../services/roadmapService";
import type { MessageRole } from "../components/chat/MessageBubble";

export interface UseChatSessionOptions {
  /** Session id from parent (sidebar). When it changes, history is loaded. */
  sessionId?: string | null;
  /** Called when the backend emits a rename_chat event. */
  onRenameChat?: (sessionId: string, newTitle: string) => void;
}

export interface UseChatSessionApi extends ChatState {
  /** Current session id (may differ from prop while a new chat is pending). */
  currentSessionId: string;
  /** Send a user message and stream the assistant reply. */
  send: (text: string, images?: string[]) => Promise<void>;
  /** Abort the active stream, freezing the partial assistant message. */
  stop: () => void;
  /** Reset to an empty new chat (new session id). */
  newSession: () => void;
  /** Load a specific session's history. */
  selectSession: (sid: string) => Promise<void>;
}

/** Convert persisted API messages to UI Message[]. */
async function hydrateHistory(msgs: APIMessage[]): Promise<Message[]> {
  let allRoadmaps: Roadmap[] = [];
  // Only fetch roadmaps if any message references one (avoid unnecessary calls).
  const hasRoadmap = msgs.some((m) => (m.role as string) === "roadmap");
  if (hasRoadmap) {
    try {
      allRoadmaps = await getRoadmaps();
    } catch {
      allRoadmaps = [];
    }
  }

  const seenRoadmapIds = new Set<number>();
  const hydrated: Message[] = [];

  for (const m of msgs) {
    let content = m.content;
    let roadmapData: Roadmap | undefined;

    if ((m.role as string) === "roadmap") {
      const rId = parseInt(content.trim(), 10);
      if (!isNaN(rId)) {
        if (seenRoadmapIds.has(rId)) {
          // If we already showed this exact roadmap in this session, skip rendering it again to avoid UI spam
          continue;
        }
        roadmapData = allRoadmaps.find((r) => r.id === rId);
        if (!roadmapData) {
          try {
            roadmapData = await getRoadmapById(rId);
          } catch {
            roadmapData = undefined;
          }
        }
        if (roadmapData) seenRoadmapIds.add(rId);
      }
      
      if (!roadmapData) {
        content = "*(Roadmap data not found or deleted)*";
        hydrated.push({ id: m.id.toString(), role: "assistant" as MessageRole, content });
        continue;
      }
      content = "";
    } else {
      // Tolerate legacy JSON roadmap payloads.
      try {
        if (content.startsWith("{") && content.includes('"title"')) {
          const parsed = JSON.parse(content);
          if (parsed.title && parsed.nodes) {
            roadmapData = parsed;
            content = "";
          }
        }
      } catch {
        /* not json roadmap */
      }
    }

    hydrated.push({
      id: m.id.toString(),
      role: m.role as MessageRole | "roadmap",
      content,
      roadmapData,
    } as Message);
  }

  return hydrated;
}

export function useChatSession(opts: UseChatSessionOptions): UseChatSessionApi {
  const { sessionId, onRenameChat } = opts;
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  // Tracks the assistant message id currently receiving stream events, in a ref
  // so stop() always sees the latest value without a stale-closure dependency.
  const activeAssistantIdRef = useRef<string | null>(null);
  const onRenameRef = useRef(onRenameChat);
  onRenameRef.current = onRenameChat;
  
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const selectSession = useCallback(async (sid: string) => {
    currentSessionIdRef.current = sid;
    dispatch({ type: "SET_STATUS", status: "idle" });
    try {
      const msgs = await getSessionMessages(sid);
      const hydrated = await hydrateHistory(msgs);
      dispatch({ type: "LOAD_HISTORY", messages: hydrated });
    } catch (e) {
      console.error("Failed to load session messages", e);
      dispatch({ type: "LOAD_HISTORY", messages: [] });
    }
  }, []);

  const newSession = useCallback(() => {
    currentSessionIdRef.current = crypto.randomUUID();
    dispatch({ type: "RESET", messages: [] });
  }, []);

  // Respond to parent session-id changes.
  useEffect(() => {
    if (!sessionId) {
      newSession();
      return;
    }
    if (sessionId === currentSessionIdRef.current) return;
    selectSession(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const activeId = activeAssistantIdRef.current;
    if (activeId) {
      dispatch({ type: "STOP", id: activeId });
    }
  }, []);

  const send = useCallback(async (text: string, images?: string[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (statusRef.current === "streaming") return; // no concurrent sends

    const targetSessionId = currentSessionIdRef.current || crypto.randomUUID();
    currentSessionIdRef.current = targetSessionId;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    dispatch({ type: "USER_SEND", message: userMessage });

    const assistantId = `a-${Date.now() + 1}`;
    activeAssistantIdRef.current = assistantId;
    dispatch({ type: "ASSISTANT_START", id: assistantId });

    const controller = new AbortController();
    abortRef.current = controller;

    const handleEvent = (event: StreamEvent) => {
      switch (event.type) {
        case "thinking_start":
          dispatch({ type: "THINKING_START", id: assistantId });
          break;
        case "thinking_delta":
          dispatch({ type: "THINKING_DELTA", id: assistantId, text: event.text });
          break;
        case "thinking_end":
          dispatch({ type: "THINKING_END", id: assistantId });
          break;
        case "tool_call": {
          const tool: ToolExecution = {
            id: event.toolId,
            title: event.title,
            description: event.description,
            icon: event.icon,
            status: "running",
            startTime: event.startTime ?? Date.now(),
            args: event.args,
          };
          dispatch({ type: "TOOL_CALL", id: assistantId, tool });
          break;
        }
        case "tool_result": {
          dispatch({
            type: "TOOL_RESULT",
            id: assistantId,
            toolId: event.toolId,
            patch: {
              status: event.status,
              endTime: event.endTime,
              duration: event.duration,
              outputSummary: event.outputSummary,
              output: event.output,
            },
          });
          break;
        }
        case "token":
          dispatch({ type: "TOKEN", id: assistantId, text: event.text });
          break;
        case "error":
          dispatch({ type: "ERROR", id: assistantId, message: event.message });
          break;
        case "rename_chat":
          onRenameRef.current?.(targetSessionId, event.title);
          break;
        case "roadmap":
          getRoadmapById(event.id)
            .then(roadmap => {
              if (roadmap) {
                dispatch({ type: "ROADMAP_APPEND", roadmap });
              }
            })
            .catch(() => {
              getRoadmaps().then(roadmaps => {
                const roadmap = roadmaps.find(r => r.id.toString() === event.id);
                if (roadmap) {
                  dispatch({ type: "ROADMAP_APPEND", roadmap });
                }
              }).catch(e => console.error("Failed to fetch roadmap by ID", e));
            });
          break;
        case "done":
          // Only finalize if this is still the active stream.
          if (activeAssistantIdRef.current === assistantId) {
            activeAssistantIdRef.current = null;
            dispatch({ type: "ASSISTANT_DONE", id: assistantId });
          }
          break;
        case "noop":
          break;
      }
    };

    await startChatStream(
      { sessionId: targetSessionId, message: trimmed, images },
      {
        onEvent: handleEvent,
        onError: (message) => dispatch({ type: "ERROR", id: assistantId, message }),
        signal: controller.signal,
      }
    );

    abortRef.current = null;
  }, []);

  return {
    ...state,
    currentSessionId: currentSessionIdRef.current || "",
    send,
    stop,
    newSession,
    selectSession,
  };
}
