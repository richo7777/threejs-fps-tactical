// bots.js — Dustline bots: capsule body + head sphere + gun box,
// waypoint patrol, hold, hunt (seen/heard), take cover when hurt,
// plant behavior for the carrier. Reaction time + accuracy scale with
// distance and target movement.
import * as THREE from 'three';
import { CFG, S } from './state.js';
import { rand } from './rng.js';

const BOT_SPEED = 3.3, BOT_RADIUS = 0.35;
const SEE_DIST = 30, FOV_DOT = 0.15, HEAR_DIST = 26;
const COLORS = { us: 0x2a8a7a, them: 0x8a4a2a };

// Line-of-sight: sample the segment; blocked if a sample sits inside a collider.
function losBlocked(a, b, colliders) {
  for (let s = 0; s <= 8; s++) {
    const t = s / 8;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return true;
    }
  }
  return false;
}

function makeBotMesh(side) {
  const color = COLORS[side] || 0x888888;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x232628, roughness: 0.7, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 4, 10), bodyMat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8b58a, roughness: 0.7 }));
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helmet.position.y = 1.65;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), darkMat);
  gun.position.set(0.22, 1.25, 0.35);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 }));
  visor.position.set(0, 1.62, 0.2);
  g.add(body, head, helmet, gun, visor);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createBots(scene, side, count, ctx) {
  const bots = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const facingV = new THREE.Vector3();
  const gunTipV = new THREE.Vector3();
  const aimV = new THREE.Vector3();

  for (let n = 0; n < count; n++) {
    const mesh = makeBotMesh(side);
    scene.add(mesh);
    const role = side === 'them'
      ? (n === 0 ? 'carrier' : n === 1 ? 'rusher' : n === 2 ? 'holder' : 'support')
      : (n === 0 ? 'holder' : n === 1 ? 'support' : 'rusher');
    const bot = {
      pos: new THREE.Vector3(),
      health: 100, alive: true, side, role, mesh,
      state: 'patrol',
      yaw: 0,
      wpIndex: n,
      target: null,           // current enemy (bot or the string 'player')
      lastKnown: new THREE.Vector3(),
      reactionT: 0, fireT: 0, stateT: 0,
      plantProgress: 0, plantSite: null, planted: false,
      reaction: 0.35 + rand() * 0.35, // per-bot reaction time
      accuracy: 0.5 + rand() * 0.15,
      speed: BOT_SPEED * (0.9 + rand() * 0.2),

      respawn(spawnPos) {
        bot.pos.copy(spawnPos);
        bot.health = 100;
        bot.alive = true;
        bot.mesh.visible = true;
        bot.state = role === 'holder' ? 'hold' : 'patrol';
        bot.stateT = 0;
        bot.target = null;
        bot.plantProgress = 0;
        bot.planted = false;
        bot.plantSite = null;
        bot.yaw = rand() * Math.PI * 2;
        bot.wpIndex = Math.floor(rand() * Math.max(1, ctx.navNodes.length));
      },

      takeDamage(amount, part) {
        if (!bot.alive) return false;
        bot.health -= amount;
        if (bot.health <= 0) {
          bot.health = 0;
          bot.alive = false;
          bot.mesh.visible = false;
          return true;
        }
        // Hurt: sometimes break off to cover, away from the shooter.
        if (bot.health < 55 && rand() < 0.45 && bot.state !== 'cover') {
          bot.state = 'cover';
          bot.stateT = 2.5;
        }
        return false;
      },

      update(dt, c) {
        if (!bot.alive) return;
        const player = c.player;
        const colliders = c.colliders || [];
        const nodes = c.navNodes || [];
        bot.stateT -= dt;

        // --- pick target: nearest visible enemy (player or opposing bot) ---
        let seen = null, seenDist = Infinity;
        const foes = [];
        if (side === 'them' && player.alive) foes.push({ ref: 'player', pos: player.pos, speed: player.speed || 0, crouched: !!player.crouched });
        for (const o of c.S.bots || []) {
          if (o.alive && o.side !== side) foes.push({ ref: o, pos: o.pos, speed: 3, crouched: false });
        }
        tmpA.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
        for (const f of foes) {
          const d = bot.pos.distanceTo(f.pos);
          if (d > SEE_DIST || d >= seenDist) continue;
          tmpB.set(f.pos.x, f.pos.y + 1.3, f.pos.z);
          if (losBlocked(tmpA, tmpB, colliders)) continue;
          // Rough frontal cone, unless very close.
          tmpC.copy(f.pos).sub(bot.pos).normalize();
          facingV.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
          if (d > 4 && tmpC.dot(facingV) < FOV_DOT) continue;
          seen = f; seenDist = d;
        }
        // Hearing: recent shot nearby pulls bots toward it.
        if (!seen && c.S.lastShotAt && (performance.now() / 1000 - c.S.lastShotAt) < 3 && c.S.lastShotPos) {
          const d = bot.pos.distanceTo(c.S.lastShotPos);
          if (d < HEAR_DIST) {
            bot.lastKnown.copy(c.S.lastShotPos);
            if (bot.state !== 'hunt' && bot.state !== 'plant') { bot.state = 'hunt'; bot.stateT = 4; }
          }
        }
        if (seen) {
          bot.lastKnown.copy(seen.pos);
          if (bot.target !== seen.ref) { bot.target = seen.ref; bot.reactionT = bot.reaction; }
          if (bot.state !== 'plant') bot.state = 'hunt';
        } else if (bot.state === 'hunt' && bot.stateT <= 0) {
          bot.target = null;
          bot.state = bot.role === 'holder' ? 'hold' : 'patrol';
        }

        // --- carrier: push a site and plant ---
        if (side === 'them' && bot.role === 'carrier' && !bot.planted && c.S.bomb && c.S.bomb.state === 'carried' && c.S.phase === 'round') {
          if (!bot.plantSite) bot.plantSite = rand() < 0.5 ? 'A' : 'B';
          const site = c.sites[bot.plantSite];
          if (site) {
            const dSite = bot.pos.distanceTo(site.pos);
            if (dSite < 2.2 && !seen) {
              bot.state = 'plant';
              bot.plantProgress += dt;
              if (bot.plantProgress >= (CFG.plantTime || 4)) { bot.planted = true; bot.plantProgress = 0; }
            } else if (bot.state !== 'hunt') {
              bot.state = 'push';
              bot.lastKnown.copy(site.pos);
            }
          }
        }

        // --- movement ---
        let moveX = 0, moveZ = 0, moving = false;
        const dest = tmpB; // reuse temp
        if (bot.state === 'patrol' || bot.state === 'push' || bot.state === 'hunt' || bot.state === 'cover') {
          if (bot.state === 'patrol') {
            if (nodes.length) {
              dest.copy(nodes[bot.wpIndex % nodes.length]);
              if (bot.pos.distanceTo(dest) < 1.2) bot.wpIndex = (bot.wpIndex + 1 + Math.floor(rand() * 2)) % nodes.length;
            } else dest.copy(bot.pos);
          } else if (bot.state === 'cover') {
            // Flee: nearest nav node away from the attacker / last known.
            let best = null, bestD = -1;
            for (const nd of nodes) {
              const away = nd.distanceTo(bot.lastKnown);
              if (away > bestD) { bestD = away; best = nd; }
            }
            if (best) dest.copy(best); else dest.copy(bot.pos);
            if (bot.stateT <= 0) bot.state = 'patrol';
          } else {
            dest.copy(bot.lastKnown);
          }
          const dx = dest.x - bot.pos.x, dz = dest.z - bot.pos.z;
          const dl = Math.hypot(dx, dz);
          if (dl > 0.6) {
            moveX = (dx / dl) * bot.speed * dt;
            moveZ = (dz / dl) * bot.speed * dt;
            bot.yaw = Math.atan2(dx, dz);
            moving = true;
          }
        } else if (bot.state === 'hold' || bot.state === 'plant') {
          if (seen) bot.yaw = Math.atan2(seen.pos.x - bot.pos.x, seen.pos.z - bot.pos.z);
        }

        if (moving) {
          // Axis-separated slide vs colliders.
          bot.pos.x += moveX;
          for (const col of colliders) {
            if (bot.pos.x + BOT_RADIUS > col.min.x && bot.pos.x - BOT_RADIUS < col.max.x &&
                bot.pos.y + 1.7 > col.min.y && bot.pos.y < col.max.y &&
                bot.pos.z + BOT_RADIUS > col.min.z && bot.pos.z - BOT_RADIUS < col.max.z) {
              bot.pos.x -= moveX; break;
            }
          }
          bot.pos.z += moveZ;
          for (const col of colliders) {
            if (bot.pos.x + BOT_RADIUS > col.min.x && bot.pos.x - BOT_RADIUS < col.max.x &&
                bot.pos.y + 1.7 > col.min.y && bot.pos.y < col.max.y &&
                bot.pos.z + BOT_RADIUS > col.min.z && bot.pos.z - BOT_RADIUS < col.max.z) {
              bot.pos.z -= moveZ; break;
            }
          }
          if (bot.pos.x < -30) bot.pos.x = -30; if (bot.pos.x > 30) bot.pos.x = 30;
          if (bot.pos.z < -22) bot.pos.z = -22; if (bot.pos.z > 22) bot.pos.z = 22;
        }

        // --- shooting ---
        if (seen && bot.state !== 'plant') {
          bot.reactionT -= dt;
          bot.fireT -= dt;
          if (bot.reactionT <= 0 && bot.fireT <= 0) {
            bot.fireT = 0.14 + rand() * 0.06;
            const dist = seenDist;
            const movePen = (seen.speed || 0) * 0.03;
            const crouchPen = seen.crouched ? 0.1 : 0;
            let chance = bot.accuracy - dist * 0.011 - movePen - crouchPen;
            chance = Math.max(0.06, Math.min(0.72, chance));
            tmpC.set(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
            gunTipV.copy(tmpC).add(facingV.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw)).multiplyScalar(0.5));
            aimV.set(seen.pos.x, seen.pos.y + 1.25, seen.pos.z);
            if (c.effects) c.effects.tracer(gunTipV, aimV);
            if (rand() < chance) {
              const head = rand() < 0.1;
              const dmg = (head ? 30 : 11) + rand() * 5;
              if (seen.ref === 'player') {
                const died = player.takeDamage(dmg, head ? 'head' : 'body');
                if (died && c.S) c.S.deaths = (c.S.deaths || 0) + 1;
              } else if (seen.ref && seen.ref.takeDamage) {
                seen.ref.takeDamage(dmg, head ? 'head' : 'body');
              }
            }
            if (c.audio && dist < 28) c.audio.shot('rifle');
          }
        }

        mesh.position.copy(bot.pos);
        mesh.rotation.y = bot.yaw;
      },
    };
    bots.push(bot);
  }
  return bots;
}
