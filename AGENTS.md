# Development guidelines

## Design principles

- Favor high cohesion and low coupling: keep related responsibilities together and dependencies explicit.
- Maintain shared values, rules, and reusable UI in one appropriate place. Avoid duplicated implementations and scattered hardcoded values.
- Prefer simple, readable solutions. Extract abstractions for clear responsibilities or actual reuse, not speculative future needs.
- Follow existing conventions; improve relevant boundaries without expanding into unrelated refactors.

## Module architecture

- Use native ES Modules with explicit imports and exports. Each HTML page loads one page or role entry module.
- Do not restore ordered classic-script lists, compatibility globals, or hidden foreign-role DOM.
- Keep domain rules independent of DOM, browser storage, and mutable application state. Bind pure scheduling rules to runtime state only in `js/core/scheduling-rules.js`.
- Keep dependencies acyclic. Resolve cycles by clarifying ownership or extracting a cohesive shared module.
- Keep demo fixtures in `js/core/demo-data.js`, storage access in `js/core/storage-adapter.js`, serialization/recovery in `js/core/data-store.js`, and shared application state in `js/core/state.js`.
- Keep role initialization in `js/coach/app.js`, `js/student/app.js`, and `js/admin/app.js`; keep scoped DOM references under `js/dom/`. Do not create a cross-role DOM aggregate.
- Keep coach profile, bookings, and availability implementations under their matching `js/coach/` feature directories. Do not restore root-level catch-all render, action, navigation, or undo modules.
- Do not expose production functions or state on `window`/`globalThis`. Test-only bridges belong exclusively to the test harness.

## State and UI

- Give each state a single owner. Use named state operations for shared business data, saved profiles, and editing drafts. Keep the applied coach-booking student filter in `js/coach/bookings/filter-state.js` and its search/open/draft UI state in `js/coach/bookings/student-picker.js`.
- Keep transient UI state local when appropriate. Do not duplicate the same business state across modules or DOM attributes.
- Keep rendering, event handling, business rules, and persistence responsibilities distinct. Rendering must not save data; storage adapters must not manipulate DOM.
- Keep editing drafts separate from saved data and follow the established save/cancel behavior.
- Maintain shared visual rules in `css/design-system.css` and page-specific layouts in the relevant page stylesheets.
- Render editable or external text with `textContent`/DOM APIs where practical; otherwise use `js/ui/safe-html.mjs`.

## Change and verification

- Preserve existing behavior, URLs, storage compatibility, and UI except where the task explicitly requests changes.
- Preserve unrelated user changes. Treat mobile work as separate scope unless requested.
- Refactor in working, verifiable steps. Remove superseded code when its replacement is complete; do not leave parallel implementations indefinitely.
- Match verification to the change. For structural changes, run `npm test`, syntax checks, entry bundling, cycle detection, and `git diff --check`.
- Add or update behavior-focused tests for changed rules and important regression risks; avoid tests that merely mirror implementation.
- Verify affected desktop UI and primary interactions in a real browser. Report any verification limits.
