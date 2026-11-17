// Architectural detail for OSM anchors. Locally, +x runs along a facade and
// +z runs through its passage toward the exterior; dimensions are in meters.
function buildLandmarks({mesh,colliders,groundHeight,landmarks}) {
  const PI=Math.PI, TAU=2*PI;
  const stone=[.69,.62,.49], pale=[.83,.77,.65], gray=[.57,.55,.49], dark=[.29,.27,.23];
  const brick=[.56,.31,.22], redRoof=[.50,.225,.151], copper=[.25,.34,.30], bronze=[.235,.385,.337];
  const iron=[.135,.16,.16], plaster=[.86,.827,.74], wood=[.33,.205,.127];
  const skipBuildingIds=[];
  let anchor, baseY, cos, sin, rotation;
  function at(key, draw, y, overrideRotation) {
    const item=landmarks[key];
    if(!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return;
    anchor=item;
    baseY=y ?? groundHeight(item.x,item.z);
    rotation=overrideRotation ?? (Number.isFinite(item.angle) ? item.angle : 0);
    cos=Math.cos(rotation); sin=Math.sin(rotation);
    if(item.id!=null) skipBuildingIds.push(item.id);
    draw(item);
  }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const tone=(color,scale)=>color.map(x=>clamp(x*scale,0,1));
  const normalize=([x,y,z])=>{
    const l=Math.hypot(x,y,z)||1;
    return [x/l,y/l,z/l];
  };
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub=(a,b)=>a.map((q,i)=>q-b[i]);
  const transform=([x,y,z])=>[anchor.x+x*cos-z*sin,baseY+y,anchor.z+x*sin+z*cos];
  const orient=([x,y,z])=>[x*cos-z*sin,y,x*sin+z*cos];
  function tri(a,b,c,color,mat,na,nb,nc) {
    if(!na){
      const axis=cross(sub(b,a),sub(c,a));
      if(Math.hypot(...axis)<1e-8)return;
      na=normalize(axis); nb=na; nc=na;
    }
    mesh.push(...transform(a),...orient(na),...color,mat,
      ...transform(b),...orient(nb),...color,mat,
      ...transform(c),...orient(nc),...color,mat);
  }
  function quad(a,b,c,d,color,mat) {
    tri(a,b,c,color,mat);
    tri(a,c,d,color,mat);
  }
  function solid(x,z,hx,hz,y0,y1,a=0) {
    const p=transform([x,0,z]);
    colliders.push({x:p[0],z:p[2],hx,hz,y0:baseY+y0,y1:baseY+y1,angle:rotation+a});
  }
  function box(x,y,z,w,h,d,col,mat,angle=0) {
    if(w<=0||h<=0||d<=0)return;
    const C=Math.cos(angle),S=Math.sin(angle);
    const p=(u,v,k)=>[x+C*u*w/2-S*k*d/2,y+v*h/2,z+S*u*w/2+C*k*d/2];
    const a=p(-1,-1,-1), b=p(1,-1,-1), c=p(1,-1,1), e=p(-1,-1,1);
    const A=p(-1,1,-1), B=p(1,1,-1), D=p(1,1,1), E=p(-1,1,1);
    quad(a,A,B,b,col,mat); quad(b,B,D,c,col,mat);quad(c,D,E,e,col,mat);quad(e,E,A,a,col,mat);
    quad(A,E,D,B,col,mat);quad(e,a,b,c,col,mat);
  }
  function ring(x,y,z,r0,r1,h,n,col,mat,a=0,smooth=false) {
    if(h<=0 || r0<0 || r1<0)return;
    const center0=[x,y,z],center1=[x,y+h,z],rise=(r0-r1)/h;
    for(let i=0;i<n;i++){
      const t=a+i*TAU/n,u=a+(i+1)*TAU/n;
      const p=(q,r,yy)=>[x+r*Math.cos(q),yy,z+r*Math.sin(q)];
      const A=p(t,r0,y), B=p(u,r0,y), C=p(u,r1,y+h), D=p(t,r1,y+h);
      const cc=tone(col,.97+.044*Math.sin((i+3)*42.54));
      if(r0>.001) tri(center0,A,B,cc,mat);
      if(r1>.001) tri(center1,C,D,cc,mat);
      if(smooth) {
        const a=normalize([Math.cos(t),rise,Math.sin(t)]), b=normalize([Math.cos(u),rise,Math.sin(u)]);
        if(r1>.001)tri(A,D,C,cc,mat,a,a,b);
        if(r0>.001)tri(A,C,B,cc,mat,a,b,b);
      } else quad(A,D,C,B,cc,mat);
    }
  }
  function lump(x,y,z,rx,ry,rz,col,mat,n=9,layers=5) {
    const p=(k,j)=>{
      const a=PI*k/layers,b=TAU*j/n,s=Math.sin(a);
      return [x+rx*s*Math.cos(b),y+ry*Math.cos(a),z+rz*s*Math.sin(b)];
    };
    for(let k=0;k<layers;k++) for(let j=0;j<n;j++){
      const A=p(k,j), B=p(k,j+1), C=p(k+1,j+1), D=p(k+1,j);
      const c=tone(col,.96+.06*Math.sin(j*5.4+k*88));
      if(k>0)tri(A,B,D,c,mat);
      if(k<layers-1)tri(B,C,D,c,mat);
    }
  }
  function branch(a,b,r0,r1,col,mat,n=8) {
    const f=normalize(sub(b,a));
    const u=normalize(Math.abs(f[1])<.9?[-f[2],0,f[0]]:[f[1],-f[0],0]);
    const v=cross(f,u);
    const end=(p,r,t)=>p.map((q,i)=>q+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
    for(let i=0;i<n;i++){
      const s=i*TAU/n,t=(i+1)*TAU/n;
      quad(end(a,r0,s),end(a,r0,t),end(b,r1,t),end(b,r1,s),col,mat);
    }
  }
  function foundation(radius, offsetX=0, offsetZ=0) {
    let min=-.25;
    for(let i=0;i<24;i++){
      const a=i*TAU/24;
      const p=transform([offsetX+Math.cos(a)*radius,0,offsetZ+Math.sin(a)*radius]);
      min=Math.min(min,groundHeight(p[0],p[2])-baseY-.65);
    }
    return min;
  }
  function rectFoundation(width, depth) {
    let bottom=-1;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
      const p=transform([i*width/2,0,j*depth/2]);
      bottom=Math.min(bottom,groundHeight(p[0],p[2])-baseY-.65);
    }
    return bottom;
  }
  function roof(w,d,base,rise,color=redRoof,x=0,z=0) {
    const a=[x-w/2,base,z-d/2], b=[x+w/2,base,z-d/2], c=[x+w/2,base,z+d/2], e=[x-w/2,base,z+d/2];
    const A=[x,base+rise,z-d/2],B=[x,base+rise,z+d/2];
    quad(e,B,A,a,color,7);
    quad(b,A,B,c,tone(color,.96),7);
    tri(b,a,A,stone,1);
    tri(e,c,B,stone,1);
  }

  // Each strip lies on a sampled Doric flute. The fine masonry is added by the renderer.
  function flutedColumn(y,height,root,top) {
    const grooves=20,samples=7;
    const r=(i,k)=>{
      const t=(i*samples+k)*TAU/(grooves*samples);
      const depression=.105*Math.sin(k*PI/samples)**1.3;
      return [Math.cos(t)*(root-depression),Math.sin(t)*(root-depression),
        Math.cos(t)*(top-depression*.82),Math.sin(t)*(top-depression*.82)];
    };
    for(let i=0;i<grooves;i++)for(let k=0;k<samples;k++){
      const a=r(i,k),b=r(i,k+1);
      quad([a[0],y,a[1]],[a[2],y+height,a[3]],[b[2],y+height,b[3]],[b[0],y,b[1]],pale,11);
    }
  }
  // Sculptural profiles use continuous rings to avoid joints visible between
  // separate geometric limbs. Axis normals stay smooth around the patina.
  function figureProfile(rows, n=16, color=bronze) {
    const node=(row,i)=>{
      const [x,y,z,rx,rz]=row,a=i*TAU/n;
      return [x+Math.cos(a)*rx,y,z+Math.sin(a)*rz];
    };
    const norm=(row,i)=>{
      const a=i*TAU/n;
      return normalize([Math.cos(a)/row[3],0,Math.sin(a)/row[4]]);
    };
    for(let j=1;j<rows.length;j++)for(let i=0;i<n;i++){
      const a=rows[j-1],b=rows[j];
      const A=node(a,i),B=node(a,i+1),C=node(b,i+1),D=node(b,i);
      const na=norm(a,i),nb=norm(a,i+1),nc=norm(b,i+1),nd=norm(b,i);
      tri(A,D,C,color,6,na,nd,nc);
      tri(A,C,B,color,6,na,nc,nb);
    }
  }
  at('pobednik',()=>{
    box(0,.10,0,4.76,.22,4.76,gray,10);
    box(0,.28,0,4.38,.14,4.38,stone,11);
    box(0,.47,0,3.84,.25,3.84,pale,11);
    box(0,1.62,0,3.21,2.08,3.21,pale,10);
    box(0,2.70,0,3.38,.14,3.38,pale,11);
    box(0,2.91,0,2.64,.26,2.64,stone,11);
    for(const side of [-1,1]){
      box(0,1.76,side*1.609,1.71,.88,.029,tone(gray,.94),11);
      box(side*1.609,1.76,0,.029,.88,1.71,tone(gray,.94),11);
    }
    ring(0,3.04,0,.95,.92,.16,32,pale,11,0,true);
    ring(0,3.20,0,.92,.78,.15,32,pale,11,0,true);
    flutedColumn(3.35,6.81,.79,.58);
    ring(0,10.16,0,.584,.61,.105,32,pale,11,0,true);
    ring(0,10.265,0,.61,.87,.345,32,pale,11,0,true);
    box(0,10.73,0,2.02,.24,2.02,pale,11);
    ring(0,10.85,0,.607,.607,.28,32,pale,11,0,true);
    solid(0,0,2.38,2.38,-.15,2.78);

    // The photographed figure rests on a round limestone drum. A calm
    // falcon sits on the extended palm; the sword runs nearly straight down.
    const h=11.13;
    const p=(x,y,z)=>[x,h+y*.81,z*.82];
    const limb=(a,b,R,r,col=bronze)=>branch(p(...a),p(...b),R*.84,r*.84,col,6,12);
    const body=(x,y,z,rx,ry,rz,color=bronze)=>lump(...p(x,y,z),rx*.84,ry*.81,rz*.83,color,6,14,8);
    const profile=rows=>figureProfile(rows.map(([x,y,z,rx,rz])=>[x,h+y*.81,z*.82,rx*.86,rz*.83]));
    body(-.245,.08,-.074,.18,.13,.31);
    body(.225,.08,.20,.17,.13,.29);
    profile([[-.245,.12,.044,.117,.125],[-.228,.40,.026,.128,.135],[-.198,.76,.013,.166,.161],[-.177,1.03,-.07,.160,.145],[-.137,1.36,-.04,.192,.191],[-.076,1.72,.001,.223,.200],[-.06,1.95,.032,.236,.205]]);
    profile([[.225,.12,.197,.117,.123],[.237,.44,.184,.133,.143],[.285,.74,.151,.169,.151],[.275,1.02,.115,.151,.142],[.238,1.44,.075,.19,.180],[.205,1.77,.043,.225,.198],[.197,1.96,.039,.228,.201]]);
    profile([[.061,1.76,.081,.251,.210],[.057,1.92,.057,.423,.278],[.038,2.12,.04,.398,.265],[.025,2.35,.036,.332,.227],[.019,2.57,.048,.406,.255],[.003,2.76,.058,.454,.258],[.002,2.89,.040,.391,.232],[.01,2.987,.021,.237,.187],[.017,3.19,-.067,.139,.133]]);
    body(-.163,2.69,-.139,.23,.215,.138);
    body(.184,2.72,-.132,.226,.204,.138);
    body(-.44,2.76,.028,.185,.236,.202);
    body(.435,2.77,.023,.172,.221,.197);
    body(.026,3.311,-.084,.206,.231,.191);
    body(.030,3.428,-.073,.197,.109,.176,tone(bronze,.90));
    body(.032,3.293,-.257,.071,.095,.067);
    body(.031,3.224,-.198,.121,.083,.104);
    for(const side of [-1,1])body(.026+side*.178,3.297,-.067,.049,.078,.052);
    limb([-.441,2.747,.007],[-.619,2.409,-.133],.158,.134);
    limb([-.619,2.409,-.133],[-.751,2.347,-.237],.136,.115);
    limb([-.75,2.35,-.237],[-.856,2.466,-.510],.123,.103);
    limb([-.856,2.466,-.510],[-.866,2.577,-.646],.11,.072);
    body(-.872,2.58,-.686,.107,.077,.149);
    limb([.429,2.75,.005],[.604,2.25,.011],.160,.124);
    limb([.604,2.25,.011],[.666,1.98,-.212],.122,.101);
    limb([.666,1.98,-.212],[.672,1.905,-.387],.099,.083);
    body(.676,1.912,-.405,.100,.128,.104);
    limb([.671,1.736,-.404],[.665,2.104,-.416],.056,.050);
    body(.665,2.106,-.417,.069,.09,.071);
    limb([.490,1.745,-.405],[.861,1.745,-.416],.037,.036);
    limb([.674,1.738,-.408],[.719,.065,-.362],.045,.008,tone(bronze,1.17));

    body(-.868,2.854,-.684,.149,.219,.164);
    body(-.872,3.058,-.777,.088,.104,.100);
    limb([-.871,3.045,-.846],[-.869,3.011,-.952],.056,.012,tone(bronze,1.08));
    for(const side of [-1,1]){
      const x=-.868+side*.111;
      body(x,2.854,-.665,.075,.188,.149,tone(bronze,.94));
      limb([x,2.899,-.690],[x+side*.015,2.693,-.465],.103,.018);
      limb([-.868+side*.066,2.724,-.69],[-.868+side*.081,2.62,-.722],.027,.018);
    }
  },undefined,-PI*.25);

  // Mesh both faces and the curved soffit, leaving an empty barrel vault from
  // end to end. Side colliders follow the inside jambs at their actual depth.
  function gateway(item, style={}) {
    const w=clamp(item.width||style.width||12,style.minWidth||4.5,style.maxWidth||28);
    const depth=clamp(item.depth||style.depth||8,style.minDepth||3.25,style.maxDepth||27);
    const half=w/2, D=depth/2;
    const trim=style.trim||.46;
    const offset=style.offset||0;
    const r=Math.min(style.opening||2.12,half-Math.abs(offset)-trim-.16);
    const spring=style.spring||2.70;
    const bottom=rectFoundation(w,depth);
    const top=style.top||6.6;
    const front=style.col||gray, block=style.block||1, n=16;
    const arch=(angle,R,z)=>[offset+Math.cos(angle)*R,spring+Math.sin(angle)*R,z];
    const rise=top-spring;
    for(const s of [-1,1]){
      const edge=s*half, jamb=offset+s*r, outerTrim=offset+s*(r+trim);
      const jambWidth=Math.abs(edge-jamb), jambCenter=(edge+jamb)/2;
      box(jambCenter,(spring+bottom)/2,0,jambWidth,spring-bottom,depth,front,block);
      box((edge+outerTrim)/2,spring+rise/2,0,Math.abs(edge-outerTrim),rise,depth,front,block);
      solid(jambCenter,0,jambWidth/2,depth/2,bottom,top+.20);
      for(const sign of [-1,1]) {
        const z=sign*(D+.055), x=offset+s*(r+trim/2);
        box(x,spring/2-.05,z,trim,spring+.10,.18,pale,1);
        box(x,.21,z,trim+.12,.40,.27,stone,1);
        box(x,spring-.06,z,trim+.19,.16,.25,pale,1);
      }
    }
    for(let i=0;i<n;i++) {
      const a=i*PI/n,b=(i+1)*PI/n;
      const A=arch(a,r,-D),B=arch(b,r,-D),C=arch(b,r,D),E=arch(a,r,D);
      quad(A,E,C,B,tone(brick,.82+.16*(i%3===0)),2);
      for(const sign of [-1,1]){
        const z=sign*D;
        const rad=r+trim-.012;
        const a0=arch(a,rad,z),b0=arch(b,rad,z),a1=[a0[0],top,z],b1=[b0[0],top,z];
        if(sign>0)quad(b0,a0,a1,b1,front,block);
        else quad(a0,b0,b1,a1,front,block);
        const zz=z+sign*.072;
        const i0=arch(a+.004,r,zz),o0=arch(a+.004,r+trim,zz),i1=arch(b-.004,r,zz),o1=arch(b-.004,r+trim,zz);
        const cc=tone(pale,.96+.05*Math.sin(i*5.8));
        if(sign>0)quad(i0,o0,o1,i1,cc,1);else quad(i1,o1,o0,i0,cc,1);
      }
    }
    box(0,top-.085,0,w,.18,depth,stone,1);
    box(0,top+.049,0,w+.10,.105,depth+.17,stone,1);
    box(0,top+.18,0,w+.20,.15,depth+.30,pale,1);
    for(const s of [-1,1]){
      const z=s*(D+.108),y=spring+r+trim*.55;
      box(offset,y,z,.375,.55,.24,pale,1);
      if(style.emblem){
        box(offset,spring+r+trim+.38,z+s*.024,1.02,.62,.19,pale,1);
        box(offset,spring+r+trim+.38,z+s*.133,.77,.41,.051,dark,1);
      }
      if(style.pilasters)for(const side of [-1,1]){
        const x=offset+side*(r+trim+1.25);
        if(Math.abs(x)+.45>half)continue;
        box(x,2.5,z,.62,5.25,.39,pale,1);
        box(x,4.91,z,.92,.26,.51,pale,1);
        box(x,.23,z,.83,.49,.49,stone,1);
      }
      if(style.wings)for(const side of [-1,1]){
        box(side*(half-1),top-.356,z,1.12,.42,.27,tone(front,.93),block);
        box(side*(half-1),top-.356,z+s*.151,.64,.24,.017,dark,1);
      }
    }
    return {top,width:w,depth};
  }
  at('outerStambol',item=>gateway(item,{top:6.4,opening:2.13,spring:2.55,pilasters:true,emblem:true,col:stone,trim:.52}));
  at('innerStambol',item=>{
    const opening=2.32, spring=2.72, offset=-.90;
    const body=gateway(item,{top:5.88,offset,opening,spring,col:[.75,.72,.625],block:10,trim:.37});
    const facade=-body.depth/2;
    const centerWidth=7.30;
    // The taller central attic reads above the low brick wings. The facade
    // on the ravelin side carries a larger blind arch around the tunnel.
    box(offset,6.37,facade-.01,centerWidth,1.18,1.25,[.79,.76,.672],10);
    for(const [y,w,th] of [[5.88,7.39,.20],[6.93,7.54,.12],[7.06,7.69,.13],[7.19,7.83,.12]]){
      box(offset,y,facade-.055,w,th,1.38,stone,11);
    }
    const strips=24, R=3.24, outerSpring=1.26, raise=4.66, rib=.34, z=facade-.20;
    const arch=(a,r,h,d)=>[offset+Math.cos(a)*r,outerSpring+Math.sin(a)*h,d];
    for(let i=0;i<strips;i++){
      const a=(i+.004)*PI/strips,b=(i+.996)*PI/strips;
      const A=arch(a,R,raise,z), B=arch(b,R,raise,z);
      const C=arch(b,R+rib,raise+rib,z-.033),D=arch(a,R+rib,raise+rib,z-.033);
      const q=tone([.83,.797,.689],.94+.09*Math.sin(i*3.32));
      quad(B,C,D,A,q,11);
      quad(A,B,arch(b,R,raise,z+.09),arch(a,R,raise,z+.09),tone(q,.87),11);
    }
    for(const side of [-1,1]){
      const x=offset+side*4.35;
      box(offset+side*(R+rib/2),outerSpring/2,z+.01,rib,outerSpring,.16,[.81,.78,.69],11);
      box(x,2.91,facade-.29,1.68,5.85,.66,[.74,.72,.64],10);
      box(x,.29,facade-.33,1.83,.26,.73,pale,11);
      box(x,4.31,facade-.31,1.81,.14,.76,pale,11);
      box(x,5.87,facade-.28,1.78,.19,.77,gray,11);
      const wingInner=x+side*.84, wingOuter=side*(body.width/2-.12),wingW=Math.abs(wingOuter-wingInner);
      box((wingInner+wingOuter)/2,5.13,facade-.11,wingW,1.45,.28,brick,2);
      box((wingInner+wingOuter)/2,4.37,facade-.15,wingW,.19,.35,stone,11);
      box((wingInner+wingOuter)/2,5.88,facade-.11,wingW,.19,.38,gray,11);
      const tx=side*(body.width/2-.9);
      // Small square brick sentry projections with pale corbels.
      for(let i=0;i<3;i++)box(tx,4.14+i*.20,facade-.20-i*.05,1.14+i*.23,.22,.61+i*.15,stone,10);
      box(tx,6.34,facade-.36,1.72,3.72,1.61,brick,2);
      box(tx,6.31,facade-.36,1.80,.15,1.67,pale,11);
      ring(tx,8.20,facade-.36,1.27,.10,1.12,4,tone(gray,.96),7,PI/4);
      lump(tx,9.33,facade-.36,.067,.065,.065,iron,6,8,5);
      for(const dx of [-.42,0,.42])box(tx+dx,6.721,facade-1.172,.095,.43,.023,dark,8);
    }
    const y=5.43, sz=facade-.25;
    box(offset,y,sz,1.22,.93,.17,pale,11);
    box(offset,y,sz-.097,1.03,.77,.026,[.94,.92,.87],11);
    const shield=[[0,-.25],[-.215,-.13],[-.26,.12],[-.199,.205],[.199,.205],[.26,.12],[.215,-.13]];
    for(let i=0;i<shield.length;i++){
      const a=shield[i],b=shield[(i+1)%shield.length];
      tri([offset,y,sz-.12],[offset+a[0],y+a[1],sz-.121],[offset+b[0],y+b[1],sz-.121],iron,6);
    }
    box(offset,y+.27,sz-.125,.246,.107,.046,bronze,6);
  });
  at('leopold',item=>gateway(item,{top:5.42,offset:2.20,opening:1.86,spring:2.29,pilasters:true,emblem:true,col:gray,trim:.48}));
  at('defterdar',item=>gateway(item,{top:5.15,opening:1.86,spring:2.45,pilasters:true,col:stone,trim:.42}));
  at('despot',item=>gateway(item,{top:6.24,opening:2.07,spring:2.62,emblem:true,col:gray,trim:.55}));
  at('charles',item=>gateway(item,{top:7.14,offset:.82,opening:2.34,spring:2.78,pilasters:true,emblem:true,wings:true,col:stone,trim:.56}));
  at('vidin',item=>gateway(item,{top:5.92,opening:2.12,spring:2.54,emblem:true,col:stone,trim:.44}));

  let sahatBottom=null, sahatTop=0;
  at('sahatGate',item=>{
    sahatBottom=baseY;
    sahatTop=gateway(item,{top:7.45,offset:.94,opening:2.22,spring:2.78,emblem:true,wings:true,col:brick,block:2,trim:.60}).top;
  });
  at('sahat', item=>{
    // The clock tower grows out of the gate's vault and has no collider at
    // pedestrian level. Its upper clock chamber and helm are octagonal.
    const radius=clamp((Math.min(item.width||7.2,item.depth||7.2))*0.5,3.1,3.95);
    const W=radius*1.86;
    const foot=sahatTop? sahatTop-.16 : 0;
    const bodyTop=17.35;
    box(0,(foot+bodyTop)/2,0,W,bodyTop-foot,W,plaster,8);
    box(0,foot+.18,0,W+.24,.43,W+.24,pale,1);
    box(0,bodyTop-.13,0,W+.19,.35,W+.19,pale,1);
    ring(0,bodyTop,0,W*.66,W*.545,.64,8,plaster,8,PI/8);
    ring(0,17.99,0,W*.545,W*.545,5.36,8,plaster,8,PI/8);
    ring(0,23.34,0,W*.55,W*.588,.25,8,pale,1,PI/8);
    ring(0,23.59,0,W*.588,W*.59,.21,8,copper,7,PI/8);
    const cover=[[23.8,.59],[24.12,.60],[24.53,.55],[25.02,.46],[25.55,.332],[26.01,.196],[26.29,.122],[26.47,.082]];
    for(let i=0;i<cover.length-1;i++){
      const [y,a]=cover[i],[next,b]=cover[i+1];
      ring(0,y,0,W*a,W*b,next-y,8,copper,7,PI/8,true);
    }
    ring(0,26.47,0,.29,.35,.155,12,copper,7);
    ring(0,26.625,0,.35,.15,.238,12,copper,7);
    ring(0,26.863,0,.15,.123,.08,12,copper,7);
    ring(0,26.943,0,.112,.071,.49,10,iron,6);
    lump(0,27.43,0,.085,.085,.085,bronze,6,7,4);
    const R=W*.545*Math.cos(PI/8);
    for(let i=0;i<4;i++){
      const a=i*PI/2,s=Math.sin(a),c=Math.cos(a);
      const p=(x,y,d)=>[c*x+s*(R+d),21.26+y,-s*x+c*(R+d)];
      for(let k=0;k<32;k++) {
        const t=k*TAU/32,u=(k+1)*TAU/32;
        tri(p(0,0,.032),p(1.15*Math.cos(t),1.15*Math.sin(t),.032),p(1.15*Math.cos(u),1.15*Math.sin(u),.032),iron,8);
        quad(p(1.10*Math.cos(t),1.10*Math.sin(t),.049),p(1.17*Math.cos(t),1.17*Math.sin(t),.049),
          p(1.17*Math.cos(u),1.17*Math.sin(u),.049),p(1.10*Math.cos(u),1.10*Math.sin(u),.049),stone,1);
      }
      for(let k=0;k<12;k++){
        const a=k*TAU/12;
        branch(p(.86*Math.cos(a),.86*Math.sin(a),.069),p(1.02*Math.cos(a),1.02*Math.sin(a),.069),.024,.019,pale,8,5);
      }
      branch(p(0,0,.080),p(.23,.48,.080),.040,.022,pale,8,6);
      branch(p(0,0,.080),p(-.74,.34,.080),.035,.015,pale,8,6);
      const B=(x,y,d,w,h,th,col,mat)=>{const p0=p(x,y,d);box(...p0,w,h,th,col,mat,-a);};
      B(0,-1.93,.057,.25,.48,.10,dark,8);
      const sx=Math.sin(a+PI/4),sz=Math.cos(a+PI/4);
      box(sx*(R+.048),21.21,sz*(R+.048),1.47,2.81,.09,tone(stone,.86),11,-a-PI/4);
      box(sx*(R+.096),21.21,sz*(R+.096),1.22,2.53,.049,tone(iron,.86),8,-a-PI/4);
      B(0,-4.79,.06,.47,.99,.12,tone(iron,.91),8);
    }
  },sahatBottom);

  at('nebojsa',item=>{
    const radius=clamp((Math.min(item.width||16.8,item.depth||16.8))*0.535,7.55,9.0);
    const y0=foundation(radius+.31), angle=PI/8;
    const shell=[.78,.741,.646], eaves=19.55;
    ring(0,y0,0,radius+.26,radius+.16,-y0+1.28,8,tone(gray,.87),1,angle);
    ring(0,1.28,0,radius+.16,radius-.03,2.05,8,tone(shell,.91),1,angle);
    ring(0,3.33,0,radius-.03,radius-.20,12.16,8,shell,1,angle);
    ring(0,15.49,0,radius-.20,radius-.18,eaves-15.49,8,tone(shell,.96),1,angle);
    ring(0,eaves-.08,0,radius-.17,radius+.17,.18,8,tone(brick,.94),2,angle);
    ring(0,eaves+.10,0,radius+.20,radius+.23,.18,8,tone(redRoof,.92),7,angle);
    ring(0,eaves+.28,0,radius+.23,.18,2.17,8,redRoof,7,angle);
    solid(0,0,radius*.88,radius*.88,y0,22.00);

    for(let f=0;f<8;f++){
      const a=f*TAU/8+PI/4, c=Math.cos(a),s=Math.sin(a);
      const wallAngle=a-PI/2, full=radius*2*Math.sin(PI/8);
      const faceDistance=y=>(radius-.03-.15*clamp((y-3.33)/12.15,0,1))*Math.cos(PI/8);
      const on=(u,y,d)=>{
        const r=faceDistance(y)+d;
        return [c*r-s*u,y,s*r+c*u];
      };
      const detail=(u,y,d,w,h,th,col,mat)=>box(...on(u,y,d),w,h,th,col,mat,wallAngle);
      for(let i=0;i<8;i++){
        const u=full*(i-3.5)/8;
        detail(u,15.73,.19,.38,.34,.35,tone(shell,.90+i*.006),10);
        detail(u,15.98,.25,.48,.25,.47,pale,10);
        detail(u,16.108,.16,.54,.062,.39,tone(shell,.84),11);
      }
      for(let i=0;i<28;i++){
        const row=i%12, u=full*(.47*Math.sin(i*271.91+(f+3)*91.5));
        const y=16.55+row*.236, w=.25+.44*(.5+.5*Math.sin(i*8.31+f));
        if(Math.abs(u)+w/2>full*.49||Math.abs(u)<.84&&y<18.25)continue;
        detail(u,y,.009,w,.138,.029,tone(brick,.92+.22*Math.sin(i*31+f)),2);
      }
      const levels=[[0,4.05,1.00,1.32,.18],[1,7.93,.72,1.18,.36],[2,11.83,.87,1.40,-.19],[3,16.81,.91,1.38,.10]];
      for(const [i,y,w,ht,u] of levels){
        if((f+2*i)%7===1 || (f+i*3)%9===4)continue;
        const r=w/2, spring=y+ht-r*.71, n=10;
        const origin=on(u,y,.075);
        windowArch(...origin,w,ht,tone(iron,.68),1,a-PI/2,.71);
        const point=(q,rise,R,depth)=>on(u+Math.cos(q)*R,spring+Math.sin(q)*rise,depth);
        for(let k=0;k<n;k++){
          const t=(k+.012)*PI/n,v=(k+.986)*PI/n;
          const A=point(t,r*.71,r,.113),B=point(v,r*.71,r,.113);
          const C=point(v,r*.71+.25,r+.24,.126),D=point(t,r*.71+.25,r+.24,.126);
          quad(A,D,C,B,tone(brick,.83+.11*Math.cos(k*3.1+f)),2);
        }
        for(const side of [-1,1])detail(u+side*(r+.095), (y+spring)/2,.09,.18,spring-y,.14,tone(brick,.88),2);
        detail(u,y-.055,.115,w+.31,.125,.25,tone(shell,.86),10);
        if(i===1||i===2){
          for(const s of [-.25,0,.25])detail(u+w*s,y+ht*.34,.13,.027,ht*.67,.041,iron,6);
          detail(u,y+ht*.43,.135,w*.98,.028,.047,iron,6);
        }
      }
    }
  });

  at('zindan',item=>{
    const width=clamp(item.width||24,20,27), depth=clamp(item.depth||11,8,15);
    const passage=4.36;
    const radius=(width-passage)/4, n=16;
    const top=10.50, towerStone=[.655,.630,.565];
    // The convex semicircles face the Leopold Gate side of the barbican.
    const leopold=landmarks.leopold;
    const dir=!leopold || (leopold.z-item.z)*cos-(leopold.x-item.x)*sin>=0 ? 1 : -1;
    const front=(depth/2-radius)*dir, back=-depth/2*dir;
    gateway({...item,width:passage+3.0,depth:depth-.30},{opening:passage/2,top:7.15,spring:2.85,col:towerStone,emblem:true,trim:.44});
    for(const side of [-1,1]){
      const x=side*(radius+passage/2), bottom=foundation(radius+.33,x,front);
      function sector(y,r,R,height,color) {
        for(let k=0;k<n;k++){
          const a=k*PI/n,b=(k+1)*PI/n;
          const point=(t,r,Y)=>[x+r*Math.cos(t),Y,front+dir*r*Math.sin(t)];
          const A=point(a,r,y), B=point(b,r,y), C=point(b,R,y+height), D=point(a,R,y+height);
          const colorByFace=tone(color,.988+.026*Math.sin(k*7.23));
          if(dir===1){
            quad(A,D,C,B,colorByFace,1);
            tri([x,y+height,front],C,D,colorByFace,1);
          }else{
            quad(B,C,D,A,colorByFace,1);
            tri([x,y+height,front],D,C,colorByFace,1);
          }
        }
      }
      const rearWidth=2*radius;
      const rearDepth=Math.abs(front-back);
      const y0=Math.min(bottom,rectFoundation(width,depth));
      box(x,(top+y0)/2,(front+back)/2,rearWidth,top-y0,rearDepth,towerStone,1);
      sector(y0,radius+.135,radius+.04,1.46-y0,tone(towerStone,.91));
      sector(1.46,radius+.04,radius-.10,top-1.46,towerStone);
      sector(top-.44,radius-.095,radius+.17,.32,tone(stone,.98));
      sector(top-.12,radius+.17,radius+.17,.47,towerStone);
      for(let i=0;i<7;i++){
        const t=(i+.5)*PI/7, R=radius-.09;
        const px=x+R*Math.cos(t), pz=front+dir*R*Math.sin(t);
        box(px,top+.73,pz,1.09,.82,.61,towerStone,1,dir*t-PI/2);
        box(px,top+1.16,pz,1.15,.11,.67,stone,10,dir*t-PI/2);
      }
      for(const [t,h,w] of [[.64,4.14,.54],[1.48,7.15,.38],[2.47,4.33,.61]]){
        const c=Math.cos(t),s=dir*Math.sin(t),R=radius-.005;
        const q=(u,v,d)=>[x+(R+d)*c-s*u,v,front+(R+d)*s+c*u];
        const a=Math.atan2(s,c)-PI/2;
        const slit=(u,v,d,width,height,th,col,mat)=>box(...q(u,v,d),width,height,th,col,mat,a);
        windowArch(...q(0,h-.45,.10),w,1.0,tone(dark,.76),1,a);
        slit(0,h-.50,.11,w+.29,.13,.21,stone,10);
        slit(0,h+.59,.09,w+.20,.16,.12,tone(towerStone,.93),10);
        for(const k of [-1,1])slit(k*(w/2+.051),h,.075,.105,1.04,.12,tone(towerStone,.96),10);
        if(w>.5){
          for(const j of [-.22,0,.22])slit(j*w,h,.14,.024,.87,.038,iron,6);
          slit(0,h-.07,.15,w*.91,.025,.034,iron,6);
        }
      }
      solid(x,(front+back)/2,radius,rearDepth/2,y0,top);
      solid(x,front+dir*radius*.31,radius*.97,radius*.34,y0,top);
      solid(x,front+dir*radius*.76,radius*.67,radius*.24,y0,top);
    }
  });

  at('dizdar',item=>{
    const w=clamp(item.width||8.8,7.5,10),d=clamp(item.depth||8.3,7.5,10), h=item.height||20;
    const bottom=rectFoundation(w,d);
    box(0,(h-2.0+bottom)/2,0,w,h-2.0-bottom,d,gray,1);
    box(0,h-2.23,0,w+.25,.35,d+.25,stone,1);
    box(0,h-1.65,0,w+.42,.90,d+.42,gray,1);
    solid(0,0,w/2,d/2,bottom,h);
    for(const side of [-1,1]){
      for(const f of [-.4,-.20,0,.20,.4]){
        box(w*f,h-.68,d*.485*side,.98,1.24,.71,gray,1);
        box(w*.485*side,h-.68,d*f,.71,1.24,.98,gray,1);
      }
      for(const y of [4.16,9.37,14.58]){
        box(.43,y,side*(d/2+.052),.43,1.43,.15,dark,8);
        box(side*(w/2+.052),y,-.33,.15,1.44,.44,dark,8);
      }
    }
  },undefined,1.04);

  at('king',item=>gateway(item,{width:7.7,depth:4.7,top:5.10,opening:1.73,spring:2.43,col:gray,emblem:true,trim:.46}));
  at('dark',item=>gateway(item,{top:5.74,opening:2.18,spring:2.35,col:gray,trim:.36}));
  at('savaGate',item=>gateway(item,{top:5.52,opening:2.06,spring:2.55,col:stone,pilasters:true,trim:.48}));
  at('karadjordje',item=>gateway(item,{top:6.16,opening:2.18,spring:2.57,col:stone,emblem:true,trim:.49}));

  function crossFinial(x,y,z,size){
    branch([x,y,z],[x,y+size,z],.055,.033,iron,6,6);
    branch([x-size*.28,y+size*.58,z],[x+size*.28,y+size*.58,z],.034,.033,iron,6,6);
  }
  function dome(x,z,y,r,h,color,n=20){
    const fraction=[0,.24,.47,.66,.80,.91,.975,1];
    const scales=[1,.991,.89,.76,.60,.42,.22,.002];
    for(let i=0;i<fraction.length-1;i++)ring(x,y+h*fraction[i],z,r*scales[i],r*scales[i+1],h*(fraction[i+1]-fraction[i]),n,color,7,PI/8,true);
  }
  // An arched ornamental recess applied to the outside of a rectangular wall.
  function windowArch(x,y,z,width,height,color,outward=1,rotate=0,riseFactor=1) {
    const r=width*.50, rise=r*riseFactor, reach=height-rise, c=Math.cos(rotate),s=Math.sin(rotate);
    const p=(u,v,k)=>[x+u*c-k*s,y+v,z+u*s+k*c];
    const a=p(-r,0,.018*outward), b=p(r,0,.018*outward);
    const d=p(-r,reach,.018*outward), e=p(r,reach,.018*outward);
    if(outward>0)quad(a,b,e,d,color,8);else quad(b,a,d,e,color,8);
    for(let i=0;i<12;i++){
      const t=i*PI/12,v=(i+1)*PI/12;
      const A=p(r*Math.cos(t),reach+rise*Math.sin(t),.018*outward),B=p(r*Math.cos(v),reach+rise*Math.sin(v),.018*outward);
      const mid=p(0,reach,.018*outward);
      if(outward>0)tri(mid,A,B,color,8);else tri(mid,B,A,color,8);
    }
  }
  at('ruzica',()=>{
    const w=10.5,d=17.6, h=6.20, below=rectFoundation(w,d);
    box(0,(h+below)/2,0,w,h-below,d,gray,1);
    roof(w+.27,d+.38,h,3.93,redRoof);
    box(0,h-.06,0,w+.27,.23,d+.29,stone,1);
    solid(0,0,w/2,d/2,below,h);
    ring(0,below,8.53,3.15,3.15,4.7-below,10,gray,1);
    ring(0,4.7,8.53,3.29,1.31,2.25,10,redRoof,7);
    solid(0,9.4,2.7,1.45,below,5.6);
    const z=-6.3, x=-3.86, b=3.75, tower=13.13;
    box(x,(tower+below)/2,z,b,tower-below,b,stone,1);
    box(x,11.31,z,b+.22,.30,b+.22,pale,1);
    box(x,tower-.14,z,b+.30,.29,b+.30,stone,1);
    ring(x,tower,z,b*.77,b*.31,1.67,4,redRoof,7,PI/4);
    crossFinial(x,tower+1.68,z,1.04);
    for(const side of [-1,1]){
      windowArch(x,11.63,z+side*(b/2),.91,1.18,dark,side);
      windowArch(x+side*b/2,11.63,z,.91,1.18,dark,side,-PI/2);
      for(const q of [-2.2,1.05,4.55])windowArch(side*w/2,2.26,q,.91,1.85,dark,side,-PI/2);
    }
    windowArch(.83,0,-d/2,1.96,3.15,wood,-1);
    box(.83,.09,-d/2-.37,2.70,.19,.75,stone,1);
    // Local ivy panels low on the walls and climbing near the west portal.
    for(let i=0;i<18;i++){
      const z=-5.2+i*.48, y=1.42+1.08*Math.sin(i*.65);
      lump(-w/2-.075,y,z,.23,.66,.54,tone([.23,.34,.15],.89+.14*Math.sin(i*.94)),8,6,4);
    }
  },undefined,.48);

  at('petka',()=>{
    const w=7.88,d=12.64,h=4.17,below=rectFoundation(w,d);
    box(0,(h+below)/2,0,w,h-below,d,stone,1);
    box(0,h-.20,0,w+.15,.23,d+.19,brick,2);
    roof(w+.26,d+.35,h,2.05,redRoof);
    solid(0,0,w/2,d/2,below,h);
    const z=3.86,y=h+.34;
    ring(0,y,z,2.42,2.42,1.96,8,pale,1,PI/8);
    ring(0,y+1.88,z,2.47,2.49,.13,8,gray,1,PI/8);
    dome(0,z,y+2,2.45,1.89,copper,12);
    crossFinial(0,y+3.88,z,.98);
    windowArch(0,.12,-d/2,1.62,2.61,dark,-1);
    for(const s of [-1,1])for(const p of [-2.8,.35,3.52])windowArch(s*w/2,1.57,p,.69,1.49,dark,s,-PI/2);
  },undefined,1.03);

  at('turbe',()=>{
    const R=4.09, y=foundation(R), h=4.4;
    ring(0,y,0,R+.17,R+.17,-y+.37,6,gray,1);
    ring(0,.37,0,R,R,h-.37,6,stone,1);
    ring(0,h,0,R,R+.19,.25,6,pale,1);
    ring(0,h+.25,0,R+.19,R+.17,.27,6,gray,1);
    dome(0,0,h+.52,3.95,1.88,copper,24);
    ring(0,h+2.39,0,.14,.11,.28,9,copper,7);
    lump(0,h+2.73,0,.099,.135,.099,bronze,6,7,5);
    const p=(R+.015)*Math.cos(PI/6);
    windowArch(0,.15,-p,1.11,2.65,wood,-1);
    solid(0,0,R*.78,R*.81,y,h);
  },undefined,0);

  at('romanWell',item=>{
    const w=clamp(item.width||8,5,8.5),d=clamp(item.depth||8,5,8.5), y=rectFoundation(w,d);
    box(0,(2.0+y)/2,0,w,2.0-y,d,gray,1);
    box(0,2.03,0,w+.18,.21,d+.18,pale,1);
    roof(w+.15,d+.18,2.14,.50,tone(gray,.82));
    windowArch(0,.02,-d/2,1.07,1.77,iron,-1);
    solid(0,0,w/2,d/2,y,2.2);
  });

  at('france',()=>{
    const y=rectFoundation(6.8,6.8), statueY=4.24;
    box(0,(y+.27)/2,0,6.90,.27-y,6.90,gray,1);
    box(0,.38,0,6.52,.30,6.52,pale,1);
    box(0,.59,0,6.03,.21,6.03,pale,1);
    box(0,2.43,0,3.83,3.50,3.63,gray,1);
    box(0,4.16,0,3.94,.22,3.80,stone,1);
    for(const side of [-1,1]){
      box(0,2.14,side*1.824,2.02,1.16,.067,dark,1);
      box(side*1.924,2.14,0,.067,1.16,2.02,dark,1);
    }
    solid(0,0,3.45,3.45,y,4.27);
    lump(0,statueY+1.09,-.10,.79,1.09,.48,bronze,6,11,6);
    lump(0,statueY+2.16,0,.58,.79,.39,bronze,6);
    lump(.04,statueY+3.08,-.16,.258,.375,.244,bronze,6);
    branch([-.49,statueY+2.51,-.08],[-.76,statueY+2.0,-.58],.17,.116,bronze,6);
    branch([-.76,statueY+2.0,-.58],[-.94,statueY+2.47,-.91],.116,.075,bronze,6);
    branch([.43,statueY+2.51,-.08],[.73,statueY+2.25,.51],.17,.111,bronze,6);
    branch([.73,statueY+2.25,.51],[.88,statueY+2.55,.91],.11,.079,bronze,6);
    lump(-.25,statueY+1.32,.61,.59,1.21,.36,tone(bronze,.91),6);
  });
  // Approximate center of the six archaeological stones in OSM relation 17699435.
  // Source survey has no georeferencing or surveyed north direction.
  if (typeof LAPIDARIUM_SCAN !== 'undefined') {
    const unpack = (value, Type) => new Type(Uint8Array.from(atob(value), c => c.charCodeAt(0)).buffer);
    const pos = unpack(LAPIDARIUM_SCAN.cm, Int16Array);
    const rgb = unpack(LAPIDARIUM_SCAN.rgb, Uint8Array);
    const faces = unpack(LAPIDARIUM_SCAN.faces, Uint16Array);
    const x0 = -79.98, z0 = 173.33, y0 = groundHeight(x0, z0);
    const point = i => [x0 + pos[i*3]/100, y0 + pos[i*3+1]/100 + .04, z0 + pos[i*3+2]/100];
    for (let j = 0; j < faces.length; j += 3) {
      const a = point(faces[j]), b = point(faces[j+1]), c = point(faces[j+2]);
      const n = normalize(cross(sub(b,a),sub(c,a)));
      for (const [k,p] of [[j,a],[j+1,b],[j+2,c]]) {
        const i = faces[k]*3;
        mesh.push(...p,...n,rgb[i]/255,rgb[i+1]/255,rgb[i+2]/255,15);
      }
    }
  }
  return {skipBuildingIds};
}
