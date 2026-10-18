import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { getAndroidFeatureState, getCloudflareEdgeLocation } from './testEndpoints';

describe('getCloudflareEdgeLocation', () => {
  it('reads the colo and country from a trace response without retaining the IP', async () => {
    let requestedUrl = '';
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response('colo=NBO\nloc=KE\nip=203.0.113.10\n', { status: 200 });
    };

    const result = await getCloudflareEdgeLocation('speed.cloudflare.com', undefined, fetcher);

    assert.equal(new URL(requestedUrl).hostname, 'speed.cloudflare.com');
    assert.equal(new URL(requestedUrl).pathname, '/cdn-cgi/trace');
    assert.deepEqual(result, { colo: 'NBO', country: 'KE' });
    assert.equal(JSON.stringify(result).includes('203.0.113.10'), false);
  });

  it('returns null when trace data is unavailable or has no valid colo', async () => {
    const unavailableFetcher: typeof fetch = async () => new Response('', { status: 503 });
    const malformedFetcher: typeof fetch = async () => new Response('loc=KE\nip=203.0.113.10\n', { status: 200 });

    assert.equal(await getCloudflareEdgeLocation('speed.cloudflare.com', undefined, unavailableFetcher), null);
    assert.equal(await getCloudflareEdgeLocation('speed.cloudflare.com', undefined, malformedFetcher), null);
  });
});

describe('getAndroidFeatureState', () => {
  afterEach(() => {
    delete (globalThis as { window?: Window & { AndroidNative?: unknown } }).window;
  });

  it('reports browser mode when no Android bridge is present', () => {
    const state = getAndroidFeatureState();

    assert.equal(state.isNativeApp, false);
    assert.equal(state.hasPermission, false);
    assert.equal(state.locationEnabled, false);
    assert.equal(state.canRequestAccess, false);
    assert.equal(state.canShowWifiScanner, false);
    assert.equal(state.canRunNativePing, false);
  });

  it('blocks Wi-Fi scanner UI until permission and location services are enabled', () => {
    (globalThis as typeof globalThis & { window: Window & { AndroidNative: any } }).window = {
      AndroidNative: {
        hasWifiNamePermission: () => false,
        isLocationEnabled: () => false,
        scanWifiNetworks: () => true,
      },
    } as any;

    const state = getAndroidFeatureState();

    assert.equal(state.isNativeApp, true);
    assert.equal(state.hasPermission, false);
    assert.equal(state.locationEnabled, false);
    assert.equal(state.canRequestAccess, true);
    assert.equal(state.canShowWifiScanner, false);
  });

  it('enables Wi-Fi scanner UI only when the native permission state is ready', () => {
    (globalThis as typeof globalThis & { window: Window & { AndroidNative: any } }).window = {
      AndroidNative: {
        hasWifiNamePermission: () => true,
        isLocationEnabled: () => true,
        scanWifiNetworks: () => true,
      },
    } as any;

    const state = getAndroidFeatureState();

    assert.equal(state.isNativeApp, true);
    assert.equal(state.hasPermission, true);
    assert.equal(state.locationEnabled, true);
    assert.equal(state.canRequestAccess, false);
    assert.equal(state.canShowWifiScanner, true);
  });

  it('enables native ping only when the Android bridge exposes it', () => {
    (globalThis as typeof globalThis & { window: Window & { AndroidNative: any } }).window = {
      AndroidNative: { runNativePing: () => true },
    } as any;

    assert.equal(getAndroidFeatureState().canRunNativePing, true);
  });
});
