import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://task-reporter-ai.onrender.com').replace(/\/$/, '') + '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000, // 15 seconds timeout handling
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Interceptor logging (Step 4 & 5 - production level)
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} -> ${config.url}`);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for unified response handling & token checks
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Graceful error logging
    const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'API network error';
    
    if (error.response?.status === 401) {
      // Clean token if unauthorized to prevent loops
      localStorage.removeItem('token');
    }
    
    console.error(`[API Response Error] ${errorMsg}`);
    return Promise.reject(new Error(errorMsg));
  }
);

export default api;
