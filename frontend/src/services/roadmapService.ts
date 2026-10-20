import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';
import { apiClient } from './apiClient';

const API_BASE_URL = BASE_CONFIG_URL;
const API_URL = API_BASE_URL;

export interface RoadmapItem {
  id: number;
  topic_id: number;
  title: string;
  content_type: string;
  content_id: string | null;
  timeline_days: number;
  is_completed: boolean;
  category?: string;
  track_type?: string;
}

export interface RoadmapTopic {
  id: number;
  roadmap_id: number;
  title: string;
  description: string;
  order_index: number;
  items: RoadmapItem[];
}

export interface Roadmap {
  id: number;
  user_id: string;
  title: string;
  description: string;
  created_at: string;
  topics: RoadmapTopic[];
}

export interface ScheduledInterview extends RoadmapItem {
  roadmap_title: string;
  topic_title: string;
  roadmap_id: number;
}

export async function getRoadmaps(): Promise<Roadmap[]> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/roadmaps`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/roadmaps`);
  }
  if (!response.ok) {
    throw new Error('Failed to fetch roadmaps');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (data.items || []);
}

export async function getRoadmapById(roadmapId: number | string): Promise<Roadmap> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/roadmaps/${roadmapId}`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/roadmaps/${roadmapId}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch roadmap ${roadmapId}`);
  }
  return response.json();
}

export async function getScheduledInterviews(): Promise<ScheduledInterview[]> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/roadmaps/interviews/scheduled`);
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/roadmaps/interviews/scheduled`);
  }
  if (!response.ok) {
    throw new Error('Failed to fetch scheduled interviews');
  }
  return response.json();
}

export async function toggleRoadmapItem(itemId: number, isCompleted: boolean): Promise<{ status: string; item_id: number; is_completed: boolean }> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/roadmaps/items/${itemId}/toggle?is_completed=${isCompleted}`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/roadmaps/items/${itemId}/toggle?is_completed=${isCompleted}`, {
      method: 'PATCH',
    });
  }
  
  if (!response.ok) {
    throw new Error('Failed to toggle roadmap item');
  }
  return response.json();
}

export async function deleteRoadmap(roadmapId: number): Promise<void> {
  let response = await apiClient.fetchWithAuth(`${API_URL}/api/v1/tracks/roadmaps/${roadmapId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    response = await apiClient.fetchWithAuth(`${API_URL}/roadmaps/${roadmapId}`, {
      method: 'DELETE',
    });
  }
  
  if (!response.ok) {
    throw new Error('Failed to delete roadmap');
  }
}
