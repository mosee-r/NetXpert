import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  const devCspPlugin = {
    name: 'speedxpat-dev-csp',
    transformIndexHtml(html: string) {
      return html.replace(
        "connect-src 'self' https: wss:;",
        "connect-src 'self' https: wss: ws://localhost:*;"
      );
    },
  };

  return {
    plugins: [react(), tailwindcss(), ...(command === 'serve' ? [devCspPlugin] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
