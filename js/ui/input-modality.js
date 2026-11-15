export function initializeInputModality() {
  const root = document.documentElement;
  root.dataset.inputModality = "pointer";
  document.addEventListener("keydown", () => {
    root.dataset.inputModality = "keyboard";
  }, true);
  document.addEventListener("pointerdown", () => {
    root.dataset.inputModality = "pointer";
  }, true);
}
