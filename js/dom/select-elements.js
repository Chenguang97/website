export function selectElements(selectors, allSelectors = {}) {
  return Object.fromEntries([
    ...Object.entries(selectors).map(([name, selector]) => [name, document.querySelector(selector)]),
    ...Object.entries(allSelectors).map(([name, selector]) => [name, document.querySelectorAll(selector)]),
  ]);
}
