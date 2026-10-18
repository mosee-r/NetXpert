import test from 'node:test';
import assert from 'node:assert/strict';

import { measureDnsResolverTiming } from './dnsAndHttpEngine';

test('measureDnsResolverTiming queries the selected resolver and parses its A record', async () => {
  let requestedUrl = '';
  let requestedAccept = '';
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedAccept = new Headers(init?.headers).get('Accept') || '';
    return new Response(JSON.stringify({
      Status: 0,
      Answer: [{ type: 1, data: '93.184.216.34' }],
    }), { status: 200 });
  };

  const result = await measureDnsResolverTiming(
    { name: 'Test resolver', endpoint: 'https://resolver.example/dns-query' },
    'example.com',
    undefined,
    fetcher
  );

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('name'), 'example.com');
  assert.equal(url.searchParams.get('type'), 'A');
  assert.equal(requestedAccept, 'application/dns-json');
  assert.equal(result.resolvedIp, '93.184.216.34');
  assert.ok(typeof result.durationMs === 'number' && result.durationMs >= 0);
  assert.equal(result.errorMessage, undefined);
});

test('measureDnsResolverTiming reports HTTP resolver failures without throwing', async () => {
  const fetcher: typeof fetch = async () => new Response('', { status: 429 });
  const result = await measureDnsResolverTiming(
    { name: 'Rate-limited resolver', endpoint: 'https://resolver.example/resolve' },
    'example.com',
    undefined,
    fetcher
  );

  assert.equal(result.durationMs, null);
  assert.equal(result.resolvedIp, null);
  assert.equal(result.errorMessage, 'Resolver returned HTTP 429.');
});

test('measureDnsResolverTiming rejects successful HTTP responses without an A record', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ Status: 0, Answer: [] }), { status: 200 });
  const result = await measureDnsResolverTiming(
    { name: 'Empty resolver', endpoint: 'https://resolver.example/resolve' },
    'example.com',
    undefined,
    fetcher
  );

  assert.equal(result.durationMs, null);
  assert.equal(result.resolvedIp, null);
  assert.equal(result.errorMessage, 'Resolver returned no IPv4 answer.');
});