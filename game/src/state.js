// Dustline — single mutable state store. One job: config + shared state.
// All other modules read/write S; nothing else holds match-level state.
export const CFG = {
  roundTime: 100,
  buyTime: 15,
  winRounds: 8,
  maxRounds: 15,
  fuseTime: 40,
  plantTime: 4,
  defuseTime: 5,
  gravity: 22,
  playerSpeed: 5.2,
  playerCrouchSpeed: 2.6,
  playerHeight: 1.7,
  playerEye: 1.62,
};

// Weapons: damage is body damage; headMul applies on head hits.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9', damage: 34, headMul: 4, rpm: 320,
    mag: 12, reserve: 36, reloadMs: 1400, spreadBase: 0.008,
    spreadMove: 0.02, recoil: 0.012, price: 300, auto: false,
  },
  smg: {
    id: 'smg', name: 'VK-9', damage: 26, headMul: 4, rpm: 750,
    mag: 30, reserve: 90, reloadMs: 2100, spreadBase: 0.014,
    spreadMove: 0.03, recoil: 0.009, price: 1500, auto: true,
  },
  rifle: {
    id: 'rifle', name: 'AR-77', damage: 33, headMul: 4, rpm: 600,
    mag: 30, reserve: 90, reloadMs: 2500, spreadBase: 0.01,
    spreadMove: 0.028, recoil: 0.016, price: 2700, auto: true,
  },
  sniper: {
    id: 'sniper', name: 'LW-50', damage: 95, headMul: 4, rpm: 48,
    mag: 5, reserve: 15, reloadMs: 3200, spreadBase: 0.002,
    spreadMove: 0.05, recoil: 0.05, price: 4750, auto: false,
  },
};

export const S = {
  phase: 'menu', // menu | buy | round | roundEnd | matchEnd
  round: 1,
  scoreUs: 0,
  scoreThem: 0,
  money: 800,
  kills: 0,
  deaths: 0,
  bomb: { state: 'carried', site: null, plantedAt: 0 },
  bots: [],
  colliders: [],
  spawns: { us: [], them: [] },
  sites: {},
  navNodes: [],
  shotMode: null, // null | 'start' | 'play' | 'end'
  seed: 1,
  scene: null,
  camera: null,
  renderer: null,
  roundTimeLeft: CFG.roundTime,
  buyTimeLeft: CFG.buyTime,
  swapped: false,
};
