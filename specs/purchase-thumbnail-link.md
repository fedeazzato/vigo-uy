# Purchase thumbnail link behavior

## Context

Purchase cards already show a link to the publication details in the text metadata, but the main product image is still a static image. Users expect clicking the image to take them to that same publication when a link is available.

## Requirements

- Make the purchase thumbnail open the publication URL when a purchase link exists.
- Preserve the current fallback behavior when no link or no image is provided.
- Cover the interaction with a unit test.

## Files to touch

- `src/components/PurchaseThumbnail.tsx`
- `src/components/PurchaseThumbnail.test.tsx`

## Test plan

- Render the thumbnail with an image and link URL.
- Assert that the image is wrapped in a link that points to the publication URL.

## Acceptance criteria

- [ ] Clicking the thumbnail opens the publication details when a link exists.
- [ ] The existing behavior remains unchanged when no link is provided.
- [ ] `npm run type-check`, `npm run lint`, and `npm test` all pass.
