import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as XLSX from 'xlsx';
const captures=[];
const context=vm.createContext({console,Date,Blob,URL});
async function load(file) {
 const module=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context});
 await module.link(specifier=>{
  const exports=specifier==='xlsx'?{...XLSX,writeFile:(wb,name)=>captures.push({wb,name})}:specifier==='jspdf'?{jsPDF:class{}}:specifier==='jspdf-autotable'?{default:()=>{}}:specifier.includes('projectStorage')?{somDigitsOnly:value=>Number(value)}:specifier.includes('dateHelpers')?{formatDisplayDate:value=>value,monthLabelUz:()=> 'Oktabr',monthSlugUz:()=> 'oktabr'}:{assertProjectsReadyForExport:projects=>projects};
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});
 });
 await module.evaluate(); return module.namespace;
}
const expense=await load('src/expenses/expenseReportExport.js');
expense.downloadExpensesXlsx([['2026-10-01','Mexnat haqi',150000,'Loyiha','Usta','','=1+1']], 'fixture-expenses.xlsx');
const monthly=await load('src/reports/monthly/reportExcelService.js');
const result=monthly.downloadMonthlyReportExcel({year:2026,month:10,kpis:{totalProjects:1,totalKw:20},projects:[{id:'fixture-project',clientName:'Fixture',stationPower:20,reportDate:'2026-10-01'}]});
assert.equal(result.count,1);assert.equal(captures.length,2);
const [ex,report]=captures.map(item=>XLSX.read(XLSX.write(item.wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}));
assert.equal(ex.SheetNames.length,1);assert.equal(ex.Sheets.Xarajatlar.C2.v,150000);assert.equal(ex.Sheets.Xarajatlar.G2.f,undefined);
assert.equal(report.SheetNames.length,5);assert.equal(report.Sheets.Umumiy.B8.v,20);assert.equal(report.Sheets['Barcha loyihalar'].K2.v,'fixture-project');
console.log('PASS actual expense/monthly Excel export services: XLSX 0.20.3 round-trip, amounts, five sheets, project IDs, text stays non-formula. In-memory fixtures only.');
