import { apiClient } from './apiClient';

export interface APIDSAQuestion {
  id: number | string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  test_cases: string; // stringified JSON
  python_starter_code?: string;
  cpp_starter_code?: string;
  cpp_test_harness?: string;
  function_name?: string;
  hints?: string;
  optimal_time_complexity?: string;
  optimal_space_complexity?: string;
  category?: string;
  created_at: string;
}

export interface CodeSubmitResponse {
  status: string;
  passed_tests: number;
  total_tests: number;
  error_message: string | null;
  execution_time_ms: number;
  memory_mb?: number;
  memory_kb?: number;
  memory_bytes?: number;
}

import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';
const API_BASE_URL = BASE_CONFIG_URL;
const API_URL = API_BASE_URL;

export async function getDSAQuestions(limit: number = 150): Promise<APIDSAQuestion[]> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/questions?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch DSA questions');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (data.items || []);
}

export async function getDSAQuestionById(id: string | number): Promise<APIDSAQuestion> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/questions/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch DSA question ${id}`);
  }
  return response.json();
}

export async function waitForSubmissionResult(submissionId: number | string): Promise<CodeSubmitResponse> {
  const streamUrl = `${API_URL}/api/v1/dsa/submissions/${submissionId}/stream`;

  const parseResultData = (rawJson: string): CodeSubmitResponse | null => {
    try {
      const data = JSON.parse(rawJson);
      return {
        status: data.status || 'Error',
        passed_tests: data.passed_tests ?? 0,
        total_tests: data.total_tests ?? 0,
        error_message: data.error_message || null,
        execution_time_ms: data.execution_time_ms || 0,
      };
    } catch {
      return null;
    }
  };
  
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: CodeSubmitResponse) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    // Timeout safety after 45s
    const timer = setTimeout(() => {
      finish({
        status: 'Time Limit Exceeded',
        passed_tests: 0,
        total_tests: 0,
        error_message: 'Code evaluation timed out waiting for worker.',
        execution_time_ms: 0,
      });
    }, 45000);

    const runStream = async () => {
      try {
        const response = await apiClient.fetchWithAuth(streamUrl, {
          headers: {
            'Accept': 'text/event-stream',
          },
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream request failed with status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const rawData = trimmed.slice(5).trim();
              if (currentEvent === 'result' || (rawData.startsWith('{') && rawData.includes('status'))) {
                const parsed = parseResultData(rawData);
                if (parsed) {
                  clearTimeout(timer);
                  try { reader.cancel(); } catch {}
                  finish(parsed);
                  return;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Direct stream reading error, trying EventSource fallback:', err);
      }

      if (resolved) return;

      // EventSource fallback
      try {
        const eventSource = new EventSource(streamUrl);
        eventSource.addEventListener('result', (e: MessageEvent) => {
          clearTimeout(timer);
          eventSource.close();
          const parsed = parseResultData(e.data);
          if (parsed) {
            finish(parsed);
          } else {
            finish({
              status: 'Error',
              passed_tests: 0,
              total_tests: 0,
              error_message: 'Failed to parse worker response.',
              execution_time_ms: 0,
            });
          }
        });

        eventSource.onerror = () => {
          eventSource.close();
          if (!resolved) {
            clearTimeout(timer);
            finish({
              status: 'Error',
              passed_tests: 0,
              total_tests: 0,
              error_message: 'Connection to evaluation stream failed.',
              execution_time_ms: 0,
            });
          }
        };
      } catch (esErr) {
        clearTimeout(timer);
        finish({
          status: 'Error',
          passed_tests: 0,
          total_tests: 0,
          error_message: 'Failed to open event stream.',
          execution_time_ms: 0,
        });
      }
    };

    runStream();
  });
}

export async function submitDSACode(id: string | number, code: string, language: string, sessionId: string): Promise<CodeSubmitResponse> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/questions/${id}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId, language, code }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit code for question ${id}`);
  }
  const initData = await response.json();
  if (initData.status === 'Pending' && initData.submission_id) {
    return await waitForSubmissionResult(initData.submission_id);
  }
  return initData;
}
export async function getLatestSubmission(id: string | number, language?: string): Promise<{ code: string; status: string } | null> {
  const url = new URL(`${API_URL}/api/v1/dsa/questions/${id}/submissions`);
  if (language) {
    url.searchParams.append('language', language);
  }
  const response = await apiClient.fetchWithAuth(url.toString());
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch latest submission for question ${id}`);
  }
  const data = await response.json();
  if (Array.isArray(data)) {
    return data.length > 0 ? data[0] : null;
  }
  return data;
}

export async function getQuestionSubmissions(id: string | number, sessionId: string): Promise<any[]> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/questions/${id}/submissions?session_id=${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch submissions for question ${id}`);
  }
  return response.json();
}

export async function getUserSubmissions(sessionId: string): Promise<any[]> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/submissions/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch submissions for user`);
  }
  return response.json();
}

export async function runDSACode(id: string | number, code: string, language: string, sessionId: string): Promise<CodeSubmitResponse> {
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/questions/${id}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId, language, code }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to run code for question ${id}`);
  }
  const initData = await response.json();
  if (initData.status === 'Pending' && initData.submission_id) {
    return await waitForSubmissionResult(initData.submission_id);
  }
  return initData;
}

export async function getDSAProfileStats(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/stats`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/auth/profile`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) {
    throw new Error('Failed to fetch DSA profile stats');
  }
  return response.json();
}

export async function getUserProblemStatus(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/status`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/stats`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }
  if (!response.ok) throw new Error('Failed to fetch problem status');
  return response.json();
}

export async function getRecommendations(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/dsa/recommendations`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) throw new Error('Failed to fetch recommendations');
  return response.json();
}

export async function submitSystemDesign(id: string | number, answer: string, token?: string, base64Image?: string): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/system-design/${id}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ answer_text: answer, image_data: base64Image })
  });
  if (!response.ok) {
    let errorDetail = `Failed to submit system design (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {}
    throw new Error(errorDetail);
  }
  return response.json();
}

export async function getDashboardOverview(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/stats`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard overview');
  }
  return response.json();
}

