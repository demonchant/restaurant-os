CREATE TABLE "menu_workbook_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"source_checksum" text NOT NULL,
	"preview_hash" text NOT NULL,
	"summary" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"tenant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit" text NOT NULL,
	"source_unit" text NOT NULL,
	"cost_basis_quantity" numeric(18, 6) NOT NULL,
	"unit_cost_minor" integer NOT NULL,
	"extended_cost_minor" integer NOT NULL,
	"quantity_formula" text,
	"extended_cost_formula" text,
	"source_row" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_recipe_id_line_number_pk" PRIMARY KEY("recipe_id","line_number"),
	CONSTRAINT "recipe_ingredients_line_check" CHECK ("recipe_ingredients"."line_number" > 0),
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK ("recipe_ingredients"."quantity" > 0),
	CONSTRAINT "recipe_ingredients_cost_basis_check" CHECK ("recipe_ingredients"."cost_basis_quantity" > 0),
	CONSTRAINT "recipe_ingredients_unit_check" CHECK ("recipe_ingredients"."unit" IN ('GRAM','KILOGRAM','MILLILITRE','LITRE','UNIT','PORTION')),
	CONSTRAINT "recipe_ingredients_unit_cost_check" CHECK ("recipe_ingredients"."unit_cost_minor" >= 0),
	CONSTRAINT "recipe_ingredients_extended_cost_check" CHECK ("recipe_ingredients"."extended_cost_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"product_id" uuid,
	"source_key" text NOT NULL,
	"normalized_name" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"portions" numeric(18, 6) NOT NULL,
	"ingredient_cost_minor" integer NOT NULL,
	"cost_price_minor" integer,
	"suggested_selling_price_minor" integer,
	"present_price_minor" integer,
	"source_sheet" text NOT NULL,
	"source_range" text NOT NULL,
	"source_checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_kind_check" CHECK ("recipes"."kind" IN ('MENU_ITEM','PREPARATION')),
	CONSTRAINT "recipes_portions_check" CHECK ("recipes"."portions" > 0),
	CONSTRAINT "recipes_ingredient_cost_check" CHECK ("recipes"."ingredient_cost_minor" >= 0),
	CONSTRAINT "recipes_cost_price_check" CHECK ("recipes"."cost_price_minor" IS NULL OR "recipes"."cost_price_minor" >= 0),
	CONSTRAINT "recipes_suggested_price_check" CHECK ("recipes"."suggested_selling_price_minor" IS NULL OR "recipes"."suggested_selling_price_minor" >= 0),
	CONSTRAINT "recipes_present_price_check" CHECK ("recipes"."present_price_minor" IS NULL OR "recipes"."present_price_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_id_tenant_unique" ON "recipes" USING btree ("id","tenant_id");--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "menu_workbook_imports" ADD CONSTRAINT "menu_workbook_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_workbook_imports" ADD CONSTRAINT "menu_workbook_imports_menu_tenant_fk" FOREIGN KEY ("menu_id","tenant_id") REFERENCES "public"."menus"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_workbook_imports" ADD CONSTRAINT "menu_workbook_imports_actor_tenant_fk" FOREIGN KEY ("actor_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_tenant_fk" FOREIGN KEY ("recipe_id","tenant_id") REFERENCES "public"."recipes"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_tenant_fk" FOREIGN KEY ("ingredient_id","tenant_id") REFERENCES "public"."ingredients"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_tenant_fk" FOREIGN KEY ("menu_id","tenant_id") REFERENCES "public"."menus"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_tenant_menu_fk" FOREIGN KEY ("product_id","tenant_id","menu_id") REFERENCES "public"."menu_products"("id","tenant_id","menu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_workbook_imports_id_tenant_unique" ON "menu_workbook_imports" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_workbook_imports_tenant_checksum_preview_unique" ON "menu_workbook_imports" USING btree ("tenant_id","source_checksum","preview_hash");--> statement-breakpoint
CREATE INDEX "menu_workbook_imports_menu_idx" ON "menu_workbook_imports" USING btree ("tenant_id","menu_id","imported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_recipe_ingredient_unique" ON "recipe_ingredients" USING btree ("recipe_id","ingredient_id","line_number");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_tenant_ingredient_idx" ON "recipe_ingredients" USING btree ("tenant_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_id_tenant_menu_unique" ON "recipes" USING btree ("id","tenant_id","menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_tenant_source_key_unique" ON "recipes" USING btree ("tenant_id","source_key");--> statement-breakpoint
CREATE INDEX "recipes_menu_idx" ON "recipes" USING btree ("tenant_id","menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_tenant_source_key_unique" ON "ingredients" USING btree ("tenant_id","source_key") WHERE "ingredients"."source_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_tenant_normalized_name_unique" ON "ingredients" USING btree ("tenant_id","normalized_name") WHERE "ingredients"."normalized_name" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_products_tenant_source_key_unique" ON "menu_products" USING btree ("tenant_id","source_key") WHERE "menu_products"."source_key" IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') THEN
  GRANT SELECT,INSERT,UPDATE ON recipes,recipe_ingredients TO restaurant_os_app;
  GRANT SELECT,INSERT ON menu_workbook_imports TO restaurant_os_app;
  REVOKE DELETE ON recipes,recipe_ingredients,menu_workbook_imports FROM restaurant_os_app;
  REVOKE UPDATE ON menu_workbook_imports FROM restaurant_os_app;
END IF; END $$;
