import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // Photo uploads go to the Node server (npm start); run it with PORT=4000 next to vite
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PULSE_API_PORT || 4000}`,
      '/photos': `http://127.0.0.1:${process.env.PULSE_API_PORT || 4000}`
    }
  },
  optimizeDeps: {
    // Pre-bundle the Three.js add-ons used by the Pulse 3D map so the dev server doesn't
    // discover them on first load and force a mid-load re-optimisation
    include: [
      'three',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/UnrealBloomPass.js',
      'three/examples/jsm/postprocessing/OutputPass.js',
      'three/examples/jsm/renderers/CSS2DRenderer.js'
    ]
  }
});
