// Dustline — procedural canvas textures only. No external assets.
import * as THREE from 'three';
import { rand } from './rng.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function speckle(ctx, size, colors, n, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = 0.12 + rand() * 0.25;
    const r = rMin + rand() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function toTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sandTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#c8a06a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, ['#b8935a', '#d9b57e', '#a8874f', '#e0c08a'], 900, 1, 4);
  // wind ripples
  ctx.strokeStyle = 'rgba(140,110,70,0.25)';
  ctx.lineWidth = 2;
  for (let y = 8; y < 256; y += 22) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
    ctx.stroke();
  }
  return toTexture(c, 12);
}

function concreteTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8d8578';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, ['#7a7264', '#9d968a', '#6e675c'], 700, 1, 3);
  ctx.strokeStyle = 'rgba(60,55,45,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();
  // rust stains
  speckle(ctx, 256, ['#8a4a2a', '#6e3a20'], 60, 3, 10);
  return toTexture(c, 4);
}

function metalTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, 256, 4);
  }
  speckle(ctx, 256, ['#8a4a2a', '#5d636b', '#33373c'], 120, 1, 5);
  ctx.strokeStyle = 'rgba(20,20,20,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 252);
  return toTexture(c, 2);
}

function woodTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = x % 64 === 0 ? '#6d4e2c' : '#86643c';
    ctx.fillRect(x, 0, 30, 256);
    ctx.strokeStyle = 'rgba(40,25,10,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 0, 30, 256);
  }
  speckle(ctx, 256, ['#5d4122', '#93714a'], 200, 1, 3);
  return toTexture(c, 1);
}

function camoTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#6b6b45';
  ctx.fillRect(0, 0, 256, 256);
  const blobs = ['#4a4a30', '#8a7a4a', '#2a8a7a', '#5d5d3a'];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = blobs[i % blobs.length];
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 18 + rand() * 30, 12 + rand() * 22, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(c, 1);
}

function crateTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#9c7a45';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = x % 64 === 0 ? '#8f6d3a' : '#a8874f';
    ctx.fillRect(x, 0, 32, 256);
  }
  ctx.strokeStyle = '#5d4122';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  ctx.beginPath();
  ctx.moveTo(5, 5);
  ctx.lineTo(251, 251);
  ctx.moveTo(251, 5);
  ctx.lineTo(5, 251);
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#2a8a7a';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DL-07', 128, 140);
  return toTexture(c, 1);
}

export function makeTextures() {
  return {
    sand: sandTexture(),
    concrete: concreteTexture(),
    metal: metalTexture(),
    wood: woodTexture(),
    camo: camoTexture(),
    crate: crateTexture(),
  };
}
