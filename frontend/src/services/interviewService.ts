import { apiClient } from './apiClient';
import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';

const API_BASE_URL = BASE_CONFIG_URL;
const API_URL = API_BASE_URL;

export interface APIInterviewType {
  id: string;
  name: string;
  description: string;
}

export interface APIInterviewTypesResponse {
  types: APIInterviewType[];
}

export async function getInterviewTypes(): Promise<APIInterviewType[]> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/types`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interview-types`);
  }
  if (!response.ok) {
    throw new Error('Failed to fetch interview types');
  }
  const data: APIInterviewTypesResponse = await response.json();
  return data.types || (Array.isArray(data) ? data : []);
}

export async function getMyInterviews(token?: string): Promise<any[]> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interviews/me`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to fetch past interviews');
  }
  return response.json();
}

export async function getInterviewDetails(token: string, sessionId: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/${sessionId}`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interview/${sessionId}`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to fetch interview details');
  }
  const data = await response.json();
  if (data && data.feedback && !data.evaluation) {
    data.evaluation = data.feedback;
  }
  return data;
}

export async function endInterview(token: string, sessionId: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/${sessionId}/end`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interview/${sessionId}/end`, {
      method: 'POST',
      headers,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to force end interview');
  }
  return response.json();
}

export async function getInterviewAnalytics(token: string, sessionId?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const targetUrl = sessionId
    ? `${API_URL}/api/v1/interviews/${sessionId}/feedback`
    : `${API_URL}/api/v1/analytics/stats`;
  let response = await apiClient.fetchWithAuth(targetUrl, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interviews/me/analytics`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to fetch interview analytics');
  }
  return response.json();
}

export async function getInterviewSessionMetrics(sessionId: string, token?: string): Promise<any> {
  // Support either parameter order: (sessionId, token) or legacy (token, sessionId)
  let actualSessionId = sessionId;
  let actualToken = token;
  if (token && (sessionId.startsWith('ey') || sessionId.split('.').length === 3)) {
    actualSessionId = token;
    actualToken = sessionId;
  }

  const headers: Record<string, string> = {};
  const authToken = actualToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null);
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/${actualSessionId}/metrics`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/interview/${actualSessionId}/metrics`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/admin/interviews/${actualSessionId}/metrics`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to fetch interview metrics');
  }
  return response.json();
}

export function getInterviewStreamUrl(sessionId: string, token?: string): string {
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : '');
  const queryParam = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  return `${API_URL}/api/v1/interviews/${sessionId}/stream${queryParam}`;
}

export function getLegacyInterviewStreamUrl(sessionId: string, token?: string): string {
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : '');
  const queryParam = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  return `${API_URL}/api/interview/${sessionId}/stream${queryParam}`;
}

export const getAnalysisStreamUrl = getInterviewStreamUrl;

export async function getInterviewToken(params: {
  room_name?: string;
  interview_type?: string;
  domain?: string;
  role?: string;
  question_ids?: string[];
  session_id?: string;
}): Promise<{ url: string; token: string; room_name: string; candidate: string; session_id?: string; ai_selected_questions?: any[] }> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/interviews/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }
  if (!response.ok) {
    throw new Error(`Failed to generate interview token (${response.status})`);
  }
  return response.json();
}

/**
 * Public Guest Candidate Invitation API
 */
export async function getGuestInviteDetails(inviteToken: string): Promise<any> {
  const response = await fetch(`${API_URL}/api/v1/interviews/invite/${inviteToken}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Invitation link not found or invalid');
  }
  return response.json();
}

export async function joinGuestInterview(inviteToken: string): Promise<{
  token: string;
  url: string;
  room_name: string;
  candidate_name: string;
  session_id: string;
  interview_type: string;
  ai_selected_questions: any[];
}> {
  const response = await fetch(`${API_URL}/api/v1/interviews/invite/${inviteToken}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to join interview');
  }
  return response.json();
}

export async function getGuestInterviewReport(inviteToken: string): Promise<any> {
  const response = await fetch(`${API_URL}/api/v1/interviews/invite/${inviteToken}/report`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Evaluation report not found');
  }
  return response.json();
}

export async function getUserSkills(token?: string): Promise<{ skills: any[]; radar_data: any[] }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/skills`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) return { skills: [], radar_data: [] };
  return response.json();
}

export async function getUserActivity(token?: string, days = 30): Promise<{ activities: any[]; total_active_days?: number; current_streak?: number; longest_streak?: number }> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/activity?days=${days}`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) return { activities: [] };
  return response.json();
}

