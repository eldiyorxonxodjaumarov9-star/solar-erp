import { useEffect, useState } from 'react';
import { ensureFirebaseAuth } from '../firebase.js';
import { getApiBaseUrl, androidPublicApiPath } from '../api/apiBase.js';
import { assertSecureApiTransport } from '../api/secureTransport.js';
export default function PrivateMedia({ src, as: Tag = 'img', ...props }) {
 const privateSource=String(src||'').startsWith('private-storage:') || String(src||'').startsWith('/api/media/');
 const [resolved,setResolved]=useState('');
 useEffect(()=>{
  let stopped=false, objectUrl;
  setResolved('');
  if(!privateSource)return;
  void (async()=>{
   const user=await ensureFirebaseAuth();let blob;
   {
    const base=getApiBaseUrl()||'';assertSecureApiTransport(base,{dev:import.meta.env.DEV,origin:location.origin});
    const endpoint=src.startsWith('private-storage:')?`/api/private-storage?path=${encodeURIComponent(src.slice(16))}`:src;
    const response=await fetch(base+androidPublicApiPath(endpoint),{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'});
    if(!response.ok)throw new Error('Media access denied');blob=await response.blob();
   }
   if(stopped)return;objectUrl=URL.createObjectURL(blob);setResolved(objectUrl);
  })().catch(()=>{});
  return()=>{stopped=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[src,privateSource]);
 // Legacy token-bearing Firebase URLs need an approved token removal/mapping migration.
 const unsafeLegacy=/firebasestorage\.googleapis\.com|storage\.googleapis\.com/.test(String(src||''));
 return <Tag {...props} src={privateSource?resolved||undefined:unsafeLegacy?undefined:src} />;
}
