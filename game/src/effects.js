// Dustline — pooled visual effects. No per-frame allocation in update():
// tracers, sparks and flashes are preallocated and reused by index.
import * as THREE from 'three';

const TRACER_N = 12;
const SPARK_N = 10;
const TRACER_LIFE = 0.09;
const SPARK_LIFE = 0.35;

export function createEffects(scene) {
  // Tracer pool: one Line per slot, 2 endpoints each.
  const tracers = [];
  const tracerLife = new Float32Array(TRACER_N);
  for (let i = 0; i < TRACER_N; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push(line);
  }
  let tracerIdx = 0;

  // Impact spark pool: small additive tetrahedra that flash and shrink.
  const sparks = [];
  const sparkLife = new Float32Array(SPARK_N);
  const sparkGeo = new THREE.TetrahedronGeometry(0.09);
  for (let i = 0; i < SPARK_N; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0 });
    const m = new THREE.Mesh(sparkGeo, mat);
    m.visible = false;
    scene.add(m);
    sparks.push(m);
  }
  let sparkIdx = 0;

  // Muzzle flash: one additive plane + point light, reused at the gun tip.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffb050, 0, 9, 2);
  scene.add(flashLight);
  let flashLife = 0;

  // Explosion: one expanding sphere + light, reused.
  const boomMat = new THREE.MeshBasicMaterial({
    color: 0xff7a2a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff6a1a, 0, 22, 2);
  scene.add(boomLight);
  let boomLife = 0;

  const _v = new THREE.Vector3();

  function muzzle(pos, dir) {
    flash.position.copy(pos);
    flash.lookAt(_v.copy(pos).add(dir));
    flash.visible = true;
    flashMat.opacity = 0.95;
    flashLight.position.copy(pos);
    flashLight.intensity = 14;
    flashLife = 0.05;
  }

  function tracer(a, b) {
    const line = tracers[tracerIdx];
    const attr = line.geometry.getAttribute('position');
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
    line.material.opacity = 0.9;
    tracerLife[tracerIdx] = TRACER_LIFE;
    tracerIdx = (tracerIdx + 1) % TRACER_N;
  }

  function impact(pos) {
    const m = sparks[sparkIdx];
    m.position.copy(pos);
    m.visible = true;
    m.material.opacity = 1;
    m.scale.setScalar(1);
    sparkLife[sparkIdx] = SPARK_LIFE;
    sparkIdx = (sparkIdx + 1) % SPARK_N;
  }

  function explosion(pos) {
    boom.position.copy(pos);
    boom.visible = true;
    boom.scale.setScalar(0.4);
    boomMat.opacity = 0.9;
    boomLight.position.copy(pos);
    boomLight.intensity = 60;
    boomLife = 0.6;
    for (let i = 0; i < 4; i++) impact(pos);
  }

  function update(dt) {
    for (let i = 0; i < TRACER_N; i++) {
      if (tracerLife[i] > 0) {
        tracerLife[i] -= dt;
        tracers[i].material.opacity = Math.max(0, tracerLife[i] / TRACER_LIFE) * 0.9;
      }
    }
    for (let i = 0; i < SPARK_N; i++) {
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        const k = Math.max(0, sparkLife[i] / SPARK_LIFE);
        sparks[i].material.opacity = k;
        sparks[i].scale.setScalar(0.4 + k);
        sparks[i].rotation.x += dt * 9;
        sparks[i].rotation.y += dt * 7;
        if (sparkLife[i] <= 0) sparks[i].visible = false;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashMat.opacity = Math.max(0, flashLife / 0.05) * 0.95;
      flashLight.intensity = Math.max(0, flashLife / 0.05) * 14;
      if (flashLife <= 0) { flash.visible = false; flashLight.intensity = 0; }
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = Math.max(0, boomLife / 0.6);
      boom.scale.setScalar(0.4 + (1 - k) * 5);
      boomMat.opacity = k * 0.9;
      boomLight.intensity = k * 60;
      if (boomLife <= 0) { boom.visible = false; boomLight.intensity = 0; }
    }
  }

  return { muzzle, tracer, impact, explosion, update };
}
