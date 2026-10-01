/** Offline inventory only. Never calls Firebase/GCS or logs download tokens/signed URLs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './credential-migration.mjs';
export function storageInventory(snapshot) {
 const publicBindings=(snapshot.iam?.bindings||[]).filter(binding=>(binding.members||[]).some(member=>['allUsers','allAuthenticatedUsers'].includes(member)));
 const objects=(snapshot.objects||[]).map(object=>({objectRef:fingerprint(object.name||'').slice(0,16),
  downloadTokenPresent:!!object.metadata?.firebaseStorageDownloadTokens,
  publicAcl:(object.acl||[]).some(acl=>['allUsers','allAuthenticatedUsers'].includes(acl.entity)),
  generationKnown:!!object.generation,action:object.metadata?.firebaseStorageDownloadTokens?'backup, map authorized reference, remove token with metageneration precondition':'verify private IAM and reference'}));
 return {objects:objects.length,tokenObjects:objects.filter(o=>o.downloadTokenPresent).length,publicAclObjects:objects.filter(o=>o.publicAcl).length,publicBucketBindings:publicBindings.length,
  publicAccessPrevention:snapshot.iamConfiguration?.publicAccessPrevention||'UNKNOWN',uniformAccess:snapshot.iamConfiguration?.uniformBucketLevelAccess?.enabled??'UNKNOWN',perObject:objects,applySupported:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--input')throw new Error('Offline inventory --input only; no APPLY');
 console.log(JSON.stringify(storageInventory(JSON.parse(fs.readFileSync(args[1],'utf8'))),null,2));
}
