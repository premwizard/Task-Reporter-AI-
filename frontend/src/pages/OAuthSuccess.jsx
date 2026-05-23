import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { RefreshCw } from 'lucide-react';

const OAuthSuccess = ({ navigate }) => {
  const { verifySession } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    console.log('[OAuthSuccess] Extracting token from URL parameters...');
    if (token) {
      localStorage.setItem('token', token);
      console.log('[OAuthSuccess] Token stored in localStorage.');
      
      // Verify session with the new token
      verifySession().then(() => {
        console.log('[OAuthSuccess] Session verified. Navigating to dashboard...');
        navigate('/');
      });
    } else {
      console.error('[OAuthSuccess] No token found in URL query parameters.');
      navigate('/login?error=no_token');
    }
  }, [navigate, verifySession]);

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center font-sans">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <RefreshCw className="w-10 h-10 text-violet-500 animate-spin" />
        <p className="text-zinc-400 font-bold text-xs tracking-wider uppercase">Completing OAuth authentication...</p>
      </div>
    </div>
  );
};

export default OAuthSuccess;
