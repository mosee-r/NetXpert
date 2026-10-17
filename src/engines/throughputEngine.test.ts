import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { measureThroughput } from './throughputEngine';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('measureThroughput upload caps', () => {
  it('does not upload more bytes than a small explicit cap', async () => {
    const uploadedSizes: number[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = init?.body;
      uploadedSizes.push(body instanceof Uint8Array ? body.byteLength : 0);
      return new Response(null, { status: 200 });
    };

    const result = await measureThroughput({
      targetUrl: 'https://speed.cloudflare.com/__up',
      direction: 'upload',
      maxBytes: 100 * 1024,
    });

    assert.equal(result.bytesTransferred, 100 * 1024);
    assert.deepEqual(uploadedSizes, [100 * 1024]);
  });

  it('reserves in-flight bytes so concurrent requests respect the total cap', async () => {
    const uploadedSizes: number[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = init?.body;
      uploadedSizes.push(body instanceof Uint8Array ? body.byteLength : 0);
      return new Response(null, { status: 200 });
    };

    const maxBytes = 2 * 1024 * 1024 + 512 * 1024;
    const result = await measureThroughput({
      targetUrl: 'https://speed.cloudflare.com/__up',
      direction: 'upload',
      maxBytes,
    });

    assert.equal(result.bytesTransferred, maxBytes);
    assert.equal(uploadedSizes.reduce((total, size) => total + size, 0), maxBytes);
  });

  it('measures a timed upload without exceeding its large safety cap', async () => {
    globalThis.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(null, { status: 200 });
    };

    const safetyCapBytes = 1024 * 1024 * 1024;
    const result = await measureThroughput({
      targetUrl: 'https://speed.cloudflare.com/__up',
      direction: 'upload',
      maxBytes: safetyCapBytes,
      durationTargetMs: 50,
    });

    assert.equal(result.status, 'success');
    assert.ok(result.durationMs >= 50);
    assert.ok(result.bytesTransferred > 0);
    assert.ok(result.bytesTransferred < safetyCapBytes);
    assert.equal(result.testSizeBytes, undefined);
  });
});
