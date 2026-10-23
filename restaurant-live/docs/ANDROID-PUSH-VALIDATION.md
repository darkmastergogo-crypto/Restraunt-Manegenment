# Validation scope

- Automated service tests: 72 passing, including 12 push tests.
- Syntax checks: 39 JavaScript files.
- Local Chromium UI test: staff account control, permission opt-in, category preferences, subscription API, local display test and unsubscribe on logout. Browser permission/PushManager/provider transport were mocked.
- Real Push API subscription encryption keys validated with generated local test public keys. No customer secrets used.
- Locked Android / real FCM delivery: NOT TESTED.
- Hosted Appwrite function/configuration/transaction integration for this update: NOT TESTED.
- Repository/Site/Function deployment: NOT performed by the assistant.
- Existing automated tests remain passing, with the obsolete “push not migrated” assertion updated to verify the new entitlement control.

The browser test cannot establish that Android background delivery will succeed. Follow the real-device and cross-tenant acceptance checklist in ANDROID-PUSH-SETUP.md before handing links to clients.
