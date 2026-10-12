/**
 * NetXpert — Full-Stack Server
 * Provides dedicated diagnostics endpoints for ping, download, upload, and DNS lookup,
 * and mounts Vite development middleware.
 */

import express from 'express';
import dns from 'dns/promises';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Diagnostics Ping Endpoint (no-cache, sub-millisecond response)
app.all('/api/ping', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, timestamp: Date.now() });
});

// 2. Download Speedtest Payload Generator Endpoint
app.get('/api/speedtest/download', (req, res) => {
  const requestedSize = parseInt(String(req.query.size || '5242880'), 10);
  const size = Math.min(Math.max(requestedSize, 65536), 30 * 1024 * 1024); // Cap between 64KB and 30MB

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', size.toString());
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Stream in 64 KB chunks
  const chunkSize = 65536;
  const chunk = Buffer.alloc(chunkSize, 0xaa);
  let bytesSent = 0;

  function sendNextChunk() {
    while (bytesSent < size) {
      const remaining = size - bytesSent;
      const currentChunkSize = Math.min(chunkSize, remaining);
      const toSend = currentChunkSize === chunkSize ? chunk : chunk.subarray(0, currentChunkSize);

      bytesSent += currentChunkSize;
      const canContinue = res.write(toSend);
      if (!canContinue) {
        res.once('drain', sendNextChunk);
        return;
      }
    }
    res.end();
  }

  sendNextChunk();
});

// 3. Upload Speedtest Discard Endpoint (Safely discards incoming test payload and tallies bytes)
app.post('/api/speedtest/upload', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let bytesReceived = 0;
  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
  });

  req.on('end', () => {
    res.json({
      ok: true,
      bytesReceived,
      timestamp: Date.now(),
    });
  });

  req.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// 4. DNS Resolution Timing Endpoint
app.get('/api/dns/lookup', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const domain = String(req.query.domain || 'cloudflare.com');

  const start = process.hrtime.bigint();
  try {
    const lookupResult = await dns.lookup(domain);
    const end = process.hrtime.bigint();
    const durationMs = Number((end - start) / 1000000n);

    res.json({
      ok: true,
      domain,
      ip: lookupResult.address,
      family: lookupResult.family,
      durationMs: Math.max(1, durationMs),
    });
  } catch (err: unknown) {
    res.status(502).json({
      ok: false,
      domain,
      error: (err as Error).message,
    });
  }
});

// 5. Network ISP & ASN Geolocation Details Endpoint (ipinfo.io + fallback)
app.get('/api/network/isp', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  // Try ipinfo.io first
  try {
    const ipinfoRes = await fetch('https://ipinfo.io/json', {
      headers: { Accept: 'application/json' },
    });
    if (ipinfoRes.ok) {
      const data = await ipinfoRes.json();
      const orgStr = data.org || '';
      const asnMatch = orgStr.match(/^(AS\d+)\s*(.*)$/);
      const asn = asnMatch ? asnMatch[1] : (orgStr.startsWith('AS') ? orgStr.split(' ')[0] : '');
      const isp = asnMatch && asnMatch[2] ? asnMatch[2] : (orgStr.replace(asn, '').trim() || 'Internet Provider');

      return res.json({
        ok: true,
        ip: data.ip,
        isp: isp,
        asn: asn,
        org: orgStr,
        city: data.city,
        region: data.region,
        country: data.country,
        source: 'ipinfo.io',
      });
    }
  } catch {
    // fallback
  }

  // Fallback to ip-api
  try {
    const apiRes = await fetch('http://ip-api.com/json/');
    if (apiRes.ok) {
      const data = await apiRes.json();
      const asMatch = (data.as || '').match(/^(AS\d+)/);
      return res.json({
        ok: true,
        ip: data.query,
        isp: data.isp || data.org,
        asn: asMatch ? asMatch[1] : '',
        org: data.org || data.as,
        city: data.city,
        region: data.regionName,
        country: data.country,
        source: 'ip-api.com',
      });
    }
  } catch {
    // fallback
  }

  res.json({ ok: false });
});

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
