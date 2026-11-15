// player.js — FPS controller: accel/decel movement, crouch, jump,
// AABB collision vs S.colliders, health/armor, camera-attached viewmodel.
import * as THREE from 'three';
import { S } from './state.js';

const EYE_STAND = 1.62, EYE_CROUCH = 1.12;
const RADIUS = 0.35, HEIGHT = 1.8, CROUCH_HEIGHT = 1.25;
const WALK_SPEED = 5.4, CROUCH_SPEED = 2.7, ACCEL = 42, FRICTION = 11;
const GRAVITY = 24, JUMP_VEL = 7.6;
const SENS = 0.0023;

// Viewmodel silhouettes per weapon id (length, barrel, grip tint).
// Ids are the canonical WEAPONS keys: pistol/smg/rifle/sniper.
const VM = {
  pistol: { len: 0.34, barrel: 0.16, mag: 0.10, accent: 0x8a4a2a },
  smg: { len: 0.52, barrel: 0.24, mag: 0.16, accent: 0x2a8a7a },
  rifle: { len: 0.62, barrel: 0.30, mag: 0.18, accent: 0x8a4a2a },
  sniper: { len: 0.86, barrel: 0.48, mag: 0.12, accent: 0x2a8a7a },
};

export function createPlayer(scene, camera, input) {
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const pos = new THREE.Vector3(0, 0, 0);
  const vel = new THREE.Vector3();
  const wish = new THREE.Vector3();
  let yaw = 0, pitch = 0;
  let onGround = true, eyeH = EYE_STAND, crouched = false;
  let viewKick = 0, swayX = 0, swayY = 0;

  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.55, metalness: 0.65 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.9, metalness: 0.1 });
  let accentMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.5, metalness: 0.4 });

  const viewmodel = new THREE.Group();
  viewmodel.position.set(0.27, -0.24, -0.5);
  camera.add(viewmodel);

  function buildViewmodel(id) {
    while (viewmodel.children.length) {
      const c = viewmodel.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const d = VM[id] || VM.pistol;
    accentMat = new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.5, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, d.len), steel);
    body.position.z = -d.len / 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, d.barrel, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -d.len - d.barrel / 2 + 0.05);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, d.mag, 0.09), gripMat);
    grip.position.set(0, -0.09, -d.len * 0.25);
    grip.rotation.x = 0.25;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.015, d.len * 0.55), accentMat);
    strip.position.set(0, 0.06, -d.len / 2);
    viewmodel.add(body, barrel, grip, strip);
  }
  buildViewmodel('pistol');

  // Axis-separated AABB resolve against S.colliders. pos = feet centre.
  function collideAxis(axis, delta) {
    if (delta === 0) return;
    pos[axis] += delta;
    const minX = pos.x - RADIUS, maxX = pos.x + RADIUS;
    const minY = pos.y, maxY = pos.y + (crouched ? CROUCH_HEIGHT : HEIGHT);
    const minZ = pos.z - RADIUS, maxZ = pos.z + RADIUS;
    for (let i = 0; i < S.colliders.length; i++) {
      const b = S.colliders[i];
      if (maxX <= b.min.x || minX >= b.max.x) continue;
      if (maxY <= b.min.y || minY >= b.max.y) continue;
      if (maxZ <= b.min.z || minZ >= b.max.z) continue;
      if (axis === 'x') pos.x = delta > 0 ? b.min.x - RADIUS : b.max.x + RADIUS;
      else if (axis === 'z') pos.z = delta > 0 ? b.min.z - RADIUS : b.max.z + RADIUS;
      else if (axis === 'y') {
        if (delta < 0) { pos.y = b.max.y; onGround = true; vel.y = 0; }
        else { pos.y = b.min.y - (crouched ? CROUCH_HEIGHT : HEIGHT); vel.y = 0; }
      }
    }
  }

  const player = {
    pos,
    // Accessors backed by the closure vars, so main.js / shot mode can
    // assign player.yaw / player.pitch and have update() honour it.
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = v; },
    input, // exposed so arsenal/game can poll keys (fire/reload/defuse)
    health: 100, armor: 0,
    weapon: 'pistol',
    alive: true,
    viewmodel,
    viewKick: 0,

    get crouched() { return crouched; },
    get speed() { return Math.hypot(vel.x, vel.z); },
    get onGround() { return onGround; },

    setWeapon(id) {
      player.weapon = id;
      buildViewmodel(id);
    },

    // Recoil shove applied to the viewmodel; decays in update().
    kick(amount) { viewKick = Math.min(0.09, viewKick + amount); },

    takeDamage(amount, part) {
      if (!player.alive) return false;
      let dmg = amount;
      if (player.armor > 0) {
        const absorbed = Math.min(player.armor, dmg * 0.5);
        player.armor -= absorbed;
        dmg -= absorbed;
      }
      player.health -= dmg;
      if (player.health <= 0) {
        player.health = 0;
        player.alive = false;
        return true; // died
      }
      return false;
    },

    respawn(spawnPos) {
      pos.copy(spawnPos);
      vel.set(0, 0, 0);
      yaw = Math.atan2(-(S.sites.A ? S.sites.A.pos.x - spawnPos.x : 1), -(S.sites.A ? S.sites.A.pos.z - spawnPos.z : 0));
      pitch = 0;
      player.health = 100;
      player.alive = true;
      onGround = true;
    },

    update(dt) {
      if (!player.alive) return;
      const look = input.consumeLook();
      yaw -= look.dx * SENS;
      pitch -= look.dy * SENS;
      pitch = Math.max(-1.5, Math.min(1.5, pitch));
      player.yaw = yaw; player.pitch = pitch;
      swayX += (look.dx * 0.0004 - swayX) * Math.min(1, dt * 10);
      swayY += (look.dy * 0.0004 - swayY) * Math.min(1, dt * 10);

      crouched = input.crouchHeld;
      const targetEye = crouched ? EYE_CROUCH : EYE_STAND;
      eyeH += (targetEye - eyeH) * Math.min(1, dt * 12);

      // Wish direction from keys, rotated by yaw.
      const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      const r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      wish.set(-sin * f + cos * r, 0, -cos * f - sin * r);
      if (wish.lengthSq() > 0) wish.normalize();

      const maxSpeed = crouched ? CROUCH_SPEED : WALK_SPEED;
      if (wish.lengthSq() > 0) {
        vel.x += wish.x * ACCEL * dt;
        vel.z += wish.z * ACCEL * dt;
        const hs = Math.hypot(vel.x, vel.z);
        if (hs > maxSpeed) { vel.x *= maxSpeed / hs; vel.z *= maxSpeed / hs; }
      } else {
        const dec = Math.max(0, 1 - FRICTION * dt);
        vel.x *= dec; vel.z *= dec;
        if (Math.abs(vel.x) < 0.01) vel.x = 0;
        if (Math.abs(vel.z) < 0.01) vel.z = 0;
      }

      if (input.jumpHeld && onGround) { vel.y = JUMP_VEL; onGround = false; }
      vel.y -= GRAVITY * dt;

      collideAxis('x', vel.x * dt);
      collideAxis('z', vel.z * dt);
      onGround = false;
      collideAxis('y', vel.y * dt);
      if (pos.y <= 0) { pos.y = 0; vel.y = 0; onGround = true; }

      camera.position.set(pos.x, pos.y + eyeH, pos.z);
      camera.rotation.set(pitch, yaw, 0);

      // Viewmodel: recoil kick + look sway + walk bob.
      viewKick = Math.max(0, viewKick - dt * 0.35);
      player.viewKick = viewKick;
      const bob = player.speed > 0.5 && onGround ? Math.sin(performance.now() * 0.012) * 0.008 : 0;
      viewmodel.position.set(0.27 + swayX, -0.24 + swayY + bob, -0.5 + viewKick);
      viewmodel.rotation.x = viewKick * 1.6;
    },
  };
  return player;
}
