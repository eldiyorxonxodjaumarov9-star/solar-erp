import { getStorage } from 'firebase-admin/storage';
import { getServerAdminAuth } from './firebaseAdminAuth.js';
export async function serverStorageBucket() {
 const name=String(process.env.FIREBASE_STORAGE_BUCKET||'').trim();
 if(!name)throw new Error('FIREBASE_STORAGE_BUCKET required');
 const app=(await getServerAdminAuth()).app,bucket=getStorage(app).bucket(name);
 const emulator=/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST||'') && /^demo-/.test(app.options.projectId||'');
 if(!emulator){
  const [metadata]=await bucket.getMetadata();
  if(metadata.iamConfiguration?.publicAccessPrevention!=='enforced'||metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled!==true)throw new Error('Private bucket PAP and uniform access required');
 }
 return bucket;
}
/** GCS/Admin upload, never Firebase client upload. No public ACL or download-token metadata. */
export async function savePrivateImage(bucket,objectPath,buffer,contentType) {
 const file=bucket.file(objectPath);
 await file.save(buffer,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType,cacheControl:'private, no-store',metadata:{firebaseStorageDownloadTokens:''}}});
 await file.setMetadata({metadata:{firebaseStorageDownloadTokens:''}});
 const [metadata]=await file.getMetadata();
 if(metadata.metadata?.firebaseStorageDownloadTokens || (metadata.acl||[]).some(a=>['allUsers','allAuthenticatedUsers'].includes(a.entity))){
  // Do not return an unsafe reference. Leave object for authorized investigation; never overwrite/delete data here.
  throw new Error('Private storage policy verification failed');
 }
 return {storagePath:objectPath,downloadUrl:`private-storage:${objectPath}`};
}
