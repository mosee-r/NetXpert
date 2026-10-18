/**
 * SpeedXpat — Full-Stack Server
 * Provides dedicated diagnostics endpoints for ping, download, upload, and DNS lookup,
 * and mounts Vite development middleware.
 */

import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import path from 'path';
import 'dotenv/config';
import { app } from './api.ts';
import { DEFAULT_PORT } from './src/config/defaults.ts';

const httpServer = createHttpServer(app);

function listenOnAvailablePort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const attemptListen = (candidatePort: number) => {
      const cleanup = () => {
        httpServer.off('listening', handleListening);
        httpServer.off('error', handleError);
      };
      const handleListening = () => {
        cleanup();
        resolve(candidatePort);
      };
      const handleError = (error: NodeJS.ErrnoException) => {
        cleanup();
        if (error.code === 'EADDRINUSE') {
          const nextPort = candidatePort + 1;
          console.warn(`Port ${candidatePort} is busy, retrying on ${nextPort}.`);
          attemptListen(nextPort);
          return;
        }

        reject(error);
      };

      httpServer.once('listening', handleListening);
      httpServer.once('error', handleError);
      httpServer.listen(candidatePort);
    };

    attemptListen(port);
  });
}

// 6. Mount Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, ws: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const actualPort = await listenOnAvailablePort(Number(process.env.PORT) || DEFAULT_PORT);
  console.log(`SpeedXpat server listening on port ${actualPort}`);
}

startServer();
