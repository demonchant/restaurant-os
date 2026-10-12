# Pricing architecture

Money is represented as integer minor units. For NGN this means kobo; display formatting is a presentation concern. Floating-point arithmetic is not used.

The server computes:

`unit price = base price + sum(authoritative option adjustment × option quantity)`

`final price = unit price × product quantity`

The validator first confirms option membership, uniqueness, quantity bounds, component selection bounds and current location availability. It rejects negative final unit prices and unsafe integer results. Request schemas are strict and reject fields such as `finalPriceMinor`; clients cannot submit an authoritative price.

Quotes contain the menu revision, product/configuration IDs, base amount, itemized adjustments, quantity, currency and calculation time. Phase 8 will persist this structure as the immutable order price snapshot. Menu publication already stores an immutable, hashed database snapshot so historical definitions do not depend on mutable draft state.

Price changes require `pricing:update` and produce `price.changed` audit events containing previous and new values.
