// weapons.js — arsenal: hitscan gunplay, spread/recoil, reload, buy menu
// economy, grenades. Weapon defs come from WEAPONS in state.js.
import * as THREE from 'three';
import { WEAPONS, S } from './state.js';
import { rand } from './rng.js';

const FALLBACK = {
  pistol: { damage: 34, headMul: 4, rpm: 360, mag: 12, reserve: 36, reloadMs: 1400, spreadBase: 0.012, spreadMove: 0.02, recoil: 0.011, price: 300, auto: false },
  smg: { damage: 26, headMul: 4, rpm: 750, mag: 25, reserve: 100, reloadMs: 2200, spreadBase: 0.016, spreadMove: 0.026, recoil: 0.009, price: 1500, auto: true },
  rifle: { damage: 33, headMul: 4, rpm: 600, mag: 30, reserve: 90, reloadMs: 2500, spreadBase: 0.011, spreadMove: 0.022, recoil: 0.014, price: 2700, auto: true },
  sniper: { damage: 110, headMul: 4, rpm: 48, mag: 5, reserve: 15, reloadMs: 3200, spreadBase: 0.002, spreadMove: 0.03, recoil: 0.06, price: 4750, auto: false },
  armor: { price: 650 },
  frag: { price: 300 },
  smoke: { price: 300 },
};
const GUN_IDS = ['pistol', 'smg', 'rifle', 'sniper'];
// Buy-menu order (same as hud.js BUY_ORDER): digits 1-7 buy during buy phase.
const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'armor', 'frag', 'smoke'];
const HEAD_Y = 1.45, LEG_Y = 0.55; // hit-part split heights above bot feet

function def(id) { return (WEAPONS && WEAPONS[id]) || FALLBACK[id] || {}; }

// Ray vs vertical segment (body/legs cylinder): returns t or -1.
function raySegment(origin, dir, base, top, radius, out) {
  const dx = dir.x, dz = dir.z;
  const ox = origin.x - base.x, oz = origin.z - base.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1; // near-vertical ray: no side hit
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return -1;
  const y = origin.y + dir.y * t;
  if (y < base.y || y > top.y) return -1;
  out.t = t; out.y = y;
  return t;
}

// Ray vs sphere (head): returns t or -1.
function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

export function createArsenal(player, scene, effects, audio) {
  const cam = S.camera;
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const hitP = new THREE.Vector3();
  const headC = new THREE.Vector3();
  const segBase = new THREE.Vector3();
  const segTop = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const segOut = { t: 0, y: 0 };

  const owned = { pistol: true }; // pistol always owned
  const ammoMap = {};
  for (const id of GUN_IDS) {
    const d = def(id);
    ammoMap[id] = { mag: d.mag || 0, reserve: d.reserve || 0 };
  }

  const grenades = { frag: 0, smoke: 0 };
  const thrown = []; // active grenade projectiles
  const smokePuffs = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.55, depthWrite: false });

  let currentId = 'pistol';
  let lastShotAt = -99, reloading = false, reloadEndsAt = 0;
  let bloom = 0; // firing bloom, decays in update()
  let prevFiring = false;
  const prevKeys = new Set();

  // Buy-menu clicks from hud.js arrive as window 'dustline-buy' events.
  window.addEventListener('dustline-buy', (e) => {
    if (e.detail && e.detail.id) arsenal.buy(e.detail.id);
  });

  const arsenal = {
    grenades,
    reloading: false,
    lastHit: null,   // {kill, headshot, victim, at} — game.js reads this for HUD
    lastKill: null,  // {victim, headshot, at} — game.js reads this for killfeed/economy
    thrown, smokePuffs,

    get current() { return currentId; },
    get def() { return def(currentId); },
    get ammo() { return ammoMap[currentId]; },
    get bloom() { return bloom; },
    // hud.js reads S.arsenal.owned as an array of owned weapon ids.
    get owned() { return GUN_IDS.filter((id) => owned[id]); },

    select(id) {
      if (!owned[id] || !GUN_IDS.includes(id)) return false;
      if (reloading) return false;
      currentId = id;
      player.setWeapon(id);
      return true;
    },

    buy(id) {
      const d = def(id);
      if (!d.price || S.money < d.price) return false;
      if (id === 'armor') {
        if (player.armor >= 100) return false;
        S.money -= d.price;
        player.armor = Math.min(100, player.armor + 50);
        return true;
      }
      if (id === 'frag' || id === 'smoke') {
        if (grenades[id] >= 2) return false;
        S.money -= d.price;
        grenades[id]++;
        return true;
      }
      if (!GUN_IDS.includes(id) || owned[id]) return false;
      S.money -= d.price;
      owned[id] = true;
      ammoMap[id] = { mag: d.mag || 0, reserve: d.reserve || 0 };
      arsenal.select(id);
      return true;
    },

    reload() {
      const a = ammoMap[currentId], d = def(currentId);
      if (reloading || a.mag >= (d.mag || 0) || a.reserve <= 0) return false;
      reloading = true;
      arsenal.reloading = true;
      reloadEndsAt = performance.now() + (d.reloadMs || 2000);
      if (audio) audio.reload();
      return true;
    },

    fire() {
      if (!player.alive || reloading) return false;
      const d = def(currentId);
      const now = performance.now();
      const interval = 60000 / (d.rpm || 300);
      if (now - lastShotAt < interval) return false;
      const a = ammoMap[currentId];
      if (a.mag <= 0) { arsenal.reload(); return false; }
      lastShotAt = now;
      a.mag--;
      bloom = Math.min(0.05, bloom + (d.recoil || 0.01) * 0.9);

      // Spread: base + movement + bloom; crouch halves the movement part.
      const moveF = Math.min(1, player.speed / 5.4);
      let spread = (d.spreadBase || 0.012) + (d.spreadMove || 0.02) * moveF * (player.crouched ? 0.5 : 1) + bloom;
      cam.getWorldPosition(origin);
      cam.getWorldDirection(dir);
      dir.x += (rand() * 2 - 1) * spread;
      dir.y += (rand() * 2 - 1) * spread;
      dir.z += (rand() * 2 - 1) * spread;
      dir.normalize();
      player.pitch += (d.recoil || 0.01);
      player.kick((d.recoil || 0.01) * 1.4);

      // Muzzle world pos (viewmodel tip) for flash + tracer start.
      muzzle.copy(origin).addScaledVector(dir, 0.7);
      muzzle.y -= 0.12;
      if (effects) effects.muzzle(muzzle, dir);
      if (audio) audio.shot(currentId);
      S.lastShotAt = now / 1000;
      tmpV.copy(origin);
      S.lastShotPos = S.lastShotPos || new THREE.Vector3();
      S.lastShotPos.copy(tmpV);

      // Hitscan vs enemy bots (head 4x, body 1x, legs 0.75x).
      let bestT = Infinity, bestBot = null, bestPart = 'body';
      const bots = S.bots || [];
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot.alive || bot.side === 'us') continue;
        const p = bot.pos;
        headC.set(p.x, p.y + 1.58, p.z);
        const th = raySphere(origin, dir, headC, 0.24);
        if (th >= 0 && th < bestT) { bestT = th; bestBot = bot; bestPart = 'head'; }
        segBase.set(p.x, p.y + LEG_Y, p.z);
        segTop.set(p.x, p.y + HEAD_Y, p.z);
        if (raySegment(origin, dir, segBase, segTop, 0.38, segOut) >= 0 && segOut.t < bestT) {
          bestT = segOut.t; bestBot = bot; bestPart = 'body';
        }
        segBase.set(p.x, p.y + 0.05, p.z);
        segTop.set(p.x, p.y + LEG_Y, p.z);
        if (raySegment(origin, dir, segBase, segTop, 0.3, segOut) >= 0 && segOut.t < bestT) {
          bestT = segOut.t; bestBot = bot; bestPart = 'legs';
        }
      }

      if (bestBot) {
        hitP.copy(origin).addScaledVector(dir, bestT);
        const mul = bestPart === 'head' ? (d.headMul || 4) : bestPart === 'legs' ? 0.75 : 1;
        const died = bestBot.takeDamage((d.damage || 30) * mul, bestPart);
        if (effects) { effects.tracer(muzzle, hitP); effects.impact(hitP); }
        if (audio) { audio.hit(); if (died) audio.kill(); }
        arsenal.lastHit = { kill: died, headshot: bestPart === 'head', victim: bestBot, at: now / 1000 };
        if (died) arsenal.lastKill = { victim: bestBot, headshot: bestPart === 'head', at: now / 1000 };
      } else {
        // Miss: tracer to max range / first wall hit (approx 60m).
        hitP.copy(origin).addScaledVector(dir, 60);
        if (effects) effects.tracer(muzzle, hitP);
      }
      return true;
    },

    throwGrenade(type) {
      if (!player.alive || grenades[type] <= 0) return false;
      grenades[type]--;
      cam.getWorldDirection(dir);
      const g = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: type === 'frag' ? 0x3a5a2a : 0x888888, roughness: 0.6 })
      );
      cam.getWorldPosition(origin);
      g.position.copy(origin).addScaledVector(dir, 0.5);
      scene.add(g);
      thrown.push({
        mesh: g, type, vel: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.5, 0)),
        fuse: type === 'frag' ? 1.6 : 1.1, landed: false,
      });
      return true;
    },

    reset() {
      for (const id of GUN_IDS) {
        if (!owned[id]) continue;
        const d = def(id);
        ammoMap[id] = { mag: d.mag || 0, reserve: d.reserve || 0 };
      }
      reloading = false;
      arsenal.reloading = false;
      bloom = 0;
      if (!owned[currentId]) arsenal.select('pistol');
    },

    update(dt) {
      // Input polling (main.js never wires keys): fire / reload / select /
      // buy-by-digit during the buy phase / grenades. Semi-auto weapons
      // fire once per mouse press; autos fire while held.
      const inp = player.input;
      if (inp && player.alive) {
        const firing = !!inp.firing;
        const d = def(currentId);
        if (firing && (d.auto || !prevFiring)) arsenal.fire();
        prevFiring = firing;
        const pressed = (code) => inp.down(code) && !prevKeys.has(code);
        if (pressed('KeyR')) arsenal.reload();
        if (pressed('KeyG')) arsenal.throwGrenade('frag');
        if (pressed('KeyF')) arsenal.throwGrenade('smoke');
        const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];
        for (let i = 0; i < digit.length; i++) {
          if (!pressed(digit[i])) continue;
          if (S.phase === 'buy') arsenal.buy(BUY_ORDER[i]);
          else if (i < 4) arsenal.select(GUN_IDS[i]);
        }
        prevKeys.clear();
        inp.keys.forEach((k) => prevKeys.add(k));
      }
      bloom = Math.max(0, bloom - dt * 0.06);
      if (reloading && performance.now() >= reloadEndsAt) {
        reloading = false;
        arsenal.reloading = false;
        const a = ammoMap[currentId], d = def(currentId);
        const need = (d.mag || 0) - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take;
      }
      // Grenade projectiles: gravity, ground bounce, fuse.
      for (let i = thrown.length - 1; i >= 0; i--) {
        const g = thrown[i];
        g.fuse -= dt;
        g.vel.y -= 14 * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        if (g.mesh.position.y <= 0.09) {
          g.mesh.position.y = 0.09;
          if (!g.landed) { g.landed = true; g.vel.multiplyScalar(0.4); g.vel.y = Math.abs(g.vel.y) * 0.3; }
          else g.vel.set(0, 0, 0);
        }
        if (g.fuse <= 0) {
          const p = g.mesh.position;
          if (g.type === 'frag') {
            if (effects) effects.explosion(p);
            if (audio) audio.explosion();
            const bots = S.bots || [];
            for (let j = 0; j < bots.length; j++) {
              const bot = bots[j];
              if (!bot.alive || bot.side === 'us') continue;
              const dist = bot.pos.distanceTo(p);
              if (dist < 6) bot.takeDamage(Math.round(110 * (1 - dist / 6) + 15), 'body');
            }
          } else {
            // Smoke screen: cluster of fading puffs, blocks sight for ~8s.
            for (let k = 0; k < 6; k++) {
              const puff = new THREE.Mesh(new THREE.SphereGeometry(1.1 + rand() * 0.7, 8, 6), smokeMat.clone());
              puff.position.set(p.x + (rand() * 2 - 1) * 1.6, 0.9 + rand() * 1.2, p.z + (rand() * 2 - 1) * 1.6);
              scene.add(puff);
              smokePuffs.push({ mesh: puff, life: 8 });
            }
          }
          scene.remove(g.mesh);
          g.mesh.geometry.dispose();
          thrown.splice(i, 1);
        }
      }
      for (let i = smokePuffs.length - 1; i >= 0; i--) {
        const s = smokePuffs[i];
        s.life -= dt;
        s.mesh.material.opacity = Math.max(0, Math.min(0.55, s.life * 0.12));
        if (s.life <= 0) {
          scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          s.mesh.material.dispose();
          smokePuffs.splice(i, 1);
        }
      }
    },
  };
  return arsenal;
}
