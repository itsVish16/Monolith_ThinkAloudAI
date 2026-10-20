import { apiClient } from './apiClient';
import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';

const API_BASE_URL = BASE_CONFIG_URL;

export interface UserStats {
  total_users: number;
  verified_users: number;
  unverified_users: number;
  growth?: Array<{ date: string; users: number }>;
}

export interface AdminUserItem {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_verified: boolean;
  role?: string;
  is_admin?: boolean;
  created_at: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface UserDossier {
  user: AdminUserItem;
  profile?: {
    bio?: string;
    avatar_url?: string;
    github_url?: string;
    linkedin_url?: string;
    target_role?: string;
    years_of_experience?: number;
  };
  preferences?: {
    theme?: string;
    preferred_language?: string;
    email_notifications?: boolean;
  };
  achievements?: Array<{
    id: number;
    title: string;
    description: string;
    icon_url?: string;
  }>;
}

export interface AchievementItem {
  id: number;
  title: string;
  description: string;
  icon_url?: string;
}

export interface CodingStats {
  total_questions: number;
  runs: number;
  submissions: number;
  passed_submissions: number;
  popular_problems?: Array<{ title: string; attempts: number }>;
}

export interface RoadmapStats {
  total_roadmaps: number;
  growth?: Array<{ date: string; roadmaps: number }>;
}

export interface DSAQuestionItem {
  id: number;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  test_cases: string;
  python_starter_code?: string;
  cpp_starter_code?: string;
  cpp_test_harness?: string;
  function_name?: string;
  hints?: string;
  optimal_time_complexity?: string;
  optimal_space_complexity?: string;
  created_at?: string;
}

export interface DSASubmissionItem {
  id: number;
  session_id?: string;
  question_id: number;
  code: string;
  language: string;
  status: string;
  error_message?: string;
  is_submission?: boolean;
  created_at: string;
}

export interface InterviewStats {
  total_users: number;
  total_interviews: number;
  total_minutes: number;
  categories: {
    dsa: number;
    system_design: number;
    behavioral: number;
    pm?: number;
    aiml?: number;
    [key: string]: number | undefined;
  };
  growth?: Array<{ date: string; interviews: number }>;
}

export interface InterviewListItem {
  id: string;
  user_email: string;
  candidate_name: string;
  type: string;
  stage: string;
  duration_minutes: number;
  score?: number;
  created_at: string;
}

export interface InterviewSessionAudit {
  id: string;
  candidate_name: string;
  interview_type: string;
  stage: string;
  created_at: string;
  updated_at?: string;
  user?: {
    id: number;
    email: string;
    username: string;
  };
  feedback?: {
    technical_score?: number;
    communication_score?: number;
    english_score?: number;
    strengths?: string[];
    weaknesses?: string[];
    improvement_plan?: string[];
    recommended_topics?: string[];
    detailed_metrics?: Record<string, number>;
  };
  state_data?: any;
  transcript?: Array<{
    role: 'interviewer' | 'candidate';
    content: string;
    created_at?: string;
  }>;
}

export interface FastLLMMetrics {
  ttft_ms?: number;
  total_ms?: number;
  output?: string;
}

export interface MainLLMMetrics {
  ttft_ms?: number;
  total_ms?: number;
}

export interface TurnEvaluationMetrics {
  score?: number;
  objective_met?: boolean;
  latency_ms?: number;
  reasoning?: string;
}

export interface TurnMetricItem {
  turn_number: number;
  stage?: string;
  user_text?: string;
  response_text?: string;
  e2e_response_latency_ms?: number;
  total_turn_duration_ms?: number;
  fast_llm?: FastLLMMetrics;
  main_llm?: MainLLMMetrics;
  stt_latency_ms?: number;
  tts_latency_ms?: number;
  evaluation?: TurnEvaluationMetrics;
  timestamp?: string;
}

export interface TelemetrySummary {
  total_turns: number;
  avg_e2e_latency_ms: number;
  min_e2e_latency_ms: number;
  max_e2e_latency_ms: number;
  avg_main_llm_ttft_ms: number;
  avg_fast_llm_ttft_ms: number;
  avg_turn_duration_ms: number;
}

export interface SlowestTurnItem {
  session_id: string;
  candidate_name?: string;
  stage?: string;
  turn_number: number;
  e2e_latency_ms: number;
  main_llm_ttft_ms?: number;
  user_text?: string;
}

export interface RecentSessionTelemetry {
  session_id: string;
  candidate_name?: string;
  interview_type?: string;
  stage?: string;
  total_turns: number;
  avg_e2e_latency_ms: number;
  created_at?: string;
}

export interface AdminTelemetryOverviewResponse {
  analyzed_sessions_count: number;
  overall_avg_e2e_latency_ms: number;
  overall_avg_main_ttft_ms: number;
  overall_avg_fast_ttft_ms: number;
  slowest_turns: SlowestTurnItem[];
  recent_sessions: RecentSessionTelemetry[];
}

export interface AdminSessionMetricsResponse {
  session_id: string;
  candidate_name?: string;
  user_email?: string;
  interview_type?: string;
  stage?: string;
  created_at?: string;
  updated_at?: string;
  telemetry_summary: TelemetrySummary;
  turns: TurnMetricItem[];
}

export const adminService = {
  // -------------------------------------------------------------
  // 1. User Management & Gamification (Scalable_User_Service)
  // -------------------------------------------------------------
  async getUsersStats(): Promise<UserStats> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users/stats`);
    if (!res.ok) {
      // Fallback for backwards compatibility with user service direct routing
      const altRes = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/users/admin/users/stats`);
      if (!altRes.ok) throw new Error('Failed to fetch user statistics');
      return altRes.json();
    }
    return res.json();
  },

  async getUsers(params: { page?: number; limit?: number; search?: string; is_verified?: boolean } = {}): Promise<{
    items: AdminUserItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.is_verified !== undefined) query.set('is_verified', String(params.is_verified));

    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users?${query.toString()}`);
    if (!res.ok) {
      // Fallback
      const altRes = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/users?${query.toString()}`);
      if (!altRes.ok) throw new Error('Failed to fetch users list');
      const data = await altRes.json();
      return {
        items: data.items || data.users || (Array.isArray(data) ? data : []),
        total: data.total || (Array.isArray(data) ? data.length : 0),
        page: params.page || 1,
        limit: params.limit || 20,
        pages: data.pages || 1
      };
    }
    return res.json();
  },

  async getUserDossier(userId: number): Promise<UserDossier> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users/${userId}`);
    if (!res.ok) throw new Error(`Failed to load dossier for user #${userId}`);
    return res.json();
  },

  async updateUserStatus(userId: number, payload: { is_verified?: boolean; full_name?: string }): Promise<any> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update user status');
    return res.json();
  },

  async deleteUser(userId: number): Promise<any> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users/${userId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return res.json();
  },

  async getAchievements(): Promise<AchievementItem[]> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/achievements`);
    if (!res.ok) return [];
    return res.json();
  },

  async createAchievement(payload: { title: string; description: string; icon_url: string }): Promise<AchievementItem> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/achievements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create achievement');
    return res.json();
  },

  // -------------------------------------------------------------
  // 2. DSA & Content Management (main_service)
  // -------------------------------------------------------------
  async getCodingStats(): Promise<CodingStats> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/coding/stats`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/coding/stats`);
    }
    if (!res.ok) throw new Error('Failed to load coding statistics');
    return res.json();
  },

  async getRoadmapStats(): Promise<RoadmapStats> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/roadmaps/stats`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/roadmaps/stats`);
    }
    if (!res.ok) throw new Error('Failed to load roadmap statistics');
    return res.json();
  },

  async getDSAQuestions(params: { page?: number; limit?: number; difficulty?: string; search?: string } = {}): Promise<{
    items: DSAQuestionItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.search) query.set('search', params.search);

    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/questions?${query.toString()}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/questions?${query.toString()}`);
    }
    if (!res.ok) throw new Error('Failed to fetch DSA questions');
    return res.json();
  },

  async getDSAQuestion(questionId: number): Promise<DSAQuestionItem> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/questions/${questionId}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/questions/${questionId}`);
    }
    if (!res.ok) throw new Error(`Failed to fetch question #${questionId}`);
    return res.json();
  },

  async createDSAQuestion(payload: Partial<DSAQuestionItem>): Promise<DSAQuestionItem> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create question');
    }
    return res.json();
  },

  async updateDSAQuestion(questionId: number, payload: Partial<DSAQuestionItem>): Promise<DSAQuestionItem> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/questions/${questionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/questions/${questionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update question');
    }
    return res.json();
  },

  async deleteDSAQuestion(questionId: number): Promise<any> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/questions/${questionId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/questions/${questionId}`, {
        method: 'DELETE'
      });
    }
    if (!res.ok) throw new Error('Failed to delete question');
    return res.json();
  },

  async getDSASubmissions(params: { page?: number; limit?: number; status?: string; question_id?: number } = {}): Promise<{
    items: DSASubmissionItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', params.status);
    if (params.question_id) query.set('question_id', String(params.question_id));

    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/submissions?${query.toString()}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/submissions?${query.toString()}`);
    }
    if (!res.ok) throw new Error('Failed to fetch code submissions');
    return res.json();
  },

  async getDSASubmission(submissionId: number): Promise<DSASubmissionItem> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/dsa/submissions/${submissionId}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/admin/dsa/submissions/${submissionId}`);
    }
    if (!res.ok) throw new Error(`Failed to load submission #${submissionId}`);
    return res.json();
  },

  // -------------------------------------------------------------
  // 3. Interview Auditing & Moderation (AI_Interviewer)
  // -------------------------------------------------------------
  async getInterviewStats(): Promise<InterviewStats> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/stats`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/stats`);
    }
    if (!res.ok) throw new Error('Failed to load interview statistics');
    return res.json();
  },

  async getInterviewUsers(params: { page?: number; limit?: number; search?: string } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);

    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/users?${query.toString()}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/users?${query.toString()}`);
    }
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  },

  async getInterviews(params: { page?: number; limit?: number; interview_type?: string; status?: string; search?: string } = {}): Promise<{
    items: InterviewListItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.interview_type) query.set('interview_type', params.interview_type);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);

    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews?${query.toString()}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/interviews?${query.toString()}`);
    }
    if (!res.ok) throw new Error('Failed to load interviews list');
    const data = await res.json();
    return {
      items: data.items || data.interviews || (Array.isArray(data) ? data : []),
      total: data.total || (Array.isArray(data) ? data.length : 0),
      page: params.page || 1,
      limit: params.limit || 20,
      pages: data.pages || 1
    };
  },

  async getInterviewSessionAudit(sessionId: string): Promise<InterviewSessionAudit> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/${sessionId}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/interviews/${sessionId}`);
    }
    if (!res.ok) throw new Error(`Failed to load interview session audit for ${sessionId}`);
    return res.json();
  },

  async overrideInterviewScore(sessionId: string, payload: {
    technical_score?: number;
    communication_score?: number;
    english_score?: number;
    reason?: string;
  }): Promise<any> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/${sessionId}/score`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/interviews/${sessionId}/score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (!res.ok) throw new Error('Failed to override interview score');
    return res.json();
  },

  async deleteInterviewSession(sessionId: string): Promise<any> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/${sessionId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/interviews/${sessionId}`, {
        method: 'DELETE'
      });
    }
    if (!res.ok) throw new Error('Failed to delete interview session');
    return res.json();
  },

  // -------------------------------------------------------------
  // 4. Latency & Telemetry Deep-Dive (AI_Interviewer)
  // -------------------------------------------------------------
  async getTelemetryOverview(limit = 50): Promise<AdminTelemetryOverviewResponse> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/telemetry/overview?limit=${limit}`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/telemetry/overview?limit=${limit}`);
    }
    if (!res.ok) throw new Error('Failed to load global telemetry overview');
    return res.json();
  },

  async getSessionMetrics(sessionId: string): Promise<AdminSessionMetricsResponse> {
    let res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/${sessionId}/metrics`);
    if (!res.ok) {
      res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/admin/interviews/${sessionId}/metrics`);
    }
    if (!res.ok) throw new Error(`Failed to load metrics for session ${sessionId}`);
    return res.json();
  },

  // -------------------------------------------------------------
  // 5. Candidate Interview Scheduling & Invitations
  // -------------------------------------------------------------
  async getAvailableQuestions(track = 'dsa', search?: string): Promise<{ track: string; total: number; questions: any[] }> {
    const query = new URLSearchParams({ track });
    if (search) query.set('search', search);
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/available-questions?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load available questions');
    return res.json();
  },

  async scheduleInterview(payload: any): Promise<any> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to schedule candidate interview');
    }
    return res.json();
  },

  async getScheduledInterviews(params: { page?: number; limit?: number; status?: string; search?: string } = {}): Promise<{
    total: number;
    page: number;
    limit: number;
    pages: number;
    items: any[];
  }> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);

    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/scheduled?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load scheduled interviews');
    return res.json();
  },

  async cancelScheduledInterview(sessionId: string): Promise<any> {
    const res = await apiClient.fetchWithAuth(`${API_BASE_URL}/api/v1/admin/interviews/scheduled/${sessionId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to cancel scheduled interview');
    return res.json();
  }
};
