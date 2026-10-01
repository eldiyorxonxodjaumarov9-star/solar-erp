import { parse } from 'dotenv';
const PUBLIC_KEYS=new Set(['VITE_API_BASE','VITE_ANDROID_API_BASE','VITE_NATIVE_API_BASE','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID']);
/** A distributable is a remote client: never ship server secrets, private data or an embedded privileged server. */
export function desktopPublicEnv(source) {
 const values=parse(source),entries=Object.entries(values).filter(([key])=>PUBLIC_KEYS.has(key));
 for(const [key,value]of entries)if(key.includes('API_BASE')){const url=new URL(value);if(url.protocol!=='https:'||['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Desktop release requires public HTTPS API');}
 if(!entries.some(([key,value])=>key==='VITE_API_BASE'&&value))throw new Error('Desktop release HTTPS API missing');
 return entries.map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\nELECTRON_SKIP_EMBEDDED_SERVER=1\nPORT=5150\nSERVE_STATIC=true\n';
}
