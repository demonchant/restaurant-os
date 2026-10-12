import path from 'node:path';
import { createDatabase } from '@restaurant-os/database';
import { importWorkbook, previewWorkbookImport, type WorkbookImportContext } from './workbook-import.js';
import { parsePinchichiWorkbook, workbookPreviewHash } from './workbook-parser.js';

const command=process.argv[2]??'inspect';
const workbookPath=path.resolve(process.env.MENU_IMPORT_WORKBOOK_PATH??'RECIPEE COST TEMPLATE.xlsx');
const required=(name:string):string=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};

if(command==='inspect'){
  const model=await parsePinchichiWorkbook(workbookPath);
  process.stdout.write(`${JSON.stringify({sourceFilename:model.sourceFilename,sourceChecksum:model.sourceChecksum,workbookHash:workbookPreviewHash(model),summary:model.summary,worksheets:model.worksheets,proteins:model.proteins,issues:model.issues},null,2)}\n`);
}else{
  if(command!=='preview'&&command!=='import')throw new Error('Command must be inspect, preview, or import');
  const database=createDatabase(required('DATABASE_URL'),1);
  const context:WorkbookImportContext={tenantId:required('MENU_IMPORT_TENANT_ID'),actorId:required('MENU_IMPORT_ACTOR_ID'),menuId:required('MENU_IMPORT_MENU_ID'),recipeCategoryId:required('MENU_IMPORT_RECIPE_CATEGORY_ID'),...(process.env.MENU_IMPORT_PROTEIN_CATEGORY_ID?.trim()?{proteinCategoryId:process.env.MENU_IMPORT_PROTEIN_CATEGORY_ID.trim()}: {})};
  try{
    if(command==='preview'){
      const preview=await previewWorkbookImport(database,workbookPath,context);
      process.stdout.write(`${JSON.stringify({previewHash:preview.previewHash,canImport:preview.canImport,sourceFilename:preview.model.sourceFilename,sourceChecksum:preview.model.sourceChecksum,summary:preview.model.summary,counts:preview.counts,actions:preview.actions,issues:preview.issues},null,2)}\n`);
      if(!preview.canImport)process.exitCode=2;
    }else{
      const result=await importWorkbook(database,workbookPath,context,required('MENU_IMPORT_APPROVED_PREVIEW_HASH'));
      process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
    }
  }finally{await database.close();}
}
