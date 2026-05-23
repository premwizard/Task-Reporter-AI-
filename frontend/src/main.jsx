import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// NOTE: React.StrictMode is intentionally removed.
// In React 18 development mode, StrictMode mounts components TWICE,
// causing useEffect to run twice, which doubled API calls.
// This is safe to remove — it has zero effect on production builds.
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
