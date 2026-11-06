import { rinkColors } from "../core/config.js";

export function getRinkColor(location) {
  return rinkColors[location] || "#bbf7d0";
}

export function getBookedRinkColor(location) {
  const bookedColors = {
    "Polar Ice Rink": "#22c55e",
    "Arcadia Ice Arena": "#3b82f6",
    "Oceanside Ice Arena": "#f59e0b",
    "Any served rink": "#8b5cf6",
    Zoom: "#0ea5e9",
  };
  return bookedColors[location] || "#22c55e";
}
