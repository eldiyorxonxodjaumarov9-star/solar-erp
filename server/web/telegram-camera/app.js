(() => {
'use strict';
const $=id=>document.getElementById(id), web=window.Telegram?.WebApp;
const fragment=new URLSearchParams(location.hash.slice(1));let ticket=fragment.get('ticket')||'', requestToken=fragment.get('request')||'', action=fragment.get('action');
if(!['check_in','check_out'].includes(action))action='check_in';
$('title').textContent=action==='check_out'?'Ishdan ketishni tasdiqlash':'Ishga kelishni tasdiqlash';
web?.ready();web?.expand();
let stream=null, blob=null, objectUrl=null, busy=false, authorized=false, canceled=false, completed=false, cameraGeneration=0;
const status=text=>$('status').textContent=text;
function stop(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;}
function clearPhoto(){blob=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$('preview').hidden=true;$('review').hidden=true;$('confirm').disabled=true;}
function authHeaders(){return ticket?{Authorization:'Bearer '+ticket}:{'x-telegram-init-data':web?.initData||''};}
async function authorize(){
 if(ticket){authorized=true;return;}
 if(!web?.initData){status('Davomatni tasdiqlash uchun botdagi Kamerani ochish tugmasidan kiring.');return;}
 try{const r=await fetch('/api/telegram/camera/authorize',{method:'POST',headers:{...authHeaders(),'content-type':'application/json'},body:JSON.stringify({requestToken,action}),cache:'no-store'});if(!r.ok)throw Error();ticket=(await r.json()).browserTicket;authorized=true;$('browser').hidden=false;}
 catch{status('Amal bajarilmadi. Botdan qayta urinib ko‘ring.');}
}
async function startCamera(){
 const generation=++cameraGeneration;const reusable=stream?.getVideoTracks().some(track=>track.readyState==='live')?stream:null;if(!reusable)stop();clearPhoto();canceled=false;$('capture').hidden=false;$('capture').disabled=true;$('camera').hidden=false;$('placeholder').hidden=false;$('placeholder').textContent='Kamera ochilmoqda…';
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error();const acquired=reusable || await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:960}}});if(canceled||generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;$('camera').srcObject=stream;await $('camera').play();$('placeholder').hidden=true;$('capture').disabled=false;$('choose').hidden=true;}
 catch{stop();$('placeholder').textContent='Kamera mavjud emas yoki ruxsat berilmadi';$('choose').hidden=false;if(authorized)status('Rasm tanlang yoki bot orqali qayta urinib ko‘ring.');}
}
function previewPhoto(value,keepCamera=false){if(!keepCamera)stop();clearPhoto();blob=value;objectUrl=URL.createObjectURL(blob);$('preview').src=objectUrl;$('preview').hidden=false;$('camera').hidden=true;$('placeholder').hidden=true;$('capture').hidden=true;$('review').hidden=false;$('confirm').disabled=!authorized;status('Rasmni tekshiring va Tasdiqlashni bosing.');}
$('capture').onclick=()=>{if(!stream||busy)return;const video=$('camera');if(!video.videoWidth)return;const canvas=document.createElement('canvas');const scale=Math.min(1,1280/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(value=>{if(value&&!canceled)previewPhoto(value,true);},'image/jpeg',.85);};
$('retake').onclick=()=>{if(!busy)void startCamera();};$('choose').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files?.[0];if(!file)return;if(!['image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024){status('JPEG yoki PNG rasm tanlang. Maksimal hajm: 10 MB.');return;}previewPhoto(file);};
$('confirm').onclick=async()=>{
 if(!blob||busy||!authorized)return;busy=true;$('confirm').disabled=true;$('retake').disabled=true;$('cancel').disabled=true;status('Rasm saqlanmoqda…');
 try{const r=await fetch('/api/telegram/camera/photo',{method:'POST',headers:{...authHeaders(),'content-type':blob.type,'x-camera-request':requestToken,'x-camera-action':action},body:blob,cache:'no-store'});if(!r.ok)throw Error();const result=await r.json();completed=true;status(result.text);$('review').hidden=true;$('choose').hidden=true;$('browser').hidden=true;$('cancel').textContent='Yopish';$('cancel').disabled=false;stop();}
 catch{status('Amal bajarilmadi. Shu rasm bilan qayta urinishingiz mumkin.');$('confirm').disabled=false;$('retake').disabled=false;$('cancel').disabled=false;}
 finally{busy=false;}
};
$('browser').onclick=()=>{if(!authorized||!ticket)return;const url=location.origin+'/api/telegram/camera#'+new URLSearchParams({action,request:requestToken,ticket});stop();if(web?.openLink)web.openLink(url);else window.open(url,'_blank','noopener,noreferrer');};
$('cancel').onclick=()=>{if(busy)return;canceled=true;stop();clearPhoto();if(!completed)status('Bekor qilindi. Davomat yozilmadi.');$('capture').disabled=true;if(web?.close)web.close();};
window.addEventListener('pagehide',()=>{canceled=true;stop();clearPhoto();});
void (async()=>{await authorize();if(!canceled)await startCamera();})();
})();