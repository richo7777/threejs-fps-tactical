// Dustline — bootstrap. Renderer/scene/lights, module wiring, fixed-step loop,
// pointer lock, and deterministic shot mode (?shot=start|play|end&seed=N).
import * as THREE from 'three';
import { S, CFG } from './state.js';
import { seedRand } from './rng.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './world.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') || '1', 10) || 1;
if (shot === 'start' || shot === 'play' || shot === 'end') {
  S.shotMode = shot;
  S.seed = seed;
  seedRand(seed);
}

// --- Renderer (WebGL2 via three 0.187) ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

// --- Scene / camera / lights ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9b57e);
scene.fog = new THREE.FogExp2(0xd9b57e, 0.0075);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
S.scene = scene;
S.camera = camera;
S.renderer = renderer;

const hemi = new THREE.HemisphereLight(0xffe0b0, 0x8a6a45, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.4);
sun.position.set(30, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
scene.add(sun);

// --- World + systems ---
const textures = makeTextures();
buildWorld(scene, textures);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput();
const player = createPlayer(scene, camera, input);
const botCtx = { player, colliders: S.colliders, navNodes: S.navNodes, sites: S.sites, S, effects, audio };
const allies = createBots(scene, 'us', 3, botCtx);
const enemies = createBots(scene, 'them', 4, botCtx);
S.bots = [...allies, ...enemies];
const arsenal = createArsenal(player, scene, effects, audio);
const match = createMatch({ player, bots: S.bots, arsenal, hud, audio, effects, S });

// Player starts at the US spawn, facing Site A.
const spawn0 = S.spawns.us[0];
player.respawn(spawn0);
player.yaw = Math.atan2(26, 44);
player.pitch = 0;

const menuOverlay = document.getElementById('menu-overlay');
const hudEl = document.getElementById('hud');
const playBtn = document.getElementById('play-btn');

function lockPointer() {
  renderer.domElement.requestPointerLock();
}

playBtn.addEventListener('click', () => {
  audio.unlock();
  lockPointer();
  menuOverlay.classList.remove('on');
  hudEl.classList.add('on');
  if (S.phase === 'menu') match.startBuy();
});

// Re-lock on canvas click while a round is live (pointer lock can drop).
renderer.domElement.addEventListener('click', () => {
  if ((S.phase === 'buy' || S.phase === 'round') && document.pointerLockElement !== renderer.domElement) {
    lockPointer();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shot mode: deterministic scenes, no pointer lock, no gesture ---
function setupShot() {
  hudEl.classList.add('on');
  if (S.shotMode === 'start') {
    // Menu overlay + camera at US spawn looking toward Site A.
    menuOverlay.classList.add('on');
    hudEl.classList.remove('on');
    player.respawn(spawn0);
    player.yaw = Math.atan2(26, 44);
    player.pitch = 0;
    camera.position.set(spawn0.x, CFG.playerEye, spawn0.z);
    camera.lookAt(S.sites.A.pos.x, 1.5, S.sites.A.pos.z);
  } else if (S.shotMode === 'play') {
    // Mid-round, player alive, 2 enemy bots visible ahead in view.
    menuOverlay.classList.remove('on');
    match.startBuy();
    match.startRound();
    player.respawn(new THREE.Vector3(0, 0, 16));
    player.yaw = 0;
    player.pitch = 0;
    player.health = 100;
    player.alive = true;
    const foes = enemies.slice(0, 2);
    foes[0].pos.set(-2.5, 0, 4);
    foes[1].pos.set(-5.5, 0, 2);
    for (const foe of foes) {
      foe.health = 100;
      foe.alive = true;
      if (foe.mesh) foe.mesh.position.copy(foe.pos);
    }
    camera.position.set(0, CFG.playerEye, 16);
    camera.lookAt(0, 1.4, -10);
  } else if (S.shotMode === 'end') {
    // Round-end overlay "ROUND WON" with the score visible.
    menuOverlay.classList.remove('on');
    S.scoreUs = 1;
    S.scoreThem = 0;
    S.round = 1;
    S.phase = 'roundEnd';
    player.respawn(spawn0);
    player.yaw = Math.atan2(26, 44);
    player.pitch = 0;
    camera.position.set(spawn0.x, CFG.playerEye, spawn0.z);
    camera.lookAt(S.sites.A.pos.x, 1.5, S.sites.A.pos.z);
    hud.update(S);
    hud.showRoundEnd('ROUND WON', 'Site A secured — Dustline holds. Score 1 — 0.');
  }
  // Render once immediately so the first frame exists even before rAF settles.
  renderer.render(scene, camera);
}

if (S.shotMode) setupShot();

// --- Fixed-step sim (60 Hz) decoupled from rendering ---
let last = performance.now();
let acc = 0;
let shotReady = false;

function step(dt) {
  // In shot mode the scene is staged deterministically; the sim stays frozen
  // so staged bots never wander out of frame before the screenshot lands.
  if (!S.shotMode) {
    if (S.phase === 'buy' || S.phase === 'round' || S.phase === 'roundEnd') {
      match.update(dt);
      if (S.phase === 'buy' || S.phase === 'round') {
        player.update(dt);
        arsenal.update(dt);
      }
    }
  }
  effects.update(dt);
  hud.update(S);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  if (n === 5) acc = 0; // drop backlog rather than spiral after a hitch
  renderer.render(scene, camera);
  if (S.shotMode && !shotReady) {
    shotReady = true;
    window.__shotReady = true;
  }
}

requestAnimationFrame(frame);
