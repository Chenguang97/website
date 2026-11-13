import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div class="method-switch liquid-switch availability-method-switch"><button aria-selected="true">日历</button><button aria-selected="false">下拉选择</button></div>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
let now = 0;
let id = 0;
const frames = new Map();
const media = { matches: false, addEventListener(_type, listener) { this.change = listener; } };
window.matchMedia = () => media;
globalThis.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
globalThis.cancelAnimationFrame = (key) => frames.delete(key);
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });

const { initializeAvailabilityMethodMotion, animateAvailabilityMethod } = await import(new URL("../js/coach/availability/method-motion.js", import.meta.url));
const root = document.querySelector("div");
const buttons = [...document.querySelectorAll("button")];
const step = (milliseconds) => {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(now));
};
const path = () => root.querySelector("path").getAttribute("d");
const center = () => {
  const values = path().match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const x = values.filter((_, index) => index % 2 === 0);
  return (x[0] + x[1]) / 2;
};

initializeAvailabilityMethodMotion(buttons);
assert.equal(root.querySelectorAll("svg").length, 1, "the shared liquid surface must mount once");
assert.equal(center(), 90, "calendar must use the confirmed left resting geometry");
animateAvailabilityMethod(buttons[1]);
step(16);
assert(center() > 90, "calendar-to-dropdown motion must begin rightward");
step(1834);
assert.equal(center(), 270, "dropdown must use the confirmed right resting geometry");
animateAvailabilityMethod(buttons[0]);
step(16);
assert(center() < 270, "dropdown-to-calendar motion must begin leftward");
media.matches = true;
media.change();
assert.equal(frames.size, 0, "reduced motion must settle without a running frame");
assert.equal(center(), 90, "reduced motion must preserve the confirmed left geometry");
assert.equal(buttons[0].getAttribute("aria-selected"), "true", "motion must not own business selection");
console.log("Availability method liquid motion tests passed (shared geometry, both directions, reduced motion).");
