/**
 * NetXpert — Full-Stack Server
 * Provides dedicated diagnostics endpoints for ping, download, upload, and DNS lookup,
 * and mounts Vite development middleware.
 */

import { createServer as createViteServer } from 'vite';
import express from 'express';
import path from 'path';
import { app } from './api';

const PORT = process.env.PORT || 3000;

// 6. Mount Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`NetXpert server listening on port ${PORT}`);
  });
}

startServer();
