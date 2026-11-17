// MODULE 4 · Georeferenced procedural world. OSM supplies XY, GEM-15 supplies broad terrain.
// Original meshes are generated below. Fortification heights and small surface corrections are approximations.
const World = (() => {
 const PI=Math.PI,TAU=2*PI,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
 const linen=[.72,.70,.62],pale=[.83,.81,.72],ash=[.43,.41,.36],brick=[.54,.29,.19],earth=[.65,.57,.43],bronze=[.17,.31,.25],iron=[.13,.18,.18],timber=[.43,.28,.17],tile=[.43,.24,.16];
 const ID=[0,0,0,0,1,1,1,1];
  function newMesh(){return [];}
  function triangle(g,a,b,c,color,m,na,nb,nc){
    if(!na){
      const u=b.map((v,i)=>v-a[i]),v=c.map((w,i)=>w-a[i]);
      na=normal([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);
      nb=nc=na;
    }
    g.push(...a,...na,...color,m,...b,...nb,...color,m,...c,...nc,...color,m);
  }
  const normal=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
  const quad=(g,a,b,c,d,col,m)=>{triangle(g,a,b,c,col,m);triangle(g,a,c,d,col,m);};
  const tone=(c,f)=>c.map(v=>clamp(v*f));
  function box(g,x,y,z,hx,hy,hz,c,m,ang=0){
    const co=Math.cos(ang),si=Math.sin(ang);
    const p=(a,b,d)=>[x+co*a*hx-si*d*hz,y+b*hy,z+si*a*hx+co*d*hz];
    const [a,b,d,e]=[p(-1,-1,-1),p(1,-1,-1),p(1,-1,1),p(-1,-1,1)];
    const [A,B,D,E]=[p(-1,1,-1),p(1,1,-1),p(1,1,1),p(-1,1,1)];
    quad(g,a,A,B,b,c,m);quad(g,b,B,D,d,c,m);quad(g,d,D,E,e,c,m);quad(g,e,E,A,a,c,m);
    quad(g,A,E,D,B,c,m);quad(g,e,a,b,d,c,m);
  }
  function column(g,x,y,z,r0,r1,height,n,c,m,angle=0,flat=false){
    for(let i=0;i<n;i++){
      const a=i*TAU/n+angle,b=(i+1)*TAU/n+angle;
      const p=(t,r,h)=>[x+Math.cos(t)*r,y+h,z+Math.sin(t)*r];
      const [L,R,U,V]=[p(a,r0,0),p(b,r0,0),p(a,r1,height),p(b,r1,height)];
      const v=(r0-r1)/height;
      if(flat) quad(g,L,U,V,R,c,m);
      else{
        let A=normal([Math.cos(a),v,Math.sin(a)]),B=normal([Math.cos(b),v,Math.sin(b)]);
        triangle(g,L,U,V,c,m,A,A,B);triangle(g,L,V,R,c,m,A,B,B);
      }
      triangle(g,[x,y,z],L,R,c,m);
      if(r1>.001) triangle(g,[x,y+height,z],V,U,c,m);
    }
  }
  function lump(g,x,y,z,rx,ry,rz,color,m,n=10,l=5,seed=0,rough=0){
    const p=(k,j)=>{
      const va=PI*k/l,ha=TAU*j/n,s=Math.sin(va);
      const d=1+rough*Math.sin(k*83.21+(j%n)*7.617+seed);
      return [x+rx*s*Math.cos(ha)*d,y+ry*Math.cos(va)*d,z+rz*s*Math.sin(ha)*d];
    };
    for(let k=0;k<l;k++) for(let j=0;j<n;j++){
      const a=p(k,j),b=p(k,j+1),c=p(k+1,j+1),d=p(k+1,j);
      const col=tone(color,1+.095*Math.sin(k*21+j*41+seed));
      const norm=q=>normal([(q[0]-x)/(rx*rx),(q[1]-y)/(ry*ry),(q[2]-z)/(rz*rz)]);
      if(k>0) triangle(g,a,b,d,col,m,...(m===4?[norm(a),norm(b),norm(d)]:[]));
      if(k<l-1) triangle(g,b,c,d,col,m,...(m===4?[norm(b),norm(c),norm(d)]:[]));
    }
  }
  function branch(g,a,b,r0,r1,c,m,n=7){
    const f=normal(b.map((v,i)=>v-a[i]));
    const u=normal(Math.abs(f[1])<.9?[-f[2],0,f[0]]:[f[1],-f[0],0]);
    const v=[f[1]*u[2]-f[2]*u[1],f[2]*u[0]-f[0]*u[2],f[0]*u[1]-f[1]*u[0]];
    const end=(p,r,t)=>p.map((q,i)=>q+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
    for(let i=0;i<n;i++){
      const s=i*TAU/n,t=(i+1)*TAU/n;
      quad(g,end(a,r0,s),end(a,r0,t),end(b,r1,t),end(b,r1,s),c,m);
    }
  }
 const bbox=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
 function pointIn(x,z,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!=(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
 function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
 const waters=MapData.water.map(q=>({...q,b:bbox(q.points)}));
 function isWater(x,z){for(const q of waters){if(q.hole||x<q.b[0]||x>q.b[2]||z<q.b[1]||z>q.b[3])continue;if(pointIn(x,z,q.points)&&!waters.some(h=>h.hole&&h.relation===q.relation&&pointIn(x,z,h.points)))return true;}return false;}
 const td=TerrainData, samples=Float32Array.from(td.values.map(x=>x===null?NaN:x-td.riverReference));
 // Fill masked shore cells from nearby valid DTM samples. Water itself remains separately masked.
 for(let pass=0;pass<10;pass++){const previous=samples.slice();let filled=0;for(let j=0;j<td.height;j++)for(let i=0;i<td.width;i++){const k=j*td.width+i;if(Number.isFinite(previous[k]))continue;let sum=0,n=0;for(const [a,b] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]])if(a>=0&&a<td.width&&b>=0&&b<td.height&&Number.isFinite(previous[b*td.width+a])){sum+=previous[b*td.width+a];n++;}if(n){samples[k]=sum/n;filled++;}}if(!filled)break;}
 function rawHeight(x,z){const gx=clamp((x-td.x0)/td.step,0,td.width-1.001),gz=clamp((z-td.z0)/td.step,0,td.height-1.001),i=Math.floor(gx),j=Math.floor(gz),a=samples[j*td.width+i],b=samples[j*td.width+i+1],c=samples[(j+1)*td.width+i],d=samples[(j+1)*td.width+i+1];let h=mix(mix(Number.isFinite(a)?a:3,Number.isFinite(b)?b:3,gx-i),mix(Number.isFinite(c)?c:3,Number.isFinite(d)?d:3,gx-i),gz-j);const outside=Math.max(td.x0-x,x-(td.x0+(td.width-1)*td.step),td.z0-z,z-(td.z0+(td.height-1)*td.step),0);return mix(h,x>350&&z>180?35:4,smooth(0,180,outside));}
 const upper=MapData.areas.upper;const highSamples=[];for(let j=0;j<td.height;j++)for(let i=0;i<td.width;i++){let x=td.x0+i*td.step,z=td.z0+j*td.step,v=samples[j*td.width+i];if(Number.isFinite(v)&&pointIn(x,z,upper))highSamples.push(v);}highSamples.sort((a,b)=>a-b);const upperHeight=highSamples[Math.floor(highSamples.length*.83)]||42;
 const gates=Object.entries(MapData.landmarks).filter(([k])=>['outerStambol','innerStambol','sahatGate','zindan','despot','leopold','defterdar','charles','vidin','king','dark','savaGate','karadjordje'].includes(k)).map(([key,v])=>({...v,key}));
 const scanTerrace = rawHeight(-79.98,173.33);
 function baseHeight(x,z){if(isWater(x,z))return -3.5;let h=rawHeight(x,z);
  // A 15 m DTM blurs the edge of the upper terrace. Recover the mapped flat courtyard.
  if(pointIn(x,z,upper)){let d=Infinity;for(let i=1;i<upper.length;i++)d=Math.min(d,segmentDistance(x,z,upper[i-1],upper[i]));h=mix(h,upperHeight,smooth(0,7,d)*.96);}
  if(MapData.pavedAreas.some(p=>p.id==='49261710'&&pointIn(x,z,p.points)))h=upperHeight;
  const scanRadius=Math.hypot((x+79.98)/8.5,(z-173.33)/9.5);
  if(scanRadius<1.5)h=mix(scanTerrace,h,smooth(1,1.5,scanRadius));
  return Math.max(.8,h);
 }
 // Sample the actual two triangles rendered in each terrain cell. Cache only
 // corner heights; the underlying 15 m DTM stays at its native precision.
 const cornerCache=new Map();
 function cornerHeight(x,z){
  const key=x+','+z;
  if(!cornerCache.has(key))cornerCache.set(key,baseHeight(x,z));
  return cornerCache.get(key);
 }
 function meshHeight(x,z){
  const core=x>=-450&&x<510&&z>=-510&&z<630,step=core?4:30;
  const ox=core?-450:-2490,oz=core?-510:-2310;
  const left=ox+Math.floor((x-ox)/step)*step,top=oz+Math.floor((z-oz)/step)*step;
  return cellHeight(x,z,left,top,step);
 }
 function cellHeight(x,z,left,top,step){
  const u=(x-left)/step,v=(z-top)/step;
  const a=cornerHeight(left,top),c=cornerHeight(left+step,top+step);
  if(v>u)return a*(1-v)+cornerHeight(left,top+step)*(v-u)+c*u;
  return a*(1-u)+cornerHeight(left+step,top)*(u-v)+c*v;
 }
 // Clip a convex pavement face to every terrain grid edge it crosses, including
 // the diagonal. Each output triangle then lies on exactly one ground plane.
 function cutFace(poly,distance){
  const lo=[],hi=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a),db=distance(b);
   if(da<=1e-8)lo.push(a);
   if(da>=-1e-8)hi.push(a);
   if((da< -1e-8&&db>1e-8)||(da>1e-8&&db< -1e-8)){
    const t=da/(da-db),q=[mix(a[0],b[0],t),mix(a[1],b[1],t)];
    lo.push(q);hi.push(q);
   }
  }
  return [lo,hi];
 }
 function gridStrips(poly,axis,origin,step){
  const low=Math.min(...poly.map(p=>p[axis])),high=Math.max(...poly.map(p=>p[axis]));
  const strips=[];
  for(let edge=origin+(Math.floor((low-origin)/step)+1)*step;edge<high-1e-8;edge+=step){
   const [left,right]=cutFace(poly,p=>p[axis]-edge);
   if(left.length>=3)strips.push(left);
   poly=right;
  }
  if(poly.length>=3)strips.push(poly);
  return strips;
 }
 function drape(g,poly,col,material,lift){
  // Partition along the fine-patch boundary before using either grid.
  let pieces=[poly];
  for(const [axis,edge] of [[0,-450],[0,510],[1,-510],[1,630]]){
   pieces=pieces.flatMap(q=>q.some(p=>p[axis]<edge)&&q.some(p=>p[axis]>edge)?cutFace(q,p=>p[axis]-edge).filter(r=>r.length>=3):[q]);
  }
  for(const piece of pieces){
   const center=axis=>piece.reduce((n,p)=>n+p[axis],0)/piece.length;
   const core=center(0)>=-450&&center(0)<510&&center(1)>=-510&&center(1)<630;
   const step=core?4:30,ox=core?-450:-2490,oz=core?-510:-2310;
   for(const strip of gridStrips(piece,0,ox,step))for(const cell of gridStrips(strip,1,oz,step)){
    const left=ox+Math.floor((cell.reduce((n,p)=>n+p[0],0)/cell.length-ox)/step)*step;
    const top=oz+Math.floor((cell.reduce((n,p)=>n+p[1],0)/cell.length-oz)/step)*step;
    for(const face of cutFace(cell,p=>p[1]-top-(p[0]-left))){
     for(let i=1;i+1<face.length;i++){
      const [a,b,c]=[face[0],face[i],face[i+1]],area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(Math.abs(area)<1e-8)continue;
      const vertex=p=>[p[0],cellHeight(p[0],p[1],left,top,step)+lift,p[1]];
      triangle(g,vertex(a),vertex(area<0?b:c),vertex(area<0?c:b),col,material);
     }
    }
   }
  }
 }
 const bridgeDecks=MapData.paths.filter(p=>p.bridge&&p.points.length>1).map(p=>{const a=p.points[0],b=p.points.at(-1);return {...p,a,b,ya:meshHeight(...a),yb:meshHeight(...b)};});
 function groundHeight(x,z){let h=meshHeight(x,z);if(h<0)return h;for(const b of bridgeDecks){const dx=b.b[0]-b.a[0],dz=b.b[1]-b.a[1],len2=dx*dx+dz*dz,t=((x-b.a[0])*dx+(z-b.a[1])*dz)/(len2||1);if(t>=0&&t<=1&&segmentDistance(x,z,b.a,b.b)<=b.width/2+.1)h=Math.max(h,mix(b.ya,b.yb,t));}return h;}
 const inGate=(x,z,margin=1)=>gates.some(g=>{const dx=x-g.x,dz=z-g.z,c=Math.cos(g.angle),s=Math.sin(g.angle),a=c*dx+s*dz,b=-s*dx+c*dz;return Math.abs(a)<Math.max(g.width/2,3.4)+margin&&Math.abs(b)<Math.max(g.depth/2,4)+margin;});
 // Ear clipping for the simple, closed OSM building polygons.
 function triangulate(points){const p=points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1]?points.slice(0,-1):points.slice();let ids=p.map((_,i)=>i),area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)ids.reverse();const tris=[];const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let limit=p.length*p.length;while(ids.length>2&&limit-->0){let cut=false;for(let k=0;k<ids.length;k++){const ia=ids[(k+ids.length-1)%ids.length],ib=ids[k],ic=ids[(k+1)%ids.length],a=p[ia],b=p[ib],c=p[ic];if(cross(a,b,c)<.00001)continue;if(ids.some(j=>j!==ia&&j!==ib&&j!==ic&&cross(a,b,p[j])>=0&&cross(b,c,p[j])>=0&&cross(c,a,p[j])>=0))continue;tris.push([a,b,c]);ids.splice(k,1);cut=true;break;}if(!cut)break;}return tris;}
 function build(){
  const batches=[],colliders=[],paths=[],land=newMesh(),architecture=newMesh(),paving=newMesh(),furniture=newMesh(),details=newMesh();let seed=198203;
  const rnd=()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
  const add=(name,g,instances=ID,detail=false)=>{if(g.length&&instances.length)batches.push({name,vertices:new Float32Array(g),instances:new Float32Array(instances),detail});};
  let currentSource="";const solid=(x,z,hx,hz,y0,y1,angle=0)=>colliders.push({x,z,hx,hz,y0,y1,angle,source:currentSource});
  const terrainPatch=(x0,z0,x1,z1,step,skipCore=false)=>{
   const nx=Math.round((x1-x0)/step),nz=Math.round((z1-z0)/step),heights=new Float32Array((nx+1)*(nz+1));for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)heights[j*(nx+1)+i]=cornerHeight(x0+i*step,z0+j*step);
   const point=(i,j)=>[x0+i*step,heights[j*(nx+1)+i],z0+j*step];
   const norm=(i,j)=>normal([heights[j*(nx+1)+Math.max(0,i-1)]-heights[j*(nx+1)+Math.min(nx,i+1)],2*step,heights[Math.max(0,j-1)*(nx+1)+i]-heights[Math.min(nz,j+1)*(nx+1)+i]]);
   for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=x0+i*step,z=z0+j*step;if(skipCore&&x>=-450&&x<510&&z>=-510&&z<630)continue;const a=point(i,j),b=point(i,j+1),c=point(i+1,j+1),d=point(i+1,j);if(Math.max(a[1],b[1],c[1],d[1])<-.1)continue;const h=(a[1]+c[1])*.5;const f=.5+.5*Math.sin(x*.021+z*.013)*Math.cos(z*.036);const col=h<1.5?[.45,.43,.32]:[.29+f*.09,.39+f*.085,.17+f*.035];triangle(land,a,b,c,col,0,norm(i,j),norm(i,j+1),norm(i+1,j+1));triangle(land,a,c,d,col,0,norm(i,j),norm(i+1,j+1),norm(i+1,j));}
  };
  terrainPatch(-450,-510,510,630,4);terrainPatch(-2490,-2310,1590,1290,30,true);
  for(const area of MapData.pavedAreas){for(const [a,b,c] of triangulate(area.points))drape(paving,[a,b,c],earth,3,.055);}
  for(const path of MapData.paths){currentSource="path:"+path.id;for(let k=1;k<path.points.length;k++){const a=path.points[k-1],b=path.points[k],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.04||Math.abs((a[0]+b[0])/2)>900||Math.abs((a[1]+b[1])/2)>1000)continue;const width=path.width,road=['secondary','tertiary','service','residential'].includes(path.kind);paths.push({a,b,width,kind:path.kind,id:path.id});const offset=(index,side)=>{
    const v=path.points[index],prev=path.points[index-1],next=path.points[index+1];
    const perpendicular=(a,b)=>{const u=b[0]-a[0],w=b[1]-a[1],l=Math.hypot(u,w)||1;return [w/l,-u/l];};
    const before=prev?perpendicular(prev,v):perpendicular(v,next),after=next?perpendicular(v,next):before;
    const scale=width*.5*side/Math.max(.5,1+before[0]*after[0]+before[1]*after[1]);
    return [v[0]+(before[0]+after[0])*scale,v[1]+(before[1]+after[1])*scale];
   };
   const corners=[offset(k-1,-1),offset(k,-1),offset(k,1),offset(k-1,1)];
   if(path.bridge){
    const vertex=p=>[p[0],groundHeight(...p)+.085,p[1]];
    quad(paving,...corners.map(vertex),timber,5);
   }else{
    const hard=road||path.surface==='asphalt',color=hard?[.34,.35,.34]:earth;
    const material=hard?13:['gravel','fine_gravel','compacted'].includes(path.surface)?14:3;
    drape(paving,corners,color,material,.085);
   }
   if(path.bridge){const ang=Math.atan2(dz,dx);for(const side of [-1,1]){const nx=dz/len*width*.5*side,nz=-dx/len*width*.5*side;branch(furniture,[a[0]+nx,groundHeight(...a)+1,a[1]+nz],[b[0]+nx,groundHeight(...b)+1,b[1]+nz],.055,.055,iron,6,5);for(let t=0;t<len;t+=2.2){const x=mix(a[0],b[0],t/len)+nx,z=mix(a[1],b[1],t/len)+nz;box(furniture,x,groundHeight(x,z)+.5,z,.045,.5,.045,iron,6);}solid((a[0]+b[0])/2+nx,(a[1]+b[1])/2+nz,len/2,.08,Math.min(groundHeight(...a),groundHeight(...b))-.2,Math.max(groundHeight(...a),groundHeight(...b))+1.1,ang);}}
  }}
  // Exact horizontal wall polylines; inferred heights. Cut every mapped gate opening.
  const passages=MapData.paths.filter(p=>p.bridge||p.tunnel).flatMap(p=>p.points.slice(1).map((b,i)=>({a:p.points[i],b,width:p.width})));
  for(const wall of MapData.walls){currentSource="wall:"+wall.id;for(let k=1;k<wall.points.length;k++){const a=wall.points[k-1],b=wall.points[k],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.15)continue;const n=Math.ceil(len/4),ang=Math.atan2(dz,dx);for(let j=0;j<n;j++){const t=(j+.5)/n,x=mix(a[0],b[0],t),z=mix(a[1],b[1],t);if(Math.hypot((x+79.98)/7,(z-173.33)/7)<1||inGate(x,z,1.15)||passages.some(p=>segmentDistance(x,z,p.a,p.b)<p.width/2+1.1))continue;const gh=groundHeight(x,z);if(gh<0)continue;const upperWall=pointIn(x,z,upper)||gh>upperHeight-4;const height=wall.height||((upperWall||wall.twoSided)?1.15:gh<10?3.1:3.4);const thick=wall.twoSided?.55:wall.closed?.6:1.5;const sideA=groundHeight(x+Math.sin(ang)*2.4,z-Math.cos(ang)*2.4),sideB=groundHeight(x-Math.sin(ang)*2.4,z+Math.cos(ang)*2.4);const bottom=Math.min(gh-1.8,sideA-.7,sideB-.7),top=gh+height;const m=wall.material==='brick'?2:1;box(architecture,x,(bottom+top)/2,z,len/n/2+.025,(top-bottom)/2,thick/2,wall.material==='brick'?brick:linen,m,ang);box(architecture,x,top+.06,z,len/n/2+.05,.13,thick/2+.10,pale,10,ang);solid(x,z,len/n/2+.01,thick/2,bottom,top+.2,ang);}}
  }
  const models=buildLandmarks({mesh:architecture,colliders,groundHeight,landmarks:MapData.landmarks});
  // Building footprints are actual OSM polygons; facade detail and missing heights are inferred.
  for(const b of MapData.buildings){currentSource="building:"+b.id;if(models.skipBuildingIds.includes(b.id)||['bunker','bridge'].includes(b.kind))continue;let pts=b.points;if(pts.length<4)continue;const bounds=bbox(pts),cx=(bounds[0]+bounds[2])/2,cz=(bounds[1]+bounds[3])/2;if(cx<-450||cx>520||cz<-520||cz>630)continue;const inPark=pointIn(cx,cz,MapData.areas.all);const h=clamp(b.height,2,28);const y=groundHeight(cx,cz);if(y<0)continue;const bottom=Math.min(...pts.map(p=>groundHeight(...p)))-.6,top=y+h;const col=inPark?[.74,.67,.54]:[.66+rnd()*.14,.61+rnd()*.1,.53+rnd()*.08];
   for(let i=1;i<pts.length;i++){const a=pts[i-1],q=pts[i],len=Math.hypot(q[0]-a[0],q[1]-a[1]);quad(architecture,[a[0],bottom,a[1]],[q[0],bottom,q[1]],[q[0],top,q[1]],[a[0],top,a[1]],col,inPark?1:8);if(inPark)solid((a[0]+q[0])/2,(a[1]+q[1])/2,len/2,.2,bottom,top,Math.atan2(q[1]-a[1],q[0]-a[0]));
    if(len>5){const ang=Math.atan2(q[1]-a[1],q[0]-a[0]);for(let k=2;k<len-1;k+=3.3)for(let sy=2;sy<h-1.5;sy+=3.2){const t=k/len;const wx=mix(a[0],q[0],t),wz=mix(a[1],q[1],t),ux=Math.cos(ang)*.5,uz=Math.sin(ang)*.5,nx=Math.sin(ang)*.075,nz=-Math.cos(ang)*.075;quad(details,[wx-ux+nx,y+sy-.7,wz-uz+nz],[wx+ux+nx,y+sy-.7,wz+uz+nz],[wx+ux+nx,y+sy+.7,wz+uz+nz],[wx-ux+nx,y+sy+.7,wz-uz+nz],[.24,.29,.29],8);}}
   }
   for(const [a,q,c] of triangulate(pts))triangle(architecture,[a[0],top,a[1]],[c[0],top,c[1]],[q[0],top,q[1]],inPark?tile:[.35,.34,.31],7);
  }
  // OSM sport courts are distinctive orientation cues near the southeastern ramparts.
  for(const court of MapData.courts){const tris=triangulate(court.points);for(const [a,b,c] of tris)drape(paving,[a,b,c],court.sport==='tennis'?[.62,.35,.23]:[.42,.47,.42],3,.12);for(let i=1;i<court.points.length;i++){const a=court.points[i-1],b=court.points[i];branch(furniture,[a[0],groundHeight(...a)+.15,a[1]],[b[0],groundHeight(...b)+.15,b[1]],.045,.045,[.91,.89,.79],3,4);}}
  const bench=(x,z,angle)=>{const y=groundHeight(x,z);box(furniture,x,y+.48,z,1.05,.055,.28,timber,5,angle);const c=Math.cos(angle),s=Math.sin(angle);box(furniture,x-s*.3,y+.9,z+c*.3,1.05,.25,.05,timber,5,angle);for(const sign of [-1,1])box(furniture,x+c*.78*sign,y+.23,z+s*.78*sign,.055,.25,.24,iron,6,angle);solid(x,z,1.08,.38,y,y+1.2,angle);};
  for(const p of MapData.benches){currentSource="bench";if(!pointIn(...p,MapData.areas.all)||inGate(...p,4)||groundHeight(...p)<0)continue;let nearest=paths.reduce((best,q)=>{const d=segmentDistance(...p,q.a,q.b);return d<best.d?{d,q}:best;},{d:Infinity});const q=nearest.q;bench(...p,q?Math.atan2(q.b[1]-q.a[1],q.b[0]-q.a[0]):0);}
  for(const p of MapData.lamps){if(!pointIn(...p,MapData.areas.all)||inGate(...p,1)||groundHeight(...p)<0)continue;const y=groundHeight(...p);column(furniture,p[0],y,p[1],.07,.055,3.3,6,iron,6);box(furniture,p[0],y+3.44,p[1],.13,.2,.13,[.88,.82,.60],1);column(furniture,p[0],y+3.64,p[1],.22,.03,.25,6,iron,6);}
  // Three procedural broadleaf forms. Leaves are cut analytically in both color and shadow passes.
  const shrub=newMesh(),treeInstances=[[],[],[]],farInstances=[],bushInstances=[];
  const trees=[];
  function leaf(g,center,r,col){
    const a=rnd()*TAU,tilt=.22+rnd()*.85;
    const u=[Math.cos(a)*r,0,Math.sin(a)*r],v=[-Math.sin(a)*r*tilt,r*(.5+rnd()*.65),Math.cos(a)*r*tilt];
    const n=normal([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);
    const point=(x,y)=>center.map((c,i)=>c+u[i]*x+v[i]*y);
    const pts=[point(-1,-1),point(1,-1),point(1,1),point(-1,1)],codes=[12,12.25,12.5,12.75];
    for(const j of [0,1,2,0,2,3])g.push(...pts[j],...n,...col,codes[j]);
  }
  for(let variant=0;variant<3;variant++){
    const tree=newMesh(),bark=[.31,.28,.22],leafColor=[[.26,.39,.13],[.34,.43,.16],[.21,.34,.12]][variant];
    const crownY=6.2+variant*.55,crownR=3.2+variant*.25;
    column(tree,0,0,0,.27,.12,4.3,10,bark,5);
    for(let i=0;i<8;i++){
      const a=i*2.399+variant,reach=1.6+rnd()*1.3,x=Math.cos(a)*reach,z=Math.sin(a)*reach,y=crownY-.6+rnd()*2;
      const elbow=[x*.48,3.7+rnd()*.8,z*.48],tip=[x,y,z];
      branch(tree,[0,2.5+i*.16,0],elbow,.14,.075,bark,5,7);branch(tree,elbow,tip,.075,.022,bark,5,6);
      lump(tree,x*.7,y,z*.7,1.2,1.15,1.2,tone(leafColor,.88),4,10,6,i,.12);
      for(let k=0;k<4;k++){const aa=a+(k-1.5)*.4;branch(tree,elbow,[x+Math.cos(aa)*.9,y-.6+rnd()*1.3,z+Math.sin(aa)*.9],.035,.008,bark,5,4);}
    }
    for(let i=0;i<620;i++){
      const az=rnd()*TAU,vy=rnd()*2-1,rr=Math.cbrt(.2+rnd()*.8),ring=Math.sqrt(1-vy*vy);
      const x=Math.cos(az)*ring*crownR*rr,z=Math.sin(az)*ring*crownR*rr,y=crownY+vy*(2.8+variant*.35)*rr;
      leaf(tree,[x,y,z],.26+rnd()*.23,tone(leafColor,.78+rnd()*.48));
    }
    trees.push(tree);
  }
  const distantTree=newMesh();column(distantTree,0,0,0,.25,.09,4.8,6,timber,5);
  for(let i=0;i<5;i++){const a=i*2.4;lump(distantTree,Math.cos(a)*1.3,5.5+(i%2),Math.sin(a)*1.3,2,2.4,1.9,[.29,.40,.16],4,8,5,i,.12);}
  for(let i=0;i<4;i++)lump(shrub,Math.cos(i*2.4)*.4,.55+rnd()*.3,Math.sin(i*2.4)*.4,.65,.6,.6,[.28,.38,.14],4,8,5,i,.12);
  for(let i=0;i<100;i++){const a=rnd()*TAU,r=Math.sqrt(rnd());leaf(shrub,[Math.cos(a)*r,.3+rnd(),Math.sin(a)*r],.17+rnd()*.11,[.32,.43,.17]);}
  for(const p of MapData.trees){currentSource="tree";const y=groundHeight(...p);if(y<1||inGate(...p,4)||Object.values(MapData.landmarks).some(q=>Math.hypot(p[0]-q.x,p[1]-q.z)<Math.max(q.width,q.depth)/2+2))continue;const s=.72+rnd()*.62;treeInstances[Math.floor(rnd()*3)].push(p[0],y-.1,p[1],rnd()*TAU,s*(.9+rnd()*.2),s,s*(.9+rnd()*.2),.88+rnd()*.2);solid(p[0],p[1],.22*s,.22*s,y,y+4.2*s);}
  for(let i=0;i<950;i++){const x=-2150+rnd()*3650,z=-2100+rnd()*3300;if(x>-460&&x<530&&z>-520&&z<650)continue;if(isWater(x,z))continue;const y=baseHeight(x,z);const s=.8+rnd()*1.3;farInstances.push(x,y-.1,z,rnd()*TAU,s,s,s,.72+rnd()*.25);}
  for(let i=0;i<420;i++){const x=-390+rnd()*850,z=-440+rnd()*1000;if(!pointIn(x,z,MapData.areas.all)||isWater(x,z)||paths.some(p=>segmentDistance(x,z,p.a,p.b)<p.width/2+1.5)||inGate(x,z,6)||pointIn(x,z,upper))continue;const y=groundHeight(x,z),s=.5+rnd()*.7;bushInstances.push(x,y,z,rnd()*TAU,s,s,s,1);}
  add('terrain',land);add('mapped paths and courts',paving);add('fortress and landmarks',architecture);add('mapped furniture',furniture);add('facade details',details);trees.forEach((tree,i)=>add('mapped broadleaf trees '+i,tree,treeInstances[i]));add('river-bank woodland',distantTree,farInstances,true);add('shrubs',shrub,bushInstances,true);
  const P=MapData.landmarks;
  const viewpoints=[{"name": "Победитель", "subtitle": "Западная терраса Верхнего города", "x": -168.43, "z": 82.43, "yaw": -2.445, "pitch": 0.137}, {"name": "Стамбольские ворота", "subtitle": "Внутренние ворота со стороны равелина", "x": 103.32, "z": 175.79, "yaw": -0.739, "pitch": 0.108}, {"name": "Верхний город", "subtitle": "Аллея и тюрбе Дамад Али-паши", "x": 2.64, "z": 66.81, "yaw": -1.632, "pitch": 0.058}, {"name": "Башня Небойша", "subtitle": "Нижний город у Дуная", "x": -126.67, "z": -343.96, "yaw": -0.995, "pitch": 0.145}, {"name": "Зиндан-капия", "subtitle": "Мост у северо-восточного входа", "x": 130.7, "z": -122.85, "yaw": -1.332, "pitch": 0.18}, {"name": "Большой Калемегдан", "subtitle": "Аллея у памятника благодарности Франции", "x": 103.1, "z": 338.11, "yaw": -.15, "pitch": .08}];
  viewpoints.push({name:"Лапидарий",subtitle:"Римские стелы и саркофаг",x:-87.9,z:173.3,yaw:1.57,pitch:-.10});
  return {batches,colliders,viewpoints,paths,bounds:MapData.bounds,map:MapData,terrainInfo:{upperHeight,datum:td.verticalDatum,step:td.step}};
 }
 return {build,groundHeight,rawHeight,isWater,pointIn,segmentDistance};
})();
