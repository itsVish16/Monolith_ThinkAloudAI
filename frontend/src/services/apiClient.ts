// src/services/apiClient.ts

import { API_BASE_URL as BASE_URL_CONFIG } from '../config/api';
export const API_BASE_URL = BASE_URL_CONFIG;
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const apiClient = {
  /**
   * A wrapper around native fetch that automatically injects the access token
   * and handles 401 Unauthorized errors by silently refreshing the token.
   */
  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = localStorage.getItem('access_token');
    
    // Add auth header
    const headers = new Headers(options.headers || {});
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && accessToken) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return response;
      }

      if (isRefreshing) {
        try {
          const newToken = await new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          headers.set('Authorization', `Bearer ${newToken}`);
          return fetch(url, { ...options, headers });
        } catch (err) {
          return Promise.reject(err);
        }
      }

      isRefreshing = true;

      try {
        const API_URL = API_BASE_URL;
        let refreshResponse = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (refreshResponse.status === 404) {
          refreshResponse = await fetch(`${API_URL}/api/v1/users/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
          });
        }

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          
          window.dispatchEvent(new CustomEvent('auth:refresh', { detail: { token: data.access_token } }));

          processQueue(null, data.access_token);
          
          headers.set('Authorization', `Bearer ${data.access_token}`);
          return fetch(url, { ...options, headers });
        } else {
          throw new Error('Refresh token invalid');
        }
      } catch (err) {
        processQueue(err, null);
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return response; // Return original 401 response
      } finally {
        isRefreshing = false;
      }
    }

    return response;
  }
};
