// Confirmed liquid surface and continuous spring shared by coach switch controls.
export const LIQUID_DURATION = 1.85;
const OMEGA = 8.1;
const FORCE = 1.2;
const SVG_NS = "http://www.w3.org/2000/svg";
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const mix = (from, to, progress) => from + (to - from) * progress;

function node(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

// One outline, including the rear: the tail never meets a separately drawn body.
export function liquidOutline({ center, width, height, tail }) {
  const direction = Math.sign(tail) || 1;
  const length = Math.abs(tail);
  const h = height / 2, w = width / 2, k = .55228475;
  const shoulder = -w + h, tip = -w - length;
  const stretch = smooth(length / 35);
  const radius = mix(h, 13, stretch);
  const pt = (x, y) => `${center + direction * x} ${44 + y}`;
  return `M ${pt(shoulder, -h)} L ${pt(w - h, -h)}
    C ${pt(w - h + k * h, -h)} ${pt(w, -k * h)} ${pt(w, 0)}
    C ${pt(w, k * h)} ${pt(w - h + k * h, h)} ${pt(w - h, h)} L ${pt(shoulder, h)}
    C ${pt(shoulder - h * .45 * stretch - length * .08, h)} ${pt(tip + radius + length * .22, mix(h, h * .78, stretch))} ${pt(tip + radius, radius)}
    C ${pt(tip + radius * (1 - k), radius)} ${pt(tip, k * radius)} ${pt(tip, 0)}
    C ${pt(tip, -k * radius)} ${pt(tip + radius * (1 - k), -radius)} ${pt(tip + radius, -radius)}
    C ${pt(tip + radius + length * .22, -mix(h, h * .78, stretch))} ${pt(shoulder - h * .45 * stretch - length * .08, -h)} ${pt(shoulder, -h)} Z`;
}

export function createLiquidSpring(from, to, speed = 0, dampingRatio = .59) {
  const damping = dampingRatio * OMEGA;
  const frequency = OMEGA * Math.sqrt(1 - dampingRatio ** 2);
  const error = from - to;
  const sineCoefficient = (speed + damping * error) / frequency;
  return (time) => {
    const envelope = Math.exp(-damping * time);
    const cosine = Math.cos(frequency * time), sine = Math.sin(frequency * time);
    const displacement = error * cosine + sineCoefficient * sine;
    return { center: to + envelope * displacement,
      velocity: envelope * (-damping * displacement - error * frequency * sine + sineCoefficient * frequency * cosine) };
  };
}

export function liquidBody(time, velocity, direction, amplitude, { deformation = 1, tailScale = 1 } = {}) {
  const normalizedVelocity = velocity * direction / 180;
  const bounce = normalizedVelocity / 4.1 * FORCE * deformation;
  const pinch = Math.sin(Math.PI * clamp(time / .58));
  const length = Math.max(0, 68 * smooth(time / .15) * Math.exp(-Math.max(0, time - .15) * 2.5) * amplitude
    + normalizedVelocity * 2 * FORCE) * (1 - smooth((time - 1.55) / .30)) * tailScale;
  return { width: 164 - 22 * Math.max(0, pinch) * amplitude * deformation + bounce * 15,
    height: 68 - bounce * 8, tail: direction * length };
}

export function createLiquidSurface({ id, className, width = 360, droplets = 3 }) {
  const svg = node("svg", { viewBox: `0 0 ${width} 88`, "aria-hidden": "true", focusable: "false", class: className });
  const defs = node("defs");
  const gradient = node("linearGradient", { id: `${id}-color`, x1: "0", y1: "0", x2: ".25", y2: "1" });
  gradient.append(node("stop", { offset: "0%", "stop-color": "#829174" }), node("stop", { offset: "100%", "stop-color": "#68795c" }));
  const filter = node("filter", { id: `${id}-merge`, x: "-60%", y: "-100%", width: "220%", height: "300%", "color-interpolation-filters": "sRGB" });
  filter.append(node("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "2" }), node("feColorMatrix", { values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" }));
  defs.append(gradient, filter);
  const group = node("g", { fill: `url(#${id}-color)`, filter: `url(#${id}-merge)` });
  const path = node("path");
  const beads = Array.from({ length: droplets }, () => node("ellipse", { rx: "0", ry: "0" }));
  group.append(path, ...beads);
  svg.append(defs, group);
  return { svg, path, beads };
}
