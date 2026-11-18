export function showFormMessage(element, message, isError = false, successColor = "var(--green)") {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "var(--red)" : successColor;
}
