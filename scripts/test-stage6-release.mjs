import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as XLSX from 'xlsx';
import { releaseGate, requiredGates } from './release-gate.mjs';
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const now = Date.now(), projectId = 'fixture-production', candidateSha256 = 'a'.repeat(64);
const gates = Object.fromEntries(requiredGates.map(name => [name, {status:'PASS', projectId, candidateSha256, checkedAt:new Date(now).toISOString(), source:'operator-verified', reference:'protected-operator-receipt'}]));
const evidence = {projectId, candidateSha256, gates};
check(releaseGate(evidence, now).decision, 'GO');
check(releaseGate({}, now).decision, 'NO-GO');
for (const name of requiredGates) {
  check(releaseGate({...evidence, gates:{...gates, [name]:undefined}}, now).decision, 'NO-GO');
  for (const change of [{status:'NOT VERIFIED'},{source:'emulator'},{projectId:'different-project'},{candidateSha256:'b'.repeat(64)},{checkedAt:new Date(now-86400001).toISOString()},{checkedAt:new Date(now+1).toISOString()}])
    check(releaseGate({...evidence, gates:{...gates, [name]:{...gates[name], ...change}}}, now).decision, 'NO-GO');
}
check(releaseGate({...evidence, projectId:'demo-production'}, now).decision, 'NO-GO');
check(releaseGate({...evidence, password:'fixture-secret'}, now).deployAuthorized, false);
check(JSON.stringify(releaseGate({...evidence, password:'fixture-secret'}, now)).includes('fixture-secret'), false);
// Isolated config VM: no dotenv, real env, Firebase or Telegram calls.
const env = {TELEGRAM_BOT_TOKEN:'fixture-old',TELEGRAM_GROUP_ID:'fixture-group'};
let configSource = fs.readFileSync('backend/config.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^const __dirname.*;\r?\n/gm,'').replace(/^dotenv.config.*;\r?\n/gm,'').replace(/export /g,'');
const context = vm.createContext({process:{env}});
vm.runInContext(configSource+'\nglobalThis.readConfig=readTelegramConfig;', context);
const provider = async token => ({ok:token==='fixture-new'}); // Synthetic rotation contract only.
check((await provider(context.readConfig().token)).ok, false);
env.TELEGRAM_BOT_TOKEN='fixture-new';
check(context.readConfig().token, 'fixture-new');
check((await provider(context.readConfig().token)).ok, true);
// Exercise the actual send path with an isolated transport, never the real API.
const transportContext=vm.createContext({fetch:async url=>({json:async()=>({ok:String(url).includes('/botfixture-new/'),description:'fixture provider failure'})})});
const client=new vm.SourceTextModule(fs.readFileSync('server/telegramClient.js','utf8'),{context:transportContext});
await client.link(()=>new vm.SyntheticModule(['readTelegramConfig'],function(){this.setExport('readTelegramConfig',context.readConfig);},{context:transportContext}));
await client.evaluate();
env.TELEGRAM_BOT_TOKEN='fixture-old';
await assert.rejects(client.namespace.telegramSendMessage('fixture'),error=>error.status===502&&!error.message.includes('fixture-old')); checks++;
env.TELEGRAM_BOT_TOKEN='fixture-new';
check((await client.namespace.telegramSendMessage('fixture')).ok,true);
env.TELEGRAM_BOT_TOKEN=''; check(context.readConfig(), null);
delete env.TELEGRAM_GROUP_ID; env.TELEGRAM_BOT_TOKEN='fixture-new'; check(context.readConfig(), null);
// Round-trip export shapes used by both services, with numeric and formula-like text cells.
check(XLSX.version,'0.20.3');
const wb = XLSX.utils.book_new();
for (const name of ['Xarajatlar','Umumiy','Oylar bo‘yicha','kW bo‘yicha','Sistema turlari','Barcha loyihalar'])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ishchi','Summa'],['=1+1',3000000],['Usta',150000]]), name);
const bytes = XLSX.write(wb,{type:'buffer',bookType:'xlsx'}), roundtrip = XLSX.read(bytes,{type:'buffer'});
check(roundtrip.SheetNames,wb.SheetNames);
for(const name of wb.SheetNames) { check(roundtrip.Sheets[name].B2.v,3000000); check(roundtrip.Sheets[name].A2.f,undefined); }
// A transport error may embed a credential URL. Actual report function must
// neither persist, return nor log that error, including database failure paths.
const records=[], logs=[];
const reportContext=vm.createContext({Date,console:{error:(...args)=>logs.push(args),warn:(...args)=>logs.push(args)},DAILY_ATTENDANCE_REPORTS:'fixture-reports',buildDailyAttendanceReportForDate:async()=>({counts:{}}),formatDailyAttendanceTelegramText:()=> 'fixture-report',sendTextToTelegramGroup:async()=>{throw new Error('https://provider.invalid/botfixture-leaked-secret');},upsertFirestoreDocument:async(_collection,_id,record)=>{records.push(record);throw new Error('fixture-leaked-secret');},markSentId:()=>{}});
const reportSource=fs.readFileSync('server/reports/dailyAttendanceTelegram.js','utf8');
const reportModule=new vm.SourceTextModule(reportSource.slice(reportSource.indexOf('export async function generateAndSendDailyAttendanceReport')),{context:reportContext,importModuleDynamically:async()=>{
 const db=new vm.SyntheticModule(['addDocumentWithId'],function(){this.setExport('addDocumentWithId',async()=>{throw new Error('fixture-leaked-secret');});},{context:reportContext});await db.link(()=>{});await db.evaluate();return db;
}});
await reportModule.link(()=>{});await reportModule.evaluate();
const failedReport=await reportModule.namespace.generateAndSendDailyAttendanceReport({dateKey:'2026-10-01',force:true});
check(failedReport.ok,false);check(failedReport.error,'TELEGRAM_SEND_FAILED');check(JSON.stringify({records,logs,failedReport}).includes('fixture-leaked-secret'),false);
console.log(`PASS Stage 6: ${checks} gate/config/export assertions; synthetic rotation only, real Telegram rotation NOT VERIFIED.`);
