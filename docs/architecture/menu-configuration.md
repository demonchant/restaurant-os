# Food configuration model

A sellable product may have `SIMPLE`, `FULL_PACKAGE`, or `BUILD_YOUR_OWN` configurations. Each configuration contains ordered component groups and each group defines minimum/maximum selections, requiredness and `INCLUDED` or `ADDITIVE` pricing.

Options have explicit semantics: `INCLUDED`, `PAID_ADDON`, `SUBSTITUTION`, `REMOVABLE`, `REQUIRED`, or `OPTIONAL`. An option may reference a product in the same menu. A removal such as “No protein” is an explicit `REMOVABLE` option with no product reference; required components cannot disappear unless such an option was configured.

Option quantity bounds and group selection bounds are enforced by database constraints, runtime schemas and the authoritative configuration validator. Unknown, duplicate, inactive, unavailable, cross-menu, and over-quantity options are rejected. Substitution relationships are explicit; arbitrary automatic substitution is not permitted.

The structured representation is the future tool boundary for web, POS and AI. An AI may propose option IDs and quantities, but it cannot invent options, override constraints, set availability, or determine a final price.
