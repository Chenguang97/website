import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div><button aria-pressed="false">即将上课</button><button aria-pressed="true">历史预约</button></div>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
let now = 0;
let id = 0;
const frames = new Map();
window.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
globalThis.cancelAnimationFrame = (key) => frames.delete(key);
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });

const { initializeBookingPeriodMotion, animateBookingPeriod } = await import(new URL("../js/coach/bookings/period-motion.js", import.meta.url));
const buttons = [...document.querySelectorAll("button")];
const path = () => document.querySelector("path").getAttribute("d");
const center = () => {
  const values = path().match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const x = values.filter((_, index) => index % 2 === 0);
  return (x[0] + x[1]) / 2;
};
const step = (milliseconds) => {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(now));
};

initializeBookingPeriodMotion(buttons);
assert.equal(center(), 270, "the liquid must respect the existing aria-pressed selection");
assert.equal(document.querySelectorAll("svg").length, 1, "the shared liquid surface mounts once");
animateBookingPeriod(buttons[0]);
step(16);
assert(center() < 270, "the history-to-upcoming direction must start moving left");
step(1834);
assert.equal(center(), 90, "the liquid must settle on upcoming");
animateBookingPeriod(buttons[1]);
step(16);
assert(center() > 90, "the upcoming-to-history direction must start moving right");
step(1834);
assert.equal(center(), 270, "the liquid must settle on history");
assert.equal(buttons[1].getAttribute("aria-pressed"), "true", "motion must leave period state ownership to booking rendering");
console.log("Booking period liquid motion tests passed (pressed state and both directions).");
