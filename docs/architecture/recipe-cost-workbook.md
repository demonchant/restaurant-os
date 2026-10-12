# Pinchichi recipe-cost workbook mapping

`RECIPEE COST TEMPLATE.xlsx` is the initial Pinchichi costing source. It is an input artifact, not a runtime schema and not part of the separate customer website. Restaurant OS preserves the Phase 4 menu domain and maps workbook data into it.

## Canonical mapping

| Workbook concept | Restaurant OS representation | Authority rule |
|---|---|---|
| Ingredient row | tenant-scoped `ingredients`, keyed by normalized `source_key` | Workbook display name is preserved; conflicting units or costs block import. |
| Recipe block | `recipes` plus ordered `recipe_ingredients` | Cached formula results are imported only when present and valid; formula text is retained as provenance. |
| Visible recipe with Present Price | `menu_products` (`FOOD`) linked to a `MENU_ITEM` recipe | `present_price_minor` becomes the server-owned base price. |
| Hidden/preparation recipe or recipe without Present Price | `PREPARATION` recipe with no sellable product | No price or product is invented. |
| `PROTEINS ` row | candidate `menu_products` (`PROTEIN`) | Import requires one unambiguous workbook selling price and an explicit existing target category. |
| Recipe quantity | exact decimal `recipe_ingredients.quantity` and product ingredient dependency | `G` ratio formulas preserve consumed grams and their cost basis separately. |
| Ingredient/unit cost | `recipe_ingredients.unit_cost_minor` plus `cost_basis_quantity` | Distinct from recipe cost and menu price. |
| Recipe total/cost price/suggested price/present price | separate integer minor-unit fields on `recipes` | Suggested prices never silently replace Present Price. |

Stable keys use `pinchichi-workbook:<kind>:<normalized-name>`. Database UUIDs remain internal relationship identifiers. A normalized-name collision without the stable source key is a conflict, not an automatic merge.

Proteins are canonical products, not duplicated per recipe sheet. The workbook does not specify which recipes expose which protein as an option, so the importer does not invent component groups, variants, add-ons, or links.

## Safety and workflow

The operational command is `npm --prefix services/api run menu:workbook -- <inspect|preview|import>`.

- `inspect` reads the workbook without a database.
- `preview` requires `DATABASE_URL`, `MENU_IMPORT_TENANT_ID`, `MENU_IMPORT_ACTOR_ID`, `MENU_IMPORT_MENU_ID`, and `MENU_IMPORT_RECIPE_CATEGORY_ID`. `MENU_IMPORT_PROTEIN_CATEGORY_ID` is optional and is required before an unambiguous protein can be imported.
- `import` additionally requires `MENU_IMPORT_APPROVED_PREVIEW_HASH` from the current preview.

Preview checks live RBAC and tenant/menu/category ownership as well as creates, updates, matches, conflicts, missing fields, invalid formula values, units, prices, duplicates, and existing recipe-line counts. Import fails if any error or conflict exists.

Import reparses the workbook, verifies the approved preview hash, acquires a tenant/menu advisory transaction lock, rechecks active staff and `menu:create`, `menu:update`, and `pricing:update`, locks the draft menu, and writes ingredients, recipes, products, dependencies, provenance, menu revision, and audit evidence in one transaction. It performs no deletes, does not reset data, and cannot update another tenant or a published menu.

Workbook uploads are deliberately not added to the HTTP API: importing is an operator-controlled administration action and must not weaken the existing public request boundary.

## Real workbook inspection (2026-08-28)

- 106 worksheets: 97 visible and 9 hidden.
- 116 recipe blocks: 96 menu-item candidates and 20 preparation recipes.
- 23 protein rows on `PROTEINS `.
- 1,306 ingredient-use rows and 287 normalized ingredient keys.
- 3,872 formula cells and 415 merged ranges.
- SHA-256: `426954afb6e7fbcffffcbf249e49b3c7e0fa7e6b14b6302e49b0654b2d3a0fbf`.

The real preview is blocked by 364 errors: 239 unmapped/ambiguous unit or quantity values, 2 recipes without a valid portion count, 7 extended-cost mismatches, 3 invalid unit costs, 1 invalid extended cost, 2 formulas without cached calculated values, 23 ambiguous protein selling prices, 2 duplicate normalized recipe keys, 31 conflicting canonical ingredient units, and 54 conflicting ingredient cost/basis combinations. Eleven visible recipes without an unambiguous Present Price are warnings and remain preparations.

The Docker-backed preview identified 499 potential creates (287 ingredients, 116 recipes, and 96 menu products) and performed zero writes. Proteins were excluded because every protein row offered different 70% and 80% selling-price candidates without choosing an authoritative price.
