export function validFile(buffer, mime) {
 if(!Buffer.isBuffer(buffer) || !buffer.length)return false;
 if(mime==='image/jpeg')return buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
 if(mime==='image/png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/webp')return buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
 if(['video/mp4','video/quicktime'].includes(mime))return buffer.toString('ascii',4,8)==='ftyp';
 return false;
}
