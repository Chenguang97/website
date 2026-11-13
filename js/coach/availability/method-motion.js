import { createLiquidSwitchMotion } from "../../ui/liquid-switch-motion.js";

let controller;

export function initializeAvailabilityMethodMotion(buttonList) {
  if (controller) return;
  controller = createLiquidSwitchMotion(buttonList, {
    id: "availability-method-liquid",
    className: "availability-method-liquid",
  });
}

export function animateAvailabilityMethod(button) {
  controller?.animate(button);
}
