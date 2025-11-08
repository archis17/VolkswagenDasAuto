// API Configuration
// Uses environment variables with fallback to current origin

// Get API base URL from environment variable or use current origin
const getApiBaseUrl = () => {
  // In production, use VITE_API_BASE_URL if set, otherwise use current origin
  // In development, Vite proxy will handle /api routes
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // Default to current origin (works with Vite proxy in dev, and same origin in production)
  return window.location.origin;
};

// Get WebSocket URL
const getWebSocketUrl = () => {
  // If API_BASE_URL is set, use it for WebSocket too
  if (import.meta.env.VITE_API_BASE_URL) {
    const apiUrl = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
    // Convert http/https to ws/wss
    return apiUrl.replace(/^http/, 'ws') + '/ws';
  }
  
  // In development, use current origin
  // In production, use current origin (assuming backend is on same domain or CORS is configured)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

export const API_BASE_URL = getApiBaseUrl();
export const WS_BASE_URL = getWebSocketUrl();

// Helper to get full API endpoint URL
export const getApiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
};

// Helper to get WebSocket URL
export const getWebSocketEndpoint = () => {
  return WS_BASE_URL;
};

console.log('API Configuration:', {
  API_BASE_URL,
  WS_BASE_URL,
  env: import.meta.env.MODE
});

