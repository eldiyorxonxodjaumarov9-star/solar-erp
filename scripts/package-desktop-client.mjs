/** Isolated client package: UI, Electron and static server dependencies only. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),stage=path.join(root,'release-artifacts',`desktop-client-${Date.now()}`),pkg=JSON.parse(fs.readFileSync('package.json'));
if(process.env.SOLARERP_DESKTOP_VERSION){if(!/^\d+\.\d+\.\d+$/.test(process.env.SOLARERP_DESKTOP_VERSION))throw new Error('Invalid desktop candidate version');pkg.version=process.env.SOLARERP_DESKTOP_VERSION;}
fs.mkdirSync(stage,{recursive:true});
for(const folder of ['dist','electron'])fs.cpSync(folder,path.join(stage,folder),{recursive:true});
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:pkg.author||'SolarERP',main:'electron/main.cjs',dependencies:{express:pkg.dependencies.express}},null,2));
const copied=new Map();
function locate(name,source){const require=createRequire(path.join(source,'package.json'));let entry;try{entry=require.resolve(name+'/package.json');}catch{entry=require.resolve(name);}let dir=path.dirname(entry);while(!fs.existsSync(path.join(dir,'package.json'))||JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).name!==name){const parent=path.dirname(dir);if(parent===dir)throw new Error('Dependency resolution failed');dir=parent;}return dir;}
function copy(name,source,parentDest){const src=locate(name,source),metadata=JSON.parse(fs.readFileSync(path.join(src,'package.json'))),id=name+'@'+metadata.version;if(copied.has(id))return;let dest=path.join(stage,'node_modules',name);if(fs.existsSync(dest))dest=path.join(parentDest,'node_modules',name);fs.cpSync(src,dest,{recursive:true,filter:file=>!path.relative(src,file).split(path.sep).includes('node_modules')});copied.set(id,dest);for(const dep of Object.keys(metadata.dependencies||{}))copy(dep,src,dest);}
copy('express',root,stage);
const config={appId:'uz.sunnur.solarerp.desktop',productName:'SolarERP',asar:true,npmRebuild:false,nodeGypRebuild:false,electronVersion:JSON.parse(fs.readFileSync('node_modules/electron/package.json')).version,directories:{app:stage,output:'release-artifacts/windows-client'},files:['**/*','!**/.env*','!**/*.map'],extraFiles:[],forceCodeSigning:false,win:{sign:null,signDlls:false,signAndEditExecutable:false,verifyUpdateCodeSignature:false,target:['portable','nsis']},portable:{artifactName:'SolarERP-${version}-portable.exe'},nsis:{oneClick:false,allowToChangeInstallationDirectory:true,artifactName:'SolarERP-${version}-setup.exe'}};
fs.writeFileSync('.security-artifacts/windows-client-build.json',JSON.stringify(config,null,2));
const fd=fs.openSync('.security-artifacts/windows-client-build.log','w');
const result=spawnSync('cmd.exe',['/d','/s','/c','npx electron-builder --config .security-artifacts/windows-client-build.json --win portable nsis --publish never'],{env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'},stdio:['ignore',fd,fd]});fs.closeSync(fd);
console.log(JSON.stringify({exit:result.status,dependencies:copied.size,stage,output:'release-artifacts/windows-client'}));process.exitCode=result.status||0;
