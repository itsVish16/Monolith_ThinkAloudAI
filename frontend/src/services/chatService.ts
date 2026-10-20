import { apiClient } from './apiClient';
import { 
  startChatStream as startChatStreamCore, 
  type StreamEvent, 
  type StreamHandlers, 
  type StreamOptions 
} from '../state/chatStream';

export type { StreamEvent, StreamHandlers, StreamOptions };

export interface APIMessage {
  id: number;
  session_id: string;
  role: 'assistant' | 'user';
  content: string;
  created_at: string;
}

export interface APISession {
  id: string;
  title?: string;
  created_at: string;
}

import { API_BASE_URL } from '../config/api';
const API_URL = API_BASE_URL;

export async function getSessions(): Promise<APISession[]> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/chat/sessions`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/sessions`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }
  return response.json();
}

export async function getSessionMessages(sessionId: string): Promise<APIMessage[]> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/chat/sessions/${sessionId}/messages`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/sessions/${sessionId}/messages`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch messages for session ${sessionId}: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/chat/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }
  if (!response.ok) {
    throw new Error(`Failed to delete session ${sessionId}: ${response.statusText}`);
  }
}

export async function startChatStream(
  opts: StreamOptions,
  handlers: StreamHandlers
): Promise<void>;
export async function startChatStream(
  sessionId: string,
  message: string,
  onChunk: (token: string) => void,
  onToolStart?: (toolName: string, input: any) => void,
  onToolEnd?: (toolName: string, output: string) => void,
  onError?: (msg: string) => void,
  images?: string[],
  onThinking?: (text: string) => void,
  signal?: AbortSignal
): Promise<void>;
export async function startChatStream(
  sessionIdOrOpts: string | StreamOptions,
  messageOrHandlers: string | StreamHandlers,
  onChunk?: (token: string) => void,
  onToolStart?: (toolName: string, input: any) => void,
  onToolEnd?: (toolName: string, output: string) => void,
  onError?: (msg: string) => void,
  images?: string[],
  onThinking?: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (typeof sessionIdOrOpts === 'object') {
    return startChatStreamCore(sessionIdOrOpts, messageOrHandlers as StreamHandlers);
  }

  const sessionId = sessionIdOrOpts;
  const message = messageOrHandlers as string;

  return startChatStreamCore(
    { sessionId, message, images },
    {
      onEvent: (event: StreamEvent) => {
        switch (event.type) {
          case 'token':
            if (onChunk) onChunk(event.text);
            break;
          case 'thinking_delta':
            if (onThinking) onThinking(event.text);
            break;
          case 'tool_call':
            if (onToolStart) onToolStart(event.title || event.toolId, event.args);
            break;
          case 'tool_result':
            if (onToolEnd) {
              onToolEnd(
                event.toolName || event.toolId,
                typeof event.output === 'string' ? event.output : JSON.stringify(event.output ?? '')
              );
            }
            break;
          case 'error':
            if (onError) onError(event.message);
            break;
        }
      },
      onError: (errMsg: string) => {
        if (onError) onError(errMsg);
      },
      signal,
    }
  );
}
