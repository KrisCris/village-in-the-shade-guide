import {animationTime,type Model,type Key} from './portraitData';
import {hiddenLayers} from './portraitCatalog';
type Sample=Key&{mix:number;next?:Key};
type Command={k:Sample;m:DOMMatrix;order:number};

/** Shared-edge WebGL rasterization avoids the alpha seams of Canvas triangle clips. */
export function createPortraitRenderer(canvas:HTMLCanvasElement,data:Model,images:Map<number,HTMLImageElement>){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false});
  if(!gl)throw new Error('浏览器无法启用 WebGL');
  const program=gl.createProgram()!;
  const shaders:WebGLShader[]=[];
  for(const [type,source] of [[gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){gl_Position=vec4(p,0.,1.);v=uv;}'],[gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D tex;varying vec2 v;void main(){gl_FragColor=texture2D(tex,v);}']] as const){
    const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader failed');
    gl.attachShader(program,s);shaders.push(s);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Portrait shader link failed');
  gl.useProgram(program);const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(const [name,offset] of [['p',0],['uv',8]] as const){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset);}
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const textures=new Map<number,WebGLTexture>();
  const hidden=new Set(hiddenLayers[data.name]||[]);
  const names=data.nodes.map(n=>String.fromCharCode(...new Uint8Array(new Int32Array(n.slice(0,2)).buffer)).replace(/\0.*$/,''));
  const animations=new Map(data.animations.map(a=>[a[0]&65535,a]));
  const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
  let commands:Command[]=[],face=1000,elapsed=0,view={x:0,y:0,scale:1};
  function state(n:number[],time:number):Sample|null{
    let k=data.keys[n[5]],next:Key|undefined;
    if(!n[4]||!k)return null;
    for(let i=0;i<n[4];i++){const q=data.keys[n[5]+i];if(q.time<=time){k=q;next=i+1<n[4]?data.keys[n[5]+i+1]:undefined;}else break;}
    const t=next?Math.max(0,Math.min(1,(time-k.time)/(next.time-k.time))):0;
    return {...k,transform:k.transform.map((v,i)=>mix(v,next?.transform[i]??v,t)),mix:t,next};
  }
  function node(index:number,time:number,parent:DOMMatrix,depth=0){
    const n=data.nodes[index];if(!n||depth>80)return;
    node(n[3],time,parent,depth+1);if(hidden.has(names[index]))return;
    const k=state(n,time);let m=parent;
    if(k){const [, ,x,y,sx,sy,r]=k.transform;m=parent.translate(x,y).rotate(r*180/Math.PI).scale(sx,sy);}
    node(n[2],time,m,depth+1);
    if(!k)return;
    if(k.resource>=244)commands.push({k,m,order:k.order||0});
    else if(k.resource>=0&&data.refs[k.resource]===data.name){
      const dynamic=k.rect[0]<0,a=animations.get(dynamic?face:k.rect[0]);if(!a)return;
      const start=commands.length;
      // The expression has its own cycle; body wrap must not restart blinking.
      node(a[2],animationTime((dynamic?elapsed:time)+k.rect[1]-k.time,a[3]),m,depth+1);
      if(k.rect[3]===0){const group=commands.splice(start).sort((a,b)=>a.order-b.order);commands.push(...group.map(c=>({...c,order:k.order||0})));}
    }
  }
  function triangles(c:Command,emit:(src:number[][],dst:number[][])=>void){
    const k=c.k,[u,v,w,h]=k.rect,[px,py]=k.transform;if(w<=0||h<=0)return;
    const mesh=data.meshes[k.mesh],end=data.meshes[k.next?.mesh??-1];
    if(!mesh){emit([[u,v],[u+w,v],[u+w,v+h]],[[-px,-py],[w-px,-py],[w-px,h-py]]);emit([[u,v],[u+w,v+h],[u,v+h]],[[-px,-py],[w-px,h-py],[-px,h-py]]);return;}
    const [nx,ny]=mesh.size;if(!nx||!ny)return;const src:number[][]=[],dst:number[][]=[];
    const point=(x:number,y:number)=>{let z=mesh.vertices[src.length];if(end&&end.size[0]===nx&&end.size[1]===ny)z=z.map((v,j)=>mix(v,end.vertices[src.length][j],k.mix));src.push([u+x+z[2],v+y+z[3]]);dst.push([x-px+z[0],y-py+z[1]]);};
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)point(x*w/nx,y*h/ny);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)point((x+.5)*w/nx,(y+.5)*h/ny);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const q=y*(nx+1)+x,c=(nx+1)*(ny+1)+y*nx+x;for(const ids of [[q,q+1,c],[q+1,q+nx+2,c],[q+nx+2,q+nx+1,c],[q+nx+1,q,c]])emit(ids.map(i=>src[i]),ids.map(i=>dst[i]));}
  }
  function collect(pose:number,t:number,expression:number){commands=[];elapsed=t;face=expression;const a=animations.get(pose);if(a)node(a[2],animationTime(t,a[3]),new DOMMatrix());commands.sort((a,b)=>a.order-b.order);}
  return {
    fit(pose:number,expression:number){
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      const duration=animations.get(pose)?.[3]||0;
      for(const t of [0,duration*.25,duration*.5,duration*.75]){collect(pose,t,expression);for(const c of commands)triangles(c,(_,dst)=>{for(const [x,y] of dst){const p=c.m.transformPoint({x,y});left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}});}
      if(!Number.isFinite(left))throw new Error('立绘没有可显示的网格');
      const scale=Math.min(canvas.width/(right-left+50),canvas.height/(bottom-top+50));
      view={scale,x:canvas.width/2-(left+right)/2*scale,y:canvas.height/2-(top+bottom)/2*scale};
    },
    draw(pose:number,expression:number,t:number){
      collect(pose,t,expression);gl!.viewport(0,0,canvas.width,canvas.height);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);
      let verts:number[]=[],current=-1;
      const flush=()=>{if(!verts.length)return;gl!.bindTexture(gl!.TEXTURE_2D,textures.get(current)!);gl!.bufferData(gl!.ARRAY_BUFFER,new Float32Array(verts),gl!.STREAM_DRAW);gl!.drawArrays(gl!.TRIANGLES,0,verts.length/4);verts=[];};
      for(const c of commands){const id=c.k.resource,im=images.get(id);if(!im)continue;
        if(current!==id){flush();current=id;if(!textures.has(id)){const tx=gl!.createTexture()!;textures.set(id,tx);gl!.bindTexture(gl!.TEXTURE_2D,tx);gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,im);for(const p of [gl!.TEXTURE_MIN_FILTER,gl!.TEXTURE_MAG_FILTER])gl!.texParameteri(gl!.TEXTURE_2D,p,gl!.LINEAR);for(const p of [gl!.TEXTURE_WRAP_S,gl!.TEXTURE_WRAP_T])gl!.texParameteri(gl!.TEXTURE_2D,p,gl!.CLAMP_TO_EDGE);}}
        triangles(c,(src,dst)=>{for(let i=0;i<3;i++){const p=c.m.transformPoint({x:dst[i][0],y:dst[i][1]});verts.push(2*(p.x*view.scale+view.x)/canvas.width-1,1-2*(p.y*view.scale+view.y)/canvas.height,src[i][0]/im.width,src[i][1]/im.height);}});
      }flush();
    },
    dispose(){for(const tx of textures.values())gl!.deleteTexture(tx);gl!.deleteBuffer(buffer);gl!.deleteProgram(program);for(const s of shaders)gl!.deleteShader(s);},
  };
}
