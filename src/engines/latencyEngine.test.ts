import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateJitterMs } from './latencyEngine';

test('calculateJitterMs ignores transient outliers and keeps jitter near the normal range', () => {
  const jitter = calculateJitterMs([74, 78, 76, 79, 340, 77, 75, 78]);

  assert.ok(jitter >= 0 && jitter <= 10, `Expected jitter to stay low despite an outlier, got ${jitter} ms`);
});
