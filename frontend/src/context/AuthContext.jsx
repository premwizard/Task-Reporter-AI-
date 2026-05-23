import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch the current authenticated user on boot
  const verifySession = async () => {
    try {
      const userData = await api.get('/auth/me');
      setUser(userData);
    } catch (err) {
      console.log('[AuthContext] Session verification failed (not logged in)');
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifySession();
  }, []);

  const logout = async () => {
    setLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('[AuthContext] Logout API error:', err);
    } finally {
      localStorage.removeItem('token');
      setUser(null);
      setLoading(false);
      // Redirect to login page
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, verifySession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
