import { createControlScope } from "./control-lifecycle.js";

const owners = new WeakMap();

export function initializeInputModality(documentRoot = document) {
  const existing = owners.get(documentRoot);
  if (existing) return existing;

  const root = documentRoot.documentElement;
  const scope = createControlScope();
  let destroyed = false;
  root.dataset.inputModality = "pointer";

  scope.listen(documentRoot, "keydown", () => {
    if (!destroyed) root.dataset.inputModality = "keyboard";
  }, true);
  scope.listen(documentRoot, "pointerdown", () => {
    if (!destroyed) root.dataset.inputModality = "pointer";
  }, true);

  const controller = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scope.destroy();
      // Keep the last value, including any value written by another module.
      if (owners.get(documentRoot) === controller) {
        owners.delete(documentRoot);
      }
    },
  };
  owners.set(documentRoot, controller);
  return controller;
}
