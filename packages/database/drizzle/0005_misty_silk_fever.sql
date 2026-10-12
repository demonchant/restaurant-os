ALTER TABLE "component_groups" DROP CONSTRAINT "component_groups_configuration_tenant_fk";
--> statement-breakpoint
ALTER TABLE "component_options" DROP CONSTRAINT "component_options_group_tenant_fk";
--> statement-breakpoint
ALTER TABLE "menu_products" DROP CONSTRAINT "menu_products_category_tenant_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "component_groups_id_tenant_menu_unique" ON "component_groups" USING btree ("id","tenant_id","menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_id_tenant_menu_unique" ON "menu_categories" USING btree ("id","tenant_id","menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_configurations_id_tenant_menu_unique" ON "product_configurations" USING btree ("id","tenant_id","menu_id");--> statement-breakpoint
ALTER TABLE "component_groups" ADD CONSTRAINT "component_groups_configuration_tenant_fk" FOREIGN KEY ("configuration_id","tenant_id","menu_id") REFERENCES "public"."product_configurations"("id","tenant_id","menu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_options" ADD CONSTRAINT "component_options_group_tenant_fk" FOREIGN KEY ("group_id","tenant_id","menu_id") REFERENCES "public"."component_groups"("id","tenant_id","menu_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_products" ADD CONSTRAINT "menu_products_category_tenant_fk" FOREIGN KEY ("category_id","tenant_id","menu_id") REFERENCES "public"."menu_categories"("id","tenant_id","menu_id") ON DELETE no action ON UPDATE no action;
