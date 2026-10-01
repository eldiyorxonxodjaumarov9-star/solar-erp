/** Offline operator evidence gate, not a production verifier or deployment tool. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const requiredGates = ['telegramRotation','productionCredentials','storageClosure','runtimeDependencies','productionEnvironment','tls','browserRoles','androidNative','securitySuite','backupRollback'];
export function releaseGate(evidence, now = Date.now()) {
  const identity = typeof evidence?.projectId === 'string' && /^[a-z][a-z0-9-]+$/.test(evidence.projectId) && !evidence.projectId.startsWith('demo-');
  const gates = requiredGates.map(name => {
    const receipt = evidence?.gates?.[name];
    const age = now - Date.parse(receipt?.checkedAt);
    const pass = identity && receipt?.status === 'PASS' && receipt?.projectId === evidence.projectId && receipt?.candidateSha256 === evidence.candidateSha256 && /^[a-f0-9]{64}$/.test(receipt?.candidateSha256 || '') && receipt?.source === 'operator-verified' && typeof receipt?.reference === 'string' && receipt.reference.length > 0 && Number.isFinite(age) && age >= 0 && age <= 86400000;
    return {name, status: pass ? 'PASS' : 'BLOCKED'};
  });
  // Only known sanitized fields leave this function; never echo supplied evidence.
  return {decision: gates.every(g => g.status === 'PASS') ? 'GO' : 'NO-GO', gates, deployAuthorized: false, evidenceTrust: 'Operator attestations require independent review; JSON is not cryptographic proof.'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--evidence') throw new Error();
    const result = releaseGate(JSON.parse(fs.readFileSync(args[1], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (result.decision !== 'GO') process.exitCode = 1;
  } catch { console.error('Release gate BLOCKED: evidence missing or invalid.'); process.exitCode = 1; }
}
