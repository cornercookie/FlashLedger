import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// 離線字體（可攜式桌面程式，不使用 Google Fonts CDN）
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
