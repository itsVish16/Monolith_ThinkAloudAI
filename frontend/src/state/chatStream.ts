// src/state/chatStream.ts
//
// SSE event pump: reads the `data: ` stream from the backend and converts each
// event into a typed callback. Supports BOTH the backend's current event names
// (thinking_start/delta/end, tool_start/end, token/text_delta, error, rename_chat)
// AND a normalized richer contract (reasoning.delta, tool.call/result, message.*).
//
// Crucially, token/text deltas are COALESCED and flushed on an animation-frame
// timer so the UI never re-renders more than ~60 times/sec even on fast streams.

import { apiClient } from "../services/apiClient";

/** Normalized events emitted to the caller. */
export type StreamEvent =
  | { type: "thinking_start" }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_end" }
  | { type: "tool_call"; toolId: string; title: string; description: string; icon: string; startTime?: number; args?: unknown }
  | { type: "tool_result"; toolId: string; toolName?: string; status: "completed" | "failed"; endTime?: number; duration?: number; outputSummary?: string; output?: unknown }
  | { type: "token"; text: string }
  | { type: "error"; message: string }
  | { type: "rename_chat"; title: string }
  | { type: "roadmap"; id: string }
  | { type: "done" }
  | { type: "noop" };

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

export interface StreamOptions {
  sessionId: string;
  message: string;
  images?: string[];
}

import { API_BASE_URL } from '../config/api';
const API_URL = API_BASE_URL;

/**
 * Open the chat SSE stream and pump events to `handlers.onEvent`.
 * Resolves when the stream closes cleanly. Rejects on fatal transport errors
 * (caller is responsible for surfacing them; non-fatal SSE parse errors are
 * logged and skipped).
 */
export async function startChatStream(
  opts: StreamOptions,
  handlers: StreamHandlers
): Promise<void> {
  const { sessionId, message, images } = opts;
  const { onEvent, onError, signal } = handlers;

  try {
    let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        ...(images && images.length > 0 ? { images } : {}),
      }),
      signal,
    });

    if (response.status === 404) {
      response = await apiClient.fetchWithAuth(`${API_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message,
          ...(images && images.length > 0 ? { images } : {}),
        }),
        signal,
      });
    }

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    if (!response.body) throw new Error("No readable stream available.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    // --- Token coalescing: accumulate text deltas and flush per animation frame ---
    let pendingText = "";
    let flushScheduled = false;
    const flushText = () => {
      flushScheduled = false;
      if (pendingText) {
        onEvent({ type: "token", text: pendingText });
        pendingText = "";
      }
    };
    const scheduleFlush = () => {
      if (!flushScheduled) {
        flushScheduled = true;
        // rAF ~16ms; fall back to setTimeout if unavailable (SSR/tests).
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(flushText);
        } else {
          setTimeout(flushText, 16);
        }
      }
    };

    const emit = (event: StreamEvent) => {
      if (event.type === "token") {
        pendingText += event.text;
        scheduleFlush();
      } else {
        // Flush any buffered text before emitting an out-of-band event so order is preserved.
        if (pendingText) {
          flushText();
        }
        onEvent(event);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const rawData = trimmed.slice(5).trim();
        if (!rawData || rawData === "[DONE]") {
          if (rawData === "[DONE]") emit({ type: "done" });
          continue;
        }

        let data: any;
        try {
          data = JSON.parse(rawData);
        } catch (err) {
          console.error("Error parsing SSE line json:", err, trimmed);
          continue;
        }

        emit(translateEvent(data));
      }
    }

    // Final flush of any trailing text.
    flushText();
    onEvent({ type: "done" });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      // User-initiated stop; not an error.
      return;
    }
    onError(error?.message ?? "Stream failed");
  }
}

/**
 * Map a backend SSE payload to our normalized StreamEvent.
 * Handles both the legacy event names and the richer contract.
 */
function translateEvent(data: any): StreamEvent {
  switch (data.type) {
    // --- Reasoning / thinking ---
    case "thinking_start":
    case "reasoning.start":
      return { type: "thinking_start" };
    case "thinking_delta":
    case "reasoning.delta":
      return { type: "thinking_delta", text: data.content ?? data.text ?? "" };
    case "thinking_end":
    case "reasoning.done":
      return { type: "thinking_end" };

    // --- Tool calls ---
    case "tool_start":
    case "tool.call": {
      const toolId = data.id ?? data.tool_id ?? data.toolId ?? `tool-${Date.now()}`;
      const toolMeta = typeof data.tool === "object" ? data.tool : { title: data.tool };
      return {
        type: "tool_call",
        toolId,
        title: toolMeta?.title ?? (typeof data.tool === "string" ? data.tool : "Tool"),
        description: toolMeta?.description ?? "Running tool…",
        icon: toolMeta?.icon ?? "wrench",
        startTime: data.time ? data.time * 1000 : Date.now(),
        args: data.input ?? data.args,
      };
    }
    case "tool_end":
    case "tool.result": {
      const toolId = data.id ?? data.tool_id ?? data.toolId ?? "";
      const toolName = typeof data.tool === "object" ? (data.tool?.title ?? data.name ?? "") : (data.tool ?? data.name ?? "");
      const failed = data.status === "error" || data.status === "failed";
      const endTime = data.time ? data.time * 1000 : Date.now();
      return {
        type: "tool_result",
        toolId,
        toolName,
        status: failed ? "failed" : "completed",
        endTime,
        duration: data.duration_ms ?? data.duration,
        outputSummary: data.outputSummary ?? data.summary ?? (failed ? "Tool failed" : "Completed successfully"),
        output: data.output ?? data.result,
      };
    }

    // --- Final answer tokens ---
    case "token":
    case "text_delta":
      return { type: "token", text: data.content ?? data.text ?? "" };

    // --- Misc ---
    case "error":
      return { type: "error", message: data.message ?? data.error ?? "Unknown error" };
    case "rename_chat":
      return { type: "rename_chat", title: data.title ?? "" };
    case "roadmap":
      return { type: "roadmap", id: data.id ?? "" };
    case "done":
    case "message.done":
      return { type: "done" };

    // Unknown event types are ignored (non-fatal).
    default:
      return { type: "noop" };
  }
}
