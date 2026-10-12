import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePinchichiWorkbook, workbookPreviewHash, workbookSourceKey } from '../src/menu/workbook-parser.js';

const workbookPath=fileURLToPath(new URL('../../../RECIPEE COST TEMPLATE.xlsx',import.meta.url));
const sha256=async()=>createHash('sha256').update(await readFile(workbookPath)).digest('hex');

describe('real Pinchichi recipe-cost workbook',()=>{
  it('inspects every sheet deterministically without modifying the source file',async()=>{
    const before=await sha256();const first=await parsePinchichiWorkbook(workbookPath);const after=await sha256();
    expect(after).toBe(before);expect(first.sourceChecksum).toBe(before);
    expect(first.summary).toMatchObject({worksheetCount:106,visibleWorksheetCount:97,hiddenWorksheetCount:9,recipeCount:116,menuItemCount:96,preparationCount:20,proteinCount:23,ingredientLineCount:1306,uniqueIngredientCount:287});
    expect(first.worksheets).toHaveLength(106);expect(first.proteins).toHaveLength(23);
    expect(first.issues.filter((issue)=>issue.code==='AMBIGUOUS_PROTEIN_SELLING_PRICE')).toHaveLength(23);
    expect(first.issues.filter((issue)=>issue.code==='FORMULA_RESULT_MISSING')).toHaveLength(2);
    expect(first.issues.some((issue)=>issue.code==='DUPLICATE_RECIPE_KEY')).toBe(true);
    expect(first.issues.some((issue)=>issue.code==='CONFLICTING_INGREDIENT_UNITS')).toBe(true);
    expect(first.issues.some((issue)=>issue.code==='CONFLICTING_INGREDIENT_COSTS')).toBe(true);
    expect(first.issues.some((issue)=>issue.code==='UNMAPPED_UNIT_OR_QUANTITY')).toBe(true);
    expect(first.summary.errorCount).toBeGreaterThan(0);
    expect(workbookPreviewHash(first)).toMatch(/^[a-f0-9]{64}$/u);
  },180_000);

  it('uses stable normalized source keys rather than database IDs',()=>{
    expect(workbookSourceKey('ingredient','  Chicken   Breast ')).toBe('pinchichi-workbook:ingredient:chicken-breast');
    expect(workbookSourceKey('protein','GOAT MEAT')).toBe('pinchichi-workbook:protein:goat-meat');
  });
});
