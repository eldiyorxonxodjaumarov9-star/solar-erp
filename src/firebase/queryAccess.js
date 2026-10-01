/** Query constraints mirror rules; Firestore remains the security authority. */
export function collectionReadFilters(name, claims) {
  if (claims.role === 'admin') return [];
  const worker = claims.role === 'usta', assistant = claims.role === 'asisten';
  const id = worker ? claims.workerId : assistant ? `asst_${claims.assistantId}` : '';
  if (!id) throw new Error('Authenticated role required');
  if (worker && name === 'projects') return [['ustaId','==',id],['assignedWorkerId','==',id],['assignedWorkerIds','array-contains',id]];
  if (worker && name === 'expenses') return [['payrollWorkerId','==',id],['ustaId','==',id]];
  if (assistant && ['projects','commercialOffers','heatPumpForms','supplyCalculations','projectSteps'].includes(name)) return [];
  const fields = { user_activity_logs:'ustaId', stage_photos:'ustaId', attendance:'userId', work_logs:'workerId', points:'userId', jalbalar:'ustaId', complaints:'userId', projectSteps:'uploadedBy', usta_yorijnoma:'workerId' };
  if (fields[name]) return [[fields[name],'==',id]];
  if (['brigades','instructions'].includes(name)) return [];
  if (assistant && ['projects','commercialOffers','heatPumpForms','supplyCalculations'].includes(name)) return [];
  throw Object.assign(new Error('This collection is restricted for your role'),{code:'permission-denied'});
}
