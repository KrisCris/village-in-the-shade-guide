export type Key={resource:number;time:number;order:number;rect:number[];transform:number[];mesh:number};
export type Model={name:string;animations:number[][];nodes:number[][];keys:Key[];refs:string[];meshes:{size:number[];vertices:number[][]}[];options:{poses:Record<string,{label:string;expressions:Record<string,number>}>;faces:Record<string,{name:string}>}};
export function defaultFace(data:Model,pose:number){
  if(data.name==='BU_0150'&&[21,23].includes(pose))return pose===21?1370:1590;
  const known=data.options.poses[pose]?.expressions||{};
  // A body marked as shouting is not necessarily paired with the normal face.
  const label=data.options.poses[pose]?.label||'';
  const match=Object.keys(known).find(id=>/叫/.test(label)&&/叫/.test(data.options.faces[id]?.name||''));
  return Number(match||Object.entries(known).sort((a,b)=>b[1]-a[1])[0]?.[0]||1000);
}
export function animationTime(time:number,duration:number){return duration>0?((time%duration)+duration)%duration:0;}
export function poseOptions(data:Model){return data.animations.map(a=>a[0]&65535).filter(id=>id>=10&&id<1000&&!(data.name==='BU_0110'&&[100,101].includes(id)));}
