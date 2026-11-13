import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div><button aria-selected="true">日历</button><button aria-selected="false">预约列表</button></div>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
let now = 0, id = 0;
const frames = new Map();
const media = { matches: false, addEventListener(_type, listener) { this.change = listener; } };
window.matchMedia = () => media;
globalThis.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
globalThis.cancelAnimationFrame = (key) => frames.delete(key);
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
const { initializeBookingViewMotion, animateBookingView } = await import(new URL('../js/coach/bookings/view-motion.js', import.meta.url));
const buttons = [...document.querySelectorAll('button')];
const step = (milliseconds) => {
  now += milliseconds;
  const callbacks = [...frames.values()]; frames.clear();
  callbacks.forEach((callback) => callback(now));
};
const path = () => document.querySelector('path').getAttribute('d');
const assertClean = () => {
  assert.equal(frames.size, 0, 'animation loop must stop');
  document.querySelectorAll('ellipse').forEach((drop) => assert.equal(Number(drop.getAttribute('rx')), 0, 'no residual droplets'));
  assert(!/NaN|Infinity/.test(path()));
};
initializeBookingViewMotion(buttons);
const left = path();
initializeBookingViewMotion(buttons);
assert.equal(document.querySelectorAll('svg').length, 1, 'initialization is idempotent');
const readGeometry = () => {
  const values = path().match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const x = values.filter((_, index) => index % 2 === 0);
  const center = (x[0] + x[1]) / 2;
  const halfWidth = Math.abs(x[4] - center);
  return { center, halfWidth, tail: Math.abs(x[14] - center) - halfWidth, values };
};
for (const target of [1, 0]) {
  const from = target ? 90 : 270, to = target ? 270 : 90;
  animateBookingView(buttons[target]);
  let elapsed = 0, previousTail, overshot = false;
  for (const time of [16, 100, 200, 300, 335, 336, 337, 400, 500, 560, 650, 800, 1000, 1200, 1440, 1600, 1800, 1849]) {
    step(time - elapsed); elapsed = time;
    const geometry = readGeometry();
    const t = time / 1000, omega = 8.1, decay = .59 * omega;
    const frequency = omega * Math.sqrt(1 - .59 ** 2);
    const lead = 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + decay / frequency * Math.sin(frequency * t));
    assert(Math.abs(geometry.center - (from + (to - from) * lead)) < .00001, 'travel and rebound must follow the final reference spring throughout');
    if (time === 16) assert(Math.abs(geometry.center - from) > .1, 'first frame responds without a delay');
    if ((geometry.center - to) * (target ? 1 : -1) > 1) overshot = true;
    if (time >= 650 && time <= 1440) {
      if (previousTail !== undefined) assert(Math.abs(geometry.tail - previousTail) > .01, 'tail keeps changing throughout gathering');
      previousTail = geometry.tail;
      [...document.querySelectorAll('ellipse')].forEach((drop, index) => {
        assert(Number(drop.getAttribute('rx')) >= 7.5 - index * 1.5 - .01, 'droplets keep their volume instead of fading or shrinking away');
        if (time === 1440) assert(Math.abs(Number(drop.getAttribute('cx')) - geometry.center) + Number(drop.getAttribute('rx')) < geometry.halfWidth - 8, 'droplets are fully enclosed before cleanup');
      });
    }
  }
  assert(overshot, 'inertia naturally carries the body past the destination');
  const before = readGeometry();
  step(1); assertClean();
  assert(['center', 'halfWidth', 'tail'].every((key) => Math.abs(readGeometry()[key] - before[key]) < .05), 'cleanup must not cause a visible outline jump');
}
// Reverse while both the body and trailing liquid are moving.
animateBookingView(buttons[1]); step(259);
const previousCenter = readGeometry().center;
step(1);
const liveOutline = path(), liveCenter = readGeometry().center;
animateBookingView(buttons[0]); step(0);
assert.equal(path(), liveOutline, 'reversal must not reset the current outline');
step(1);
assert(Math.abs((readGeometry().center - liveCenter) - (liveCenter - previousCenter)) < .03, 'reversal retains the current velocity instead of restarting the movement');
step(1849); assertClean();
animateBookingView(buttons[1]); step(650);
const gatheringOutline = path();
const gatheringDrops = [...document.querySelectorAll('ellipse')].map((drop) => drop.outerHTML);
animateBookingView(buttons[0]); step(0);
assert.equal(path(), gatheringOutline, 'reversing during gathering preserves the live outline');
assert.deepEqual([...document.querySelectorAll('ellipse')].map((drop) => drop.outerHTML), gatheringDrops);
for (let i = 0; i < 20; i++) {
  step(37); animateBookingView(buttons[i % 2]);
  assert.equal(frames.size, 1, 'rapid clicks keep one animation loop');
  assert.equal(document.querySelectorAll('ellipse').length, 3, 'droplets do not accumulate');
  assert(!/NaN|Infinity/.test(path()));
}
step(1850); assertClean();
animateBookingView(buttons[0]); step(80);
media.matches = true; media.change(); assertClean();
assert.equal(path(), left, 'reduced motion immediately settles the latest target');
animateBookingView(buttons[1]); assertClean();
assert.notEqual(path(), left);
assert.equal(buttons[0].getAttribute('aria-selected'), 'true', 'decoration leaves business selection to existing navigation');
console.log('Booking liquid motion tests passed (reference spring, velocity continuity, gathering, interruptions, reduced motion).');
