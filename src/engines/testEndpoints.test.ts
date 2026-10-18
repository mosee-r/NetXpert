import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { getAndroidFeatureState } from './testEndpoints';

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
