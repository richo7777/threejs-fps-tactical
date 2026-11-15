// game.js — Dustline match: phase machine MENU -> BUY -> ROUND ->
// ROUND_END -> next round / MATCH_END. Economy, bomb plant/defuse,
// win conditions, side swap after round 7.
import { CFG, S } from './state.js';

const WIN_MONEY = 3250, LOSS_MONEY = 1900, KILL_MONEY = 300;
const ROUND_END_PAUSE = 4;

export function createMatch(ctx) {
  const { player, bots, arsenal, hud, audio } = ctx;
  const allies = bots.filter((b) => b.side === 'us');
  const enemies = bots.filter((b) => b.side === 'them');
  // HUD reads health/ammo off S.player / S.arsenal; main.js never sets them.
  S.player = player;
  S.arsenal = arsenal;
  // Bot tick context: game.js drives bot updates (main.js never calls them).
  // effects comes from ctx when the coordinator passes it; bots degrade
  // gracefully (tracers skipped) if it is absent.
  const botCtx = { player, colliders: S.colliders, navNodes: S.navNodes, sites: S.sites, S, effects: ctx.effects || null, audio };

  let phase = 'menu';
  let round = 0;
  let scoreUs = 0, scoreThem = 0;
  let timeLeft = 0;
  let roundEndT = 0;
  let defuseProgress = 0;
  let bombBeepT = 0;
  let started = false;

  function setPhase(p) {
    phase = p;
    S.phase = p;
    S.timeLeft = timeLeft;
  }

  function spawnAll() {
    const spawns = S.spawns || {};
    const usSpawns = spawns.us || [];
    const themSpawns = spawns.them || [];
    if (usSpawns.length) player.respawn(usSpawns[0]);
    allies.forEach((b, i) => { if (usSpawns.length) b.respawn(usSpawns[(i + 1) % usSpawns.length]); });
    enemies.forEach((b, i) => { if (themSpawns.length) b.respawn(themSpawns[i % themSpawns.length]); });
  }

  function ensureCarrier() {
    if (enemies.some((b) => b.alive && b.role === 'carrier')) return;
    const alive = enemies.filter((b) => b.alive);
    if (alive.length) alive[0].role = 'carrier';
  }

  const match = {
    state: S,

    get phase() { return phase; },
    get round() { return round; },
    get timeLeft() { return timeLeft; },

    startBuy() {
      round++;
      S.round = round;
      // Sides swap after round 7: swap spawn sets.
      if (round === 8 && S.spawns && S.spawns.us && S.spawns.them) {
        const t = S.spawns.us; S.spawns.us = S.spawns.them; S.spawns.them = t;
      }
      spawnAll();
      ensureCarrier();
      if (arsenal.reset) arsenal.reset();
      S.bomb = { state: 'carried', site: null, plantedAt: 0 };
      defuseProgress = 0;
      timeLeft = CFG.buyTime || 15;
      setPhase('buy');
      if (hud) { hud.showBuy(S); hud.setBombStatus(''); }
      if (audio) audio.beep();
    },

    startRound() {
      timeLeft = CFG.roundTime || 100;
      setPhase('round');
      // hud has no hideBuy(); the buy overlay must not linger into the round.
      const buyEl = document.getElementById('buy-overlay');
      if (buyEl) buyEl.style.display = 'none';
      if (hud) hud.update(S);
    },

    endRound(winner, reason) {
      if (phase !== 'round' && phase !== 'buy') return;
      if (winner === 'us') { scoreUs++; S.money += WIN_MONEY; }
      else { scoreThem++; S.money += LOSS_MONEY; }
      S.scoreUs = scoreUs; S.scoreThem = scoreThem;
      timeLeft = 0;
      roundEndT = ROUND_END_PAUSE;
      setPhase('roundEnd');
      const titles = {
        elim: winner === 'us' ? 'ROUND WON' : 'ROUND LOST',
        detonation: 'ROUND LOST',
        defuse: 'ROUND WON',
        time: 'ROUND LOST',
        plant: 'ROUND LOST',
      };
      const subs = {
        elim: winner === 'us' ? 'Enemy team eliminated' : 'Your team was eliminated',
        detonation: 'The bomb detonated',
        defuse: 'Bomb defused',
        time: 'Time expired — bomb not planted',
        plant: 'Bomb site lost',
      };
      if (hud) hud.showRoundEnd(titles[reason] || (winner === 'us' ? 'ROUND WON' : 'ROUND LOST'), subs[reason] || '');
      if (audio) { if (winner === 'us') audio.roundWin(); else audio.roundLose(); }
    },

    plantBomb(bot, site) {
      if (phase !== 'round' || !S.bomb || S.bomb.state !== 'carried') return;
      S.bomb = { state: 'planted', site, plantedAt: (CFG.roundTime || 100) - timeLeft };
      if (hud) hud.setBombStatus('BOMB PLANTED — ' + site);
      if (audio) audio.plant();
    },

    // Called every frame while KeyE is held (main.js wires the key).
    // Advances only when the player is within 2.5m of the planted site.
    defuseTick(dt) {
      if (phase !== 'round' || !S.bomb || S.bomb.state !== 'planted') return;
      const site = S.sites && S.sites[S.bomb.site];
      if (!site) return;
      if (player.alive && player.pos.distanceTo(site.pos) < 2.5) {
        defuseProgress += dt;
        if (hud) hud.setBombStatus('DEFUSING ' + Math.ceil(((CFG.defuseTime || 5) - defuseProgress)) + 's');
        if (defuseProgress >= (CFG.defuseTime || 5)) {
          S.bomb.state = 'defused';
          if (audio) audio.defuse();
          match.endRound('us', 'defuse');
        }
      } else {
        defuseProgress = Math.max(0, defuseProgress - dt * 2);
      }
    },

    // main.js calls this once when the player clicks Play.
    startMatch() {
      if (started) return;
      started = true;
      scoreUs = 0; scoreThem = 0;
      S.scoreUs = 0; S.scoreThem = 0;
      S.money = 800;
      S.kills = 0; S.deaths = 0;
      round = 0;
      match.startBuy();
    },

    update(dt) {
      S.timeLeft = timeLeft;
      // Killfeed + economy from arsenal hits (arsenal has no hud handle).
      if (arsenal.lastKill) {
        const k = arsenal.lastKill;
        arsenal.lastKill = null;
        S.kills = (S.kills || 0) + 1;
        S.money += KILL_MONEY;
        if (hud) hud.killfeed((k.headshot ? 'You  [HEADSHOT]  ' : 'You  ') + 'enemy bot');
      }
      if (arsenal.lastHit && hud) {
        hud.hitmarker(arsenal.lastHit.kill);
        arsenal.lastHit = null;
      }
      // Carrier finished planting: game owns the bomb state.
      for (const b of enemies) {
        if (b.alive && b.planted && S.bomb && S.bomb.state === 'carried') {
          match.plantBomb(b, b.plantSite || 'A');
          b.planted = false;
        }
      }
      ensureCarrier();

      if (phase === 'buy') {
        timeLeft -= dt;
        if (timeLeft <= 0) match.startRound();
      } else if (phase === 'round') {
        timeLeft -= dt;
        // Bots only move/fight during the live round.
        for (const b of bots) b.update(dt, botCtx);
        // Defuse: hold E near the planted site (main.js never wires the key).
        if (S.bomb && S.bomb.state === 'planted' && player.input && player.input.down('KeyE')) {
          match.defuseTick(dt);
        }
        // Bomb fuse.
        if (S.bomb && S.bomb.state === 'planted') {
          const fuseLeft = (CFG.fuseTime || 40) - ((CFG.roundTime || 100) - timeLeft - S.bomb.plantedAt);
          bombBeepT -= dt;
          if (bombBeepT <= 0) { bombBeepT = fuseLeft < 10 ? 0.5 : 1; if (audio) audio.beep(); }
          if (fuseLeft <= 0) {
            const site = S.sites && S.sites[S.bomb.site];
            if (site && ctx.effects) ctx.effects.explosion(site.pos);
            if (audio) audio.explosion();
            if (site && player.alive) {
              const d = player.pos.distanceTo(site.pos);
              if (d < 9) player.takeDamage(Math.round(120 * (1 - d / 9)), 'body');
            }
            S.bomb.state = 'detonated';
            match.endRound('them', 'detonation');
            return;
          }
          if (hud) hud.setBombStatus('BOMB PLANTED — ' + S.bomb.site + '  ' + Math.ceil(fuseLeft) + 's');
        }
        // Win conditions.
        const usAlive = allies.filter((b) => b.alive).length + (player.alive ? 1 : 0);
        const themAlive = enemies.filter((b) => b.alive).length;
        if (themAlive === 0) { match.endRound('us', 'elim'); return; }
        if (usAlive === 0) { match.endRound('them', 'elim'); return; }
        if (timeLeft <= 0) {
          match.endRound('them', 'time');
          return;
        }
      } else if (phase === 'roundEnd') {
        roundEndT -= dt;
        if (roundEndT <= 0) {
          const winRounds = CFG.winRounds || 8;
          const maxRounds = CFG.maxRounds || 15;
          if (scoreUs >= winRounds || scoreThem >= winRounds || round >= maxRounds) {
            setPhase('matchEnd');
            S.phase = 'matchEnd';
            const won = scoreUs > scoreThem;
            if (hud) hud.showMatchEnd(won ? 'VICTORY  ' + scoreUs + ' — ' + scoreThem : 'DEFEAT  ' + scoreUs + ' — ' + scoreThem);
            if (audio) { if (won) audio.roundWin(); else audio.roundLose(); }
          } else {
            match.startBuy();
          }
        }
      }
      if (hud) hud.update(S);
    },
  };

  // Keep S in sync for HUD/menus before the match starts.
  S.phase = phase; S.round = round; S.scoreUs = 0; S.scoreThem = 0;
  S.money = 800; S.timeLeft = 0;
  if (!S.bomb) S.bomb = { state: 'carried', site: null, plantedAt: 0 };
  return match;
}
