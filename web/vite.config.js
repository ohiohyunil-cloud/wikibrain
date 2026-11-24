import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const THREE = fileURLToPath(new URL('./node_modules/three/build/three.module.js', import.meta.url));

// 위성 엔진(src/core/physics)은 빌드 없는 시절 경로로 three를 import한다: 같은 three 하나로 묶는다
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {alias: [{find: /^(\.\.\/)+vendor\/three\/build\/three\.module\.js$/, replacement: THREE}]},
  build: {outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 2000},
  server: {proxy: {'/api': 'http://127.0.0.1:8000', '/data': 'http://127.0.0.1:8000'}},
});
