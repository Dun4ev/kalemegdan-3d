const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({});
for (const name of ['map-data', 'terrain-data', 'landmarks', 'geometry']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8'), ctx);
}
const batches = vm.runInContext('World.build().batches', ctx);
const terrain = batches.find(b => b.name === 'terrain').vertices;
const paving = batches.find(b => b.name === 'mapped paths and courts').vertices;
const cells = new Map();
for (let i = 0; i < terrain.length; i += 60) {
  const x = terrain[i], z = terrain[i + 2], step = terrain[i + 20] - x;
  cells.set([x,z,step].join(), [terrain[i+1],terrain[i+11],terrain[i+21],terrain[i+51]]);
}
let checked = 0, missed = 0, errors = 0, worst = 0, victor = 0, stambol = 0;
for (let i = 0; i < paving.length; i += 30) {
  if (paving[i+9] === 5) continue; // The bridge deck is elevated.
  const x = (paving[i]+paving[i+10]+paving[i+20])/3;
  const y = (paving[i+1]+paving[i+11]+paving[i+21])/3;
  const z = (paving[i+2]+paving[i+12]+paving[i+22])/3;
  const core = x >= -450 && x < 510 && z >= -510 && z < 630;
  const step = core ? 4 : 30, ox = core ? -450 : -2490, oz = core ? -510 : -2310;
  const left = ox+Math.floor((x-ox)/step)*step, top = oz+Math.floor((z-oz)/step)*step;
  const heights = cells.get([left,top,step].join());
  if (!heights) {missed++; continue;}
  const [a,b,c,d] = heights, u = (x-left)/step, v = (z-top)/step;
  const h = v>u ? a*(1-v)+b*(v-u)+c*u : a*(1-u)+d*(u-v)+c*v;
  const err = Math.min(Math.abs(y-h-.055),Math.abs(y-h-.085),Math.abs(y-h-.12));
  worst = Math.max(worst,err);
  if (err>.002) errors++;
  checked++;
  if (Math.hypot(x+168,z-82)<40) victor++;
  if (Math.hypot(x-103,z-176)<30) stambol++;
}
console.log({checked,missed,errors,worst,victor,stambol});
if (errors || !victor || !stambol) process.exitCode=1;
