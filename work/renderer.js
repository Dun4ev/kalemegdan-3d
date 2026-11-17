// MODULE 1 · Small column-major matrix library. No dependencies.
const Mat = {
  normalize(a) { const n=Math.hypot(...a)||1; return a.map(x=>x/n); },
  cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; },
  multiply(a,b) { const o=new Float32Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k]; return o; },
  perspective(fov,aspect,near,far) { const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,far/(near-far),-1,0,0,far*near/(near-far),0]); },
  lookAt(eye,at,up=[0,1,0]) {const z=this.normalize(eye.map((v,i)=>v-at[i])),x=this.normalize(this.cross(up,z)),y=this.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);},
  ortho(l,r,b,t,n,f) {return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,-(r+l)/(r-l),-(t+b)/(t-b),n/(n-f),1]);}
};
// MODULE 2 · WGSL. Stone, grass, brick, water and sky use only analytical noise.
const Shaders = (() => {
const shared = /* wgsl */`
struct Uniforms {
 viewProj:mat4x4f, lightVP:mat4x4f,
 eye:vec4f, sun:vec4f, params:vec4f, forward:vec4f, right:vec4f, up:vec4f
};
@group(0) @binding(0) var<uniform> u:Uniforms;
fn hash(p:vec2f)->f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p:vec2f)->f32 { let i=floor(p);let f=fract(p);let v=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2f(1,0)),v.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),v.x),v.y); }
fn fbm(p:vec2f)->f32 {return noise(p)*0.55+noise(p*2.03+vec2f(3.2))*0.28+noise(p*4.12)*0.12+noise(p*8.17)*0.05;}
fn sky(rd:vec3f)->vec3f {
 let h=max(rd.y,0.);var col=mix(vec3f(.79,.86,.88),vec3f(.24,.52,.77),pow(h,.52));
 let s=max(dot(rd,u.sun.xyz),0.); col+=vec3f(1.,.81,.52)*pow(s,180.)*.32+vec3f(1.,.93,.76)*smoothstep(.9991,.99965,s)*2.;
 if(rd.y>0.025){ let q=rd.xz/(rd.y+.16)*1.35+vec2f(u.params.x*.001,0);let c=smoothstep(.53,.76,fbm(q));col=mix(col,vec3f(.96,.96,.91),c*smoothstep(.025,.19,rd.y)*.8); }
 return col;
}
struct VIn { @location(0) pos:vec3f,@location(1) normal:vec3f,@location(2) color:vec3f,@location(3) mat:f32,@location(4) tr:vec4f,@location(5) sc:vec4f };
struct VOut { @builtin(position) clip:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) color:vec3f,@location(3) @interpolate(flat) mat:u32,@location(4) light:vec4f,@location(5) leafUV:vec2f };
fn position(v:VIn)->vec3f {
 var p=v.pos*v.sc.xyz; let c=cos(v.tr.w);let s=sin(v.tr.w);p=vec3f(c*p.x-s*p.z,p.y,s*p.x+c*p.z)+v.tr.xyz;
 if(v.mat==4.||(v.mat>=12.&&v.mat<13.)) {p.x+=sin(p.z*.4+u.params.x*.75)*.065*max(v.pos.y,0.);}
 return p;
}
fn vertexData(v:VIn)->VOut {
 var o:VOut;let p=position(v);let c=cos(v.tr.w);let s=sin(v.tr.w);let n=v.normal/v.sc.xyz;
 let code=fract(v.mat);o.leafUV=vec2f(select(-1.,1.,code>=.25&&code<.75),select(-1.,1.,code>=.5));o.world=p;o.clip=u.viewProj*vec4f(p,1);o.normal=normalize(vec3f(c*n.x-s*n.z,n.y,s*n.x+c*n.z));o.color=v.color*v.sc.w;o.mat=u32(v.mat);o.light=u.lightVP*vec4f(p,1);return o;
}
@vertex fn vs(v:VIn)->VOut {return vertexData(v);}
fn cutLeaf(v:VOut)->bool {
 if(v.mat!=12u){return false;}let uv=v.leafUV;var shape=10.;
 for(var i=0;i<3;i++){let y=f32(i)*.58-.58;
  for(var j=0;j<2;j++){let x=select(-.31,.31,j==1);let q=(uv-vec2f(x,y))/vec2f(.40,.32);shape=min(shape,dot(q,q));}
 }return shape>1. || noise(v.world.xz*23.)<.035;
}
@vertex fn shadowVS(v:VIn)->VOut {var o=vertexData(v);o.clip=o.light;return o;}
@fragment fn shadowFS(v:VOut) {if(cutLeaf(v)){discard;}}
`;
const scene = shared + /* wgsl */`
@group(0) @binding(1) var shadowTex:texture_depth_2d;
@group(0) @binding(2) var shadowSampler:sampler_comparison;
@group(0) @binding(3) var facadeTex:texture_2d_array<f32>;
@group(0) @binding(4) var facadeSampler:sampler;
fn shadow(light:vec4f,n:vec3f)->f32 {
 let q=light.xyz/light.w;let uv=q.xy*vec2f(.5,-.5)+.5;
 if(any(uv<vec2f(0))||any(uv>vec2f(1))||q.z<0.||q.z>1.){return 1.;}
 let bias=max(.00035,.0015*(1.-dot(n,u.sun.xyz)));var sum=0.;let texel=1./f32(textureDimensions(shadowTex).x);
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){sum+=textureSampleCompareLevel(shadowTex,shadowSampler,uv+vec2f(f32(x),f32(y))*texel*1.3,q.z-bias);}}
 return sum/9.;
}
@fragment fn fs(v:VOut)->@location(0) vec4f {
 let footprint=fwidth(v.world);if(cutLeaf(v)){discard;}
 let p=v.world;var n=normalize(v.normal);var albedo=v.color;let dist=distance(p,u.eye.xyz);let view=normalize(u.eye.xyz-p);
 if(v.mat==1u||v.mat==2u||v.mat==10u){
  var uv=vec2f(p.x,p.y);if(abs(n.x)>.65){uv=vec2f(p.z,p.y);}if(abs(n.y)>.65){uv=p.xz;}
  let brick=v.mat==2u;let ashlar=v.mat==10u;
  let size=select(select(vec2f(.64,.29),vec2f(.92,.46),ashlar),vec2f(.29,.085),brick);
  let warp=select(vec2f((noise(uv*4.1)-.5)*.08,(noise(uv*3.7+9.)-.5)*.035),vec2f(0),ashlar||brick);
  let row=floor((uv.y+warp.y)/size.y);let shift=hash(vec2f(row,7.))*.8;
  let grid=vec2f((uv.x+warp.x)/size.x+shift,(uv.y+warp.y)/size.y);let cell=floor(grid);let f=fract(grid);
  let edge=min(min(f.x,1.-f.x)*size.x,min(f.y,1.-f.y)*size.y);
  let aa=max(footprint.x,max(footprint.y,footprint.z))*.55;let seam=select(.013,.005,brick);
  let mortar=1.-smoothstep(seam-aa,seam+.008+aa,edge);
  let mott=fbm(uv*4.7);let random=hash(cell+row);
  albedo*=.79+.34*random+.23*(mott-.5);
  albedo=mix(albedo,vec3f(.67,.65,.58),mortar*.70);
  let weather=fbm(uv*.65+vec2f(11.));albedo*=.89+.17*weather;
  albedo=mix(albedo,vec3f(.57,.56,.49),smoothstep(.67,.85,weather)*.28);
  let panelMeters=select(vec2f(3.2,2.5),vec2f(1.72,3.36),brick);
  let pixelMeters=max(footprint.x,max(footprint.y,footprint.z));
  let lod=clamp(log2(max(.001,pixelMeters*256./min(panelMeters.x,panelMeters.y))),0.,8.);
  let stonePhoto=textureSampleLevel(facadeTex,facadeSampler,uv*vec2f(1.,-1.)/panelMeters,select(0,1,brick),lod).rgb;
  albedo=mix(albedo,stonePhoto*select(vec3f(1.05,1.04,1.02),vec3f(1.15,.99,.90),brick),select(.57,.82,brick||ashlar));
  let relief=vec3f(noise(uv*28.)-.5,noise(uv*22.+2.)-.5,noise(uv*25.+7.)-.5);
  n=normalize(n+relief*select(.18,.08,ashlar));
 } else if(v.mat==11u){
  albedo*=.91+.13*fbm(p.xy*3.+p.z);albedo*=1.-.045*noise(p.xz*70.);
 } else if(v.mat==0u){ let g=fbm(p.xz*.23);albedo*=.76+g*.48;albedo*=.88+.20*noise(p.xz*18.);albedo=mix(albedo,vec3f(.45,.40,.23),smoothstep(.66,.85,g)*.55); }
 else if(v.mat==3u){let g=noise(p.xz*13.);let tile=fract(p.xz*1.4);let seam=1.-smoothstep(.014,.06,min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y)));albedo*=.83+g*.3;albedo*=1.-seam*.15;}
 else if(v.mat==13u){albedo*=.87+.22*noise(p.xz*42.);albedo*=.95+.1*noise(p.xz*.7);}
 else if(v.mat==14u){albedo*=.76+.4*noise(p.xz*36.);albedo=mix(albedo,vec3f(.52,.49,.41),smoothstep(.75,.9,noise(p.xz*20.))*.22);}
 else if(v.mat==5u){albedo*=.75+.3*noise(vec2f(p.x*24.+p.z*24.,p.y*.6));}
 else if(v.mat==6u){albedo*=.75+.4*fbm(p.xy*5.);}
 else if(v.mat==4u||v.mat==12u){albedo*=.76+.35*noise(p.xz*5.+p.y);if(v.mat==12u){albedo*=.84+.16*smoothstep(.02,.10,abs(v.leafUV.x));}}
 else if(v.mat==7u){let uv=vec2f(p.x+p.z,p.y);let grid=fract(uv*vec2f(5.,6.));albedo*=.8+.2*noise(floor(uv*vec2f(5.,6.)));albedo*=.85+.15*smoothstep(.02,.09,min(grid.x,grid.y));}
 if(v.mat==9u){
  let t=u.params.x;let fade=1./(1.+dist*.006);let w1=sin(p.x*.63+p.z*.48+t*1.4);let w2=sin(p.x*.39-p.z*.52-t*.85);
  n=normalize(vec3f((w1*.09+w2*.035)*fade,1.,cos(p.z*.65+p.x*.21+t)*.075*fade));
  let fres=pow(1.-max(dot(view,n),0.),4.);let refl=sky(reflect(-view,n));
  albedo=mix(vec3f(.17,.36,.42),refl,min(.85,.24+fres*.62));
  let halfv=normalize(view+u.sun.xyz);let spec=pow(max(dot(n,halfv),0.),190.);let sparkle=pow(max(dot(n,halfv),0.),850.);
  albedo+=vec3f(1.,.9,.68)*(spec*.85+sparkle*.8);albedo+=vec3f(.025)*(noise(p.xz*.09+vec2f(t*.04))-.5)*fade;
  let fog=1.-exp(-dist*.00065);return vec4f(mix(albedo,sky(normalize(p-u.eye.xyz)),fog),1);
 }
 let shade=shadow(v.light,n);let ndl=max(dot(n,u.sun.xyz),0.);let hemi=.5+.5*n.y;
 let ambient=mix(vec3f(.25,.29,.27),vec3f(.55,.64,.71),hemi)*.83;
 var col=albedo*(ambient+vec3f(1.,.93,.78)*ndl*shade*.91);
 if(v.mat==4u||v.mat==12u){col+=albedo*.22*max(dot(-n,u.sun.xyz),0.);}
 if(v.mat==15u){col=mix(albedo,col,.24);}
 if(v.mat==6u){col+=vec3f(.52,.62,.48)*pow(max(dot(reflect(-u.sun.xyz,n),view),0.),35.)*shade*.35;}
 col=pow(max(col,vec3f(0)),vec3f(.91));let fog=1.-exp(-dist*.0015);col=mix(col,sky(normalize(p-u.eye.xyz)),min(.92,fog));return vec4f(col,1);
}
`;
const background=shared+/* wgsl */`
struct SkyOut {@builtin(position) pos:vec4f,@location(0) uv:vec2f};
@vertex fn skyVS(@builtin(vertex_index) i:u32)->SkyOut {var o:SkyOut;let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));o.pos=vec4f(xy[i],.999999,1);o.uv=xy[i];return o;}
@fragment fn skyFS(v:SkyOut)->@location(0) vec4f {let rd=normalize(u.forward.xyz+v.uv.x*u.right.xyz*u.right.w*u.forward.w+v.uv.y*u.up.xyz*u.forward.w);return vec4f(sky(rd),1);}
`;
return {scene,background,shadow:shared};
})();
// MODULE 3 · WebGPU renderer, shadow pass and adaptive quality.
class Renderer {
 constructor(canvas,onStats,onError){this.canvas=canvas;this.onStats=onStats;this.onError=onError;this.scale=.9;this.detail=1;this.frames=0;this.frameTimes=[];this.slow=0;this.fast=0;this.auto=true;this.dead=false;this.errors=[];}
 async loadFacadeMaterials() {
  const device = this.device;
  const texture = device.createTexture({
   size: [256,256,2], mipLevelCount:9, format:'rgba8unorm',
   usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {willReadFrequently:true});
  for (const [layer,uri] of facadePhotos.entries()) {
   const photo = new Image();
   photo.src = uri;
   await photo.decode();
   for (let level=0;level<9;level++) {
    const size = 256 >> level;
    canvas.width = canvas.height = size;
    context.drawImage(photo,0,0,size,size);
    device.queue.writeTexture({texture,mipLevel:level,origin:[0,0,layer]},
     context.getImageData(0,0,size,size).data,{bytesPerRow:size*4},[size,size,1]);
   }
  }
  this.facadeView = texture.createView({dimension:'2d-array'});
  this.facadeSampler = device.createSampler({addressModeU:'mirror-repeat',addressModeV:'mirror-repeat',
   minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:4});
 }
 async init(world){
  if(!navigator.gpu)throw Error('WebGPU недоступен. Откройте файл в современном Chrome или Edge с аппаратным ускорением.');
  this.adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!this.adapter)throw Error('Браузер не предоставил WebGPU-адаптер. Проверьте аппаратное ускорение и драйвер видеокарты.');
  const d=this.device=await this.adapter.requestDevice();d.addEventListener('uncapturederror',e=>{this.errors.push(e.error.message);this.onError(e.error.message);});d.lost.then(info=>{this.dead=true;this.onError('Графическое устройство отключено. Перезагрузите страницу. '+info.message);});
  this.ctx=this.canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.ctx.configure({device:d,format:this.format,alphaMode:'opaque'});
  this.uniform=d.createBuffer({size:224,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.layout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{viewDimension:'2d-array'}},{binding:4,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
  this.shadowLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]});
  this.shadowBind=d.createBindGroup({layout:this.shadowLayout,entries:[{binding:0,resource:{buffer:this.uniform}}]});
  this.sampler=d.createSampler({compare:'less-equal',magFilter:'linear',minFilter:'linear'});await this.loadFacadeMaterials();this.makeShadow(2048);
  const buffers=[{arrayStride:40,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x3'},{shaderLocation:3,offset:36,format:'float32'}]},{arrayStride:32,stepMode:'instance',attributes:[{shaderLocation:4,offset:0,format:'float32x4'},{shaderLocation:5,offset:16,format:'float32x4'}]}];
  const makeModule=async(code,label)=>{let m=d.createShaderModule({code,label});let info=await m.getCompilationInfo();let errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw Error(label+': '+errors.map(e=>e.lineNum+':'+e.message).join('\n'));return m;};
  const modules=await Promise.all([makeModule(Shaders.scene,'Materials'),makeModule(Shaders.background,'Sky'),makeModule(Shaders.shadow,'Shadows')]);
  const layout=d.createPipelineLayout({bindGroupLayouts:[this.layout]});
  [this.pipeline,this.skyPipeline,this.shadowPipeline]=await Promise.all([
   d.createRenderPipelineAsync({layout,vertex:{module:modules[0],entryPoint:'vs',buffers},fragment:{module:modules[0],entryPoint:'fs',targets:[{format:this.format}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}}),
   d.createRenderPipelineAsync({layout,vertex:{module:modules[1],entryPoint:'skyVS'},fragment:{module:modules[1],entryPoint:'skyFS',targets:[{format:this.format}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:false,depthCompare:'less-equal'}}),
   d.createRenderPipelineAsync({layout:d.createPipelineLayout({bindGroupLayouts:[this.shadowLayout]}),vertex:{module:modules[2],entryPoint:'shadowVS',buffers},fragment:{module:modules[2],entryPoint:'shadowFS',targets:[]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2}})
  ]);
  const water=[];for(const p of [[-6000,0,-6000],[-6000,0,6000],[6000,0,6000],[-6000,0,-6000],[6000,0,6000],[6000,0,-6000]])water.push(...p,0,1,0,.2,.4,.45,9);
  this.batches=[...world.batches,{name:'rivers',vertices:new Float32Array(water),instances:new Float32Array([0,.1,0,0,1,1,1,1])}].map(b=>{
   const vertex=d.createBuffer({size:b.vertices.byteLength,usage:GPUBufferUsage.VERTEX,mappedAtCreation:true});new Float32Array(vertex.getMappedRange()).set(b.vertices);vertex.unmap();
   const instance=d.createBuffer({size:b.instances.byteLength,usage:GPUBufferUsage.VERTEX,mappedAtCreation:true});new Float32Array(instance.getMappedRange()).set(b.instances);instance.unmap();return {name:b.name,vertex,instance,count:b.vertices.length/10,instances:b.instances.length/8,detail:b.detail};
  });
  this.sun=Mat.normalize([.45,.81,.38]);this.lightVP=Mat.multiply(Mat.ortho(-245,245,-245,245,1,950),Mat.lookAt(this.sun.map((v,i)=>v*430+(i===1?15:0)),[0,15,0]));
  this.resize();
 }
 makeShadow(size){if(this.shadowTexture)this.shadowTexture.destroy();this.shadowSize=size;this.shadowTexture=this.device.createTexture({size:[size,size],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});this.shadowView=this.shadowTexture.createView();this.bind=this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.shadowView},{binding:2,resource:this.sampler},{binding:3,resource:this.facadeView},{binding:4,resource:this.facadeSampler}]});this.shadowDirty=true;}
 resize(){if(!this.device)return;const pixel=Math.min(devicePixelRatio||1,1.5)*this.scale;const w=Math.max(320,Math.min(2560,Math.round(this.canvas.clientWidth*pixel))),h=Math.max(240,Math.min(1600,Math.round(this.canvas.clientHeight*pixel)));if(this.canvas.width===w&&this.canvas.height===h&&this.depth)return;this.canvas.width=w;this.canvas.height=h;if(this.depth)this.depth.destroy();this.depth=this.device.createTexture({size:[w,h],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});this.depthView=this.depth.createView();}
 quality(mode){this.auto=mode==='auto';if(!this.auto){this.scale=mode==='high'?1:mode==='medium'?.75:.5;this.detail=mode==='high'?1:mode==='medium'?.8:.55;this.makeShadow(mode==='low'?1024:2048);this.resize();}this.frameTimes=[];this.slow=0;this.fast=0;}
 render(camera,time,dt){if(this.dead)return;this.resize();const {position:eye,yaw,pitch}=camera;const cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp],right=[Math.cos(yaw),0,Math.sin(yaw)],up=Mat.cross(right,forward);const aspect=this.canvas.width/this.canvas.height;const fov=2*Math.atan(Math.tan(Math.PI/6)/Math.min(1,Math.max(.6,aspect)));
  if(!this.shadowCenter||Math.hypot(eye[0]-this.shadowCenter[0],eye[2]-this.shadowCenter[1])>4){const center=[Math.round(eye[0]/4)*4,eye[1]-10,Math.round(eye[2]/4)*4];this.shadowCenter=[center[0],center[2]];this.lightVP=Mat.multiply(Mat.ortho(-180,180,-180,180,1,1100),Mat.lookAt(this.sun.map((v,i)=>v*500+center[i]),center));this.shadowDirty=true;}
  const vp=Mat.multiply(Mat.perspective(fov,aspect,.08,6500),Mat.lookAt(Array.from(eye),eye.map((v,i)=>v+forward[i])));const u=new Float32Array(56);u.set(vp);u.set(this.lightVP,16);u.set([...eye,1],32);u.set([...this.sun,1],36);u.set([time,this.canvas.width,this.canvas.height,this.detail],40);u.set([...forward,Math.tan(fov/2)],44);u.set([...right,aspect],48);u.set([...up,0],52);this.device.queue.writeBuffer(this.uniform,0,u);
  const enc=this.device.createCommandEncoder();const draw=(pass,shadow)=>{for(const b of this.batches){if(shadow&&b.name==='rivers')continue;const count=b.detail?Math.max(1,Math.floor(b.instances*this.detail)):b.instances;pass.setVertexBuffer(0,b.vertex);pass.setVertexBuffer(1,b.instance);pass.draw(b.count,count);}};
  if(this.shadowDirty||this.frames%8===0){const pass=enc.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.shadowView,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});pass.setPipeline(this.shadowPipeline);pass.setBindGroup(0,this.shadowBind);draw(pass,true);pass.end();this.shadowDirty=false;}
  const pass=enc.beginRenderPass({colorAttachments:[{view:this.ctx.getCurrentTexture().createView(),clearValue:{r:.6,g:.8,b:.9,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depthView,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});pass.setBindGroup(0,this.bind);pass.setPipeline(this.skyPipeline);pass.draw(3);pass.setPipeline(this.pipeline);draw(pass,false);pass.end();this.device.queue.submit([enc.finish()]);this.frames++;
  if(dt>0&&dt<.15){this.frameTimes.push(dt);if(this.frameTimes.length>90)this.frameTimes.shift();}
  if(this.frames%90===0&&this.frameTimes.length>=45){const avg=this.frameTimes.reduce((a,b)=>a+b)/this.frameTimes.length;this.fps=1/avg;if(this.auto){this.slow=avg>.019?this.slow+1:0;this.fast=avg<.0175?this.fast+1:0;if(this.slow>=2){if(this.scale>.5)this.scale=Math.max(.5,this.scale-.1);else this.detail=Math.max(.5,this.detail-.12);if(this.scale<.65&&this.shadowSize>1024)this.makeShadow(1024);this.slow=0;this.resize();}if(this.fast>=5&&this.scale<1){this.scale=Math.min(1,this.scale+.05);this.detail=Math.min(1,this.detail+.05);this.fast=0;this.resize();}}
   this.onStats({fps:Math.round(this.fps),scale:this.scale,detail:this.detail,width:this.canvas.width,height:this.canvas.height,auto:this.auto});
  }
 }
}
