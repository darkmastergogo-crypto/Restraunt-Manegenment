# Release 46 visual refinement outcomes

## 1. Source and architecture preserved

- The uploaded Release46 source remains the source of truth.
- The app stays plain HTML/CSS/JavaScript and keeps the existing Appwrite Function/API integration, tenant routing, authentication/MFA flow, role checks, and security boundaries.
- No service key, VAPID private key, environment secret, or production credential is copied into public code.

## 2. Customer menu and checkout remain connected

- Restaurant branding, custom logo, tagline, table identity, QR visit validation, categories, search, dietary filters, recommendation/best-seller states, dish images/descriptions, portions/prices, availability, quantities, cart, customer name, kitchen instructions, configured tax, order submission, retry/idempotency, confirmation, tracking, history, cancellation, receipts, Call waiter, music requests, review links, footer, and honest failure states remain wired to the existing source behavior.
- The maximum two unaccepted pending orders per customer browser/device per restaurant remains a server-enforced rule; accepting one frees a slot.

## 3. Kitchen, waiter, requests, tables, and management remain authorized

- Kitchen retains pending/open order lists, accept/reject/serve/undo behavior, billing, receipts/printing, records, analytics, requests, tables/QR, customer devices, menu, stocks, staff/restaurant management, notification controls, account/sign-out, and authorized owner links.
- Waiter retains private-link/account access, request handling, permitted order visibility/actions, optional billing, restaurant isolation, and role restrictions.
- Customer/counter actions continue through backend validation into restaurant-scoped requests, authorized handling, and refreshed status.
- Stable table IDs, QR credentials, printed QR usability, order relationships, and historical snapshots survive display-name changes.

## 4. Customization and tenant branding are visible and safe

- Admin Management continues to expose brand name/tagline/logo/favicon/hero, colors, font, radius/density, receipt identity/content/visibility fields, tax/behavior controls, contact/links, text overrides, and feature/module visibility according to the existing catalog and owner entitlements.
- Hiding a feature or label remains presentation/entitlement-aware and does not delete data or bypass protected controls.
- Each restaurant keeps its own logo, app name, colors, manifest identity, and menu/admin/kitchen URLs.

## 5. Visual system is refined

- New restaurants use the quiet editorial bistro default: warm paper background, crisp ink, terracotta actions, readable status colors, bundled fonts, no external font dependency, and responsive touch-friendly controls.
- Existing saved tenant themes continue to render through their configured tokens.
- Customer menu, checkout, kitchen, waiter, requests, tables, management, and owner provisioning receive consistent spacing, typography, borders, focus states, empty states, and mobile layouts.
- Decorative motion is restrained and reduced-motion-safe.

## 6. PWA, packaging, and documentation are complete

- Role-specific manifests, app installation help, service worker registration, background push opt-in, and offline connection-required behavior remain in place.
- `manus-routes.json` is served as a static route declaration for managed Preview.
- `npm test`, `npm run check`, and `npm run build` are run and documented with honest limitations.
- A complete source ZIP is produced without local secrets or dependency folders. Hosted Appwrite deployment, real-device installation, and locked-phone push delivery are not claimed unless actually performed.
