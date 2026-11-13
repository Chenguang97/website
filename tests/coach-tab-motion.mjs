import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div><button aria-selected="true">基本资料</button><button>预约管理</button><button>开放时间</button></div>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
const root = document.querySelector('div'), buttons = [...root.querySelectorAll('button')];
let rootWidth = 348;
root.getBoundingClientRect = () => ({ left: 20, width: rootWidth, height: 56 });
const bounds = [{ left: 28, width: 108 }, { left: 140, width: 108 }, { left: 252, width: 108 }];
buttons.forEach((button, index) => { button.getBoundingClientRect = () => ({ ...bounds[index], height: 40 }); });
const desktop = { matches: true, addEventListener(_type, listener) { this.change = listener; } };
const reduced = { matches: false, addEventListener(_type, listener) { this.change = listener; } };
window.matchMedia = (query) => query.includes('min-width') ? desktop : reduced;
let now = 0, id = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
globalThis.cancelAnimationFrame = (key) => frames.delete(key);
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
const { initializeCoachTabMotion, animateCoachTab } = await import('../js/coach/tab-motion.js');
const step = (milliseconds) => {
  now += milliseconds;
  const pending = [...frames.values()]; frames.clear();
  pending.forEach((callback) => callback(now));
};
const path = () => root.querySelector('path').getAttribute('d');
const geometry = () => {
  const values = path().match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const x = values.filter((_, index) => index % 2 === 0);
  const center = (x[0] + x[1]) / 2;
  const halfWidth = Math.abs(x[4] - center);
  return { center, halfWidth, height: 2 * (44 - values[1]), tail: Math.abs(x[14] - center) - halfWidth, x };
};
const assertSameShape = (before, after, message) => {
  const values = (text) => text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const first = values(before), second = values(after);
  assert(first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) < 1e-9), message);
};
const targetCenter = (index) => (bounds[index].left - 20 + bounds[index].width / 2) * 88 / 56;
initializeCoachTabMotion(buttons);
initializeCoachTabMotion(buttons);
assert.equal(root.querySelectorAll('svg').length, 1);
assert.equal(root.querySelectorAll('ellipse').length, 0, 'top tabs have an integrated tail without detached droplets');
assert(root.classList.contains('has-liquid-tabs'));
assert(!root.querySelector('path').parentElement.hasAttribute('filter'), 'the single top-tab path uses its actual bounds without goo-filter shrinkage');
assert.equal(root.querySelector('stop').getAttribute('stop-color'), '#829174', 'top tabs reuse the confirmed sage palette');
const assertRestingCapsule = (index) => {
  const shape = geometry(), scale = 88 / 56;
  assert(Math.abs(shape.halfWidth * 2 / scale - 108) < .001, 'all three states have the same capsule width');
  assert(Math.abs(shape.height / scale - 40) < .001, 'all three states have the same capsule height and radius');
  assert(Math.abs(shape.tail) < .001, 'a settled capsule cannot retain a tail');
  assert(Math.abs((44 - shape.height / 2) / scale - 8) < .001, 'top inset is 8px');
  assert(Math.abs((88 - 44 - shape.height / 2) / scale - 8) < .001, 'bottom inset is 8px');
  if (index === 0) assert(Math.abs((shape.center - shape.halfWidth) / scale - 8) < .001, 'left endpoint retains an 8px inset');
  if (index === 2) assert(Math.abs(rootWidth - (shape.center + shape.halfWidth) / scale - 8) < .001, 'right endpoint retains an 8px inset');
  for (const [left, right] of [[2, 16], [3, 15], [4, 14], [5, 13], [6, 12]]) {
    assert(Math.abs(shape.x[left] + shape.x[right] - shape.center * 2) < .001, 'settled ends must have symmetric rounded control points');
  }
};
assertRestingCapsule(0);
for (const next of [1, 2, 0, 2, 1, 0]) {
  const from = geometry().center, to = targetCenter(next), direction = Math.sign(to - from);
  const previous = path();
  animateCoachTab(buttons[next]); step(0);
  assertSameShape(path(), previous, 'selection starts at the current shape');
  let overshoot = 0, longestTail = 0;
  for (let i = 0; i < 115; i++) {
    step(16);
    const current = geometry();
    overshoot = Math.max(overshoot, (current.center - to) * direction);
    longestTail = Math.max(longestTail, current.tail);
  }
  assert(overshoot > .5 && overshoot < Math.abs(to - from) * .07, 'restrained spring retains a smaller natural rebound');
  assert(longestTail > 2 && longestTail < 30, 'shorter tail still visibly stretches as liquid');
  step(10);
  assert.equal(frames.size, 0);
  assert(Math.abs(geometry().center - to) < .001, 'adjacent and cross-item moves end at measured positions');
  assert(Math.abs(geometry().halfWidth * 2 - bounds[next].width * 88 / 56) < .001, 'selection matches actual label width');
  assertRestingCapsule(next);
}
animateCoachTab(buttons[2]); step(199);
const priorCenter = geometry().center;
step(1);
const currentCenter = geometry().center, reversing = path();
animateCoachTab(buttons[0]); step(0);
assertSameShape(path(), reversing, 'mid-flight reversal keeps the live tail and body');
step(1);
assert(Math.abs((geometry().center - currentCenter) - (currentCenter - priorCenter)) < .05, 'reversal preserves velocity');
for (let i = 0; i < 18; i++) {
  step(25); animateCoachTab(buttons[i % 3]);
  assert.equal(frames.size, 1, 'rapid clicks replace the active flight rather than queueing');
  assert(!/NaN|Infinity/.test(path()));
}
reduced.matches = true; reduced.change();
assert.equal(frames.size, 0);
animateCoachTab(buttons[2]);
assert.equal(frames.size, 0);
assert(Math.abs(geometry().center - targetCenter(2)) < .001);
reduced.matches = false;
animateCoachTab(buttons[0], { animate: false });
assert.equal(frames.size, 0, 'restoring the saved panel does not animate');
const unchanged = path();
buttons[1].disabled = true; animateCoachTab(buttons[1]);
assert.equal(path(), unchanged);
buttons[1].disabled = false;
animateCoachTab(buttons[2]); step(80);
desktop.matches = false; desktop.change();
assert.equal(frames.size, 0);
assert(!root.classList.contains('has-liquid-tabs'), 'mobile keeps the original static tabs');
assert.equal(root.querySelector('svg').style.display, 'none');
assert.equal(buttons[0].getAttribute('aria-selected'), 'true', 'animation does not own business selection');
console.log('Coach top tab motion tests passed (equal symmetric capsules, 8px insets, adjacent/cross moves, continuous reversal, desktop scope).');
