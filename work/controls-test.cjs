const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class EventTargetMock {
  listeners = new Map();

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type).delete(handler);
  }

  dispatch(type, properties = {}) {
    const event = { preventDefault() {}, ...properties };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

const window = new EventTargetMock();
const document = new EventTargetMock();
const canvas = new EventTargetMock();
canvas.tabIndex = -1;
canvas.focus = () => { document.activeElement = canvas; };
canvas.requestPointerLock = async () => {
  document.pointerLockElement = canvas;
  document.dispatch('pointerlockchange');
};
document.exitPointerLock = () => {
  document.pointerLockElement = null;
  document.dispatch('pointerlockchange');
};

const World = { groundHeight: () => 1 };
const runtime = vm.createContext({ window, document, World });
const script = fs.readFileSync(path.join(__dirname, 'controls.js'), 'utf8');
const { Controls, AudioEngine } = vm.runInContext(script + '\n({ Controls, AudioEngine });', runtime);
const viewpoint = { x: 0, z: 0, yaw: 0, pitch: 0 };
const wall = { x: 0, z: -2, hx: 15, hz: 0.15, angle: 0, y0: 0, y1: 4 };

function setup(colliders = [], viewpoints = [viewpoint], onViewpoint, onLock, bounds) {
  document.activeElement = null;
  return new Controls(canvas, { colliders, viewpoints, paths: [], bounds }, onViewpoint, onLock);
}

function hold(controls, ...keys) {
  for (const code of keys) window.dispatch('keydown', { code });
  for (let i = 0; i < 10; i++) controls.update(0.1);
}

(async () => {
  let controls = setup([wall]);
  hold(controls, 'KeyW');
  assert.equal(controls.position[2], 0, 'movement needs focus or explicit touch input');
  canvas.focus();
  hold(controls, 'KeyW');
  assert.ok(controls.position[2] >= -1.501 && controls.position[2] <= -1.499, 'wall stops capsule');
  hold(controls, 'KeyD');
  assert.ok(controls.position[0] > 2.8 && controls.position[2] > -1.501, 'capsule slides along wall');
  window.dispatch('blur');
  assert.equal(controls.update(0.1), 0, 'blur clears keys');
  controls.dispose();

  const rotatedWall = { ...wall, x: 2, z: 0, angle: Math.PI / 2 };
  controls = setup([rotatedWall]);
  controls.setTouchMove(1, 0);
  for (let i = 0; i < 10; i++) controls.update(0.1);
  assert.ok(controls.position[0] >= 1.499 && controls.position[0] <= 1.501, 'rotated wall stops capsule');
  controls.dispose();

  const onView = [];
  const onLock = [];
  const overheadBeam = { ...wall, y0: 3.1 };
  controls = setup([overheadBeam], [viewpoint, { x: 2, z: 4, yaw: 0.5, pitch: -0.3 }], (index) => onView.push(index), (locked) => onLock.push(locked));
  await controls.requestLock();
  hold(controls, 'KeyW');
  assert.ok(controls.position[2] < -3.99, 'passes through opening beneath overhead beam');
  window.dispatch('keydown', { code: 'Digit2' });
  assert.deepEqual(Array.from(controls.position), [2, 2.7, 4]);
  assert.equal(controls.yaw, 0.5);
  assert.equal(controls.pitch, -0.3);
  assert.deepEqual(onView, [0, 1]);
  document.exitPointerLock();
  assert.deepEqual(onLock, [true, false]);
  assert.equal(controls.update(0.1), 0, 'unlock clears keys');
  controls.dispose();

  controls = setup();
  canvas.focus();
  hold(controls, 'KeyD', 'KeyW', 'ShiftLeft');
  assert.ok(Math.abs(Math.hypot(controls.position[0], controls.position[2]) - 8) < 1e-9, 'sprint does not boost diagonal speed');
  controls.dispose();

  for (const obstacleHeight of [0.2, 3]) {
    World.groundHeight = (x) => x > 1 ? obstacleHeight : 1;
    controls = setup();
    controls.setTouchMove(1, 0);
    for (let i = 0; i < 10; i++) controls.update(0.1);
    assert.ok(controls.position[0] > 0.8 && controls.position[0] <= 1, 'water and steep terrain stop movement');
    controls.dispose();
  }

  World.groundHeight = () => 1;
  controls = setup([], [{ ...viewpoint, x: 244 }]);
  controls.setTouchMove(1, 0);
  for (let i = 0; i < 10; i++) controls.update(0.1);
  assert.equal(controls.position[0], 244.65, 'capsule stays inside map bounds');
  controls.dispose();

  const sixthViewpoint = { ...viewpoint, x: -429, z: 579 };
  controls = setup([], [viewpoint, viewpoint, viewpoint, viewpoint, viewpoint, sixthViewpoint],
    undefined, undefined, { minX: -430, maxX: 450, minZ: -470, maxZ: 580 });
  canvas.focus();
  window.dispatch('keydown', { code: 'Digit6' });
  assert.deepEqual(Array.from(controls.position), [-429, 2.7, 579]);
  controls.setTouchMove(-1, -1);
  for (let i = 0; i < 10; i++) controls.update(0.1);
  assert.equal(controls.position[0], -429.65, 'capsule stays inside supplied minimum x');
  assert.equal(controls.position[2], 579.65, 'capsule stays inside supplied maximum z');
  controls.dispose();

  controls = setup();
  canvas.requestPointerLock = async () => { throw new Error('Pointer lock denied'); };
  assert.equal(await controls.requestLock(), false, 'pointer lock rejection leaves fallback usable');
  canvas.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  window.dispatch('pointermove', { pointerId: 1, clientX: 20, clientY: 20 });
  assert.ok(controls.yaw > 0 && controls.pitch < 0, 'drag changes yaw and pitch');
  hold(controls, 'KeyW');
  assert.ok(controls.position[2] < -3.99, 'focused canvas handles keyboard in fallback');
  controls.dispose();

  assert.equal(await AudioEngine.start(), false, 'unsupported browser degrades gracefully');
  AudioEngine.update(0.1, 4);
  console.log('Controls checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
