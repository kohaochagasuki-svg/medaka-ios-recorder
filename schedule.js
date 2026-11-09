export const DURATION = 30 * 60 * 1000;
export const LATE_LIMIT = 30 * 1000;
const JST = 9 * 60 * 60 * 1000;
export function dailySlots(now) {
  const d = new Date(now + JST);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - JST;
  return [9, 17].map(hour => ({ id: `daily-${midnight + hour * 3600000}`, at: midnight + hour * 3600000, duration: DURATION, kind: '毎日' }));
}
export function nextDaily(now) {
  return [...dailySlots(now), ...dailySlots(now + 86400000)].find(slot => slot.at > now);
}
export function dueBetween(previous, now) {
  if (now < previous) return [];
  // A suspended browser must not replay days of old reservations.
  const from = Math.max(previous, now - 86400000);
  return [...dailySlots(from), ...dailySlots(now)].filter((slot, i, list) => slot.at > from && slot.at <= now && list.findIndex(s => s.id === slot.id) === i);
}
export function countdown(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(n => String(n).padStart(2, '0')).join(':');
}
