// Centralized API configuration for ThinkAloudAI Monolith
export const getApiBaseUrl = (): string => {
  // Explicit API origin (e.g. http://localhost:8000). "/" or "" means
  // same-origin — requests go to /api/v1/... on the current host.
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === 'string') {
    const trimmed = envUrl.trim();
    if (trimmed === '' || trimmed === '/') {
      return '';
    }
    return trimmed.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('thinkaloudai.tech')) {
    return 'https://api.thinkaloudai.tech';
  }
  return 'http://localhost:8000';
};

export const API_BASE_URL = getApiBaseUrl();

