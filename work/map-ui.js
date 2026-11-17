// MODULE 7 · The plan and the scene share one coordinate system and one data set.
class MapView {
 constructor(canvas,world,controls,onSelect){this.canvas=canvas;this.world=world;this.controls=controls;this.onSelect=onSelect;this.hits=[];canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=this.hits.find(q=>Math.hypot(x-q.x,y-q.y)<20);if(hit)this.onSelect(hit.index);});}
 draw(){const canvas=this.canvas,w=canvas.clientWidth,h=canvas.clientHeight,ratio=Math.min(devicePixelRatio||1,2);canvas.width=w*ratio;canvas.height=h*ratio;const c=canvas.getContext('2d');c.scale(ratio,ratio);const scale=Math.min((w-40)/1000,(h-30)/1100),cx=w/2+15*scale,cz=h/2-45*scale;const screen=(x,z)=>[cx+x*scale,cz+z*scale];this.scale=scale;
  c.fillStyle='#e8ead9';c.fillRect(0,0,w,h);
  const polygon=(pts,fill,stroke,width=1)=>{c.beginPath();pts.forEach((p,i)=>{const [x,y]=screen(...p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});if(fill){c.closePath();c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
  for(const q of [MapData.areas.all])polygon(q,'#d4dfbc');
  for(const q of MapData.greens)polygon(q.points,q.kind==='wood'?'#bccfa2':'#cbd9b2');
  for(const q of MapData.water)polygon(q.points,q.hole?'#e8ead9':'#a1c4d0');
  for(const b of MapData.buildings)polygon(b.points,'#b5b2a3');
  for(const p of MapData.paths)polygon(p.points,null,['secondary','tertiary','residential','service'].includes(p.kind)?'#b9b9ad':'#fffbee',Math.max(.7,p.width*scale));
  for(const q of MapData.walls)polygon(q.points,null,'#95674b',Math.max(1,2*scale));
  for(const q of Object.values(MapData.landmarks))polygon(q.points,'#a1835a');
  const labels=[['pobednik','Победитель',-8,14],['nebojsa','Небойша',7,-10],['sahat','Сахат',8,-6],['zindan','Зиндан',7,-9],['ruzica','Ружица',12,2],['petka','Св. Петка',9,-7],['turbe','Тюрбе',8,8],['outerStambol','Внешние Стамбольские',9,6],['charles','Карла VI',7,-8],['france','Памятник Франции',9,13]];
  c.font='10px system-ui';c.textAlign='left';c.textBaseline='middle';
  for(const [key,label,dx,dy] of labels){const p=MapData.landmarks[key],[x,y]=screen(p.x,p.z);c.fillStyle='#394d3c';c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();c.lineWidth=3;c.strokeStyle='#eef0e2';c.strokeText(label,x+dx,y+dy);c.fillText(label,x+dx,y+dy);}
  c.font='italic 16px Georgia';c.fillStyle='#527988';const rs=screen(-380,250),rd=screen(-300,-465);c.save();c.translate(...rs);c.rotate(-.36);c.fillText('Сава',0,0);c.restore();c.fillText('Дунай',...rd);
  this.hits=[];
  this.world.viewpoints.forEach((p,i)=>{const [x,y]=screen(p.x,p.z);this.hits.push({x,y,index:i});c.fillStyle='#234b3d';c.strokeStyle='#fffbed';c.lineWidth=2;c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.fill();c.stroke();c.font='600 10px system-ui';c.fillStyle='#fffbed';c.textAlign='center';c.fillText(String(i+1),x,y);});
  const p=this.controls.position,[px,py]=screen(p[0],p[2]),a=this.controls.yaw;c.save();c.translate(px,py);c.rotate(a);c.beginPath();c.moveTo(0,-17);c.lineTo(7,6);c.lineTo(0,3);c.lineTo(-7,6);c.closePath();c.fillStyle='#d96135';c.strokeStyle='#fff';c.lineWidth=2;c.fill();c.stroke();c.restore();
  c.textAlign='left';c.fillStyle='#3a4b3c';c.font='10px system-ui';c.fillText('С',w-30,24);c.beginPath();c.moveTo(w-27,54);c.lineTo(w-27,32);c.lineTo(w-31,38);c.moveTo(w-27,32);c.lineTo(w-23,38);c.strokeStyle='#3a4b3c';c.lineWidth=1.5;c.stroke();c.fillRect(20,h-24,100*scale,2);c.fillText('100 м',20,h-36);
 }
}
