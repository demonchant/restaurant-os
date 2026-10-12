import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), slug: text('slug').notNull(),
  status: text('status').notNull().default('ACTIVE'), ...timestamps,
}, (table) => [uniqueIndex('tenants_slug_unique').on(table.slug)]);

export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(), legalName: text('legal_name').notNull().default(''), contactEmail: text('contact_email'), contactPhone: text('contact_phone'),
  timezone: text('timezone').notNull().default('Africa/Lagos'), currency: text('currency').notNull().default('NGN'), countryCode: text('country_code').notNull().default('NG'), status: text('status').notNull().default('ACTIVE'), settings: jsonb('settings').notNull().default({}), ...timestamps,
}, (table) => [index('restaurants_tenant_idx').on(table.tenantId), uniqueIndex('restaurants_tenant_unique').on(table.tenantId), uniqueIndex('restaurants_id_tenant_unique').on(table.id, table.tenantId), check('restaurants_status_check',sql`${table.status} IN ('ACTIVE','INACTIVE','SUSPENDED')`)]);

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  restaurantId: uuid('restaurant_id').notNull(), name: text('name').notNull(),
  addressLine1:text('address_line_1').notNull().default(''),addressLine2:text('address_line_2'),city:text('city').notNull().default(''),state:text('state').notNull().default(''),postalCode:text('postal_code'),countryCode:text('country_code').notNull().default('NG'),status:text('status').notNull().default('ACTIVE'),
  timezone: text('timezone').notNull().default('Africa/Lagos'), operatingConfig:jsonb('operating_config').notNull().default({}), ...timestamps,
}, (table) => [index('locations_tenant_idx').on(table.tenantId), uniqueIndex('locations_tenant_name_unique').on(table.tenantId,table.name), uniqueIndex('locations_id_tenant_unique').on(table.id, table.tenantId),check('locations_status_check',sql`${table.status} IN ('ACTIVE','INACTIVE','SUSPENDED')`), foreignKey({ name: 'locations_restaurant_tenant_fk', columns: [table.restaurantId, table.tenantId], foreignColumns: [restaurants.id, restaurants.tenantId] })]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  kind: text('kind').notNull().default('STAFF'), phone: text('phone'), phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  email: text('email'), passwordHash: text('password_hash'), passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  mfaRequired: boolean('mfa_required').notNull().default(false), status: text('status').notNull().default('ACTIVE'), ...timestamps,
}, (table) => [index('users_tenant_idx').on(table.tenantId), uniqueIndex('users_tenant_email_unique').on(table.tenantId, table.email), uniqueIndex('users_tenant_phone_unique').on(table.tenantId, table.phone).where(sql`${table.phone} IS NOT NULL`), uniqueIndex('users_id_tenant_unique').on(table.id, table.tenantId)]);

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: text('code').notNull(), name: text('name').notNull(), description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(true), rank: integer('rank').notNull().default(0), ...timestamps,
}, (table) => [uniqueIndex('roles_tenant_code_unique').on(table.tenantId, table.code), uniqueIndex('roles_id_tenant_unique').on(table.id, table.tenantId)]);

export const permissions = pgTable('permissions', { code: text('code').primaryKey(), description: text('description').notNull() });

export const userRoles = pgTable('user_roles', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id').notNull(), roleId: uuid('role_id').notNull(),
  assignedBy: uuid('assigned_by'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.roleId] }), index('user_roles_tenant_idx').on(table.tenantId), foreignKey({ name: 'user_roles_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] }), foreignKey({ name: 'user_roles_role_tenant_fk', columns: [table.roleId, table.tenantId], foreignColumns: [roles.id, roles.tenantId] }), foreignKey({ name: 'user_roles_assigner_tenant_fk', columns: [table.assignedBy, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const staffProfiles = pgTable('staff_profiles', {
  userId: uuid('user_id').primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), displayName: text('display_name').notNull(),
  accessScope: text('access_scope').notNull().default('TENANT'), invitedBy: uuid('invited_by'), ...timestamps,
}, (table) => [uniqueIndex('staff_profiles_user_tenant_unique').on(table.userId, table.tenantId), index('staff_profiles_tenant_idx').on(table.tenantId), check('staff_profiles_access_scope_check', sql`${table.accessScope} IN ('TENANT','LOCATIONS')`), foreignKey({ name: 'staff_profiles_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] }), foreignKey({ name: 'staff_profiles_inviter_tenant_fk', columns: [table.invitedBy, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const staffLocationAccess = pgTable('staff_location_access', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id').notNull(), locationId: uuid('location_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.locationId] }), index('staff_location_tenant_idx').on(table.tenantId), foreignKey({ name: 'staff_location_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [staffProfiles.userId, staffProfiles.tenantId] }), foreignKey({ name: 'staff_location_location_tenant_fk', columns: [table.locationId, table.tenantId], foreignColumns: [locations.id, locations.tenantId] })]);

export const rolePermissions = pgTable('role_permissions', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id), roleId: uuid('role_id').notNull(), permissionCode: text('permission_code').notNull().references(() => permissions.code),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionCode] }), foreignKey({ name: 'role_permissions_role_tenant_fk', columns: [table.roleId, table.tenantId], foreignColumns: [roles.id, roles.tenantId] })]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull(), tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }),
  csrfTokenHash: text('csrf_token_hash'), authMethod: text('auth_method').notNull().default('BEARER'), assuranceLevel: integer('assurance_level').notNull().default(1),
  deviceLabel: text('device_label'), userAgentHash: text('user_agent_hash'), ipHash: text('ip_hash'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash), index('sessions_user_idx').on(table.userId), foreignKey({ name: 'sessions_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const otpChallenges = pgTable('otp_challenges', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id'),
  purpose: text('purpose').notNull(), targetPhone: text('target_phone').notNull(), channel: text('channel').notNull(), codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(5),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), resendAfter: timestamp('resend_after', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }), deliveryStatus: text('delivery_status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('otp_target_purpose_idx').on(table.tenantId, table.targetPhone, table.purpose, table.createdAt), foreignKey({ name: 'otp_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const identityTokens = pgTable('identity_tokens', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id'),
  purpose: text('purpose').notNull(), tokenHash: text('token_hash').notNull(), target: text('target'), metadata: jsonb('metadata').notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), consumedAt: timestamp('consumed_at', { withTimezone: true }), revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('identity_tokens_hash_unique').on(table.tokenHash), index('identity_tokens_tenant_purpose_idx').on(table.tenantId, table.purpose, table.createdAt), foreignKey({ name: 'identity_tokens_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const mfaFactors = pgTable('mfa_factors', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id').notNull(),
  type: text('type').notNull().default('TOTP'), secretCiphertext: text('secret_ciphertext').notNull(), secretIv: text('secret_iv').notNull(), secretTag: text('secret_tag').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }), enrollmentExpiresAt: timestamp('enrollment_expires_at', { withTimezone: true }), revokedAt: timestamp('revoked_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('mfa_factors_user_idx').on(table.userId), foreignKey({ name: 'mfa_factors_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const mfaChallenges = pgTable('mfa_challenges', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id').notNull(),
  attempts: integer('attempts').notNull().default(0), maxAttempts: integer('max_attempts').notNull().default(5), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('mfa_challenges_user_idx').on(table.userId, table.createdAt), foreignKey({ name: 'mfa_challenges_user_tenant_fk', columns: [table.userId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  locationId: uuid('location_id'), name: text('name').notNull(), type: text('type').notNull(),
  status:text('status').notNull().default('PENDING'),credentialHash: text('credential_hash'),credentialVersion:integer('credential_version').notNull().default(0),softwareVersion:text('software_version'), lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),disabledAt:timestamp('disabled_at',{withTimezone:true}), ...timestamps,
}, (table) => [index('devices_tenant_idx').on(table.tenantId),uniqueIndex('devices_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('devices_tenant_name_unique').on(table.tenantId,table.name),check('devices_type_check',sql`${table.type} IN ('POS','FOH_TERMINAL','KITCHEN_TERMINAL','PACKING_TERMINAL','PRINTER','LOCAL_AGENT')`),check('devices_status_check',sql`${table.status} IN ('PENDING','ACTIVE','REVOKED','DISABLED')`), foreignKey({ name: 'devices_location_tenant_fk', columns: [table.locationId, table.tenantId], foreignColumns: [locations.id, locations.tenantId] })]);

export const deviceEnrollmentTokens=pgTable('device_enrollment_tokens',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),deviceId:uuid('device_id').notNull(),purpose:text('purpose').notNull(),tokenHash:text('token_hash').notNull(),createdBy:uuid('created_by').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),consumedAt:timestamp('consumed_at',{withTimezone:true}),revokedAt:timestamp('revoked_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[uniqueIndex('device_enrollment_hash_unique').on(table.tokenHash),index('device_enrollment_device_idx').on(table.tenantId,table.deviceId),check('device_enrollment_purpose_check',sql`${table.purpose} IN ('ENROLL','ROTATE')`),foreignKey({name:'device_enrollment_device_tenant_fk',columns:[table.deviceId,table.tenantId],foreignColumns:[devices.id,devices.tenantId]}),foreignKey({name:'device_enrollment_actor_tenant_fk',columns:[table.createdBy,table.tenantId],foreignColumns:[users.id,users.tenantId]})]);

export const menus=pgTable('menus',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),name:text('name').notNull(),description:text('description').notNull().default(''),status:text('status').notNull().default('DRAFT'),revision:integer('revision').notNull().default(1),publishedAt:timestamp('published_at',{withTimezone:true}),archivedAt:timestamp('archived_at',{withTimezone:true}),...timestamps,
},(table)=>[uniqueIndex('menus_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('menus_tenant_name_status_unique').on(table.tenantId,table.name,table.status).where(sql`${table.status} = 'DRAFT'`),index('menus_tenant_status_idx').on(table.tenantId,table.status),check('menus_status_check',sql`${table.status} IN ('DRAFT','PUBLISHED','ARCHIVED')`),check('menus_revision_check',sql`${table.revision} > 0`)]);

export const menuCategories=pgTable('menu_categories',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),name:text('name').notNull(),description:text('description').notNull().default(''),displayOrder:integer('display_order').notNull().default(0),active:boolean('active').notNull().default(true),...timestamps,
},(table)=>[uniqueIndex('menu_categories_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('menu_categories_id_tenant_menu_unique').on(table.id,table.tenantId,table.menuId),uniqueIndex('menu_categories_tenant_menu_name_unique').on(table.tenantId,table.menuId,table.name),index('menu_categories_menu_idx').on(table.tenantId,table.menuId),foreignKey({name:'menu_categories_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]})]);

export const menuProducts=pgTable('menu_products',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),categoryId:uuid('category_id').notNull(),sourceKey:text('source_key'),name:text('name').notNull(),description:text('description').notNull().default(''),sku:text('sku'),type:text('type').notNull(),basePriceMinor:integer('base_price_minor').notNull().default(0),active:boolean('active').notNull().default(true),displayed:boolean('displayed').notNull().default(true),displayOrder:integer('display_order').notNull().default(0),maximumQuantity:integer('maximum_quantity').notNull().default(20),...timestamps,
},(table)=>[uniqueIndex('menu_products_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('menu_products_id_tenant_menu_unique').on(table.id,table.tenantId,table.menuId),uniqueIndex('menu_products_tenant_sku_unique').on(table.tenantId,table.sku).where(sql`${table.sku} IS NOT NULL`),uniqueIndex('menu_products_tenant_source_key_unique').on(table.tenantId,table.sourceKey).where(sql`${table.sourceKey} IS NOT NULL`),index('menu_products_menu_idx').on(table.tenantId,table.menuId),check('menu_products_type_check',sql`${table.type} IN ('FOOD','DRINK','MEAL','SIDE','PROTEIN','EXTRA')`),check('menu_products_price_check',sql`${table.basePriceMinor} >= 0`),check('menu_products_quantity_check',sql`${table.maximumQuantity} BETWEEN 1 AND 100`),foreignKey({name:'menu_products_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'menu_products_category_tenant_fk',columns:[table.categoryId,table.tenantId,table.menuId],foreignColumns:[menuCategories.id,menuCategories.tenantId,menuCategories.menuId]})]);

export const productConfigurations=pgTable('product_configurations',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),productId:uuid('product_id').notNull(),name:text('name').notNull(),kind:text('kind').notNull(),active:boolean('active').notNull().default(true),displayOrder:integer('display_order').notNull().default(0),revision:integer('revision').notNull().default(1),...timestamps,
},(table)=>[uniqueIndex('product_configurations_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('product_configurations_id_tenant_menu_unique').on(table.id,table.tenantId,table.menuId),uniqueIndex('product_configurations_product_name_unique').on(table.tenantId,table.productId,table.name),index('product_configurations_product_idx').on(table.tenantId,table.productId),check('product_configurations_kind_check',sql`${table.kind} IN ('SIMPLE','FULL_PACKAGE','BUILD_YOUR_OWN')`),check('product_configurations_revision_check',sql`${table.revision} > 0`),foreignKey({name:'product_configurations_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'product_configurations_product_tenant_fk',columns:[table.productId,table.tenantId,table.menuId],foreignColumns:[menuProducts.id,menuProducts.tenantId,menuProducts.menuId]})]);

export const componentGroups=pgTable('component_groups',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),configurationId:uuid('configuration_id').notNull(),name:text('name').notNull(),minimumSelections:integer('minimum_selections').notNull().default(0),maximumSelections:integer('maximum_selections').notNull().default(1),required:boolean('required').notNull().default(false),displayOrder:integer('display_order').notNull().default(0),pricingBehavior:text('pricing_behavior').notNull().default('ADDITIVE'),...timestamps,
},(table)=>[uniqueIndex('component_groups_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('component_groups_id_tenant_menu_unique').on(table.id,table.tenantId,table.menuId),uniqueIndex('component_groups_configuration_name_unique').on(table.tenantId,table.configurationId,table.name),index('component_groups_configuration_idx').on(table.tenantId,table.configurationId),check('component_groups_selection_check',sql`${table.minimumSelections} >= 0 AND ${table.maximumSelections} >= ${table.minimumSelections} AND ${table.maximumSelections} <= 100`),check('component_groups_required_check',sql`NOT ${table.required} OR ${table.minimumSelections} > 0`),check('component_groups_pricing_check',sql`${table.pricingBehavior} IN ('INCLUDED','ADDITIVE')`),foreignKey({name:'component_groups_configuration_tenant_fk',columns:[table.configurationId,table.tenantId,table.menuId],foreignColumns:[productConfigurations.id,productConfigurations.tenantId,productConfigurations.menuId]}),foreignKey({name:'component_groups_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]})]);

export const componentOptions=pgTable('component_options',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),groupId:uuid('group_id').notNull(),optionProductId:uuid('option_product_id'),name:text('name').notNull(),type:text('type').notNull(),priceAdjustmentMinor:integer('price_adjustment_minor').notNull().default(0),minimumQuantity:integer('minimum_quantity').notNull().default(1),maximumQuantity:integer('maximum_quantity').notNull().default(1),active:boolean('active').notNull().default(true),displayOrder:integer('display_order').notNull().default(0),...timestamps,
},(table)=>[uniqueIndex('component_options_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('component_options_group_name_unique').on(table.tenantId,table.groupId,table.name),index('component_options_group_idx').on(table.tenantId,table.groupId),check('component_options_type_check',sql`${table.type} IN ('INCLUDED','PAID_ADDON','SUBSTITUTION','REMOVABLE','REQUIRED','OPTIONAL')`),check('component_options_quantity_check',sql`${table.minimumQuantity} >= 1 AND ${table.maximumQuantity} >= ${table.minimumQuantity} AND ${table.maximumQuantity} <= 100`),foreignKey({name:'component_options_group_tenant_fk',columns:[table.groupId,table.tenantId,table.menuId],foreignColumns:[componentGroups.id,componentGroups.tenantId,componentGroups.menuId]}),foreignKey({name:'component_options_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'component_options_product_tenant_fk',columns:[table.optionProductId,table.tenantId,table.menuId],foreignColumns:[menuProducts.id,menuProducts.tenantId,menuProducts.menuId]})]);

export const optionSubstitutions=pgTable('option_substitutions',{
  tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),optionId:uuid('option_id').notNull(),substituteOptionId:uuid('substitute_option_id').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[primaryKey({columns:[table.optionId,table.substituteOptionId]}),check('option_substitutions_not_self_check',sql`${table.optionId} <> ${table.substituteOptionId}`),foreignKey({name:'option_substitutions_option_tenant_fk',columns:[table.optionId,table.tenantId],foreignColumns:[componentOptions.id,componentOptions.tenantId]}),foreignKey({name:'option_substitutions_substitute_tenant_fk',columns:[table.substituteOptionId,table.tenantId],foreignColumns:[componentOptions.id,componentOptions.tenantId]})]);

export const ingredients=pgTable('ingredients',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),sourceKey:text('source_key'),normalizedName:text('normalized_name'),name:text('name').notNull(),defaultUnit:text('default_unit').notNull(),active:boolean('active').notNull().default(true),...timestamps,
},(table)=>[uniqueIndex('ingredients_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('ingredients_tenant_name_unique').on(table.tenantId,table.name),uniqueIndex('ingredients_tenant_source_key_unique').on(table.tenantId,table.sourceKey).where(sql`${table.sourceKey} IS NOT NULL`),uniqueIndex('ingredients_tenant_normalized_name_unique').on(table.tenantId,table.normalizedName).where(sql`${table.normalizedName} IS NOT NULL`),check('ingredients_unit_check',sql`${table.defaultUnit} IN ('GRAM','KILOGRAM','MILLILITRE','LITRE','UNIT','PORTION')`)]);

export const recipes=pgTable('recipes',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),productId:uuid('product_id'),sourceKey:text('source_key').notNull(),normalizedName:text('normalized_name').notNull(),name:text('name').notNull(),kind:text('kind').notNull(),portions:numeric('portions',{precision:18,scale:6}).notNull(),ingredientCostMinor:integer('ingredient_cost_minor').notNull(),costPriceMinor:integer('cost_price_minor'),suggestedSellingPriceMinor:integer('suggested_selling_price_minor'),presentPriceMinor:integer('present_price_minor'),sourceSheet:text('source_sheet').notNull(),sourceRange:text('source_range').notNull(),sourceChecksum:text('source_checksum').notNull(),...timestamps,
},(table)=>[uniqueIndex('recipes_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('recipes_id_tenant_menu_unique').on(table.id,table.tenantId,table.menuId),uniqueIndex('recipes_tenant_source_key_unique').on(table.tenantId,table.sourceKey),index('recipes_menu_idx').on(table.tenantId,table.menuId),check('recipes_kind_check',sql`${table.kind} IN ('MENU_ITEM','PREPARATION')`),check('recipes_portions_check',sql`${table.portions} > 0`),check('recipes_ingredient_cost_check',sql`${table.ingredientCostMinor} >= 0`),check('recipes_cost_price_check',sql`${table.costPriceMinor} IS NULL OR ${table.costPriceMinor} >= 0`),check('recipes_suggested_price_check',sql`${table.suggestedSellingPriceMinor} IS NULL OR ${table.suggestedSellingPriceMinor} >= 0`),check('recipes_present_price_check',sql`${table.presentPriceMinor} IS NULL OR ${table.presentPriceMinor} >= 0`),foreignKey({name:'recipes_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'recipes_product_tenant_menu_fk',columns:[table.productId,table.tenantId,table.menuId],foreignColumns:[menuProducts.id,menuProducts.tenantId,menuProducts.menuId]})]);

export const recipeIngredients=pgTable('recipe_ingredients',{
  tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),recipeId:uuid('recipe_id').notNull(),ingredientId:uuid('ingredient_id').notNull(),lineNumber:integer('line_number').notNull(),quantity:numeric('quantity',{precision:18,scale:6}).notNull(),unit:text('unit').notNull(),sourceUnit:text('source_unit').notNull(),costBasisQuantity:numeric('cost_basis_quantity',{precision:18,scale:6}).notNull(),unitCostMinor:integer('unit_cost_minor').notNull(),extendedCostMinor:integer('extended_cost_minor').notNull(),quantityFormula:text('quantity_formula'),extendedCostFormula:text('extended_cost_formula'),sourceRow:integer('source_row').notNull(),...timestamps,
},(table)=>[primaryKey({columns:[table.recipeId,table.lineNumber]}),uniqueIndex('recipe_ingredients_recipe_ingredient_unique').on(table.recipeId,table.ingredientId,table.lineNumber),index('recipe_ingredients_tenant_ingredient_idx').on(table.tenantId,table.ingredientId),check('recipe_ingredients_line_check',sql`${table.lineNumber} > 0`),check('recipe_ingredients_quantity_check',sql`${table.quantity} > 0`),check('recipe_ingredients_cost_basis_check',sql`${table.costBasisQuantity} > 0`),check('recipe_ingredients_unit_check',sql`${table.unit} IN ('GRAM','KILOGRAM','MILLILITRE','LITRE','UNIT','PORTION')`),check('recipe_ingredients_unit_cost_check',sql`${table.unitCostMinor} >= 0`),check('recipe_ingredients_extended_cost_check',sql`${table.extendedCostMinor} >= 0`),foreignKey({name:'recipe_ingredients_recipe_tenant_fk',columns:[table.recipeId,table.tenantId],foreignColumns:[recipes.id,recipes.tenantId]}),foreignKey({name:'recipe_ingredients_ingredient_tenant_fk',columns:[table.ingredientId,table.tenantId],foreignColumns:[ingredients.id,ingredients.tenantId]})]);

export const menuWorkbookImports=pgTable('menu_workbook_imports',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),actorId:uuid('actor_id').notNull(),sourceFilename:text('source_filename').notNull(),sourceChecksum:text('source_checksum').notNull(),previewHash:text('preview_hash').notNull(),summary:jsonb('summary').notNull(),importedAt:timestamp('imported_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[uniqueIndex('menu_workbook_imports_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('menu_workbook_imports_tenant_checksum_preview_unique').on(table.tenantId,table.sourceChecksum,table.previewHash),index('menu_workbook_imports_menu_idx').on(table.tenantId,table.menuId,table.importedAt),foreignKey({name:'menu_workbook_imports_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'menu_workbook_imports_actor_tenant_fk',columns:[table.actorId,table.tenantId],foreignColumns:[users.id,users.tenantId]})]);

export const productIngredientDependencies=pgTable('product_ingredient_dependencies',{
  tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),productId:uuid('product_id').notNull(),ingredientId:uuid('ingredient_id').notNull(),dependencyType:text('dependency_type').notNull(),quantity:numeric('quantity',{precision:18,scale:6}).notNull(),unit:text('unit').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[primaryKey({columns:[table.productId,table.ingredientId]}),check('product_ingredient_type_check',sql`${table.dependencyType} IN ('REQUIRED','OPTIONAL')`),check('product_ingredient_quantity_check',sql`${table.quantity} > 0`),check('product_ingredient_unit_check',sql`${table.unit} IN ('GRAM','KILOGRAM','MILLILITRE','LITRE','UNIT','PORTION')`),foreignKey({name:'product_ingredient_product_tenant_fk',columns:[table.productId,table.tenantId],foreignColumns:[menuProducts.id,menuProducts.tenantId]}),foreignKey({name:'product_ingredient_ingredient_tenant_fk',columns:[table.ingredientId,table.tenantId],foreignColumns:[ingredients.id,ingredients.tenantId]})]);

export const ingredientAvailability=pgTable('ingredient_availability',{
  tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),locationId:uuid('location_id').notNull(),ingredientId:uuid('ingredient_id').notNull(),status:text('status').notNull(),version:integer('version').notNull().default(1),changedBy:uuid('changed_by').notNull(),reason:text('reason').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[primaryKey({columns:[table.locationId,table.ingredientId]}),check('ingredient_availability_status_check',sql`${table.status} IN ('AVAILABLE','UNAVAILABLE')`),check('ingredient_availability_version_check',sql`${table.version} > 0`),foreignKey({name:'ingredient_availability_location_tenant_fk',columns:[table.locationId,table.tenantId],foreignColumns:[locations.id,locations.tenantId]}),foreignKey({name:'ingredient_availability_ingredient_tenant_fk',columns:[table.ingredientId,table.tenantId],foreignColumns:[ingredients.id,ingredients.tenantId]}),foreignKey({name:'ingredient_availability_actor_tenant_fk',columns:[table.changedBy,table.tenantId],foreignColumns:[users.id,users.tenantId]})]);

export const productAvailability=pgTable('product_availability',{
  tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),locationId:uuid('location_id').notNull(),productId:uuid('product_id').notNull(),status:text('status').notNull(),version:integer('version').notNull().default(1),changedBy:uuid('changed_by').notNull(),reason:text('reason').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[primaryKey({columns:[table.locationId,table.productId]}),check('product_availability_status_check',sql`${table.status} IN ('AVAILABLE','UNAVAILABLE')`),check('product_availability_version_check',sql`${table.version} > 0`),foreignKey({name:'product_availability_location_tenant_fk',columns:[table.locationId,table.tenantId],foreignColumns:[locations.id,locations.tenantId]}),foreignKey({name:'product_availability_product_tenant_fk',columns:[table.productId,table.tenantId],foreignColumns:[menuProducts.id,menuProducts.tenantId]}),foreignKey({name:'product_availability_actor_tenant_fk',columns:[table.changedBy,table.tenantId],foreignColumns:[users.id,users.tenantId]})]);

export const menuPublications=pgTable('menu_publications',{
  id:uuid('id').primaryKey().defaultRandom(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),menuId:uuid('menu_id').notNull(),version:integer('version').notNull(),snapshot:jsonb('snapshot').notNull(),snapshotHash:text('snapshot_hash').notNull(),publishedBy:uuid('published_by').notNull(),publishedAt:timestamp('published_at',{withTimezone:true}).notNull().defaultNow(),
},(table)=>[uniqueIndex('menu_publications_id_tenant_unique').on(table.id,table.tenantId),uniqueIndex('menu_publications_menu_version_unique').on(table.tenantId,table.menuId,table.version),uniqueIndex('menu_publications_hash_unique').on(table.tenantId,table.snapshotHash),foreignKey({name:'menu_publications_menu_tenant_fk',columns:[table.menuId,table.tenantId],foreignColumns:[menus.id,menus.tenantId]}),foreignKey({name:'menu_publications_actor_tenant_fk',columns:[table.publishedBy,table.tenantId],foreignColumns:[users.id,users.tenantId]})]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id), actorId: uuid('actor_id'), action: text('action').notNull(),
  resourceType: text('resource_type').notNull(), resourceId: text('resource_id'), requestId: text('request_id').notNull(), metadata: jsonb('metadata').notNull().default({}),
}, (table) => [index('audit_tenant_time_idx').on(table.tenantId, table.occurredAt)]);

export const securityEvents = pgTable('security_events', {
  id: uuid('id').primaryKey().defaultRandom(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').references(() => tenants.id), actorId: uuid('actor_id'), eventType: text('event_type').notNull(),
  severity: text('severity').notNull(), requestId: text('request_id').notNull(), sourceIpHash: text('source_ip_hash'), metadata: jsonb('metadata').notNull().default({}),
}, (table) => [index('security_events_time_idx').on(table.occurredAt), index('security_events_tenant_idx').on(table.tenantId)]);

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  actorId: uuid('actor_id').notNull(), action: text('action').notNull(), keyHash: text('key_hash').notNull(), requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'), responseBody: jsonb('response_body'), locked: boolean('locked').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('idempotency_scope_unique').on(table.tenantId, table.actorId, table.action, table.keyHash), index('idempotency_expiry_idx').on(table.expiresAt), foreignKey({ name: 'idempotency_actor_tenant_fk', columns: [table.actorId, table.tenantId], foreignColumns: [users.id, users.tenantId] })]);

export const schemaVersion = pgTable('schema_metadata', { key: text('key').primaryKey(), value: text('value').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`) });
