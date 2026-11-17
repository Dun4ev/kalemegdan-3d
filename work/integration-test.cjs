const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const eventTarget = () => ({ addEventListener() {}, removeEventListener() {} });
const document = eventTarget();
const canvas = { ...eventTarget(), tabIndex: 0 };
const context = vm.createContext({ atob, document, window: eventTarget() });
const modules = ['map-data', 'terrain-data', 'scan-data', 'landmarks', 'geometry', 'controls'];
for (const name of modules) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8'), context, { filename: name + '.js' });
}
const { World, MapData, Controls } = vm.runInContext('({ World, MapData, Controls })', context);
const world = World.build();
const paths = new Map(MapData.paths.map((way) => [String(way.id), way]));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round = (value) => Number(value.toFixed(3));
const rounded = (point) => Array.from(point, round);
const ground = (point) => World.groundHeight(...point);

function colliderDistance(point, box) {
  const [x, z] = point;
  const c = Math.cos(box.angle), s = Math.sin(box.angle);
  const dx = x - box.x, dz = z - box.z;
  return Math.hypot(
    Math.max(0, Math.abs(c * dx + s * dz) - box.hx),
    Math.max(0, Math.abs(-s * dx + c * dz) - box.hz),
  );
}

function nearby(point, oldHeight = ground(point), radius = 1.0) {
  const h = Math.max(ground(point), oldHeight);
  return Array.from(world.colliders.entries())
    .filter(([, box]) => h + 1.76 > box.y0 && h + 0.08 < box.y1)
    .map(([index, box]) => ({ index, box, distance: colliderDistance(point, box) }))
    .filter((entry) => entry.distance <= radius + 0.00001)
    .sort((a, b) => a.distance - b.distance)
    .map(({ index, box, distance: d }) => ({
      index, source: box.source ?? null, center: rounded([box.x, box.z]),
      halfSize: rounded([box.hx, box.hz]), vertical: rounded([box.y0, box.y1]),
      angle: round(box.angle), distance: round(d),
    }));
}

function samplePolyline(points, maxStep = 0.1) {
  const samples = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.ceil(distance(a, b) / maxStep));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      samples.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return samples;
}

function approach(start, nextInside, preferred, used) {
  const points = [];
  const walkable = Array.from(paths.values()).filter((way) =>
    !way.tunnel && ['footway', 'path', 'pedestrian', 'steps', 'service'].includes(way.kind));
  let remaining = 5;
  let point = start;
  let back = nextInside;
  while (remaining > 0.001) {
    const candidates = [];
    for (const way of walkable) {
      if (used.has(way.id)) continue;
      const index = way.points.findIndex((candidate) => distance(point, candidate) <= 0.02);
      if (index < 0) continue;
      const directions = [way.points.slice(index + 1), way.points.slice(0, index).reverse()];
      for (const direction of directions) {
        if (!direction.length) continue;
        const first = direction[0];
        const step = distance(point, first);
        const previous = distance(point, back);
        const alignment = ((point[0] - back[0]) * (first[0] - point[0]) +
          (point[1] - back[1]) * (first[1] - point[1])) / (step * previous || 1);
        candidates.push({ id: way.id, direction, score: (way.id === preferred ? 10 : 0) + alignment });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0];
    if (!selected) break;
    used.add(selected.id);
    for (const target of selected.direction) {
      const step = distance(point, target);
      if (step > remaining) {
        const t = remaining / step;
        points.push([point[0] + t * (target[0] - point[0]), point[1] + t * (target[1] - point[1])]);
        return points;
      }
      points.push(target);
      remaining -= step;
      back = point;
      point = target;
    }
  }
  return points;
}

const definitions = [
  { name: 'Inner Stambol', key: 'innerStambol', main: ['418450984'], before: '418450982' },
  { name: 'Sahat Gate', key: 'sahatGate', main: ['50989819'], after: '418450981' },
  { name: 'Zindan and bridge', key: 'zindan', main: ['50989234', '50989231'], before: '41108809', after: '50989227' },
  { name: 'Leopold Gate', key: 'leopold', main: ['689230844'], before: '50989227', after: '80823287' },
  { name: 'Zindan to Leopold', main: ['50989234', '50989231', '50989227', '689230844'], before: '41108809', after: '80823287' },
  { name: 'Defterdar and descent', key: 'defterdar', main: ['51677390', '40300566'], before: '40300568' },
  { name: 'Charles VI Gate', key: 'charles', main: ['603978949'], before: '41108593', after: '603978948' },
];

function routePoints(definition) {
  const ways = definition.main.map((id) => paths.get(id));
  const points = Array.from(ways[0].points);
  for (const way of ways.slice(1)) {
    const next = Array.from(way.points);
    if (distance(points.at(-1), next.at(-1)) < distance(points.at(-1), next[0])) next.reverse();
    if (distance(points.at(-1), next[0]) > 0.02) throw Error('Disconnected ways: ' + definition.name);
    points.push(...next.slice(1));
  }
  const start = approach(points[0], points[1], definition.before, new Set(definition.main));
  const end = approach(points.at(-1), points.at(-2), definition.after, new Set(definition.main));
  return [...start.reverse(), ...points, ...end];
}

function assess(samples) {
  const spans = [];
  let span = null;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], previous = samples[Math.max(0, i - 1)];
    const h = ground(p), prev = ground(previous);
    const colliders = nearby(p, prev, 0.35);
    const terrain = h < 0.6 || h - prev > 0.8 || h - prev < -1.15;
    if (!colliders.length && !terrain) { span = null; continue; }
    if (!span) {
      spans.push(span = {
        from: rounded(p), to: rounded(p), count: 0, colliderIndices: [],
        largestVerticalStep: 0, colliders: [],
      });
    }
    span.to = rounded(p);
    span.count++;
    if (terrain && Math.abs(h - prev) > Math.abs(span.largestVerticalStep)) span.largestVerticalStep = round(h - prev);
    for (const c of colliders) if (!span.colliderIndices.includes(c.index)) {
      span.colliderIndices.push(c.index);
      span.colliders.push(c);
    }
  }
  return spans;
}

function traverse(samples) {
  const controls = new Controls(canvas, world);
  const start = samples[0];
  controls.position = [start[0], ground(start) + 1.7, start[1]];
  let firstDeviation;
  let reached = null;
  for (let i = 1; i < samples.length; i++) {
    const target = samples[i];
    const [x, y, z] = controls.position;
    const gap = distance([x, z], target);
    const scale = Math.min(1, 0.1 / gap);
    if (gap > 1e-8) controls.move(scale * (target[0] - x), scale * (target[1] - z));
    const actual = [controls.position[0], controls.position[2]];
    const error = distance(actual, target);
    if (!firstDeviation && error > 0.18) {
      firstDeviation = {
        index: i, expected: rounded(target), actual: rounded(actual), error: round(error),
        actualGround: round(y - 1.7), expectedGround: round(ground(target)),
        nearby: nearby(actual, y - 1.7),
      };
    }
    if (error <= 0.18) reached = i;
  }
  const endpoint = samples.at(-1);
  // Let a lightly deflected controller converge on the endpoint.
  for (let i = 0; i < 100; i++) {
    const [x, , z] = controls.position;
    const gap = distance([x, z], endpoint);
    if (gap < 0.04) break;
    const t = Math.min(1, 0.1 / gap);
    controls.move((endpoint[0] - x) * t, (endpoint[1] - z) * t);
  }
  const final = rounded([controls.position[0], controls.position[2]]);
  controls.dispose();
  return {
    reached, total: samples.length - 1, firstDeviation: firstDeviation ?? null,
    endTarget: rounded(endpoint), endActual: final, endError: round(distance(final, endpoint)),
  };
}

const viewpoints = Array.from(world.viewpoints, (view, index) => {
  const point = [view.x, view.z], h = ground(point);
  const overlapping = nearby(point, h, 0.35);
  return { index: index + 1, name: view.name || view.label || view.title, point: rounded(point), ground: round(h), overlapping };
});
const routes = definitions.map((definition) => {
  const points = routePoints(definition);
  const samples = samplePolyline(points);
  return {
    ...definition, points, centerlineIssues: assess(samples),
    forward: traverse(samples), reverse: traverse(samples.slice().reverse()),
  };
});
const missingRequestedWays = ['50989232', '50989233'].filter((id) => !paths.has(id));
const report = { viewpoints, routes, missingRequestedWays };
fs.writeFileSync(path.join(__dirname, 'integration-report.json'), JSON.stringify(report, null, 2) + '\n');

for (const view of viewpoints) console.log('view', view.index, view.name, view.point.join(', '), view.overlapping.length ? 'overlap' : 'clear');
for (const route of routes) {
  console.log(route.name, 'end error forward/reverse', route.forward.endError, route.reverse.endError,
    'blocked spans', route.centerlineIssues.map(({ from, to, colliderIndices, largestVerticalStep }) => ({ from, to, colliderIndices, largestVerticalStep })));
}
if (missingRequestedWays.length) console.log('missing requested ways:', missingRequestedWays.join(', '));
if (process.argv.includes('--strict') && (viewpoints.length !== 7 || viewpoints.some((v) => v.overlapping.length || v.ground < 0.6) ||
    routes.some((r) => r.centerlineIssues.length || r.forward.firstDeviation || r.reverse.firstDeviation ||
      r.forward.endError > 0.2 || r.reverse.endError > 0.2))) process.exitCode = 1;
