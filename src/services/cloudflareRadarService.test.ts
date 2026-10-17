import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getASNInfoFromRadar, getIPInfoFromRadar } from './cloudflareRadarService';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Cloudflare Radar API', () => {
  it('requests IP details from the documented entity endpoint and maps its response', async () => {
    let requestedUrl = '';
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        success: true,
        result: {
          ip: {
            ip: '8.8.8.8',
            asn: '15169',
            asnName: 'GOOGLE',
            asnOrgName: 'Google LLC',
            location: 'US',
            locationName: 'United States',
          },
        },
      }), { status: 200 });
    };

    const result = await getIPInfoFromRadar('8.8.8.8', { apiToken: 'test-token' });

    assert.equal(requestedUrl, 'https://api.cloudflare.com/client/v4/radar/entities/ip?ip=8.8.8.8');
    assert.equal(result.ok, true);
    assert.equal(result.ip, '8.8.8.8');
    assert.equal(result.country, 'US');
    assert.equal(result.city, undefined);
    assert.equal(result.asn, '15169');
    assert.equal(result.isp, 'Google LLC');
  });

  it('requests ASN details from the documented entity endpoint', async () => {
    let requestedUrl = '';
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        success: true,
        result: { asn: { name: 'Google LLC', website: 'https://google.com' } },
      }), { status: 200 });
    };

    const result = await getASNInfoFromRadar('AS15169', { apiToken: 'test-token' });

    assert.equal(requestedUrl, 'https://api.cloudflare.com/client/v4/radar/entities/asns/15169');
    assert.equal(result.ok, true);
    assert.equal(result.asn, 'AS15169');
    assert.equal(result.name, 'Google LLC');
    assert.equal(result.domain, 'https://google.com');
  });
});
