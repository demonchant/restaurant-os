import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseConnection } from '@restaurant-os/database';
import { importWorkbook, previewWorkbookImport, type WorkbookImportContext } from '../src/menu/workbook-import.js';

const databaseUrl=process.env.TEST_DATABASE_URL;const describeDatabase=databaseUrl?describe:describe.skip;

describeDatabase('transactional workbook import against PostgreSQL',()=>{
  let db:DatabaseConnection;let directory='';let workbookPath='';let context:WorkbookImportContext;let secondTenantId='';
  beforeAll(async()=>{
    db=createDatabase(databaseUrl!,4);directory=await mkdtemp(path.join(tmpdir(),'restaurant-os-workbook-test-'));workbookPath=path.join(directory,'costing.xlsx');
    const workbook=new ExcelJS.Workbook();const recipe=workbook.addWorksheet('TEST DISH');recipe.getCell('A1').value='TEST DISH';recipe.getCell('B3').value=1;recipe.getCell('A4').value='INGREDIENTS';recipe.getCell('B4').value='NO OF RECIPEE UNITS';recipe.getCell('C4').value='UNIT';recipe.getCell('D4').value='COST PER RECIPE UNIT';recipe.getCell('E4').value='EXTENDED COST';recipe.getCell('A5').value='TEST INGREDIENT';recipe.getCell('B5').value={formula:'100/1000',result:0.1};recipe.getCell('C5').value='G';recipe.getCell('D5').value=2000;recipe.getCell('E5').value={formula:'B5*D5',result:200};recipe.getCell('E6').value={formula:'SUM(E5:E5)',result:200};recipe.getCell('D10').value='COST PRICE';recipe.getCell('E10').value=300;recipe.getCell('D11').value='SELLING PRICE @20%';recipe.getCell('E11').value=375;recipe.getCell('G12').value='PRESENT PRICE';recipe.getCell('H12').value=500;workbook.addWorksheet('PROTEINS ');
    await writeFile(workbookPath,(await workbook.xlsx.writeBuffer()) as unknown as Uint8Array<ArrayBufferLike>);
    const tenantId=crypto.randomUUID(),actorId=crypto.randomUUID(),roleId=crypto.randomUUID(),menuId=crypto.randomUUID(),categoryId=crypto.randomUUID();secondTenantId=crypto.randomUUID();
    await db.sql`INSERT INTO tenants(id,name,slug,status) VALUES(${tenantId},'Workbook Test',${`workbook-${tenantId}`},'ACTIVE'),(${secondTenantId},'Other Tenant',${`workbook-${secondTenantId}`},'ACTIVE')`;
    await db.sql`INSERT INTO users(id,tenant_id,kind,email,status) VALUES(${actorId},${tenantId},'STAFF',${`actor-${actorId}@example.test`},'ACTIVE')`;
    await db.sql`INSERT INTO roles(id,tenant_id,code,name,rank) VALUES(${roleId},${tenantId},'WORKBOOK_TEST','Workbook Test',10)`;
    for(const permission of ['menu:create','menu:update','pricing:update']){await db.sql`INSERT INTO permissions(code,description) VALUES(${permission},${permission}) ON CONFLICT(code) DO NOTHING`;await db.sql`INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES(${tenantId},${roleId},${permission})`;}
    await db.sql`INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES(${tenantId},${actorId},${roleId})`;
    await db.sql`INSERT INTO menus(id,tenant_id,name,status) VALUES(${menuId},${tenantId},'Workbook Draft','DRAFT')`;await db.sql`INSERT INTO menu_categories(id,tenant_id,menu_id,name) VALUES(${categoryId},${tenantId},${menuId},'Imported Recipes')`;
    context={tenantId,actorId,menuId,recipeCategoryId:categoryId};
  },60_000);
  afterAll(async()=>{
    if(db){const t=context?.tenantId;await db.sql`DELETE FROM audit_logs WHERE tenant_id IN (${t},${secondTenantId})`;await db.sql`DELETE FROM menu_workbook_imports WHERE tenant_id=${t}`;await db.sql`DELETE FROM product_ingredient_dependencies WHERE tenant_id=${t}`;await db.sql`DELETE FROM recipe_ingredients WHERE tenant_id=${t}`;await db.sql`DELETE FROM recipes WHERE tenant_id=${t}`;await db.sql`DELETE FROM product_configurations WHERE tenant_id=${t}`;await db.sql`DELETE FROM menu_products WHERE tenant_id=${t}`;await db.sql`DELETE FROM ingredients WHERE tenant_id=${t}`;await db.sql`DELETE FROM menu_categories WHERE tenant_id=${t}`;await db.sql`DELETE FROM menus WHERE tenant_id=${t}`;await db.sql`DELETE FROM user_roles WHERE tenant_id IN (${t},${secondTenantId})`;await db.sql`DELETE FROM role_permissions WHERE tenant_id IN (${t},${secondTenantId})`;await db.sql`DELETE FROM roles WHERE tenant_id IN (${t},${secondTenantId})`;await db.sql`DELETE FROM users WHERE tenant_id IN (${t},${secondTenantId})`;await db.sql`DELETE FROM tenants WHERE id IN (${t},${secondTenantId})`;await db.close();}
    if(directory&&directory.startsWith(tmpdir()))await rm(directory,{recursive:true,force:true});
  },60_000);

  it('rejects cross-tenant actors and wrong preview hashes without writes',async()=>{
    const isolated=await previewWorkbookImport(db,workbookPath,{...context,tenantId:secondTenantId});expect(isolated.canImport).toBe(false);expect(isolated.issues.some((issue)=>issue.code==='IMPORT_ACTOR_UNAUTHORIZED')).toBe(true);
    await expect(importWorkbook(db,workbookPath,context,'0'.repeat(64))).rejects.toThrow('Preview hash mismatch');
    expect((await db.sql<{count:string}[]>`SELECT count(*)::text count FROM recipes WHERE tenant_id=${context.tenantId}`)[0]?.count).toBe('0');
  });

  it('imports atomically with workbook selling price, recipe costs, consumption, provenance, and audit',async()=>{
    const preview=await previewWorkbookImport(db,workbookPath,context);expect(preview.canImport).toBe(true);expect(preview.counts).toMatchObject({create:3,conflict:0});
    const result=await importWorkbook(db,workbookPath,context,preview.previewHash);expect(result.previewHash).toBe(preview.previewHash);
    const products=await db.sql<{base_price_minor:number;quantity:string}[]>`SELECT p.base_price_minor,d.quantity::text quantity FROM menu_products p JOIN product_ingredient_dependencies d ON d.tenant_id=p.tenant_id AND d.product_id=p.id WHERE p.tenant_id=${context.tenantId}`;
    expect(products).toEqual([{base_price_minor:50000,quantity:'100.000000'}]);
    expect((await db.sql<{count:string}[]>`SELECT count(*)::text count FROM recipes WHERE tenant_id=${context.tenantId} AND ingredient_cost_minor=20000 AND cost_price_minor=30000 AND present_price_minor=50000`)[0]?.count).toBe('1');
    expect((await db.sql<{count:string}[]>`SELECT count(*)::text count FROM menu_workbook_imports WHERE tenant_id=${context.tenantId}`)[0]?.count).toBe('1');
    expect((await db.sql<{count:string}[]>`SELECT count(*)::text count FROM audit_logs WHERE tenant_id=${context.tenantId} AND action='menu.workbook_imported'`)[0]?.count).toBe('1');
  });

  it('serializes concurrent imports and commits the approved preview only once',async()=>{
    const preview=await previewWorkbookImport(db,workbookPath,context);expect(preview.canImport).toBe(true);
    const outcomes=await Promise.allSettled([importWorkbook(db,workbookPath,context,preview.previewHash),importWorkbook(db,workbookPath,context,preview.previewHash)]);
    expect(outcomes.filter((outcome)=>outcome.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter((outcome)=>outcome.status==='rejected')).toHaveLength(1);
    expect((await db.sql<{count:string}[]>`SELECT count(*)::text count FROM menu_workbook_imports WHERE tenant_id=${context.tenantId}`)[0]?.count).toBe('2');
  });
});
