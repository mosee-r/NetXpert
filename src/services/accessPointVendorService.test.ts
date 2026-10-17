import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccessPointOui } from './accessPointVendorService';

test('extracts the manufacturer prefix from a standard BSSID', () => {
  assert.equal(getAccessPointOui('00:1b:63:84:45:e6'), '001B63');
});

test('rejects locally administered and multicast BSSIDs', () => {
  assert.equal(getAccessPointOui('02:1b:63:84:45:e6'), undefined);
  assert.equal(getAccessPointOui('01:1b:63:84:45:e6'), undefined);
});

test('rejects invalid and placeholder BSSIDs', () => {
  assert.equal(getAccessPointOui('not-a-bssid'), undefined);
  assert.equal(getAccessPointOui('00:00:00:00:00:00'), undefined);
  assert.equal(getAccessPointOui('ff:ff:ff:ff:ff:ff'), undefined);
});
