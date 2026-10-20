// src/services/langgraphService.ts
import { apiClient } from './apiClient';
import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';

const API_BASE_URL = BASE_CONFIG_URL;
const API_URL = API_BASE_URL;

export async function generateLanggraphToken(_sessionId?: string): Promise<string> {
  const token = localStorage.getItem('access_token');
  return token || '';
}

export async function getUserProfile(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/auth/profile`, {
    method: 'GET',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/users/profile`, {
      method: 'GET',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }

  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }

  return response.json();
}
