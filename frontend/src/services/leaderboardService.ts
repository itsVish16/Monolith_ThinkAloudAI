import { apiClient } from './apiClient';
import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';

const API_BASE_URL = BASE_CONFIG_URL;
const API_URL = API_BASE_URL;

export interface LeaderboardUser {
  rank: number;
  candidate_name: string;
  score: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardUser[];
  me: LeaderboardUser;
}

export async function getLiveLeaderboard(token: string): Promise<LeaderboardResponse> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/analytics/leaderboard`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/api/leaderboard`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
  
  if (!response.ok) {
    throw new Error('Failed to fetch leaderboard');
  }
  
  return response.json();
}
