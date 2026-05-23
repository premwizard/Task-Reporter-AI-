import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for unified error formatting
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorMsg = error.response?.data?.error || error.message || 'API request failure';
    // Suppress console errors for 401 checks (which are normal for guest/unlogged sessions)
    if (error.response?.status !== 401) {
      console.error('API Error:', errorMsg);
    }
    return Promise.reject(new Error(errorMsg));
  }
);

export default api;
