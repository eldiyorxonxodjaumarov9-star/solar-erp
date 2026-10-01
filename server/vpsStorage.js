import path from 'node:path';
import { constants } from 'node:fs';
import { mkdir, lstat, open, readFile, writeFile } from 'node:fs/promises';
import { validFile } from './fileSafety.js';

const MAX_IMAGE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
export function createVpsStorage(directory) {
 if (!path.isAbsolute(directory || '')) throw new Error('Absolute private media directory required');
 const root=path.resolve(directory);
 async function target(objectPath,create=false) {
  if (!/^private\/[-A-Za-z0-9_]+\/projects\/[-A-Za-z0-9_]+\/images\/[-A-Za-z0-9_]+\.(jpg|jpeg|png|webp)$/.test(objectPath)) throw new Error('Invalid private path');
  if(create)await mkdir(root,{recursive:true,mode:0o700});
  if((await lstat(root)).isSymbolicLink())throw new Error('Symlink storage root forbidden');
  const parts=objectPath.split('/');let dir=root;
  for(const part of parts.slice(0,-1)) {
   dir=path.join(dir,part);if(create)await mkdir(dir,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
   const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe media directory');
  }
  return path.join(dir,parts.at(-1));
 }
 return {adapter:'vps',file(objectPath){return {
  async save(buffer,{metadata}={}) {
   if(!IMAGE_TYPES.has(metadata?.contentType)||buffer.length>MAX_IMAGE||!validFile(buffer,metadata.contentType))throw new Error('Invalid media');
   const file=await target(objectPath,true);
   await writeFile(file,buffer,{flag:'wx',mode:0o600});
   await writeFile(file+'.json',JSON.stringify({contentType:metadata.contentType,size:buffer.length,metadata:{firebaseStorageDownloadTokens:''}}),{flag:'wx',mode:0o600});
  },
  async setMetadata(metadata) {
   if(metadata?.metadata?.firebaseStorageDownloadTokens!=='')throw new Error('Public tokens forbidden');
   // VPS objects never support public tokens. Metadata is immutable after creation.
  },
  async getMetadata() {
   const file=await target(objectPath);const stat=await lstat(file),sidecar=await lstat(file+'.json');
   if(!stat.isFile()||stat.isSymbolicLink()||sidecar.isSymbolicLink()||!sidecar.isFile()||sidecar.size>2048||stat.size>MAX_IMAGE)throw new Error('Unsafe media file');
   const metadata=JSON.parse(await readFile(file+'.json','utf8'));
   if(!IMAGE_TYPES.has(metadata.contentType)||metadata.size!==stat.size||metadata.metadata?.firebaseStorageDownloadTokens)throw new Error('Invalid media metadata');
   return [metadata];
  },
  async download() {
   const file=await target(objectPath);await this.getMetadata();
   const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
   try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_IMAGE)throw new Error('Unsafe media file');return [await handle.readFile()];}finally{await handle.close();}
  }
 };}};
}
