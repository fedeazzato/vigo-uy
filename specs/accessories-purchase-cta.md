# Accessories purchase CTA

## Context

The accessories page already shows the community purchase section, but the call to action still points to the generic purchase form without any accessories-specific entry point. Users looking for a way to share an accessory purchase should be able to reach the form quickly from the accessories page itself.

## Requirements

- Add a clear call-to-action button on the accessories page for signed-in users to start registering an accessory purchase.
- Keep the existing community purchase section behavior intact for visitors and signed-out users.
- Route the button to the existing purchase form so the user can submit the purchase without extra navigation.
- Cover the new CTA with a unit test.

## Files to touch

- `src/pages/AccessoriesPage.tsx`
- `src/components/PurchaseCommunitySection.tsx`
- `src/pages/AccessoriesPage.test.tsx`

## Test plan

- Render the accessories page in a router with a signed-in auth state.
- Assert that a link/button with the accessories-specific CTA text is present.
- Assert that the CTA targets the existing purchase form route.

## Acceptance criteria

- [ ] The accessories page shows a dedicated CTA for registering an accessory purchase.
- [ ] The CTA links to the existing purchase form route.
- [ ] `npm run type-check`, `npm run lint`, and `npm test` all pass.
