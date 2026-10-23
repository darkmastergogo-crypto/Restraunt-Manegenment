# Hosted acceptance checklist — not yet executed

Do these in a staging environment with at least two restaurants, two unrelated staff accounts, a platform owner, a manager and two isolated customer browsers. Use actual Appwrite executions and data inspection. Local mock/browser checks are not substitutes.

## Setup / authentication

- [ ] Database/table columns and indexes all Available; row security on; no guest/user/team grants on `entities`.
- [ ] Public function build Ready; guest execution allowed; expected dynamic key scopes only.
- [ ] Maintenance build Ready; execution permissions EMPTY; no public callable route; schedule executes.
- [ ] Correct frontend hostname registered as an Appwrite Web platform; HTTPS cookies/session persist; logout revokes current session.
- [ ] Correct owner IDs configured. Non-owner cannot provision restaurants or change entitlements/group locks.
- [ ] Fresh owner enrollment and existing TOTP sign-in both work; password-only owner/admin denied server-side; ordinary manager sign-in works.
- [ ] Session expiry/missing JWT cannot silently become a staff actor. Caller-supplied identity headers/body fields do not grant access.
- [ ] Authenticator backup/recovery procedure rehearsed. Do not disable MFA merely to bypass a setup problem.

- [ ] `/admin` redirects/renders correctly after deployment; owner sign-in + TOTP opens All restaurants. Signing in as owner from a restaurant redirects to Main admin.
- [ ] A fresh project with no restaurants shows the empty state; Create restaurant works without a restaurant slug in the request.
- [ ] Non-owner accounts cannot list/create restaurants even with forged body role fields or direct function calls.
- [ ] Copy menu/admin URL uses the actual production domain; newly created links work; Settings/Features buttons target the selected tenant.
- [ ] Restaurant controls contain no Create restaurant action; owner can return to the global list; staff cannot enter it.

## Isolation and least privilege

- [ ] Restaurant A admin cannot read/write B via changed slug, row ID, order ID, device ID, visit token or request ID.
- [ ] Raw Appwrite client database calls fail even for signed-in restaurant admins.
- [ ] Public menu exposes no member/device list, private order history or waiter/device secret hash.
- [ ] Customer A cannot open/cancel customer B's orders; browser secret mismatch denied.
- [ ] Manager devices/blocking permissions default denied; each delegated permission works as documented.
- [ ] Revoking membership takes effect on the next operation. Removing owner status requires server environment change.
- [ ] Old waiter link fails immediately after rotation. Waiter cannot edit settings, member roles, stock or feature entitlements.

## Transactions and operations

- [ ] Two simultaneous submissions against the last unit yield one success; no negative stock.
- [ ] Three simultaneous submissions with pending cap 2 yield two saved orders, not three.
- [ ] Duplicate retry with the same submission ID returns the original bill, increments stock/counters once.
- [ ] Inject a failure after staging stock/counter/order writes: no partial committed changes.
- [ ] Settings/menu/stock version conflicts reject stale updates without data loss.
- [ ] Reject/cancel restore same-generation stock once; undo cannot restore stale reset generations.
- [ ] 25-line cart including low-stock alerts fits the target plan's operation count and execution timeout.
- [ ] Table reservation prevents checkout; rotating/removing QR revokes open visits; expired visits require rescan.
- [ ] Scheduler expires old Pending orders/restores reservations; loops reset at expected times after downtime.
- [ ] Scheduler disabled/failure alerting and recovery procedures tested; large runs do not silently truncate.

## Customer / kitchen / billing

- [ ] Full QR → menu → cart → server-priced order → kitchen acceptance → served → history/receipt workflow.
- [ ] Server rejects forged prices/invalid sizes/disabled menu or cart capabilities.
- [ ] Music title/artist/link reaches only the same restaurant's kitchen; Playing/Played/Rejected work.
- [ ] Music cooldown, queue cap, duplicate retry, hidden toggle and owner denial work through direct API calls too.
- [ ] Assistance requests, reserved-table alerts and counter-to-waiter calls work with intended roles.
- [ ] Manual Cash/Online bill uses server prices/tax; waiter billing remains disabled until granted.
- [ ] Print actual 58 mm and 80 mm receipts on target printers; verify tax identity, alignment and required legal fields.
- [ ] Receipt copies reflect appropriate historical prices; understand branding is rendered using current settings.
- [ ] History windows, cancellation deadline, pending expiry, tax rounding, day/month boundaries and configured timezone validated.
- [ ] All enabled/disabled modules tested individually AND with dependencies; hidden inventory screen does not accidentally remove stock enforcement.

## Customization and devices

- [ ] Restaurant A logo/text/colors/receipt changes do not affect B.
- [ ] Owner-locked groups reject raw API changes by A admin.
- [ ] Protected Save/sign-out/customization route remains recoverable after visibility edits.
- [ ] Long names, translations, narrow screens, contrast, keyboard navigation and touch targets checked.
- [ ] Image URL failures/large files/record-size failures show clear errors and do not corrupt settings.
- [ ] CSV opens safely in spreadsheet software, with formula-like text escaped; decimal/date/currency values correct.
- [ ] Reports reconcile to a sample ledger, including cancelled/rejected orders, taxes, manual bills, portions and reset baselines.
- [ ] Audio requires user gesture, works on intended devices; background push explicitly absent rather than assumed working.
- [ ] Wake lock and reconnect behavior checked on target phones/tablets; no duplicate alarms/orders after reconnect.

## Launch gate

- [ ] Read complete original audit and feature-parity matrix; decide whether partial/unported features block rollout.
- [ ] Export/verify source data, backup and rehearse restore. No automatic Supabase migration has run.
- [ ] Build an explicit data migration, preserving IDs/snapshots/balances; reconcile counts/totals before cutover.
- [ ] Rate limits/monitoring, billing alerts and project quotas configured; test actual expected restaurant count/load.
- [ ] Date-filtered server reporting / retention plan approved for expected growth beyond the beta's row guard.
- [ ] Privacy notice, customer-data access policy, staff offboarding, legal/tax requirements and music policy reviewed.
- [ ] Revoke temporary setup key; scan deployed assets for secrets; never deploy the local demo server.
- [ ] Independent security review completed; owner signs off before real customers use it.
