/** Read-only network preflight. Never logs credentials, tokens or response data. */
export async function checkHttpsApi(base) {
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||['localhost','127.0.0.1','api.example.invalid'].includes(url.hostname))throw new Error('Verified public HTTPS API origin required');
 const checks=[];
 for(const [path,status]of [['/status',200],['/api/auth/session',401],['/api/staff/workers',401],['/api/private-storage',401]]){
  try{const response=await fetch(url.origin+path,{redirect:'error',signal:AbortSignal.timeout(10000)});checks.push({path,status:response.status,pass:response.status===status&&!!response.headers.get('content-type')?.includes('application/json')});}
  catch{checks.push({path,status:'TLS_OR_NETWORK_ERROR',pass:false});}
 }
 return {checks,publicPreflightPass:checks.every(c=>c.pass),realAdminLoginVerified:false,productionDataVerified:false};
}
if(process.argv[1]?.endsWith('check-https-api.mjs'))try{const result=await checkHttpsApi(process.argv[2]);console.log(JSON.stringify(result,null,2));if(!result.publicPreflightPass)process.exitCode=1;}catch{console.error('HTTPS API preflight BLOCKED: invalid origin or missing configuration.');process.exitCode=1;}
