import express from 'express';
import dns from 'dns/promises';

export const app = express();

app.all('/api/ping', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, timestamp: Date.now() });
});

app.get('/api/speedtest/download', (req, res) => {
  const requestedSize = parseInt(String(req.query.size || '5242880'), 10);
  const size = Math.min(Math.max(requestedSize, 65536), 30 * 1024 * 1024);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', size.toString());
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');

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

app.post('/api/speedtest/upload', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let bytesReceived = 0;
  let exceedsLimit = false;
  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
    if (bytesReceived > 30 * 1024 * 1024) exceedsLimit = true;
  });

  req.on('end', () => {
    if (exceedsLimit) {
      return res.status(413).json({ ok: false, error: 'Upload exceeds the 30 MB limit.' });
    }
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

app.get('/api/network/isp', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const ipinfoRes = await fetch('https://ipinfo.io/json', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (ipinfoRes.ok) {
      const data = await ipinfoRes.json();
      const orgStr = data.org || '';
      const asnMatch = orgStr.match(/^(AS\d+)\s*(.*)$/);
      const asn = asnMatch ? asnMatch[1] : (orgStr.startsWith('AS') ? orgStr.split(' ')[0] : '');
      const isp = asnMatch && asnMatch[2] ? asnMatch[2] : orgStr.replace(asn, '').trim();

      return res.json({
        ok: true,
        ip: data.ip,
        isp,
        asn,
        org: orgStr,
        city: data.city,
        region: data.region,
        country: data.country,
        source: 'ipinfo.io',
      });
    }
  } catch {
    // The client displays unavailable ISP details when the provider cannot be reached.
  } finally {
    clearTimeout(timeoutId);
  }

  res.status(502).json({ ok: false, error: 'ISP lookup is temporarily unavailable.' });
});