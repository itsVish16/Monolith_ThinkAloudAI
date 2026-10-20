// src/state/chatReducer.ts
//
// Pure reducer + types for the ChatGPT-class chat UI.
// Single source of truth: `messages[]`. Every streaming event becomes a
// ChatAction that updates the ACTIVE assistant message by id — never appends
// a new message mid-stream (the classic "each token = new bubble" bug).

import type { MessageRole } from "../components/chat/MessageBubble";
import type { Roadmap } from "../services/roadmapService";

export type ToolStatus = "pending" | "running" | "completed" | "failed";

export interface ToolExecution {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: ToolStatus;
  startTime?: number;
  endTime?: number;
  duration?: number;
  outputSummary?: string;
  /** Raw arguments sent to the tool (for expandable inspection). */
  args?: unknown;
  /** Raw output returned by the tool (for expandable inspection). */
  output?: unknown;
  /** Set true when the tool produced a roadmap that gets rendered separately. */
  producedRoadmap?: boolean;
}

export interface Message {
  id: string;
  role: MessageRole | "roadmap";
  content: string;
  roadmapData?: Roadmap;
  thinkingContent?: string;
  isThinking?: boolean;
  /** Start timestamp of reasoning, used to compute "Thought for Xs". */
  thinkingStartedAt?: number;
  thinkingEndedAt?: boolean;
  toolInvocations?: ToolExecution[];
  /** True while this assistant message is still being streamed. */
  isStreaming?: boolean;
  /** Set when generation was stopped by the user. */
  stopped?: boolean;
  /** Set when an error occurred during generation. */
  error?: string;
}

export type ChatStatus = "idle" | "streaming" | "error";

export interface ChatState {
  messages: Message[];
  status: ChatStatus;
  /** id of the assistant message currently receiving stream events. */
  activeAssistantId: string | null;
}

export const initialChatState: ChatState = {
  messages: [],
  status: "idle",
  activeAssistantId: null,
};

export type ChatAction =
  | { type: "RESET"; messages?: Message[] }
  | { type: "LOAD_HISTORY"; messages: Message[] }
  | { type: "USER_SEND"; message: Message }
  | { type: "ASSISTANT_START"; id: string }
  | { type: "THINKING_START"; id: string }
  | { type: "THINKING_DELTA"; id: string; text: string }
  | { type: "THINKING_END"; id: string }
  | { type: "TOOL_CALL"; id: string; tool: ToolExecution }
  | { type: "TOOL_RESULT"; id: string; toolId: string; patch: Partial<ToolExecution> }
  | { type: "ROADMAP_APPEND"; roadmap: Roadmap }
  | { type: "TOKEN"; id: string; text: string }
  | { type: "ASSISTANT_DONE"; id: string }
  | { type: "ERROR"; id: string; message: string }
  | { type: "STOP"; id: string }
  | { type: "SET_STATUS"; status: ChatStatus };

/** Immutably update one message by id. Returns same array ref if not found. */
function patchMessage(
  messages: Message[],
  id: string,
  updater: (m: Message) => Message
): Message[] {
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return messages;
  const next = messages.slice();
  next[idx] = updater(next[idx]);
  return next;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "RESET":
      return { ...initialChatState, messages: action.messages ?? [] };

    case "LOAD_HISTORY":
      return { ...state, messages: action.messages, status: "idle", activeAssistantId: null };

    case "USER_SEND":
      return { ...state, messages: [...state.messages, action.message] };

    case "ASSISTANT_START":
      return {
        ...state,
        status: "streaming",
        activeAssistantId: action.id,
        messages: [
          ...state.messages,
          { id: action.id, role: "assistant", content: "", isStreaming: true },
        ],
      };

    case "THINKING_START":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isThinking: true,
          thinkingContent: m.thinkingContent ?? "",
          thinkingStartedAt: m.thinkingStartedAt ?? Date.now(),
          thinkingEndedAt: false,
        })),
      };

    case "THINKING_DELTA":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isThinking: true,
          thinkingStartedAt: m.thinkingStartedAt ?? Date.now(),
          thinkingContent: (m.thinkingContent ?? "") + action.text,
        })),
      };

    case "THINKING_END":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isThinking: false,
          thinkingEndedAt: true,
        })),
      };

    case "TOOL_CALL":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          toolInvocations: [...(m.toolInvocations ?? []), action.tool],
        })),
      };

    case "TOOL_RESULT":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => {
          if (!m.toolInvocations) return m;
          return {
            ...m,
            toolInvocations: m.toolInvocations.map((t) =>
              t.id === action.toolId
                ? {
                    ...t,
                    ...action.patch,
                    duration:
                      action.patch.duration ??
                      (action.patch.endTime && t.startTime
                        ? action.patch.endTime - t.startTime
                        : t.duration),
                  }
                : t
            ),
          };
        }),
      };

    case "ROADMAP_APPEND": {
      // Avoid duplicate roadmap cards.
      const exists = state.messages.some(
        (m) => m.role === "roadmap" && m.roadmapData?.id === action.roadmap.id
      );
      if (exists) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `${Date.now()}-roadmap`,
            role: "roadmap",
            content: "",
            roadmapData: action.roadmap,
          },
        ],
      };
    }

    case "TOKEN":
      return {
        ...state,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          content: m.content + action.text,
        })),
      };

    case "ASSISTANT_DONE":
      return {
        ...state,
        status: "idle",
        activeAssistantId: null,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isStreaming: false,
          isThinking: false,
          thinkingEndedAt: m.thinkingEndedAt ?? !!m.thinkingContent,
        })),
      };

    case "ERROR":
      return {
        ...state,
        status: "error",
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isStreaming: false,
          isThinking: false,
          error: action.message,
        })),
      };

    case "STOP":
      return {
        ...state,
        status: "idle",
        activeAssistantId: null,
        messages: patchMessage(state.messages, action.id, (m) => ({
          ...m,
          isStreaming: false,
          isThinking: false,
          stopped: true,
          thinkingEndedAt: m.thinkingEndedAt ?? !!m.thinkingContent,
        })),
      };

    case "SET_STATUS":
      return { ...state, status: action.status };

    default:
      return state;
  }
}
