// Dustline map — desert-industrial, two bomb sites, mid corridor, long sightline.
// Layout (x east, z south; us spawn south z=+30, them spawn north z=-30):
//   Site A warehouse west (-24,-14), Site B yard east (+24,-14), mid x=0.
// Colliders are AABBs {min,max}; navNodes are walkable waypoints for bots.
import * as THREE from 'three';
import { S } from './state.js';

const MAP_W = 96;
const MAP_D = 72;
const WALL_H = 5;

export function buildWorld(scene, textures) {
  const colliders = [];
  const meshes = [];

  const sandMat = new THREE.MeshStandardMaterial({ map: textures.sand, roughness: 1 });
  const concMat = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ map: textures.metal, roughness: 0.6, metalness: 0.55 });
  const woodMat = new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.85 });
  const camoMat = new THREE.MeshStandardMaterial({ map: textures.camo, roughness: 0.9 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.7, metalness: 0.4 });
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x2a8a7a, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.8 });

  function add(mesh, x, y, z, collide) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    if (collide) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      colliders.push({ min: box.min.clone(), max: box.max.clone() });
    }
    return mesh;
  }

  function box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_D), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  meshes.push(ground);

  // Perimeter walls (with a gap-free ring; play area is inside)
  add(box(MAP_W, WALL_H, 1, concMat), 0, WALL_H / 2, -MAP_D / 2, true);
  add(box(MAP_W, WALL_H, 1, concMat), 0, WALL_H / 2, MAP_D / 2, true);
  add(box(1, WALL_H, MAP_D, concMat), -MAP_W / 2, WALL_H / 2, 0, true);
  add(box(1, WALL_H, MAP_D, concMat), MAP_W / 2, WALL_H / 2, 0, true);

  // Long sightline markers: teal trim along the centre lane
  add(box(0.3, 0.3, 40, tealMat), -6, 0.15, 0, false);
  add(box(0.3, 0.3, 40, tealMat), 6, 0.15, 0, false);

  // --- Site A: warehouse (west, x -36..-16, z -24..-4) ---
  // Roof slab on pillars so the interior is playable and shaded.
  add(box(20, 0.6, 20, metalMat), -26, 4.6, -14, false);
  add(box(1, 4.6, 20, concMat), -36, 2.3, -14, true);
  add(box(20, 4.6, 1, concMat), -26, 2.3, -24, true);
  add(box(1, 4.6, 20, concMat), -16, 2.3, -24, true); // north-east corner pillar wall
  add(box(1, 4.6, 6, concMat), -16, 2.3, -7, true); // south wall stub, leaves entry gap
  add(box(1, 4.6, 1, rustMat), -36, 2.3, -4, true);
  add(box(1, 4.6, 1, rustMat), -16, 2.3, -4, true);
  // Warehouse crates (cover inside A)
  add(box(2.4, 2.4, 2.4, crateMat), -30, 1.2, -18, true);
  add(box(2.4, 2.4, 2.4, crateMat), -30, 1.2, -15.4, true);
  add(box(2.4, 2.4, 2.4, crateMat), -27.6, 3.6, -16.7, true);
  add(box(1.8, 1.8, 1.8, woodMat), -21, 0.9, -9, true);
  add(box(1.8, 1.8, 1.8, woodMat), -21, 0.9, -19, true);
  // Site A marker: teal container + "A" beacon pole
  add(box(4, 2.4, 2.2, tealMat), -26, 1.2, -11, true);
  const poleA = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), tealMat);
  add(poleA, -26, 3, -14, false);

  // --- Site B: open yard (east, x 16..36, z -24..-4) ---
  add(box(20, 0.8, 1, concMat), 26, 0.4, -24, true); // low north wall
  add(box(1, 3.2, 20, rustMat), 36, 1.6, -14, true); // rust fence east
  add(box(2.4, 2.4, 2.4, crateMat), 30, 1.2, -19, true);
  add(box(2.4, 2.4, 2.4, crateMat), 22, 1.2, -19, true);
  add(box(2.4, 2.4, 2.4, crateMat), 26, 3.6, -19, true);
  add(box(1.8, 1.8, 1.8, woodMat), 31, 0.9, -9, true);
  add(box(3, 1.2, 1.5, camoMat), 20, 0.6, -10, true); // sandbag / camo barrier
  const poleB = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), tealMat);
  add(poleB, 26, 3, -14, false);

  // --- Mid corridor (x -6..6, z -8..8): crates + barrels, the contested lane ---
  add(box(2.4, 2.4, 2.4, crateMat), -3.5, 1.2, 0, true);
  add(box(2.4, 2.4, 2.4, crateMat), 3.5, 1.2, -4, true);
  add(box(1.8, 1.8, 1.8, crateMat), 3.5, 1.2, 4, true);
  add(box(2, 3, 1, concMat), 0, 1.5, -8, true); // mid wall block
  add(box(2, 3, 1, concMat), 0, 1.5, 8, true);
  // Barrels (cylinders, AABB colliders via box)
  for (const [bx, bz] of [[-9, 2], [-9, -2], [9, 6], [12, -8], [-12, -12], [14, 14]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12), rustMat);
    add(barrel, bx, 0.8, bz, true);
  }

  // --- Connector lanes: scattered cover between spawns and sites ---
  // [w, h, d, material, x, z]
  const cover = [
    [2.4, 2.4, 2.4, crateMat, 10, 8], [2.4, 2.4, 2.4, crateMat, -10, 8],
    [2.4, 2.4, 2.4, crateMat, -10, -8], [2.4, 2.4, 2.4, crateMat, 10, -8],
    [1.8, 1.8, 1.8, woodMat, -20, 16], [1.8, 1.8, 1.8, woodMat, 20, 16],
    [3, 1.2, 1.5, camoMat, -18, 12], [3, 1.2, 1.5, camoMat, 18, 12],
    [2.4, 2.4, 2.4, crateMat, -24, 6], [2.4, 2.4, 2.4, crateMat, 24, 6],
  ];
  for (const [w, h, d, mat, x, z] of cover) add(box(w, h, d, mat), x, h / 2, z, true);

  // Spawn shelters (low walls so spawns are not a shooting gallery)
  add(box(10, 2.2, 1, concMat), 0, 1.1, 24, true);
  add(box(10, 2.2, 1, concMat), 0, 1.1, -24, true);
  // Dark steel gantry over mid for silhouette readability
  add(box(14, 0.5, 1, darkMat), 0, 5.2, 0, false);
  add(box(0.5, 5.2, 1, darkMat), -7, 2.6, 0, false);
  add(box(0.5, 5.2, 1, darkMat), 7, 2.6, 0, false);

  const spawns = {
    us: [
      new THREE.Vector3(-6, 0, 30), new THREE.Vector3(-2, 0, 30),
      new THREE.Vector3(2, 0, 30), new THREE.Vector3(6, 0, 30),
    ],
    them: [
      new THREE.Vector3(-6, 0, -30), new THREE.Vector3(-2, 0, -30),
      new THREE.Vector3(2, 0, -30), new THREE.Vector3(6, 0, -30),
    ],
  };

  const sites = {
    A: { pos: new THREE.Vector3(-26, 0, -14), box: { min: new THREE.Vector3(-34, 0, -22), max: new THREE.Vector3(-18, 3, -6) } },
    B: { pos: new THREE.Vector3(26, 0, -14), box: { min: new THREE.Vector3(18, 0, -22), max: new THREE.Vector3(34, 3, -6) } },
  };

  const navNodes = [
    new THREE.Vector3(0, 0, 28), new THREE.Vector3(0, 0, 16), new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -16), new THREE.Vector3(-12, 0, -10), new THREE.Vector3(12, 0, -10),
    new THREE.Vector3(-26, 0, -8), new THREE.Vector3(26, 0, -8),
    new THREE.Vector3(-26, 0, -14), new THREE.Vector3(26, 0, -14),
    new THREE.Vector3(-10, 0, 8), new THREE.Vector3(10, 0, 8),
    new THREE.Vector3(-10, 0, -8), new THREE.Vector3(10, 0, -8),
    new THREE.Vector3(-20, 0, 16), new THREE.Vector3(20, 0, 16),
    new THREE.Vector3(-20, 0, 0), new THREE.Vector3(20, 0, 0),
    new THREE.Vector3(0, 0, -28), new THREE.Vector3(-6, 0, -28), new THREE.Vector3(6, 0, -28),
  ];

  S.colliders = colliders;
  S.spawns = spawns;
  S.sites = sites;
  S.navNodes = navNodes;

  return { colliders, spawns, sites, navNodes, meshes };
}
