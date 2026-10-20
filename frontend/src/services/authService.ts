// src/services/authService.ts
import { apiClient } from './apiClient';
import { API_BASE_URL as BASE_CONFIG_URL } from '../config/api';
const API_BASE_URL = BASE_CONFIG_URL;
const BASE_URL = `${API_BASE_URL}/api/v1/auth`;

async function handleApiError(response: Response, defaultMessage: string) {
  const errData = await response.json().catch(() => null);
  let errMsg = errData?.message || defaultMessage;
  if (errData?.detail) {
    if (Array.isArray(errData.detail)) {
      errMsg = errData.detail.map((e: any) => `${e.loc?.slice(-1)}: ${e.msg}`).join(', ');
    } else {
      errMsg = errData.detail;
    }
  }
  throw new Error(errMsg);
}

export const authService = {
  async signup(data: any) {
    const response = await fetch(`${BASE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      await handleApiError(response, `Signup failed with status ${response.status}`);
    }
    
    return response.json();
  },

  async verifyEmail(email: string, token: string) {
    const response = await fetch(`${BASE_URL}/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token })
    });
    
    if (!response.ok) {
      await handleApiError(response, `Verification failed with status ${response.status}`);
    }
    
    return response.json();
  },

  async resendVerification(email: string) {
    const response = await fetch(`${BASE_URL}/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!response.ok) {
      await handleApiError(response, `Failed to resend verification with status ${response.status}`);
    }
    
    return response.json();
  },

  async forgotPassword(email: string) {
    const response = await fetch(`${BASE_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    if (!response.ok) {
      await handleApiError(response, `Failed to request password reset with status ${response.status}`);
    }
    
    return response.json();
  },

  async resetPassword(email: string, otp: string, new_password: string) {
    const response = await fetch(`${BASE_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, new_password })
    });
    
    if (!response.ok) {
      await handleApiError(response, `Failed to reset password with status ${response.status}`);
    }
    
    return response.json();
  },

  async login(email: string, password: string) {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      await handleApiError(response, `Login failed. Invalid credentials.`);
    }
    
    return response.json();
  },

  async getMe(token: string) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/me`, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to fetch profile.`);
    }
    
    return response.json();
  },

  async getProfile(token: string) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/profile`, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to fetch detailed profile.`);
    }
    
    return response.json();
  },

  async getPublicProfile(username: string) {
    const response = await fetch(`${BASE_URL}/profile/${username}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to fetch public profile.`);
    }
    
    return response.json();
  },

  async logout(accessToken: string, refreshToken: string) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Logout failed.`);
    }

    return response.json();
  },

  async updateProfileDetails(token: string, data: any) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/profile`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      await handleApiError(response, `Failed to update profile details.`);
    }
    return response.json();
  },

  async updateMe(token: string, data: any) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/me`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      await handleApiError(response, `Failed to update basic user details.`);
    }
    return response.json();
  },

  async getPreferences(token: string) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/me/preferences`, {
      method: 'GET'
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to get preferences.`);
    }
    return response.json();
  },

  async updatePreferences(token: string, data: any) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/me/preferences`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to update preferences.`);
    }
    return response.json();
  },

  async getAchievements(token: string) {
    const response = await apiClient.fetchWithAuth(`${BASE_URL}/achievements`, {
      method: 'GET'
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || errData?.message || `Failed to get achievements.`);
    }
    return response.json();
  }
};
