# Restaurant Platform Release 46 — Design Specification

## 1. Design overview

Restaurant Platform Release 46 is a multi-restaurant ordering and operations system. The design must make every restaurant feel like its own digital venue while keeping the shared product dependable, fast to scan, and easy to operate during service.

The refined interface follows a **quiet editorial bistro** direction: warm paper-like surfaces, confident ink typography, restrained terracotta actions, clear status colors, generous touch targets, and restaurant-owned branding. It is intentionally calmer than a conventional restaurant dashboard and more structured than a decorative food-ordering site.

The design serves four connected experiences:

1. The customer menu and checkout journey.
2. The kitchen and restaurant staff workspace.
3. The private waiter display.
4. The platform-owner restaurant provisioning console.

All experiences use the same underlying tenant and permission model, but each has a different information priority.

## 2. Product design principles

### Calm hierarchy

The interface should show the most important action or state first. Customers should see the restaurant identity, menu, filters, and cart path without distraction. Staff should see order state, requests, and service actions immediately. Platform owners should see restaurant status, provisioning progress, and links without navigating through unnecessary detail.

### Hospitality without decoration overload

Warm surfaces and editorial type create a welcoming atmosphere, but decoration must never compete with food names, prices, order states, or operational actions. Motion is limited to feedback and state changes.

### Tenant identity is primary

Restaurant name, logo, tagline, favicon, colors, receipt identity, menu text, and supported visibility settings belong to each restaurant. The shared platform provides the system structure; the restaurant supplies the personality.

### Operational clarity

Statuses must be understandable without relying on color alone. Pending, accepted, served, cancelled, blocked, low-stock, and request states should use text labels, clear contrast, and recognizable placement.

### Safe and reversible interaction

Buttons must communicate whether an action is reversible, destructive, or still processing. Saving, accepting, rejecting, serving, blocking, rotating QR credentials, and provisioning websites must preserve existing backend validation and display honest success or failure feedback.

## 3. Visual language

### Color system

The default new-tenant palette is light and warm:

| Token | Default | Purpose |
|---|---:|---|
| `background` | `#f7f4ef` | Main page background and quiet reading space |
| `surface` | `#fffdf9` | Cards, panels, drawers, and primary content areas |
| `raised` | `#eee9e1` | Hero areas, selected filters, grouped controls, and elevated utility surfaces |
| `text` | `#262521` | Primary headings, labels, prices, and actions |
| `muted` | `#6e6a62` | Descriptions, timestamps, helper text, and secondary metadata |
| `accent` | `#b85c3a` | Primary action, active navigation, brand emphasis, and links |
| `accentText` | `#fffaf5` | Text on accent-colored buttons and active states |
| `border` | `#ded8cf` | Dividers, input boundaries, card edges, and focus-adjacent structure |
| `danger` | `#b64239` | Rejection, cancellation, invalid data, and destructive warnings |
| `success` | `#27795d` | Live connection, completed action, served order, and healthy status |

Restaurant-specific theme values may override the defaults through the existing customization system. Existing saved dark palettes continue to render as dark experiences. The application determines whether the modern light layer should activate from the configured background luminance rather than assuming every tenant uses the default palette.

Color should not be the only status signal. Every status should also include a readable label, icon, or position in a known workflow.

### Typography

The interface uses two complementary families:

- **Utility/UI family:** the bundled Plus Jakarta Sans or configured system-compatible font for navigation, forms, buttons, labels, tables, and operational content.
- **Display family:** Georgia, Times New Roman, or the configured editorial serif for customer-facing hero headings, owner page headings, and major staff section titles.

Type hierarchy:

| Level | Usage | Guidance |
|---|---|---|
| Display | Customer hero, owner overview | Large, compact, editorial, strong negative tracking |
| Page heading | Pending Orders, All restaurants, Our menu | Clear and prominent; avoid excessive uppercase |
| Section heading | Menu groups, request groups, management sections | Strong but compact |
| Card heading | Dish name, restaurant name, order title | Scannable and action-adjacent |
| Utility label | Status, metadata, field labels | Small, high-contrast, never overly compressed |
| Helper text | Descriptions, timestamps, setup guidance | Muted but readable, not below accessible contrast |

### Shape and radius

The default interface uses medium rounded corners rather than fully rounded controls everywhere:

- Cards and major panels: 18–22px.
- Hero surfaces and large drawers: 20–26px.
- Inputs and standard buttons: 10–12px.
- Status pills and compact badges: fully rounded.
- Customer category filters: rounded pills where the control is a category selector.

The existing `radius` customization value remains supported. Components should use the configured value instead of hardcoding a single global radius when the feature-specific stylesheet already exposes a token.

### Borders and elevation

Borders are warm and subtle. Cards should be separated primarily through surface changes and spacing, with borders providing structure. Shadows are soft and low contrast:

- Small elevation: `0 8px 24px rgba(48, 38, 26, 0.07)`.
- Medium elevation: `0 18px 46px rgba(48, 38, 26, 0.11)`.

Avoid heavy black shadows, glossy gradients, and decorative glass effects that reduce readability.

## 4. Shared shell

### Global banner

The local/demo or connection banner sits at the top of the page in a quiet raised strip. It must remain visible when relevant, but it should not compete with the restaurant header. Production copy must accurately describe connection state and must not imply that local demo data is production data.

### Focus and interaction states

All interactive controls require a visible keyboard focus state. The default focus treatment is a three-pixel accent-colored outline with a small offset. Hover states may add a light surface change and modest elevation, but hover must never be the only indication of interaction.

Buttons need a minimum touch height of 44px. Inputs use a minimum height of 46px. Disabled controls retain readable contrast and explain why the action is unavailable where appropriate.

### Notifications and feedback

Toasts are short-lived confirmation or error messages. They should appear as high-contrast rounded notices and must not contain sensitive customer or order data. Persistent errors belong near the affected control or content area.

Dialogs use the shared modal surface, warm border, backdrop dimming, and clear close action. Checkout is a drawer-style modal because it represents a continuing task rather than an unrelated interruption.

## 5. Customer experience

### Customer header

The customer header uses a sticky, lightly translucent surface on the modern light theme. It contains:

- Restaurant logo or initial mark.
- Restaurant name in display typography.
- Tagline or short brand line.
- Install app action where supported.
- Table identity or scan-table prompt.
- Call waiter action where enabled.
- Order status/history action where enabled.

The header must keep the restaurant identity visible as the customer scrolls. On mobile, utility actions may wrap to a second row rather than becoming too small to tap.

### Hero section

The customer hero introduces the menu without presenting a generic marketing landing page. It uses:

- A small eyebrow such as “Fresh ingredients · bold flavors”.
- A large restaurant/menu heading.
- A short description.
- Optional music request action.
- Optional tenant-configured hero image.

The hero should feel like a menu cover: editorial, warm, and focused. It should not push the actual menu too far below the fold.

### Category and filter area

The browse area provides category filters, best-seller/recommended filters, search, dietary filtering, and any supported availability controls. Categories should be horizontally scrollable on narrow screens and remain easy to identify as selected or unselected.

Search should preserve the customer’s input while filtering the visible menu. Empty states should explain that no dishes match the current filters and should provide a clear way to broaden the search.

### Dish cards

Dish cards prioritize the following information in order:

1. Dietary indicator.
2. Dish name.
3. Recommended or best-seller label.
4. Description.
5. Optional photograph.
6. Portion/size choices.
7. Price.
8. Add or quantity controls.

Cards use a clean paper surface and a light border. The add action is visually strong but should not overpower the dish name or price. When a dish is unavailable, the card must communicate sold-out state instead of silently removing context when the feature configuration allows the item to remain visible.

Dish images are optional and must preserve the restaurant’s configured image. Images should use `alt` text derived from the dish name and lazy loading where appropriate.

### Cart and checkout

The cart is available as a persistent action on mobile and a side panel on larger screens when the layout supports it. Checkout must show:

- Selected dishes and portions.
- Quantity changes.
- Kitchen notes.
- Customer name when enabled.
- Subtotal, tax when configured, and total.
- Table/visit context where applicable.
- Order submission state.
- Honest error/retry feedback.

The customer must never be shown a client-calculated price as authoritative. The server remains the source of truth for prices, stock, totals, pending order limits, and order creation.

## 6. Kitchen and staff experience

### Desktop staff shell

The kitchen/admin interface uses a fixed left navigation rail on desktop and a responsive horizontal navigation on smaller screens. The rail contains the operational destinations exposed by the tenant and role:

- Pending orders.
- Billing.
- Records.
- Dashboard and analytics.
- Requests.
- Tables.
- Customer devices.
- Menu.
- Stocks.
- Management.
- Notifications.
- Owner controls where authorized.

The main header contains restaurant identity, screen title, live/sync status, request action, and signed-in account controls. The main workspace begins after the navigation rail so headings and cards are never hidden beneath the rail.

### Order workspace

The Pending Orders screen opens with the page heading, live sound/voice actions, status filters, and the order grid or list. Order cards should make the following information easy to scan:

- Table label.
- Order number and time.
- Customer name when available.
- Item lines and quantities.
- Total.
- Current state.
- Available staff actions.

Primary actions are visually distinct from destructive or reversible actions. Accept, reject/unavailable, bill, serve, undo, and block-device actions must remain subject to the existing backend permission checks.

### Empty and loading states

An empty order view should use a calm bordered container with explicit copy such as “No orders in this view.” It should not look like a broken or missing page. Loading states should preserve the structure of the final content when possible rather than causing large layout shifts.

### Requests and assistance

Requests are treated as a service board. Call waiter, reserved-table, and music requests should show type, table, age, state, and the appropriate handling action. Music requests must be clearly distinguished from customer order data and must follow the existing cooldown and idempotency behavior.

### Tables, QR, devices, stocks, and management

Operational resource screens use the same panel and table language as the order workspace. Editing a display name must not change stable table IDs, QR credentials, existing visits, or historical order relationships. Device blocking and security alerts require explicit confirmation and clear status copy. Stock warnings use warning or danger states with readable labels, not color alone.

The Management screen groups controls into understandable sections:

- Brand and identity.
- Theme and density.
- Menu and categories.
- Receipt and bill presentation.
- Tax and behavior.
- Contact and review links.
- Feature visibility.
- Staff and role controls.
- Notifications, audio, and device behavior.

## 7. Waiter experience

The waiter interface is private and capability-controlled. It should look related to the staff workspace but remain focused on the actions a waiter can perform.

On desktop, a split workspace may show active orders and requests side by side. On mobile, the interface becomes a single-column sequence with compact header identity, quick state filters, and readable request/order cards.

The waiter screen must make private access status clear without exposing the bearer key or other sensitive capability data. If access is invalid or revoked, the page should show a direct explanation and a recovery path controlled by the restaurant owner.

## 8. Platform-owner console

The owner console manages the platform rather than a single restaurant. Its visual language is light, editorial, and more administrative than the customer menu.

### Owner overview

The overview contains:

- Platform identity.
- Signed-in owner state.
- Restaurant count.
- Create restaurant action.
- Search/filter for restaurants.
- Restaurant cards.

Restaurant cards show name, safe slug or ID metadata, hosting state, and separate menu/dashboard/kitchen links when a site is ready. Links must not appear as ready until the backend confirms deployment and secure platform registration.

### Provisioning state

Provisioning uses clear state labels such as:

- Queued.
- Creating website.
- Deploying.
- Configuring secure access.
- Ready.
- Needs attention.

The UI should explain that website creation is asynchronous and that retrying an existing request is safer than creating duplicates. The existing request ID and backend idempotency behavior must remain unchanged.

### Restaurant-specific branding

The owner creates a restaurant with a name. The restaurant admin later configures its logo, favicon, hero, tagline, colors, receipt identity, and text. Generated restaurant Sites use the same trusted codebase but receive tenant-specific public identity variables and load their own tenant configuration at runtime.

The design must never imply that all restaurants share a single visible brand. The shared platform may appear in owner/admin utility contexts, but customer-facing pages should foreground the restaurant identity.

## 9. Responsive behavior

### Desktop

At wide widths, use the full staff rail, structured multi-column menu workspace where appropriate, side checkout panel, and spacious owner cards. Maintain a maximum readable content width for customer and owner screens rather than stretching text lines across the entire viewport.

### Tablet

Collapse secondary panels before shrinking content below comfortable reading width. Category controls remain scrollable. Staff navigation may become horizontally scrollable. Order cards use a flexible grid with a minimum readable width.

### Mobile

At approximately 760px and below:

- Customer header actions wrap across rows.
- Customer hero becomes single-column.
- Category filters scroll horizontally.
- Menu cards use a single-column flow.
- Checkout becomes a full-width or near-full-width drawer.
- Staff rail becomes a horizontal navigation strip.
- Staff header content stacks without losing live state or account actions.
- Owner card actions and link rows stack vertically.
- Inputs and copyable URLs use the full available width.

Mobile layouts should never reduce action labels to the point that staff cannot understand them. If a control must be compact, preserve an accessible name and visible context.

## 10. Accessibility requirements

The interface should meet the following practical requirements:

- All meaningful images have alternative text.
- Buttons have explicit labels and do not rely only on icons.
- Focus is visible for keyboard navigation.
- Text and control borders meet usable contrast against their surfaces.
- Status information is communicated with text as well as color.
- Dialogs have a clear close action and preserve a logical focus order.
- Form labels remain associated with their inputs.
- Touch targets are at least 44px high where practical.
- Reduced-motion users receive minimal transitions and no required animation.
- Error messages identify the affected action and, where safe, explain how to recover.

## 11. Motion and feedback

Motion is functional rather than decorative:

- 160ms hover/focus transitions.
- Small upward movement for cards on hover where pointer input exists.
- Short drawer/dialog entrance transitions.
- No animated food backgrounds, excessive parallax, or looping decorative effects.
- Respect `prefers-reduced-motion: reduce` by reducing transitions and animations to near-zero duration.

Sound and voice alerts are operational features and remain controlled by existing permissions, opt-in actions, and tenant settings. They are not part of the visual decoration layer.

## 12. Branding and PWA identity

Each restaurant can maintain its own:

- Restaurant name.
- Logo.
- Favicon.
- Hero image.
- Brand colors.
- Tagline.
- Receipt logo and receipt text.
- Customer menu copy.
- Role-specific installable app identity.

The runtime applies the configured favicon and Apple touch icon when a restaurant logo or favicon is available. Public manifests retain safe role-specific defaults and are generated through the existing build workflow. No private Appwrite keys or owner identity allowlists may enter browser-visible configuration.

## 13. Implementation map

The visual system is implemented using the existing source structure:

- `public/schema.mjs`: default palette and shared customization schema.
- `shared/schema.mjs`: synchronized backend/source schema copy.
- `public/modern-shell.css`: final light visual layer and responsive overrides.
- `public/original-appearance.mjs`: loads the modern layer after the compatibility stylesheet stack.
- `public/app.mjs`: role classes, theme luminance detection, tenant branding, runtime favicon/touch icon behavior, and existing rendering/actions.
- `public/manus-routes.json`: managed Preview route declarations.
- `public/*.webmanifest`: role-specific installable app metadata.
- `scripts/build-site.mjs`: owner/restaurant static builds and tenant-specific public configuration.
- `functions/restaurant-api/src/sites.mjs`: isolated Appwrite Site creation and tenant build variables.
- `functions/restaurant-api/src/service.mjs`: tenant, role, MFA, provisioning, ordering, request, and configuration behavior.

The existing feature-specific CSS remains available for compatibility and saved themes. The modern shell should be extended carefully rather than replacing feature selectors that carry behavior or layout assumptions.

## 14. Design acceptance criteria

The design is considered complete when:

1. New restaurants render with the light editorial palette by default.
2. Existing configured dark restaurants retain their dark visual identity.
3. Restaurant logos and names appear in customer, staff, waiter, and runtime browser identity contexts.
4. Customer menu and checkout remain readable, responsive, and connected to real backend actions.
5. Kitchen, waiter, requests, tables, devices, stocks, management, and owner screens preserve their existing feature access and permissions.
6. Owner provisioning clearly separates restaurants and exposes links only after secure hosting readiness.
7. Desktop and mobile layouts avoid clipped content, hidden headings, inaccessible controls, or horizontal overflow that prevents use.
8. Keyboard focus, reduced motion, status labels, and readable errors are present.
9. Automated tests, source checks, and builds pass before packaging.
10. Production Appwrite deployment, real device installation, and push delivery are documented as deployment acceptance work rather than claimed solely from local Preview evidence.
