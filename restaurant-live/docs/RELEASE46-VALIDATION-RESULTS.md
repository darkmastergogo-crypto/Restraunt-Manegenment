# Release 46 refinement validation

## Completed in the managed workspace

The supplied Release46 source was refined in `/home/ubuntu/restaurantplatform` without changing the Appwrite service contract. The default palette for new tenants is now warm paper, ink, terracotta, green status, and red error tones. Existing saved dark tenant palettes continue to activate the legacy dark presentation through palette luminance detection. Each tenant's configured brand logo continues to render in the menu/staff header and is now also applied as the runtime favicon and Apple touch icon when available.

The new `public/modern-shell.css` is the documented final presentation layer. It improves the owner provisioning console, customer menu/checkout shell, kitchen/staff rail, waiter workspace, cards, controls, focus states, dialogs, responsive behavior, and reduced-motion behavior. Appwrite request paths, backend authorization, tenant isolation, MFA rules, QR/table relationships, PWA registration, push flows, and existing feature gates were not replaced.

## Checks

- `npm test`: **81 passed, 0 failed**.
- `npm run check`: **passed**; 41 JavaScript files checked and shared schema copies match.
- `npm run build`: **passed**; static site generated in `dist/` and Function archive generated at `build/restaurant-function.tar.gz`.
- `GET /manus-routes.json`: **200** with owner, menu, admin, kitchen, and waiter route declarations.
- Local demo server: **200** for owner and customer routes on the managed Preview port.
- Visual inspection: owner, customer menu, staff/kitchen, and waiter screens inspected at desktop width; customer, owner, staff, and waiter screens inspected at 390px mobile width.

## Delivery notes

The application is still a source release, not a live production deployment. Appwrite Sites provisioning, real production domains, authentication platform registration, real-device PWA installation, and locked-phone push delivery still require the staging acceptance steps in `docs/APPWRITE-SITES-SETUP.md`.

The uploaded ZIP is source-complete and excludes `node_modules`, `.git`, local secrets, and transient build state. The public manifest keeps role-specific local icon files as the safe fallback; a configured restaurant logo is used immediately in the live app header/favicon/touch icon. A deployment rebuild is still required if the platform wants a static store icon embedded directly in an Appwrite Site manifest.
