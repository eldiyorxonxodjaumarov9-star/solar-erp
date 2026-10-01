import { getServerAdminDb } from './firebaseAdminAuth.js';
import { assertAccountSession } from './accountSecurity.js';
import { assertProjectAccess, actorId } from './operationAuthorization.js';
import { STAGES } from '../src/projects/stageConfig.js';
/** Called only after the trusted server successfully sends all stage photos. */
export async function recordConfirmedStage(req,{getDb=getServerAdminDb}={}) {
 const db=await getDb(),{projectId,stageId}=req.body;
 if(!STAGES.some(stage=>stage.id===stageId))throw new Error('Invalid stage');
 await assertAccountSession(req.authClaims,{getDb:async()=>db});
 await assertProjectAccess(req.authSession,projectId,db);
 const ref=db.collection('project_stage_locks').doc(projectId);
 return db.runTransaction(async transaction=>{
  const snapshot=await transaction.get(ref),before=snapshot.exists?snapshot.data():{},stages=before.stages||{};
  if(stages[stageId])return stages[stageId];
  const stage={sentAt:new Date().toISOString(),ustaId:actorId(req.authSession),ustaName:req.authSession.name,brigadeName:String(req.body.brigadeName||'')};
  transaction.set(ref,{projectId,stages:{...stages,[stageId]:stage},updatedAt:stage.sentAt},{merge:true});return stage;
 });
}
