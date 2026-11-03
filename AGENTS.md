# Development guidelines

## Module architecture

- All production JavaScript uses native ES Modules with explicit `import`/`export` declarations.
- Each HTML page loads exactly one role or page entry module. Do not restore ordered classic-script lists, global compatibility installers, or hidden foreign-role DOM.
- Keep dependencies one-way: configuration and pure rules → demo/storage/data → state → UI/actions → initialization → entries.
- Keep `js/domain/` independent from DOM, browser storage, and mutable application state.
- Keep demo fixtures in `js/demo-data.js`, browser storage access in `js/storage-adapter.js`, serialization/recovery in `js/data-store.js`, and runtime mutable state in `js/state.js`.
- Do not expose production functions or state on `window`/`globalThis`. Tests may create a test-only bridge in their generated entry.
- Avoid circular imports. If two modules need each other, move the shared rule or status boundary to the lowest cohesive module instead of adding a callback registry or compatibility global.

## State and UI

- Use the state module's named operations for collection replacement, persistence, saved profiles, and profile drafts. Do not create parallel mutable copies in DOM attributes or page modules.
- Keep rendering, event handling, business rules, and persistence separate. Rendering must not save data; storage adapters must not manipulate the DOM.
- Preserve storage keys, data formats, URLs, query parameters, booking rules, and public behavior unless a task explicitly changes them.
- Preserve desktop appearance and interaction during structural refactors. Treat responsive/mobile changes as a separate scope.
- Maintain shared visual rules in `css/design-system.css`; keep page-specific layout in the existing page stylesheets.
- Render editable or external text with `textContent`/DOM APIs where practical, otherwise use `js/ui/safe-html.mjs`.

## Change and verification discipline

- Make structural changes by complete dependency boundary or page entry; do not leave legacy and replacement implementations in parallel.
- Add or update behavior-focused tests when moving a boundary. Avoid tests that only mirror implementation details.
- After structural changes run `npm test`, syntax checks, entry bundling and cycle detection, and `git diff --check`.
- Manually verify affected desktop pages and primary interactions in a real browser.
- Preserve unrelated user changes and report anything not verified.
