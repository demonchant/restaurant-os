import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@restaurant-os/database';
import { parsePinchichiWorkbook, workbookPreviewHash, type PinchichiWorkbookModel, type WorkbookIssue } from './workbook-parser.js';

export type ImportDisposition='CREATE'|'UPDATE'|'MATCH'|'CONFLICT';
export interface ImportAction{entity:'INGREDIENT'|'RECIPE'|'MENU_ITEM'|'PROTEIN';sourceKey:string;name:string;disposition:ImportDisposition;reason:string}
export interface WorkbookImportContext{tenantId:string;actorId:string;menuId:string;recipeCategoryId:string;proteinCategoryId?:string}
export interface WorkbookImportPreview{
  previewHash:string;canImport:boolean;model:PinchichiWorkbookModel;actions:ImportAction[];issues:WorkbookIssue[];
  counts:{create:number;update:number;match:number;conflict:number;unmapped:number;invalid:number;duplicate:number};
}

type SqlClient=DatabaseConnection['sql'];
type Row=Record<string,unknown>;
const requiredPermissions=['menu:create','menu:update','pricing:update'] as const;
const comparable=(input:unknown):string=>input===null||input===undefined?'':typeof input==='string'||typeof input==='number'||typeof input==='boolean'?String(input):JSON.stringify(input);
const same=(left:unknown,right:unknown)=>comparable(left)===comparable(right);

async function validateBoundary(sql:SqlClient,context:WorkbookImportContext,lock=false):Promise<WorkbookIssue[]>{
  const issues:WorkbookIssue[]=[];
  const actor=(await sql<{permission_code:string|null}[]>`
    SELECT rp.permission_code FROM users u JOIN tenants t ON t.id=u.tenant_id
    LEFT JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
    LEFT JOIN role_permissions rp ON rp.tenant_id=ur.tenant_id AND rp.role_id=ur.role_id
    WHERE u.tenant_id=${context.tenantId} AND u.id=${context.actorId} AND u.kind='STAFF' AND u.status='ACTIVE' AND t.status='ACTIVE'`);
  if(actor.length===0)issues.push({severity:'ERROR',code:'IMPORT_ACTOR_UNAUTHORIZED',location:'database',message:'Actor is not active staff in the target tenant'});
  const granted=new Set(actor.flatMap((row)=>row.permission_code?[row.permission_code]:[]));
  for(const permission of requiredPermissions)if(!granted.has(permission))issues.push({severity:'ERROR',code:'IMPORT_PERMISSION_MISSING',location:'database',message:`Actor lacks ${permission}`});
  const lockFragment=lock?' FOR UPDATE':'';
  const menus=await sql.unsafe<{status:string}[]>(`SELECT status FROM menus WHERE tenant_id=$1 AND id=$2${lockFragment}`,[context.tenantId,context.menuId]);
  if(!menus[0])issues.push({severity:'ERROR',code:'TARGET_MENU_MISSING',location:'database',message:'Target menu is outside the tenant or does not exist'});
  else if(menus[0].status!=='DRAFT')issues.push({severity:'ERROR',code:'TARGET_MENU_NOT_DRAFT',location:'database',message:'Workbook imports may only change a draft menu'});
  const categoryIds=[context.recipeCategoryId,...(context.proteinCategoryId?[context.proteinCategoryId]:[])];
  const categories=await sql<{id:string}[]>`SELECT id FROM menu_categories WHERE tenant_id=${context.tenantId} AND menu_id=${context.menuId} AND id=ANY(${categoryIds})`;
  if(categories.length!==new Set(categoryIds).size)issues.push({severity:'ERROR',code:'TARGET_CATEGORY_INVALID',location:'database',message:'Every import category must belong to the target tenant and menu'});
  return issues;
}

function action(entity:ImportAction['entity'],sourceKey:string,name:string,existing:Row|undefined,expected:Record<string,unknown>,collision:Row|undefined):ImportAction{
  if(!existing&&collision)return{entity,sourceKey,name,disposition:'CONFLICT',reason:'A record with the normalized/display name exists without this stable workbook source key'};
  if(!existing)return{entity,sourceKey,name,disposition:'CREATE',reason:'No record has this stable workbook source key'};
  const changed=Object.entries(expected).some(([key,value])=>!same(existing[key],value));
  return{entity,sourceKey,name,disposition:changed?'UPDATE':'MATCH',reason:changed?'Workbook-owned fields differ':'Workbook-owned fields already match'};
}

async function buildActions(sql:SqlClient,context:WorkbookImportContext,model:PinchichiWorkbookModel):Promise<{actions:ImportAction[];issues:WorkbookIssue[]}>{
  const issues=await validateBoundary(sql,context);const actions:ImportAction[]=[];
  const ingredientLines=new Map(model.ingredients.map((ingredient)=>[ingredient.sourceKey,ingredient]));
  const ingredientRows=await sql<Row[]>`SELECT id,source_key,normalized_name,name,default_unit FROM ingredients WHERE tenant_id=${context.tenantId}`;
  for(const line of ingredientLines.values()){
    const existing=ingredientRows.find((row)=>row.source_key===line.sourceKey);const collision=ingredientRows.find((row)=>row.normalized_name===line.normalizedName||row.name===line.name);
    actions.push(action('INGREDIENT',line.sourceKey,line.name,existing,{normalized_name:line.normalizedName,name:line.name,default_unit:line.unit},collision));
  }
  const productRows=await sql<Row[]>`SELECT id,menu_id,category_id,source_key,name,type,base_price_minor FROM menu_products WHERE tenant_id=${context.tenantId}`;
  const recipeRows=await sql<Row[]>`SELECT id,menu_id,product_id,source_key,normalized_name,name,kind,portions,ingredient_cost_minor,cost_price_minor,suggested_selling_price_minor,present_price_minor,source_sheet,source_range,source_checksum FROM recipes WHERE tenant_id=${context.tenantId}`;
  for(const recipe of model.recipes){
    let productId:string|null=null;
    if(recipe.kind==='MENU_ITEM'){
      const existing=productRows.find((row)=>row.source_key===recipe.sourceKey);const collision=productRows.find((row)=>row.name===recipe.name);productId=existing?String(existing.id):null;
      actions.push(action('MENU_ITEM',recipe.sourceKey,recipe.name,existing,{menu_id:context.menuId,category_id:context.recipeCategoryId,name:recipe.name,type:'FOOD',base_price_minor:recipe.presentPriceMinor},collision));
      if(existing&&existing.menu_id!==context.menuId)issues.push({severity:'ERROR',code:'SOURCE_KEY_OTHER_MENU',location:'database',message:`${recipe.name} belongs to another menu`});
    }
    const existing=recipeRows.find((row)=>row.source_key===recipe.sourceKey);const collision=recipeRows.find((row)=>row.normalized_name===recipe.normalizedName);
    actions.push(action('RECIPE',recipe.sourceKey,recipe.name,existing,{menu_id:context.menuId,product_id:productId,normalized_name:recipe.normalizedName,name:recipe.name,kind:recipe.kind,portions:recipe.portions,ingredient_cost_minor:recipe.ingredientCostMinor,cost_price_minor:recipe.costPriceMinor,suggested_selling_price_minor:recipe.suggestedSellingPriceMinor,present_price_minor:recipe.presentPriceMinor,source_sheet:recipe.sheet,source_range:recipe.sourceRange,source_checksum:model.sourceChecksum},collision));
    if(existing){
      const count=(await sql<{count:string}[]>`SELECT count(*)::text count FROM recipe_ingredients WHERE tenant_id=${context.tenantId} AND recipe_id=${String(existing.id)}`)[0];
      if(Number(count?.count)!==recipe.lines.length)issues.push({severity:'ERROR',code:'RECIPE_LINE_COUNT_CONFLICT',location:`${recipe.sheet}!${recipe.sourceRange}`,message:'Existing imported recipe has a different line count; automatic deletion is prohibited'});
    }
  }
  for(const protein of model.proteins){
    if(protein.sellingPrice70Minor===null)continue;
    if(!context.proteinCategoryId){issues.push({severity:'ERROR',code:'PROTEIN_CATEGORY_REQUIRED',location:'database',message:'An explicit existing category is required before proteins can be imported'});continue;}
    const existing=productRows.find((row)=>row.source_key===protein.sourceKey);const collision=productRows.find((row)=>row.name===protein.name);
    actions.push(action('PROTEIN',protein.sourceKey,protein.name,existing,{menu_id:context.menuId,category_id:context.proteinCategoryId,name:protein.name,type:'PROTEIN',base_price_minor:protein.sellingPrice70Minor},collision));
  }
  return{actions,issues};
}

function finalHash(model:PinchichiWorkbookModel,context:WorkbookImportContext,actions:ImportAction[],issues:WorkbookIssue[]):string{
  return createHash('sha256').update(JSON.stringify({workbook:workbookPreviewHash(model),context,actions,issues})).digest('hex');
}

export async function previewWorkbookImport(connection:DatabaseConnection,workbookPath:string,context:WorkbookImportContext):Promise<WorkbookImportPreview>{
  const model=await parsePinchichiWorkbook(workbookPath);const planned=await buildActions(connection.sql,context,model);const issues=[...model.issues,...planned.issues];
  const conflict=planned.actions.filter((item)=>item.disposition==='CONFLICT').length;
  const counts={create:planned.actions.filter((item)=>item.disposition==='CREATE').length,update:planned.actions.filter((item)=>item.disposition==='UPDATE').length,match:planned.actions.filter((item)=>item.disposition==='MATCH').length,conflict,unmapped:issues.filter((item)=>item.code.includes('UNMAPPED')||item.code.includes('MISSING')).length,invalid:issues.filter((item)=>item.code.includes('INVALID')||item.code.includes('MISMATCH')).length,duplicate:issues.filter((item)=>item.code.includes('DUPLICATE')).length};
  return{previewHash:finalHash(model,context,planned.actions,planned.issues),canImport:conflict===0&&!issues.some((item)=>item.severity==='ERROR'),model,actions:planned.actions,issues,counts};
}

function requireImportable(model:PinchichiWorkbookModel):void{
  if(model.issues.some((issue)=>issue.severity==='ERROR'))throw new Error('Workbook validation failed; no records were imported');
  for(const recipe of model.recipes)if(recipe.portions===null||recipe.ingredientCostMinor===null||recipe.lines.some((line)=>line.unit===null||line.quantity===null||line.costBasisQuantity===null||line.unitCostMinor===null||line.extendedCostMinor===null))throw new Error('Workbook has incomplete canonical recipe values');
}

export async function importWorkbook(connection:DatabaseConnection,workbookPath:string,context:WorkbookImportContext,approvedPreviewHash:string):Promise<{importId:string;previewHash:string;summary:PinchichiWorkbookModel['summary']} >{
  const preview=await previewWorkbookImport(connection,workbookPath,context);
  if(preview.previewHash!==approvedPreviewHash)throw new Error('Preview hash mismatch; preview the current workbook and database state again');
  if(!preview.canImport)throw new Error('Preview contains blocking errors or conflicts; no records were imported');
  requireImportable(preview.model);const now=new Date();const importId=randomUUID();
  await connection.sql.begin(async(sql)=>{
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${context.menuId}`},0))`;
    const boundary=await validateBoundary(sql as SqlClient,context,true);if(boundary.some((issue)=>issue.severity==='ERROR'))throw new Error('Import boundary changed after preview');
    const ingredients=new Map<string,string>();
    for(const line of preview.model.ingredients){
      const rows=await sql<{id:string}[]>`INSERT INTO ingredients(tenant_id,source_key,normalized_name,name,default_unit,active,created_at,updated_at) VALUES(${context.tenantId},${line.sourceKey},${line.normalizedName},${line.name},${line.unit},true,${now},${now}) ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO UPDATE SET normalized_name=EXCLUDED.normalized_name,name=EXCLUDED.name,default_unit=EXCLUDED.default_unit,updated_at=EXCLUDED.updated_at RETURNING id`;const row=rows[0];if(!row)throw new Error('Ingredient upsert failed');ingredients.set(line.sourceKey,row.id);
    }
    for(const recipe of preview.model.recipes){
      let productId:string|null=null;
      if(recipe.kind==='MENU_ITEM'){
        const products=await sql<{id:string}[]>`INSERT INTO menu_products(tenant_id,menu_id,category_id,source_key,name,description,type,base_price_minor,active,displayed,display_order,maximum_quantity,created_at,updated_at) VALUES(${context.tenantId},${context.menuId},${context.recipeCategoryId},${recipe.sourceKey},${recipe.name},'', 'FOOD',${recipe.presentPriceMinor},true,true,0,20,${now},${now}) ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,base_price_minor=EXCLUDED.base_price_minor,updated_at=EXCLUDED.updated_at WHERE menu_products.menu_id=${context.menuId} RETURNING id`;productId=products[0]?.id??null;if(!productId)throw new Error('Menu product upsert failed');
        await sql`INSERT INTO product_configurations(tenant_id,menu_id,product_id,name,kind,active,display_order,created_at,updated_at) VALUES(${context.tenantId},${context.menuId},${productId},'Standard','SIMPLE',true,0,${now},${now}) ON CONFLICT (tenant_id,product_id,name) DO NOTHING`;
      }
      const recipes=await sql<{id:string}[]>`INSERT INTO recipes(tenant_id,menu_id,product_id,source_key,normalized_name,name,kind,portions,ingredient_cost_minor,cost_price_minor,suggested_selling_price_minor,present_price_minor,source_sheet,source_range,source_checksum,created_at,updated_at) VALUES(${context.tenantId},${context.menuId},${productId},${recipe.sourceKey},${recipe.normalizedName},${recipe.name},${recipe.kind},${recipe.portions},${recipe.ingredientCostMinor},${recipe.costPriceMinor},${recipe.suggestedSellingPriceMinor},${recipe.presentPriceMinor},${recipe.sheet},${recipe.sourceRange},${preview.model.sourceChecksum},${now},${now}) ON CONFLICT (tenant_id,source_key) DO UPDATE SET product_id=EXCLUDED.product_id,normalized_name=EXCLUDED.normalized_name,name=EXCLUDED.name,kind=EXCLUDED.kind,portions=EXCLUDED.portions,ingredient_cost_minor=EXCLUDED.ingredient_cost_minor,cost_price_minor=EXCLUDED.cost_price_minor,suggested_selling_price_minor=EXCLUDED.suggested_selling_price_minor,present_price_minor=EXCLUDED.present_price_minor,source_sheet=EXCLUDED.source_sheet,source_range=EXCLUDED.source_range,source_checksum=EXCLUDED.source_checksum,updated_at=EXCLUDED.updated_at WHERE recipes.menu_id=${context.menuId} RETURNING id`;const recipeId=recipes[0]?.id;if(!recipeId)throw new Error('Recipe upsert failed');
      const dependencies=new Map<string,{quantity:number;unit:string}>();
      for(const line of recipe.lines){const ingredientId=ingredients.get(line.sourceKey);if(!ingredientId)throw new Error('Canonical ingredient is missing');
        await sql`INSERT INTO recipe_ingredients(tenant_id,recipe_id,ingredient_id,line_number,quantity,unit,source_unit,cost_basis_quantity,unit_cost_minor,extended_cost_minor,quantity_formula,extended_cost_formula,source_row,created_at,updated_at) VALUES(${context.tenantId},${recipeId},${ingredientId},${line.lineNumber},${line.quantity},${line.unit},${line.sourceUnit},${line.costBasisQuantity},${line.unitCostMinor},${line.extendedCostMinor},${line.quantityFormula},${line.extendedCostFormula},${line.sourceRow},${now},${now}) ON CONFLICT (recipe_id,line_number) DO UPDATE SET ingredient_id=EXCLUDED.ingredient_id,quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,source_unit=EXCLUDED.source_unit,cost_basis_quantity=EXCLUDED.cost_basis_quantity,unit_cost_minor=EXCLUDED.unit_cost_minor,extended_cost_minor=EXCLUDED.extended_cost_minor,quantity_formula=EXCLUDED.quantity_formula,extended_cost_formula=EXCLUDED.extended_cost_formula,source_row=EXCLUDED.source_row,updated_at=EXCLUDED.updated_at`;
        if(productId){const prior=dependencies.get(ingredientId);if(prior&&prior.unit!==line.unit)throw new Error('One product cannot consume one ingredient in conflicting units');dependencies.set(ingredientId,{quantity:(prior?.quantity??0)+(line.quantity??0),unit:line.unit??''});}
      }
      for(const [ingredientId,dependency] of dependencies)await sql`INSERT INTO product_ingredient_dependencies(tenant_id,product_id,ingredient_id,dependency_type,quantity,unit,created_at,updated_at) VALUES(${context.tenantId},${productId},${ingredientId},'REQUIRED',${dependency.quantity},${dependency.unit},${now},${now}) ON CONFLICT (product_id,ingredient_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,updated_at=EXCLUDED.updated_at`;
    }
    if(context.proteinCategoryId)for(const protein of preview.model.proteins)if(protein.sellingPrice70Minor!==null)await sql`INSERT INTO menu_products(tenant_id,menu_id,category_id,source_key,name,description,type,base_price_minor,active,displayed,display_order,maximum_quantity,created_at,updated_at) VALUES(${context.tenantId},${context.menuId},${context.proteinCategoryId},${protein.sourceKey},${protein.name},'','PROTEIN',${protein.sellingPrice70Minor},true,true,0,20,${now},${now}) ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,base_price_minor=EXCLUDED.base_price_minor,updated_at=EXCLUDED.updated_at WHERE menu_products.menu_id=${context.menuId}`;
    await sql`UPDATE menus SET revision=revision+1,updated_at=${now} WHERE tenant_id=${context.tenantId} AND id=${context.menuId} AND status='DRAFT'`;
    await sql`INSERT INTO menu_workbook_imports(id,tenant_id,menu_id,actor_id,source_filename,source_checksum,preview_hash,summary,imported_at) VALUES(${importId},${context.tenantId},${context.menuId},${context.actorId},${preview.model.sourceFilename},${preview.model.sourceChecksum},${preview.previewHash},${JSON.stringify(preview.model.summary)}::jsonb,${now})`;
    await sql`INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,request_id,metadata,occurred_at) VALUES(${context.tenantId},${context.actorId},'menu.workbook_imported','menu',${context.menuId},${`workbook-${importId}`},${JSON.stringify({importId,sourceChecksum:preview.model.sourceChecksum,previewHash:preview.previewHash,summary:preview.model.summary})}::jsonb,${now})`;
  });
  return{importId,previewHash:preview.previewHash,summary:preview.model.summary};
}
