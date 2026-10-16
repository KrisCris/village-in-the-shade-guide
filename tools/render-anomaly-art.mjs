// Renders the anomaly-guide models exported by tools/extract-anomaly-art.py with the site's portrait renderer.
// usage: node tools/render-anomaly-art.mjs   (set CHROME to the Chrome/Chromium executable if it is not found)
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {build} from 'esbuild';

const root=path.resolve('output/anomaly-art');
const {jobs}=JSON.parse(await readFile(path.join(root,'jobs.json'),'utf8'));
await mkdir(path.join(root,'renders'),{recursive:true});

const entry=`
import {createPortraitRenderer} from './src/components/art/portraitRenderer';
async function load(src){const im=new Image();im.src=src;await im.decode();return im;}
window.renderModel=async(dir,name,seq,size)=>{
  const data=await (await fetch(dir+'/'+name+'.json')).json();
  data.options={poses:{},faces:{}};
  const images=new Map();
  for(const k of data.keys)if(k.resource>=data.refs.length&&!images.has(k.resource))images.set(k.resource,await load(dir+'/tex-'+k.resource+'.png'));
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;document.body.append(canvas);
  const renderer=createPortraitRenderer(canvas,data,images);
  renderer.fit(seq,1000);renderer.draw(seq,1000,0);
  const url=canvas.toDataURL('image/png');canvas.remove();renderer.dispose();return url;
};`;
// The renderer's UI-only imports (translations, portrait layer presets) are not needed for bare model renders.
const stubs={name:'stubs',setup(b){
  b.onResolve({filter:/(i18n\/active|portraitCatalog)$/},a=>({path:a.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const tr=s=>s;export const hiddenLayers={};',loader:'js'}));
}};
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',outfile:path.join(root,'bundle.js'),plugins:[stubs],logLevel:'warning'});
await writeFile(path.join(root,'index.html'),'<!doctype html><body style="margin:0;background:transparent"><script src="bundle.js"></script></body>');

const chrome=process.env.CHROME||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!chrome)throw new Error('Chrome not found; set CHROME');
const port=9335;
const proc=spawn(chrome,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(root,'.profile')}`,'--allow-file-access-from-files','--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
try{
  let target;
  for(let i=0;i<50&&!target;i++){await sleep(200);try{target=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');}catch{}}
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r));
  let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||'render failed');
    return r.result.result.value;
  };
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});
  await sleep(800);
  for(const job of jobs){
    const dir=pathToFileURL(path.join(root,job.dir)).href;
    const url=await evaluate(`renderModel(${JSON.stringify(dir)},${JSON.stringify(job.model)},${job.seq},384)`);
    await writeFile(path.join(root,'renders',`${job.slug}.png`),Buffer.from(url.split(',')[1],'base64'));
  }
  ws.close();
  console.log(`rendered ${jobs.length} images -> ${path.join(root,'renders')}`);
}finally{proc.kill();}
