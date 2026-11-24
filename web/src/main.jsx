import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from './astryx-themes';
import './scene.css';
import App from './App.jsx';

// 밤하늘 장면이라 어두운 모드 고정
createRoot(document.getElementById('root')).render(
  <StrictMode><Theme theme={themes[defaultThemeSlug]} mode="dark"><App /></Theme></StrictMode>
);
