// MODULE 5 · Web Audio synthesis and first-person movement with ground/OBB collision.
const AudioEngine = (() => {
  let context;
  let master;
  let noise;
  let enabled = false;
  let generation = 0;
  let stepDistance = 0;

  function initialize() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    context = new Context();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    const wind = context.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 415;
    const windVolume = context.createGain();
    windVolume.gain.value = 0.11;
    wind.connect(windFilter).connect(windVolume).connect(master);
    wind.start();

    // Slowly vary the wind intensity to soften the loop.
    const gust = context.createOscillator();
    gust.frequency.value = 0.14;
    const gustDepth = context.createGain();
    gustDepth.gain.value = 0.044;
    gust.connect(gustDepth).connect(windVolume.gain);
    gust.start();

    const traffic = context.createBufferSource();
    traffic.buffer = noise;
    traffic.playbackRate.value = 0.71;
    traffic.loop = true;
    const trafficFilter = context.createBiquadFilter();
    trafficFilter.type = 'bandpass';
    trafficFilter.frequency.value = 116;
    trafficFilter.Q.value = 0.55;
    const trafficVolume = context.createGain();
    trafficVolume.gain.value = 0.11;
    traffic.connect(trafficFilter).connect(trafficVolume).connect(master);
    traffic.start();
    return true;
  }

  async function setEnabled(value) {
    const request = ++generation;
    enabled = !!value;
    stepDistance = 0;
    try {
      if (enabled && !context && !initialize()) enabled = false;
      if (context && enabled) await context.resume();
      if (request === generation && master) {
        master.gain.setTargetAtTime(enabled ? 0.72 : 0, context.currentTime, 0.065);
      }
    } catch {
      if (request === generation) enabled = false;
    }
    return enabled;
  }

  function footstep(surface, speed) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 0.82 + Math.random() * 0.36;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = ({ grass: 370, stone: 640, pavement: 710, gravel: 940 })[surface] || 940;
    filter.Q.value = 0.8;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(speed > 5 ? 0.19 : 0.13, now + 0.013);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    source.connect(filter).connect(envelope).connect(master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(now, Math.random() * 2.5);
    source.stop(now + 0.16);
  }

  function update(dt, speed, surface = 'gravel') {
    if (!enabled || context?.state !== 'running') return;
    if (speed < 0.25) {
      stepDistance = 0;
      return;
    }
    stepDistance += speed * dt;
    const stride = speed > 5 ? 2.25 : 1.76;
    if (stepDistance >= stride) {
      stepDistance %= stride;
      footstep(surface, speed);
    }
  }

  return {
    toggle: () => setEnabled(!enabled),
    start: () => setEnabled(true),
    setEnabled,
    update,
    suspend: () => context?.suspend().catch(() => {}),
    resume: () => enabled ? context?.resume().catch(() => {}) : undefined,
  };
})();

class Controls {
  constructor(canvas, world, onViewpoint = () => {}, onLock = () => {}) {
    this.canvas = canvas;
    this.world = world;
    const { minX = -175, maxX = 245, minZ = -185, maxZ = 285 } = world.bounds || {};
    this.minX = minX + 0.35;
    this.maxX = maxX - 0.35;
    this.minZ = minZ + 0.35;
    this.maxZ = maxZ - 0.35;
    this.onViewpoint = onViewpoint;
    this.onLock = onLock;
    this.position = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.keys = new Set();
    this.touchMove = [0, 0];
    this.drag = null;
    this.listeners = [];
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;

    this.listen(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.clearMotion();
      this.onLock(this.locked);
    });
    this.listen(document, 'pointerlockerror', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLock(this.locked);
    });
    this.listen(window, 'blur', () => this.clearMotion());
    this.listen(canvas, 'blur', () => this.clearMotion());
    this.listen(document, 'visibilitychange', () => this.clearMotion());
    this.listen(window, 'keydown', (event) => this.keyDown(event));
    this.listen(window, 'keyup', (event) => this.keys.delete(event.code));
    this.listen(canvas, 'pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || this.locked) return;
      canvas.focus({ preventScroll: true });
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    });
    this.listen(canvas, 'lostpointercapture', () => { this.drag = null; });
    this.listen(window, 'pointerup', (event) => this.endDrag(event));
    this.listen(window, 'pointercancel', (event) => this.endDrag(event));
    this.listen(window, 'pointermove', (event) => {
      if (this.locked) {
        this.look(event.movementX || 0, event.movementY || 0);
      } else if (this.drag?.id === event.pointerId) {
        this.look(event.clientX - this.drag.x, event.clientY - this.drag.y);
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
      }
    });

    if (world.viewpoints.length) this.teleport(0);
    else this.position[1] = World.groundHeight(0, 0) + 1.7;
  }

  listen(target, name, handler) {
    target.addEventListener(name, handler);
    this.listeners.push([target, name, handler]);
  }

  keyDown(event) {
    if ((!this.locked && document.activeElement !== this.canvas) || event.altKey || event.metaKey || event.ctrlKey) return;
    if (/^Digit[1-7]$/.test(event.code)) {
      const index = Number(event.code.at(-1)) - 1;
      if (!this.world.viewpoints[index]) return;
      event.preventDefault();
      if (!event.repeat) this.teleport(index);
      return;
    }
    if (!/^(Key[WASD]|Arrow(Left|Right|Up|Down)|Shift(Left|Right))$/.test(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  }

  endDrag(event) {
    if (this.drag?.id === event.pointerId) this.drag = null;
  }

  clearMotion() {
    this.keys.clear();
    this.setTouchMove(0, 0);
    this.drag = null;
  }

  async requestLock() {
    this.canvas.focus({ preventScroll: true });
    if (this.locked || !this.canvas.requestPointerLock) return this.locked;
    try {
      await this.canvas.requestPointerLock();
    } catch {
      this.onLock(false);
    }
    return document.pointerLockElement === this.canvas;
  }

  look(dx, dy) {
    this.yaw += dx * 0.0026;
    this.pitch = Math.max(-1.49, Math.min(1.49, this.pitch - dy * 0.0026));
  }

  setTouchMove(x, z) {
    this.touchMove[0] = Math.max(-1, Math.min(1, Number(x) || 0));
    this.touchMove[1] = Math.max(-1, Math.min(1, Number(z) || 0));
  }

  teleport(index) {
    const viewpoint = this.world.viewpoints[index];
    if (!viewpoint) return false;
    const ground = World.groundHeight(viewpoint.x, viewpoint.z);
    if (!Number.isFinite(ground) || ground < 0.6) return false;
    this.position[0] = viewpoint.x;
    this.position[1] = ground + 1.7;
    this.position[2] = viewpoint.z;
    this.yaw = viewpoint.yaw;
    this.pitch = viewpoint.pitch;
    this.onViewpoint(index);
    return true;
  }

  // Project the character's horizontal circle out of solid rectangles.
  slide(x, z, ground) {
    const radius = 0.35;
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (const box of this.world.colliders) {
        if (ground + 1.76 <= box.y0 || ground + 0.08 >= box.y1) continue;
        if (Math.abs(x - box.x) > box.hx + box.hz + radius ||
            Math.abs(z - box.z) > box.hx + box.hz + radius) continue;
        const cos = Math.cos(box.angle);
        const sin = Math.sin(box.angle);
        const dx = x - box.x;
        const dz = z - box.z;
        const localX = cos * dx + sin * dz;
        const localZ = -sin * dx + cos * dz;
        let pushX = localX - Math.max(-box.hx, Math.min(box.hx, localX));
        let pushZ = localZ - Math.max(-box.hz, Math.min(box.hz, localZ));
        const distance = Math.hypot(pushX, pushZ);
        if (distance >= radius) continue;
        if (distance > 0.00001) {
          const factor = (radius - distance + 0.0001) / distance;
          pushX *= factor;
          pushZ *= factor;
        } else {
          const edgeX = box.hx - Math.abs(localX);
          const edgeZ = box.hz - Math.abs(localZ);
          if (edgeX < edgeZ) {
            pushX = (Math.sign(localX) || 1) * (edgeX + radius + 0.0001);
            pushZ = 0;
          } else {
            pushX = 0;
            pushZ = (Math.sign(localZ) || 1) * (edgeZ + radius + 0.0001);
          }
        }
        x += cos * pushX - sin * pushZ;
        z += sin * pushX + cos * pushZ;
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  }

  move(dx, dz) {
    const [oldX, oldEye, oldZ] = this.position;
    const oldGround = oldEye - 1.7;
    const x = Math.max(this.minX, Math.min(this.maxX, oldX + dx));
    const z = Math.max(this.minZ, Math.min(this.maxZ, oldZ + dz));
    const candidateGround = World.groundHeight(x, z);
    if (!Number.isFinite(candidateGround)) return;
    const [newX, newZ] = this.slide(x, z, Math.max(oldGround, candidateGround));
    if (newX < this.minX || newX > this.maxX || newZ < this.minZ || newZ > this.maxZ) return;
    const ground = World.groundHeight(newX, newZ);
    if (!Number.isFinite(ground) || ground < 0.6 || ground > oldGround + 0.8 || ground < oldGround - 1.15) return;
    this.position[0] = newX;
    this.position[1] = ground + 1.7;
    this.position[2] = newZ;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || document.hidden) return 0;
    dt = Math.min(dt, 0.12);
    const keyboard = this.locked || document.activeElement === this.canvas;
    const down = (code) => keyboard && this.keys.has(code);
    this.yaw += (Number(down('ArrowRight')) - Number(down('ArrowLeft'))) * dt * 1.85;
    let x = this.touchMove[0] + Number(down('KeyD')) - Number(down('KeyA'));
    let z = this.touchMove[1] + Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown'));
    const length = Math.hypot(x, z);
    if (length === 0) return 0;
    const scale = dt * (down('ShiftLeft') || down('ShiftRight') ? 8 : 4) / Math.max(length, 1);
    x *= scale;
    z *= scale;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = cos * x + sin * z;
    const dz = sin * x - cos * z;

    const [oldX, , oldZ] = this.position;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.14));
    for (let i = 0; i < steps; i++) this.move(dx / steps, dz / steps);
    return Math.hypot(this.position[0] - oldX, this.position[2] - oldZ) / dt;
  }

  dispose() {
    for (const [target, name, handler] of this.listeners) target.removeEventListener(name, handler);
    this.listeners.length = 0;
    if (this.locked) document.exitPointerLock?.();
    this.locked = false;
    this.clearMotion();
  }
}
