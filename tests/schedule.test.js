import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySlots, nextDaily, dueBetween, countdown, DURATION } from '../schedule.js';
const at = value => Date.parse(value);
test('JST daily slots are independent of host timezone', () => {
  assert.deepEqual(dailySlots(at('2026-11-09T08:59:59+09:00')).map(s => s.at), [at('2026-11-09T09:00:00+09:00'), at('2026-11-09T17:00:00+09:00')]);
  assert.equal(DURATION, 1800000);
});
test('next reservation crosses day, month and year', () => {
  assert.equal(nextDaily(at('2026-12-31T17:00:00+09:00')).at, at('2027-01-01T09:00:00+09:00'));
  assert.equal(nextDaily(at('2026-11-09T09:00:00+09:00')).at, at('2026-11-09T17:00:00+09:00'));
});
test('crossing a boundary returns one occurrence and never repeats it', () => {
  const t = at('2026-11-09T09:00:00+09:00');
  assert.equal(dueBetween(t-500, t+500).length, 1);
  assert.equal(dueBetween(t+500, t+1000).length, 0);
  assert.equal(dueBetween(t, t-1000).length, 0);
});
test('both periods, midnight and suspension', () => {
  assert.equal(dueBetween(at('2026-11-09T08:00:00+09:00'), at('2026-11-09T18:00:00+09:00')).length, 2);
  assert.equal(dueBetween(at('2026-11-09T23:00:00+09:00'), at('2026-11-10T09:00:00+09:00')).length, 1);
  assert.ok(dueBetween(at('2026-11-01T00:00:00Z'), at('2026-11-20T00:00:00Z')).length <= 2);
});
test('countdown rounds up and never goes negative', () => {
  assert.equal(countdown(1), '00:00:01'); assert.equal(countdown(-50), '00:00:00'); assert.equal(countdown(3661000), '01:01:01');
});
