# Menu domain

Restaurant OS has one tenant-scoped menu domain shared by every future channel. `Menu` owns categories, products and configurations. Products are typed as `FOOD`, `DRINK`, `MEAL`, `SIDE`, `PROTEIN`, or `EXTRA`; the type is structural and is not inferred from names.

Relationship identifiers are server-generated UUIDs. Imported products, recipes, and ingredients additionally have tenant-scoped stable source keys for deterministic previews and idempotent updates. Composite foreign keys bind categories, products, configurations, groups, options, recipes, ingredients and availability records to the same tenant and, where relevant, the same menu. No Pinchichi menu data or prices are compiled into the application.

Menus follow `DRAFT -> PUBLISHED -> ARCHIVED`. Published and archived content cannot be edited through the application service. A new revision must be prepared as a draft. Every draft child mutation locks the owning menu row and increments its revision, so publication cannot race with category, product, configuration, price, or dependency edits.

The administration interface at `/menu` uses the production API. The operator-only Pinchichi workbook flow is documented in `recipe-cost-workbook.md`; it maps into this domain through validation, conflict preview and a transactional import. Source workbooks never become a parallel platform schema.
