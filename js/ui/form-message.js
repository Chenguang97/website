export function showFormMessage(message, isError = false) {
  const element = document.querySelector("#formMessage");
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "var(--red)" : "var(--green)";
}
