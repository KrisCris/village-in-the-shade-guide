import {readFile,writeFile,mkdir} from 'node:fs/promises';
const source='https://nippon1.jp/consumer/honogurashi/character.html';
const response=await fetch(source);
if(!response.ok)throw new Error(`character page HTTP ${response.status}`);
const html=await response.text();
const people=JSON.parse(await readFile('data/generated/build-24969282/entities/characters.json','utf8'));
// The publisher page has malformed alt="alt="..." attributes; names are
// matched exactly to the Japanese game localization, never guessed by order.
const images=[...html.matchAll(/<img src="(img\/character\/chr_nav_\d+\.png[^\"]*)" alt="alt="([^\"]+)"/g)];
if(images.length!==14)throw new Error(`Unexpected publisher portrait list: ${images.length}`);
await mkdir('public/portraits/official',{recursive:true});
const portraits=[];
for(const [,relative,name] of images){
 const matches=people.filter(person=>person.name.ja===name);
 if(matches.length!==1)throw new Error(`Ambiguous game character: ${name}`);
 const person=matches[0];
 const imageUrl=new URL(relative,source).href;
 const image=await fetch(imageUrl);
 if(!image.ok)throw new Error(`Portrait HTTP ${image.status}`);
 const bytes=Buffer.from(await image.arrayBuffer());
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Not a PNG');
 const path=`/portraits/official/${person.id}.png`;
 await writeFile(`public${path}`,bytes);
 portraits.push({character_id:person.id,name_ja:name,path,source,image_url:imageUrl});
}
await writeFile('data/sources/official-character-portraits.json',JSON.stringify({portraits},null,2)+'\n');
console.log(`Imported ${portraits.length} publisher portraits matched to game character names`);
