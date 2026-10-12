import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { verifyMiniAppInitData, cameraTicket, verifyCameraTicket, validateCameraImage, CAMERA_MAX_BYTES } from '../server/telegram/cameraSecurity.js';
const token='123:local_camera_test_token', now=Date.parse('2026-10-12T03:55:00Z');
function signed(fields={}) {const p=new URLSearchParams({auth_date:String(now/1000),user:JSON.stringify({id:123}),...fields});const data=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(data).digest('hex'));return p.toString();}
test('valid Telegram initData resolves only signed user ID',()=>assert.equal(verifyMiniAppInitData(signed(),token,now),'123'));
for(const [name,value] of [['forged',signed().replace(/hash=[^&]+/,'hash='+'0'.repeat(64))],['expired',signed({auth_date:String(now/1000-301)})],['future',signed({auth_date:String(now/1000+60)})],['duplicate',signed()+'&user='+encodeURIComponent(JSON.stringify({id:456}))],['missing',''],['bot',signed({user:JSON.stringify({id:123,is_bot:true})})],['unsafe ID',signed({user:JSON.stringify({id:9007199254740992})})]])test('initData DENY '+name,()=>assert.throws(()=>verifyMiniAppInitData(value,token,now)));
test('signature field included in bot-token HMAC verification',()=>assert.equal(verifyMiniAppInitData(signed({signature:'telegram-signature-placeholder'}),token,now),'123'));
test('browser handoff signed, short-lived, rotation and tampering DENY',()=>{const ticket=cameraTicket({telegramUserId:'123',requestToken:'local',action:'check_in'},token,now);assert.equal(verifyCameraTicket(ticket,token,now).telegramUserId,'123');assert.throws(()=>verifyCameraTicket(ticket,token,now+301000));assert.throws(()=>verifyCameraTicket(ticket,token+'x',now));assert.throws(()=>verifyCameraTicket(ticket+'x',token,now));});
const image=jpeg.encode({width:2,height:2,data:Buffer.alloc(16,255)},80).data;
test('JPEG decodes and sanitizes pixels',()=>{const result=validateCameraImage(image,'image/jpeg');assert.equal(result.extension,'jpg');assert.equal(jpeg.decode(result.buffer).width,2);});
test('PNG decodes, checks CRC and sanitizes pixels',()=>{const png=PNG.sync.write({width:2,height:2,data:Buffer.alloc(16,255)});assert.equal(PNG.sync.read(validateCameraImage(png,'image/png').buffer).width,2);});
for(const [name,bytes,mime]of [['MIME mismatch',image,'image/png'],['executable',Buffer.from('MZ executable'),'image/jpeg'],['spoof JPEG',Buffer.from([255,216,255,0,255,217]),'image/jpeg'],['SVG',Buffer.from('<svg/>'),'image/svg+xml'],['oversize',Buffer.alloc(CAMERA_MAX_BYTES+1),'image/jpeg'],['PNG huge dimensions',(()=>{const p=PNG.sync.write({width:1,height:1,data:Buffer.alloc(4)});p.writeUInt32BE(1000000,16);return p;})(),'image/png']])test('image DENY '+name,()=>assert.throws(()=>validateCameraImage(bytes,mime)));
