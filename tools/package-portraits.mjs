// Packages already extracted native FAN data; no game archives are published.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const source=path.resolve(process.argv[2] || '.local/fairy-review');
const target=path.resolve('public/art/portraits');
await mkdir(target,{recursive:true});
const read=async name=>JSON.parse(await readFile(path.join(source,name+'.json'),'utf8'));
const poses=await read('poses'), faces=await read('expressions');
const textures=new Set();
for(const {name} of await read('index')) {
  if(name==='BU_0160')continue;
  const data=await read(name);
  data.options={poses:Object.fromEntries(Object.entries(poses[name]||{}).map(([id,p])=>[id,{label:p.label,expressions:p.expressions}])),faces:faces[name]||{}};
  for(const k of data.keys)if(k.resource>=244)textures.add(k.resource);
  await writeFile(path.join(target,name+'.json'),JSON.stringify(data,(_,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*100000)/100000:v));
}
for(const id of textures)await copyFile(path.join(source,`tex-${id}.webp`),path.join(target,`tex-${id}.webp`));
console.log(`Packaged 14 portraits and ${textures.size} native texture atlases.`);
