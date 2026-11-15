// hud.js — Dustline HUD: health/armor/ammo/money/timer/score, kill feed,
// hitmarker, spreading crosshair, 2D top-down minimap, bomb status, overlays.
// Reads the single state store S; never touches the 3D scene.
import { WEAPONS } from './state.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'armor', 'frag', 'smoke'];
const BUY_LABEL = {
  pistol: 'P9 Pistol',
  smg: 'VK-9 SMG',
  rifle: 'AR-77 Rifle',
  sniper: 'LW-50 Sniper',
  armor: 'Kevlar Armor',
  frag: 'Frag Grenade',
  smoke: 'Smoke Grenade',
};
const BUY_PRICE = { pistol: 300, smg: 1500, rifle: 2700, sniper: 4750, armor: 650, frag: 300, smoke: 300 };

export function createHud() {
  const el = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    health: $('health'),
    healthNum: $('health-num'),
    armor: $('armor'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    money: $('money'),
    timer: $('timer'),
    scoreUs: $('score-us'),
    scoreThem: $('score-them'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    minimap: $('minimap'),
    bombStatus: $('bomb-status'),
    menu: $('menu-overlay'),
    buy: $('buy-overlay'),
    buyList: $('buy-list'),
    round: $('round-overlay'),
    roundTitle: $('round-title'),
    roundSub: $('round-sub'),
    match: $('match-overlay'),
    matchTitle: $('match-title'),
    vignette: $('damage-vignette'),
    reloadHint: $('reload-hint'),
  };
  const ctx = el.minimap ? el.minimap.getContext('2d') : null;
  const crossLines = el.crosshair ? Array.from(el.crosshair.querySelectorAll('i')) : [];
  let lastHealth = 100;
  let vignette = 0;
  let spreadPx = 6;
  let bounds = null; // cached world bounds for the minimap {minX,maxX,minZ,maxZ}
  let feedCount = 0;

  function hideAll() {
    for (const k of ['menu', 'buy', 'round', 'match']) {
      if (el[k]) el[k].style.display = 'none';
    }
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function computeBounds(S) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const take = (x, z) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    };
    for (const c of S.colliders || []) {
      take(c.min.x, c.min.z);
      take(c.max.x, c.max.z);
    }
    for (const side of ['us', 'them']) {
      for (const p of (S.spawns && S.spawns[side]) || []) take(p.x, p.z);
    }
    for (const site of Object.values(S.sites || {})) {
      if (site.pos) take(site.pos.x, site.pos.z);
      if (site.box) { take(site.box.min.x, site.box.min.z); take(site.box.max.x, site.box.max.z); }
    }
    if (!Number.isFinite(minX)) { minX = -40; maxX = 40; minZ = -40; maxZ = 40; }
    const pad = 4;
    bounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }

  function drawMinimap(S) {
    if (!ctx || !el.minimap) return;
    const w = el.minimap.width, h = el.minimap.height;
    if (!bounds) computeBounds(S);
    const b = bounds;
    const sx = (x) => ((x - b.minX) / (b.maxX - b.minX)) * w;
    const sz = (z) => ((z - b.minZ) / (b.maxZ - b.minZ)) * h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a140d';
    ctx.fillRect(0, 0, w, h);
    // walls / colliders
    ctx.fillStyle = '#5a4632';
    for (const c of S.colliders || []) {
      const x = sx(c.min.x), z = sz(c.min.z);
      ctx.fillRect(x, z, Math.max(1, sx(c.max.x) - x), Math.max(1, sz(c.max.z) - z));
    }
    // bomb sites
    for (const [name, site] of Object.entries(S.sites || {})) {
      const p = site.pos || (site.box && { x: (site.box.min.x + site.box.max.x) / 2, z: (site.box.min.z + site.box.max.z) / 2 });
      if (!p) continue;
      ctx.fillStyle = '#2a8a7a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, sx(p.x), sz(p.z) - 5);
      ctx.strokeStyle = '#2a8a7a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx(p.x) - 7, sz(p.z) - 7, 14, 14);
    }
    // bots as dots
    for (const bot of S.bots || []) {
      if (!bot.alive) continue;
      ctx.fillStyle = bot.side === 'us' ? '#3ec6b2' : '#e05a3a';
      ctx.beginPath();
      ctx.arc(sx(bot.pos.x), sz(bot.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // player as a white dot with direction tick
    const p = S.player;
    if (p && p.alive !== false) {
      const px = sx(p.pos.x), pz = sz(p.pos.z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px - Math.sin(p.yaw || 0) * 8, pz - Math.cos(p.yaw || 0) * 8);
      ctx.stroke();
    }
    // bomb marker
    if (S.bomb && S.bomb.state === 'planted' && S.bomb.site && S.sites && S.sites[S.bomb.site]) {
      const site = S.sites[S.bomb.site];
      const bp = site.pos;
      if (bp) {
        ctx.fillStyle = '#ffcf3d';
        ctx.beginPath();
        ctx.arc(sx(bp.x), sz(bp.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function update(S) {
    const p = S.player || {};
    const health = p.health ?? S.health ?? 100;
    const armor = p.armor ?? S.armor ?? 0;
    const ammo = (S.arsenal && S.arsenal.ammo) || S.ammo || { mag: 0, reserve: 0 };
    if (el.healthNum) el.healthNum.textContent = String(Math.max(0, Math.ceil(health)));
    if (el.health) el.health.style.width = `${clamp(health, 0, 100)}%`;
    if (el.armorNum) el.armorNum.textContent = String(Math.max(0, Math.ceil(armor)));
    if (el.armor) el.armor.style.width = `${clamp(armor, 0, 100)}%`;
    if (el.ammoMag) el.ammoMag.textContent = String(ammo.mag ?? 0);
    if (el.ammoReserve) el.ammoReserve.textContent = String(ammo.reserve ?? 0);
    if (el.money) el.money.textContent = `$${S.money ?? 0}`;
    if (el.timer) el.timer.textContent = fmtTime(S.timeLeft ?? S.roundTimeLeft ?? 0);
    if (el.scoreUs) el.scoreUs.textContent = String(S.scoreUs ?? 0);
    if (el.scoreThem) el.scoreThem.textContent = String(S.scoreThem ?? 0);
    if (el.roundNum) el.roundNum.textContent = `ROUND ${S.round ?? 1}`;
    if (el.reloadHint) {
      const reloading = S.arsenal && S.arsenal.reloading;
      el.reloadHint.style.display = reloading ? 'block' : 'none';
      if (reloading) el.reloadHint.textContent = 'RELOADING…';
    }
    // damage flash when health drops
    if (health < lastHealth && el.vignette) vignette = 1;
    lastHealth = health;
    if (el.vignette) {
      vignette = Math.max(0, vignette - 0.03);
      el.vignette.style.opacity = String(vignette * 0.85);
    }
    drawMinimap(S);
  }

  function killfeed(text) {
    if (!el.killfeed) return;
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.textContent = text;
    el.killfeed.prepend(row);
    feedCount++;
    while (feedCount > 5 && el.killfeed.lastChild) {
      el.killfeed.removeChild(el.killfeed.lastChild);
      feedCount--;
    }
    setTimeout(() => {
      if (row.parentNode) {
        row.parentNode.removeChild(row);
        feedCount = Math.max(0, feedCount - 1);
      }
    }, 6000);
  }

  function hitmarker(kill) {
    if (!el.hitmarker) return;
    el.hitmarker.classList.remove('show', 'kill');
    void el.hitmarker.offsetWidth; // restart the CSS animation
    el.hitmarker.classList.add('show');
    if (kill) el.hitmarker.classList.add('kill');
    setTimeout(() => el.hitmarker.classList.remove('show', 'kill'), 180);
  }

  function setSpread(px) {
    spreadPx = clamp(px, 2, 42);
    if (!el.crosshair || crossLines.length < 4) return;
    const g = spreadPx;
    // 4 <i> lines: top, right, bottom, left — positioned by CSS transform origin
    crossLines[0].style.transform = `translate(-50%, 0) translateY(${-g - 8}px)`;
    crossLines[1].style.transform = `translate(0, -50%) translateX(${g + 8}px)`;
    crossLines[2].style.transform = `translate(-50%, 0) translateY(${g}px)`;
    crossLines[3].style.transform = `translate(0, -50%) translateX(${-g - 8}px)`;
  }

  function showMenu() {
    hideAll();
    if (el.menu) el.menu.style.display = 'flex';
    if (el.hud) el.hud.style.display = 'none';
  }

  function showBuy(S) {
    hideAll();
    if (el.hud) el.hud.style.display = 'block';
    if (el.buy) el.buy.style.display = 'flex';
    if (!el.buyList) return;
    el.buyList.innerHTML = '';
    const money = S.money ?? 0;
    const owned = (S.arsenal && S.arsenal.owned) || [];
    BUY_ORDER.forEach((id, i) => {
      const price = BUY_PRICE[id];
      const w = WEAPONS[id];
      const item = document.createElement('div');
      item.className = 'buy-item';
      item.dataset.id = id;
      const name = BUY_LABEL[id];
      const detail = w ? `${w.damage} dmg · ${w.mag} rnd` : (id === 'armor' ? '+50 armor' : 'utility');
      const have = owned.includes(id);
      item.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${name}</span>` +
        `<span class="buy-detail">${detail}</span><span class="buy-price">$${price}</span>`;
      if (have) item.classList.add('owned');
      if (price > money && !have) item.classList.add('cant-afford');
      item.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('dustline-buy', { detail: { id } }));
      });
      el.buyList.appendChild(item);
    });
  }

  function showRoundEnd(title, sub) {
    hideAll();
    if (el.hud) el.hud.style.display = 'block';
    if (el.round) el.round.style.display = 'flex';
    if (el.roundTitle) el.roundTitle.textContent = title;
    if (el.roundSub) el.roundSub.textContent = sub || '';
  }

  function showMatchEnd(title) {
    hideAll();
    if (el.hud) el.hud.style.display = 'block';
    if (el.match) el.match.style.display = 'flex';
    if (el.matchTitle) el.matchTitle.textContent = title;
  }

  function setBombStatus(text) {
    if (el.bombStatus) el.bombStatus.textContent = text || '';
  }

  setSpread(6);
  return { update, killfeed, hitmarker, setSpread, showMenu, showBuy, showRoundEnd, showMatchEnd, setBombStatus };
}
