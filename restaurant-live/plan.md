# Restaurant Platform Release 46 — visual refinement plan

## Scope and implementation approach

This is a visual and information-architecture refinement of the supplied Release46 source, not a backend rewrite. The existing plain HTML/CSS/JavaScript architecture remains the source of truth. Appwrite Function calls, authentication/MFA, role gates, tenant slug routing, request idempotency, QR/table credentials, PWA manifests, push registration, customer ordering, kitchen/waiter workflows, and owner provisioning remain in place.

The work is limited to:

- porting the uploaded source into the managed workspace;
- making new restaurants start with a clean, light, editorial restaurant UI while preserving existing saved tenant themes;
- consolidating shared visual tokens in the existing schema and a single documented final shell stylesheet;
- improving responsive structure, spacing, typography, focus states, controls, cards, tables, drawers, and owner provisioning presentation;
- ensuring each restaurant keeps its own logo/brand values and role-specific installable app identities;
- adding a route manifest required by the managed Preview workflow;
- updating documentation and packaging the complete source as a downloadable ZIP.

No Appwrite collection, Function, permission, secret, or production deployment change is made by this task.

## Design direction

Three possible directions were considered: quiet editorial bistro (0.07), dark neon kitchen console (0.05), and playful market menu (0.04). The selected direction is **quiet editorial bistro**.

- **Design movement:** contemporary hospitality editorial, using warm paper surfaces, crisp ink typography, restrained terracotta accents, and compact utility chrome.
- **Core principles:** calm hierarchy, fast scanning, visible system state, generous touch targets, and tenant-owned branding.
- **Color philosophy:** a warm paper background makes food imagery and restaurant logos feel intentional; ink provides confident readability; terracotta is reserved for action and hospitality cues; green/red remain reserved for system status.
- **Layout paradigm:** a flexible workspace with a narrow utility rail for staff, a focused menu canvas for guests, and responsive drawers/panels rather than a generic centered dashboard grid.
- **Signature elements:** editorial serif display moments, terracotta active rails/pills, and quiet paper-like panels with thin warm borders.
- **Interaction philosophy:** every action keeps its current data and permission behavior, but gives a clearer visual affordance, focus state, busy state, or status explanation.
- **Animation:** no decorative motion; use short, reduced-motion-safe transitions for active states, drawers, and feedback only.
- **Typography system:** bundled Plus Jakarta Sans remains the utility/UI family; Georgia/Times is used only for customer-facing display headings so existing offline-safe font behavior is preserved.
- **Brand essence:** a dependable shared restaurant operating system that lets each venue feel like itself; calm, precise, hospitable.
- **Brand voice:** concise and reassuring. Example lines: “A clearer service board for every shift.” and “Your menu is ready when your guests are.”
- **Wordmark & logo:** preserve each restaurant’s uploaded logo as the primary mark; when absent, use a compact initial mark rather than inventing a new client identity.
- **Signature brand color:** terracotta `#b85c3a`, used as the platform default action color and still fully replaceable through restaurant theme settings.

## Project structure

- `public/app.mjs`: existing route selection, Appwrite API adapter, rendering, owner provisioning, customer menu, kitchen, waiter, customization, and PWA integration; behavior is preserved.
- `public/schema.mjs`: shared defaults and customization catalog; default palette is refreshed for new tenants while tenant overrides remain supported.
- `public/style.css`: base tokens and accessibility-safe primitives.
- `public/appearance.css`: existing compatibility bridge for the Release44 visual stack.
- `public/modern-shell.css`: one final, documented visual system layer for the quiet editorial bistro treatment and responsive shell refinements.
- `public/original/`: retained reference CSS assets required by existing screens and feature-specific selectors.
- `public/install-app.mjs`, `*.webmanifest`, `push-sw.js`, `push-client.mjs`: retained PWA and notification surfaces.
- `functions/restaurant-api/`: retained Appwrite Function source and tenant-scoped service layer.
- `scripts/build-site.mjs`: retained owner/restaurant static build and per-restaurant identity generation.
- `docs/`: updated release notes, validation evidence, and deployment caveats.

## Feature-preservation matrix

| Existing screen/feature | Current implementation | Visual replacement | Behaviour to preserve | Evidence/check |
|---|---|---|---|---|
| Customer menu and checkout | `public/app.mjs` menu render + cart drawer | Editorial menu header, category rail, dish cards, responsive checkout drawer | QR/table visit, menu filters, portions, stock, notes, totals, retry/idempotency, confirmation | Existing tests + `npm test` + local UI smoke |
| Kitchen/admin | staff render + original nav | Calm staff shell, clearer rail, compact live-state header, readable order cards | Role/MFA, orders, billing, records, analytics, requests, tables, devices, menu, stocks, management, notifications | Existing tests + `npm test` |
| Waiter interface | private capability route | Split-pane desktop and sectioned mobile workspace | Private access, requests, order visibility/actions, waiter permissions | Existing tests + layout audit |
| Requests/music | customer and counter actions → Function → request board | Status cards and accessible filters | restaurant-scoped persistence, idempotency, call waiter, music queue, handling actions | Existing request tests |
| Tables/QR | stable table IDs plus display names and QR credentials | cleaner table cards and QR actions | renames keep IDs/QR/order relationships; rotation stays explicit | Release46 tests |
| Customization | Management editor from schema/catalog | organized brand/theme/receipt/text/visibility sections | logo, text, colors, bill fields, feature visibility, protected controls and permissions | schema/build checks |
| Owner platform | `/admin` owner console | branded overview cards, clearer provisioning state and copyable links | create restaurant, separate Appwrite site, menu/admin/kitchen URLs, owner-only access | owner UI smoke + static builds |
| PWA / notifications | role-specific manifests, service worker, push opt-in | refreshed manifest colors and install wording styling | no secrets in public manifest, HTTPS assumptions, push remains separate from install | manifest/build checks |

## Delivery workflow

1. Run diagnostics registration for JavaScript, CSS, HTML, and JSON where supported.
2. Apply source changes without touching server secrets or production data.
3. Run `npm test`, `npm run check`, `npm run build`, and existing UI/layout scripts where their local dependencies are available.
4. Start the existing local demo server and inspect customer, kitchen, waiter, and owner routes at desktop/mobile widths.
5. Fix confirmed regressions only; do not claim hosted Appwrite, real-device PWA installation, or locked-phone push delivery without those environments.
6. Save a managed checkpoint and package the full project source into a ZIP, excluding `node_modules`, `.git`, and local secret files.
