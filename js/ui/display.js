import { unavailableSelection } from "../config.js";

export function formatLocationLabel(location) {
  if (location === "Any served rink") return "\u4E0D\u9650\u51B0\u573A";
  if (location === unavailableSelection) return "\u4E0D\u53EF\u9884\u7EA6";
  return location;
}

