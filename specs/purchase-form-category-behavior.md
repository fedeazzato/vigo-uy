# Purchase form category behavior

## Context

The shared purchase form currently uses the same fields and placeholder copy for all purchase categories. That makes accessory purchases feel like they still need vehicle-specific details, even when those details are not relevant.

## Requirements

- Hide vehicle-specific fields such as odometer/kilometraje for accessory categories.
- Add an EV charger category to the accessory catalog so charger purchases can be categorized properly.
- Prefill the store field from a recognized purchase link when the user pastes a link from a supported site.
- Change the product placeholder text based on the selected purchase category so it better matches the item being entered.

## Files to touch

- `src/data/accessories.json`
- `src/lib/purchaseCatalog.ts`
- `src/lib/storeLinks.ts`
- `src/pages/NewPartPurchasePage.tsx`
- `src/pages/NewPartPurchasePage.test.tsx`

## Test plan

- Render the purchase form and verify the odometer field is hidden when an accessory category is selected.
- Verify the product placeholder changes for a different category selection.
- Verify the store field is prefilled from a recognized link.
- Verify the new EV charger category is available in the category selector.

## Acceptance criteria

- [ ] Accessory purchases hide irrelevant vehicle-specific fields such as odometer/kilometraje.
- [ ] The purchase form includes an EV charger category under accessories.
- [ ] The store field is prefilled for recognized store links.
- [ ] The product placeholder changes with the selected category.
- [ ] `npm run type-check`, `npm run lint`, and `npm test` all pass.
