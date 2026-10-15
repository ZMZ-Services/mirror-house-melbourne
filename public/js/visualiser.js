// Mirror House Melbourne: "Try it in your room" visualiser.
//
// How it works ("tour into the picture", Horry et al. 1997):
//  1. The photo is treated as a pinhole camera at the origin looking down -Z.
//  2. The shopper marks the back wall as a rectangle. With a known camera height and lens,
//     the rectangle's floor line gives the wall's depth, and from that the whole room box.
//  3. Every room surface is painted with the photo by projecting it back out of the original
//     camera (projective texturing), so the first 3D frame matches the photo exactly.
//  4. The mirror is real-size geometry with a planar Reflector, so it reflects the room
//     box (floor, side walls and a synthetic wall behind the photographer) as you orbit.
// Everything runs in the browser. Photos are never uploaded.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEG = Math.PI / 180;
const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Rectangles are in image fractions (0..1, y down). `horizon` is the eye-level line (y fraction),
// measured from where the floor seams meet. Values tuned against the sample photos.
const SAMPLES = {
  living: {
    src: '/images/rooms/living.jpg', label: 'Living room',
    rect: { x0: 0.217, y0: 0.177, x1: 0.7725, y1: 0.6445 }, horizon: 0.44, height: 1.3, lens: 66,
    backFrac: 0.66, floorWall: 'back'
  },
  bedroom: {
    src: '/images/rooms/bedroom.jpg', label: 'Bedroom',
    rect: { x0: 0.209, y0: 0.179, x1: 0.7756, y1: 0.6535 }, horizon: 0.452, height: 1.3, lens: 66,
    backFrac: 0.5, floorWall: 'right'
  }
};
// Used if a sample photo hasn't arrived yet.
const STAND_IN = {
  src: '/images/hero.jpg', label: 'Stand-in room',
  rect: { x0: 0.0, y0: 0.0, x1: 0.942, y1: 0.746 }, horizon: 0.47, height: 1.2, lens: 66,
  backFrac: 0.45, floorWall: 'back'
};
const UPLOAD_DEFAULTS = { rect: { x0: 0.24, y0: 0.2, x1: 0.76, y1: 0.66 }, horizon: 0.5, height: 1.5, lens: 66, backFrac: 0.5, floorWall: 'back' };

const MIRRORS = [
  {
    id: 'grand-royale', slug: 'grand-royale-arched-brass-floor-mirror',
    name: 'Grand Royale Arched Brass Floor Mirror', short: 'Grand Royale Arch', price: '$1,290',
    shape: 'arch', w: 0.75, h: 1.95, frame: 0.025, depth: 0.028, floor: true, hangH: 1.25,
    note: 'Slim polished brass frame'
  },
  {
    id: 'ondine', slug: 'ondine-wavy-wall-mirror',
    name: 'Ondine Wavy Wall Mirror', short: 'Ondine Wavy', price: '$590',
    shape: 'wavy', w: 0.52, h: 0.90, frame: 0, depth: 0.006, hangH: 1.55,
    note: 'Frameless, bevelled edge'
  },
  {
    id: 'aurelia', soon: true, name: 'Aurelia Round', short: 'Aurelia Round',
    shape: 'circle', w: 0.80, h: 0.80, frame: 0.03, depth: 0.03, hangH: 1.6,
    note: 'Brass frame'
  },
  {
    id: 'linea', soon: true, name: 'Linea Rectangle', short: 'Linea Rectangle',
    shape: 'rect', w: 0.60, h: 1.60, frame: 0.02, depth: 0.025, hangH: 1.35,
    note: 'Brass frame'
  }
];

const STANDOFF = 0.015;      // gap between wall and mirror back
const LEAN = 6 * DEG;        // floor mirror lean
const BRASS = 0xC9A45C;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  sampleKey: 'living',
  preset: SAMPLES.living,
  photo: null,               // { canvas, w, h }
  rect: { ...SAMPLES.living.rect },
  horizon: SAMPLES.living.horizon,
  lens: SAMPLES.living.lens,
  camH: SAMPLES.living.height,
  room: null,
  mirrorId: 'grand-royale',
  wall: 'back',
  mount: 'lean',             // lean | hang (floor mirrors only)
  place: { s: 0, h: 1.2 },
  editing: false
};
const mirrorDef = () => MIRRORS.find((m) => m.id === state.mirrorId);
const isLeaning = () => !!mirrorDef().floor && state.mount === 'lean';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const el = {
  viewport: $('#viewport'), cover: $('#viz-cover'), coverTitle: $('#viz-cover-title'), coverText: $('#viz-cover-text'),
  hint: $('#viz-hint'), reset: $('#reset-view-btn'),
  photoInput: $('#photo-input'), dropZone: $('#drop-zone'), photoMsg: $('#photo-msg'),
  lens: $('#lens-input'), lensOut: $('#lens-value'), height: $('#height-input'), heightOut: $('#height-value'),
  roomSize: $('#room-size'), editBtn: $('#edit-wall-btn'),
  editor: $('#wall-editor'), editorBar: $('#editor-bar'), frame: $('#editor-frame'), editorCanvas: $('#editor-canvas'),
  guides: $('#editor-guides'), rectEl: $('#wall-rect'), horizonLine: $('#horizon-line'), horizonHandle: $('#handle-horizon'), readout: $('#editor-readout'),
  done: $('#wall-done-btn'),
  mirrorList: $('#mirror-list'), wallGroup: $('#wall-group'), mountGroup: $('#mount-group'),
  selName: $('#mirror-selected-name'), dims: $('#mirror-dims'), addBtn: $('#add-to-bag-btn')
};

function showCover(title, text) {
  el.coverTitle.textContent = title;
  el.coverText.textContent = text;
  el.cover.hidden = false;
}
function setMsg(text, isError) {
  el.photoMsg.textContent = text || '';
  el.photoMsg.classList.toggle('error', !!isError);
}

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (e) { return false; }
}

let renderer, scene, camera, controls, roomMesh, roomMaterial, photoTexture;
let mirror = null;           // { mount, tilt, reflector, pickables, def }
let needsRender = true;
let rafId = 0;
let camShift = 0;

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x26201b, 1);
  renderer.domElement.setAttribute('aria-label', '3D preview of the mirror in the room. Drag the mirror to move it, drag elsewhere to look around.');
  renderer.domElement.setAttribute('role', 'img');
  el.viewport.prepend(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showCover('The 3D view stopped', 'Your browser paused 3D graphics. Refresh the page to carry on.');
  });

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(2.5, 3.5, 2);
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a7560, 0.35));

  camera = new THREE.PerspectiveCamera(50, 1, 0.03, 80);
  camera.position.set(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = !reduceMotion.matches;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = Math.PI / 2 - 25 * DEG;
  controls.maxPolarAngle = Math.PI / 2 + 25 * DEG;
  controls.minAzimuthAngle = -40 * DEG;
  controls.maxAzimuthAngle = 40 * DEG;
  controls.addEventListener('change', () => { needsRender = true; });
  reduceMotion.addEventListener?.('change', () => { controls.enableDamping = !reduceMotion.matches; });

  roomMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      map: { value: null },
      tanH: { value: 0.65 }, tanV: { value: 0.49 }, hy: { value: 0 },
      D: { value: 5 }, xL: { value: -2 }, xR: { value: 2 }, yF: { value: -1.5 }, yC: { value: 1.2 }, Zf: { value: 2 }
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform float tanH, tanV, hy, D, xL, xR, yF, yC, Zf;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      // Photo coordinates of a world point, seen from the original camera.
      vec2 photoUv(vec3 p) {
        float iz = 1.0 / max(-p.z, 1e-4);
        return vec2(0.5 + 0.5 * (p.x * iz / tanH), 0.5 + 0.5 * (p.y * iz / tanV + hy));
      }
      // Depth (positive, distance down -Z) at which a point with this x, y enters the photo.
      float coverDepth(float x, float y) {
        float dx = abs(x) / tanH;
        float dy = y < 0.0 ? -y / ((1.0 + hy) * tanV) : y / ((1.0 - hy) * tanV);
        return max(dx, dy) * 1.002;
      }

      // Distance o folded back and forth inside 0..L (a hinge that never runs off the wall).
      float foldRange(float o, float L) {
        float m = mod(o, 2.0 * L);
        return L - abs(L - m);
      }

      void main() {
        vec3 p = vWorld;
        vec3 n = abs(vNormalW);
        float shade = 1.0;

        if (n.z > 0.5 && p.z > 0.0) {
          // Front wall (behind the photographer): the back wall, mirrored left to right.
          p = vec3(xL + xR - p.x, p.y, -D);
          shade = 0.92;
        } else if (n.z <= 0.5) {
          // Floor, ceiling, side walls: fold the part nearer than the photo's coverage back
          // into covered territory; past the back wall, hinge onto the back wall itself.
          float zc = -coverDepth(p.x, p.y);
          if (p.z > zc) {
            float z2 = 2.0 * zc - p.z;
            if (z2 < -D) {
              float o = -D - z2;
              z2 = -D;
              if (n.y > 0.5) p.y = p.y < 0.0 ? yF + foldRange(o, yC - yF) : yC - foldRange(o, yC - yF);
              else p.x = p.x < 0.0 ? xL + foldRange(o, xR - xL) : xR - foldRange(o, xR - xL);
            }
            p.z = z2;
          }
        }

        vec2 uv = photoUv(p);
        uv = 1.0 - abs(1.0 - abs(uv));             // mirror-fold anything still outside 0..1
        uv = clamp(uv, vec2(0.0005), vec2(0.9995));
        vec3 c = texture2D(map, uv).rgb * shade;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  roomMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), roomMaterial);
  roomMesh.visible = false;
  scene.add(roomMesh);

  const ro = new ResizeObserver(() => resize());
  ro.observe(el.viewport);
  resize();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop(); else startLoop();
  });
  startLoop();
}

function viewSize() {
  return { w: Math.max(1, el.viewport.clientWidth), h: Math.max(1, el.viewport.clientHeight) };
}

function reflectorSize() {
  const { w, h } = viewSize();
  const pr = renderer.getPixelRatio();
  return { w: Math.min(2048, Math.round(w * pr)), h: Math.min(2048, Math.round(h * pr)) };
}

function resize() {
  if (!renderer) return;
  const { w, h } = viewSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  fitCameraLens();
  if (mirror && mirror.reflector) {
    const rs = reflectorSize();
    mirror.reflector.getRenderTarget().setSize(rs.w, rs.h);
  }
  if (state.editing) layoutEditor();
  needsRender = true;
}

// Match the 3D camera to the photo's lens. The photo "covers" the viewport, so the first frame is
// the photo itself (cropped to the viewport's shape), with eye level where the photo has it.
function fitCameraLens() {
  if (!camera) return;
  const { w, h } = viewSize();
  const aspect = w / h;
  const r = state.room;
  let tanVc = 0.5;
  camShift = 0;
  if (r) {
    const photoAspect = state.photo.w / state.photo.h;
    tanVc = aspect >= photoAspect ? r.tanH / aspect : r.tanV;
    camShift = r.hy * r.tanV / tanVc;
  }
  camera.aspect = aspect;
  camera.fov = 2 * Math.atan(tanVc) / DEG;
  camera.updateProjectionMatrix();
  // Vertical lens shift (like an architectural shift lens): keeps eye level where the photo had it.
  camera.projectionMatrix.elements[9] = -camShift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function resetView() {
  const r = state.room;
  if (!r) return;
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, -r.D);
  controls.minDistance = Math.min(1.0, r.D * 0.5);
  controls.maxDistance = r.D + r.Zf * 0.85;
  fitCameraLens();
  controls.update();
  needsRender = true;
}

// Keep the camera inside the room box so the view stays plausible.
function clampCamera() {
  const r = state.room;
  if (!r) return;
  const p = camera.position;
  const before = p.clone();
  p.x = clamp(p.x, r.xL + 0.25, r.xR - 0.25);
  p.y = clamp(p.y, r.yF + 0.3, r.yC - 0.15);
  p.z = clamp(p.z, -r.D + 0.6, r.Zf - 0.15);
  if (!before.equals(p)) camera.lookAt(controls.target);
}

function frame() {
  rafId = requestAnimationFrame(frame);
  if (state.editing || !state.room) return;
  const moved = controls.update();
  if (moved) clampCamera();
  if (moved || needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}
function startLoop() { if (!rafId && renderer) { needsRender = true; rafId = requestAnimationFrame(frame); } }
function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

// ---------------------------------------------------------------------------
// Room reconstruction
// ---------------------------------------------------------------------------

function computeRoom() {
  const { w, h } = state.photo;
  const tanH = Math.tan(state.lens * DEG / 2);
  const tanV = tanH * h / w;
  const r = state.rect;
  const hy = 1 - 2 * state.horizon;           // eye level in photo NDC (y up)
  const x0n = 2 * r.x0 - 1, x1n = 2 * r.x1 - 1;
  const yBottom = 1 - 2 * r.y1, yTop = 1 - 2 * r.y0;
  const H = state.camH;

  // Ray through the wall's floor line hits the floor (y = -H) at depth D.
  const y0 = Math.min(yBottom - hy, -0.02);
  const D = H / (-y0 * tanV);
  const xL = Math.min(x0n * tanH * D, -0.3);
  const xR = Math.max(x1n * tanH * D, 0.3);
  let yC = (yTop - hy) * tanV * D;
  const ceilingUnseen = r.y0 <= 0.004;
  if (ceilingUnseen) yC = Math.max(yC, 2.4 - H);
  yC = Math.max(yC, 0.3);
  const Zf = Math.max(1.2, 0.45 * D);
  return { tanH, tanV, hy, D, xL, xR, yF: -H, yC, Zf, H, width: xR - xL, height: yC + H, ceilingUnseen };
}

function updateRoom() {
  const r = state.room = computeRoom();
  const u = roomMaterial.uniforms;
  u.tanH.value = r.tanH; u.tanV.value = r.tanV; u.hy.value = r.hy;
  u.D.value = r.D; u.xL.value = r.xL; u.xR.value = r.xR; u.yF.value = r.yF; u.yC.value = r.yC; u.Zf.value = r.Zf;

  roomMesh.geometry.dispose();
  roomMesh.geometry = new THREE.BoxGeometry(r.width, r.height, r.D + r.Zf);
  roomMesh.position.set((r.xL + r.xR) / 2, (r.yF + r.yC) / 2, (r.Zf - r.D) / 2);
  roomMesh.visible = true;

  const text = `${r.width.toFixed(1)} m wide × ${r.height.toFixed(1)} m high × ${r.D.toFixed(1)} m deep`;
  el.roomSize.innerHTML = `Room size: <strong>${text}</strong>${r.ceilingUnseen ? ' (ceiling out of shot, set to 2.4 m)' : ''}`;
  el.readout.textContent = `About ${text}`;

  placeMirror();
  resetView();
}

// ---------------------------------------------------------------------------
// Mirror shapes
// ---------------------------------------------------------------------------

// Wavy outline: an ellipse perturbed by a few sinusoids, scaled to the exact size.
function wavyBase(w, h) {
  const pts = [];
  const N = 220;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 1 + 0.055 * Math.sin(3 * t + 0.4) + 0.035 * Math.sin(5 * t + 1.7) + 0.018 * Math.sin(7 * t + 0.9);
    pts.push(new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, sx = w / (maxX - minX), sy = h / (maxY - minY);
  return pts.map((p) => new THREE.Vector2((p.x - cx) * sx, (p.y - cy) * sy));
}
// Offset a smooth closed CCW polygon inwards by d.
function insetPoints(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    return new THREE.Vector2(p.x - (ty / len) * d, p.y + (tx / len) * d);
  });
}

const wavyCache = new Map();
function wavyPts(def) {
  if (!wavyCache.has(def.id)) wavyCache.set(def.id, wavyBase(def.w, def.h));
  return wavyCache.get(def.id);
}

// Outline of a mirror (centred on its bounding box), shrunk by `inset` metres.
function shapeFor(def, inset = 0) {
  const w = def.w, h = def.h;
  const s = new THREE.Shape();
  if (def.shape === 'arch') {
    const R = w / 2;                      // arch radius; arc centre stays fixed
    const r = R - inset;
    const cy = h / 2 - R;
    s.moveTo(-r, -h / 2 + inset);
    s.lineTo(r, -h / 2 + inset);
    s.lineTo(r, cy);
    s.absarc(0, cy, r, 0, Math.PI, false);
    s.lineTo(-r, -h / 2 + inset);
  } else if (def.shape === 'circle') {
    s.absarc(0, 0, w / 2 - inset, 0, Math.PI * 2, false);
  } else if (def.shape === 'rect') {
    const x = w / 2 - inset, y = h / 2 - inset;
    s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y);
  } else {
    const pts = inset ? insetPoints(wavyPts(def), inset) : wavyPts(def);
    s.setFromPoints(pts);
    s.closePath();
  }
  return s;
}

// Soft contact shadow: the silhouette, blurred, as an alpha map.
function shadowTexture(def, margin, blurM, kind) {
  const W = def.w + margin * 2, H = kind === 'floor' ? def._floorDepth + margin * 2 : def.h + margin * 2;
  const cw = 160, ch = Math.round(clamp(cw * H / W, 32, 512));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  const k = cw / W;
  const off = cw * 3;                    // draw off-canvas; only the blurred shadow lands on it
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = Math.max(2, blurM * k);
  ctx.shadowOffsetX = off;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (kind === 'floor') {
    ctx.rect(margin * k - off, margin * k, def.w * k, def._floorDepth * k);
  } else {
    const pts = shapeFor(def, 0).getPoints(64);
    pts.forEach((p, i) => {
      const x = (p.x + W / 2) * k - off, y = (H / 2 - p.y) * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return { tex, W, H };
}

function shadowMesh(def, kind, opacity) {
  const margin = kind === 'floor' ? 0.12 : 0.1;
  const { tex, W, H } = shadowTexture(def, margin, kind === 'floor' ? 0.08 : 0.05, kind);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: tex, transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  mesh.renderOrder = 1;
  return mesh;
}

function disposeMirror() {
  if (!mirror) return;
  scene.remove(mirror.mount);
  mirror.mount.traverse((o) => {
    if (o.isReflector) { o.dispose(); o.geometry.dispose(); return; }
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.alphaMap) o.material.alphaMap.dispose();
      o.material.dispose();
    }
  });
  mirror = null;
}

function buildMirror() {
  disposeMirror();
  const def = mirrorDef();
  const mount = new THREE.Group();
  const tilt = new THREE.Group();
  mount.add(tilt);
  const pickables = [];

  const rs = reflectorSize();
  let glassZ;
  if (def.frame > 0) {
    // Brass frame: outer outline with the glass opening as a hole, extruded.
    const outer = shapeFor(def, 0);
    outer.holes.push(shapeFor(def, def.frame));
    const frameGeo = new THREE.ExtrudeGeometry(outer, {
      depth: def.depth - 0.004, curveSegments: 72,
      bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 3
    });
    frameGeo.translate(0, 0, 0.002);
    const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: 0.28, envMapIntensity: 0.8 });
    const frameMesh = new THREE.Mesh(frameGeo, brass);
    tilt.add(frameMesh);
    pickables.push(frameMesh);
    glassZ = def.depth - 0.009;
  } else {
    // Frameless: a thin polished bevel ring around the glass.
    const ring = shapeFor(def, 0);
    ring.holes.push(shapeFor(def, 0.012));
    const ringGeo = new THREE.ExtrudeGeometry(ring, {
      depth: 0.003, curveSegments: 64,
      bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0035, bevelSegments: 3
    });
    ringGeo.translate(0, 0, 0.0015);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xdfe3e1, metalness: 0.65, roughness: 0.14, emissive: 0x3a3e3d, envMapIntensity: 1.3
    });
    const ringMesh = new THREE.Mesh(ringGeo, edgeMat);
    tilt.add(ringMesh);
    pickables.push(ringMesh);
    glassZ = 0.0042;
  }

  const glassShape = shapeFor(def, def.frame > 0 ? def.frame - 0.003 : 0.0105);
  const reflector = new Reflector(new THREE.ShapeGeometry(glassShape, 72), {
    textureWidth: rs.w, textureHeight: rs.h, color: 0xb9bcba, clipBias: 0.003
  });
  reflector.position.z = glassZ;
  tilt.add(reflector);
  pickables.push(reflector);

  // Soft shadows: on the wall behind, and on the floor for a leaning mirror.
  const wallShadow = shadowMesh(def, 'wall', 0.32);
  mount.add(wallShadow);
  def._floorDepth = def.h * Math.sin(LEAN) + def.depth + 0.04;
  const floorShadow = shadowMesh(def, 'floor', 0.7);
  floorShadow.rotation.x = -Math.PI / 2;
  mount.add(floorShadow);

  scene.add(mount);
  mirror = { def, mount, tilt, reflector, pickables, wallShadow, floorShadow };
  placeMirror();
}

// Wall geometry: base point on the floor at wall coordinate s, and the yaw that faces into the room.
function wallInfo(wall) {
  const r = state.room;
  if (wall === 'left') return { yaw: Math.PI / 2, min: -r.D, max: r.Zf, point: (s) => new THREE.Vector3(r.xL, r.yF, s), plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), -r.xL), sOf: (p) => p.z };
  if (wall === 'right') return { yaw: -Math.PI / 2, min: -r.D, max: r.Zf, point: (s) => new THREE.Vector3(r.xR, r.yF, s), plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), r.xR), sOf: (p) => p.z };
  return { yaw: 0, min: r.xL, max: r.xR, point: (s) => new THREE.Vector3(s, r.yF, -r.D), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), r.D), sOf: (p) => p.x };
}

function defaultPlacement() {
  const def = mirrorDef();
  const r = state.room;
  if (!r) return;
  const wi = wallInfo(state.wall);
  let s;
  if (state.wall === 'back') {
    s = r.xL + (state.preset.backFrac ?? 0.5) * r.width;
  } else {
    // Middle of the stretch of side wall that's in view from the starting camera.
    const { w, h } = viewSize();
    const tanHView = Math.min(r.tanH, Math.tan(camera.fov * DEG / 2) * w / h);
    const xWall = state.wall === 'left' ? r.xL : r.xR;
    const visibleStart = Math.max(-Math.abs(xWall) / tanHView, -r.D + def.w + 0.1);
    s = (-r.D + visibleStart) / 2;
  }
  const h = def.floor && state.mount === 'lean' ? def.h / 2 : (def.hangH ?? 1.5);
  state.place = { s, h };
}

function clampPlacement() {
  const def = mirrorDef();
  const r = state.room;
  const wi = wallInfo(state.wall);
  const m = 0.03;
  const sMin = wi.min + def.w / 2 + m, sMax = wi.max - def.w / 2 - m;
  state.place.s = sMin <= sMax ? clamp(state.place.s, sMin, sMax) : (wi.min + wi.max) / 2;
  const hMin = def.h / 2 + 0.01, hMax = r.height - def.h / 2 - 0.02;
  state.place.h = hMin <= hMax ? clamp(state.place.h, hMin, hMax) : r.height / 2;
}

function placeMirror() {
  if (!mirror || !state.room) return;
  const def = mirror.def;
  clampPlacement();
  const wi = wallInfo(state.wall);
  mirror.mount.position.copy(wi.point(state.place.s));
  mirror.mount.rotation.set(0, wi.yaw, 0);

  const lean = isLeaning();
  const th = lean ? LEAN : 0;
  const cy = lean ? (def.h / 2) * Math.cos(th) + 0.002 : state.place.h;
  const cz = lean ? STANDOFF + (def.h / 2) * Math.sin(th) : STANDOFF;
  mirror.tilt.position.set(0, cy, cz);
  mirror.tilt.rotation.set(-th, 0, 0);

  // Wall shadow sits on the wall just behind the mirror, nudged down as if lit from above.
  mirror.wallShadow.position.set(0, cy - (lean ? 0.03 : 0.018), 0.003);
  mirror.wallShadow.material.opacity = lean ? 0.2 : 0.4;
  mirror.floorShadow.visible = lean;
  mirror.floorShadow.position.set(0, 0.003, def._floorDepth / 2);
  needsRender = true;
}

// ---------------------------------------------------------------------------
// Mirror dragging
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;

function setNdc(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function hitMirror(e) {
  if (!mirror) return false;
  setNdc(e);
  return raycaster.intersectObjects(mirror.pickables, false).length > 0;
}
function wallHit(e) {
  setNdc(e);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(wallInfo(state.wall).plane, p) ? p : null;
}

function initDrag() {
  const canvas = renderer.domElement;
  // Capture phase on the wrapper runs before OrbitControls' own pointerdown on the canvas.
  el.viewport.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas || state.editing || drag || e.button > 0) return;
    if (!hitMirror(e)) return;
    const p = wallHit(e);
    if (!p) return;
    const wi = wallInfo(state.wall);
    drag = { id: e.pointerId, offS: state.place.s - wi.sOf(p), offH: state.place.h - (p.y - state.room.yF) };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    el.viewport.classList.add('is-dragging');
    e.preventDefault();
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      const p = wallHit(e);
      if (!p) return;
      state.place.s = wallInfo(state.wall).sOf(p) + drag.offS;
      if (!isLeaning()) state.place.h = p.y - state.room.yF + drag.offH;
      placeMirror();
      return;
    }
    if (e.pointerType === 'mouse' && !e.buttons && !state.editing) {
      canvas.style.cursor = hitMirror(e) ? 'grab' : '';
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    controls.enabled = true;
    el.viewport.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------------------
// Photo loading
// ---------------------------------------------------------------------------

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

async function decodePhoto(blob) {
  let src;
  try {
    src = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) {
    src = await blobToImage(blob);
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  if (!w0 || !h0) throw new Error('decode');
  const k = Math.min(1, 2048 / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * k);
  canvas.height = Math.round(h0 * k);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  return { canvas, w: canvas.width, h: canvas.height };
}

function usePhoto(photo, preset) {
  state.photo = photo;
  state.preset = preset;
  state.rect = { ...preset.rect };
  state.horizon = preset.horizon;
  state.lens = preset.lens;
  state.camH = preset.height;
  el.lens.value = String(state.lens);
  el.height.value = String(state.camH);
  syncSliderLabels();

  if (renderer) {
    if (photoTexture) photoTexture.dispose();
    photoTexture = new THREE.CanvasTexture(photo.canvas);
    photoTexture.colorSpace = THREE.SRGBColorSpace;
    photoTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    photoTexture.generateMipmaps = true;
    photoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    roomMaterial.uniforms.map.value = photoTexture;

    const def = mirrorDef();
    if (def.floor && state.mount === 'lean' && preset.floorWall) setWall(preset.floorWall, false);
    state.room = computeRoom();
    fitCameraLens();
    defaultPlacement();
    if (!mirror) buildMirror();
    updateRoom();
    el.cover.hidden = true;
  }
  if (state.editing) layoutEditor();
}

async function loadSample(key) {
  const preset = SAMPLES[key];
  state.sampleKey = key;
  document.querySelectorAll('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === key)));
  setMsg('');
  try {
    const res = await fetch(preset.src);
    if (!res.ok) throw new Error('missing');
    const photo = await decodePhoto(await res.blob());
    if (state.sampleKey !== key) return;
    usePhoto(photo, preset);
  } catch (e) {
    try {
      const res = await fetch(STAND_IN.src);
      if (!res.ok) throw new Error('missing');
      const photo = await decodePhoto(await res.blob());
      if (state.sampleKey !== key) return;
      usePhoto(photo, STAND_IN);
      setMsg(`The ${preset.label.toLowerCase()} sample is still on its way, so here's a stand-in room.`);
    } catch (err) {
      setMsg("We couldn't load the sample room. Try uploading your own photo.", true);
      if (renderer) showCover('No room photo yet', 'Upload a photo of your room to get started.');
    }
  }
}

function looksLikeHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
}

async function loadFile(file) {
  if (!file) return;
  const heic = looksLikeHeic(file);
  if (!heic && file.type && !file.type.startsWith('image/')) {
    setMsg("That file isn't a photo. Try a JPG, PNG or WebP.", true);
    return;
  }
  setMsg('Opening your photo…');
  try {
    const photo = await decodePhoto(file);
    state.sampleKey = 'upload';
    document.querySelectorAll('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    usePhoto(photo, UPLOAD_DEFAULTS);
    setMsg('Photo loaded. It stays on this device. Now mark the back wall.');
    $('#step-wall').dataset.done = 'false';
    openEditor();
    el.viewport.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  } catch (e) {
    setMsg(heic
      ? "This browser can't open HEIC photos. On iPhone, share the photo and pick JPEG, or set Camera › Formats to Most Compatible, then try again."
      : "We couldn't open that photo. Try a JPG, PNG or WebP.", true);
  }
}

function initPhotoInputs() {
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
    if (state.editing) closeEditor();
    loadSample(b.dataset.sample);
  }));
  el.photoInput.addEventListener('change', () => {
    const f = el.photoInput.files && el.photoInput.files[0];
    loadFile(f);
    el.photoInput.value = '';
  });
  const targets = [el.dropZone, el.viewport];
  targets.forEach((t) => {
    t.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      el.dropZone.classList.add('is-over');
    });
    t.addEventListener('dragleave', () => el.dropZone.classList.remove('is-over'));
    t.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      el.dropZone.classList.remove('is-over');
      loadFile(e.dataTransfer.files[0]);
    });
  });
}

// ---------------------------------------------------------------------------
// 2D wall editor
// ---------------------------------------------------------------------------

const MIN_SIZE = 0.06;

function openEditor() {
  if (!state.photo) return;
  state.editing = true;
  el.editor.hidden = false;
  el.hint.hidden = true;
  el.editBtn.textContent = 'Done';
  el.editBtn.setAttribute('aria-expanded', 'true');
  layoutEditor();
  $('#handle-tl').focus({ preventScroll: true });
}

function closeEditor() {
  state.editing = false;
  el.editor.hidden = true;
  el.hint.hidden = false;
  el.editBtn.textContent = 'Mark the wall';
  el.editBtn.setAttribute('aria-expanded', 'false');
  $('#step-wall').dataset.done = 'true';
  resetView();
  needsRender = true;
}

function layoutEditor() {
  if (!state.photo) return;
  const vw = el.viewport.clientWidth, vh = el.viewport.clientHeight;
  const top = el.editorBar.offsetHeight + 4;
  const pad = 26;
  const availW = vw - pad * 2, availH = vh - top - pad - 34;
  const a = state.photo.w / state.photo.h;
  let w = availW, h = availW / a;
  if (h > availH) { h = availH; w = h * a; }
  w = Math.max(40, w); h = Math.max(30, h);
  const left = (vw - w) / 2, y = top + (vh - top - 34 - h) / 2;
  Object.assign(el.frame.style, { left: `${left}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.editorCanvas.width = Math.round(w * dpr);
  el.editorCanvas.height = Math.round(h * dpr);
  el.editorCanvas.getContext('2d').drawImage(state.photo.canvas, 0, 0, el.editorCanvas.width, el.editorCanvas.height);
  updateEditorDom();
}

function updateEditorDom() {
  const r = state.rect;
  Object.assign(el.rectEl.style, {
    left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`, width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`
  });
  el.horizonLine.style.top = `${state.horizon * 100}%`;
  // Park the "Eye level" label where it won't sit on a wall handle.
  const fw = el.frame.clientWidth, lw = el.horizonHandle.offsetWidth || 100;
  const leftGap = r.x0 * fw, rightGap = (1 - r.x1) * fw;
  const cx = leftGap >= lw + 30 ? leftGap / 2 : rightGap >= lw + 30 ? fw - rightGap / 2 : (r.x0 + (r.x1 - r.x0) * 0.38) * fw;
  el.horizonHandle.style.left = `${cx}px`;
  // Corner seam guides: from the eye-level centre point out through each wall corner to the photo edge.
  const vx = 50, vy = state.horizon * 100;
  const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
  el.guides.innerHTML = corners.map(([cx, cy]) => {
    const x = cx * 100, y = cy * 100;
    const dx = x - vx, dy = y - vy;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (100 - x) / dx); else if (dx < 0) t = Math.min(t, -x / dx);
    if (dy > 0) t = Math.min(t, (100 - y) / dy); else if (dy < 0) t = Math.min(t, -y / dy);
    if (!isFinite(t)) t = 0;
    return `<line x1="${x}" y1="${y}" x2="${x + dx * t}" y2="${y + dy * t}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
}

function applyHandle(h, p, start) {
  const r = { ...state.rect };
  const floorMin = state.horizon + 0.03;
  if (h === 'move') {
    const w = start.rect.x1 - start.rect.x0, ht = start.rect.y1 - start.rect.y0;
    const nx0 = clamp(start.rect.x0 + p.x - start.p.x, 0, 1 - w);
    const ny0 = clamp(start.rect.y0 + p.y - start.p.y, Math.max(0, floorMin - ht), 1 - ht);
    Object.assign(r, { x0: nx0, x1: nx0 + w, y0: ny0, y1: ny0 + ht });
  } else if (h === 'hz') {
    state.horizon = clamp(p.y, 0.08, Math.min(0.92, r.y1 - 0.03));
  } else {
    if (h.includes('l')) r.x0 = clamp(p.x, 0, r.x1 - MIN_SIZE);
    if (h.includes('r')) r.x1 = clamp(p.x, r.x0 + MIN_SIZE, 1);
    if (h.includes('t')) r.y0 = clamp(p.y, 0, r.y1 - MIN_SIZE);
    if (h.includes('b')) r.y1 = clamp(p.y, Math.max(r.y0 + MIN_SIZE, floorMin), 1);
    if (r.y0 < 0.008) r.y0 = 0;            // snap to the top: ceiling out of shot
  }
  state.rect = r;
  onWallChanged();
}

function onWallChanged() {
  updateEditorDom();
  if (renderer && state.photo) updateRoom();
}

function framePoint(e) {
  const b = el.frame.getBoundingClientRect();
  return { x: clamp((e.clientX - b.left) / b.width, 0, 1), y: clamp((e.clientY - b.top) / b.height, 0, 1) };
}

function handleValue(h) {
  const r = state.rect;
  if (h === 'hz') return { x: 0.5, y: state.horizon };
  return {
    x: h.includes('l') ? r.x0 : h.includes('r') ? r.x1 : (r.x0 + r.x1) / 2,
    y: h.includes('t') ? r.y0 : h.includes('b') ? r.y1 : (r.y0 + r.y1) / 2
  };
}

function initEditor() {
  let active = null;
  el.editor.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-h]');
    if (!target || !el.editor.contains(target)) return;
    e.preventDefault();
    const h = target.dataset.h;
    active = { id: e.pointerId, h, el: target, start: { p: framePoint(e), rect: { ...state.rect } } };
    target.setPointerCapture(e.pointerId);
    if (h !== 'move') target.focus({ preventScroll: true });
  });
  el.editor.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    applyHandle(active.h, framePoint(e), active.start);
  });
  const end = (e) => { if (active && e.pointerId === active.id) active = null; };
  el.editor.addEventListener('pointerup', end);
  el.editor.addEventListener('pointercancel', end);

  // Arrow keys nudge the focused handle. Shift for bigger steps.
  el.editor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.target === el.rectEl)) { closeEditor(); el.editBtn.focus(); return; }
    const t = e.target.closest('[data-h]');
    if (!t || t === el.rectEl) return;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const h = t.dataset.h;
    const step = e.shiftKey ? 0.02 : 0.004;
    const v = handleValue(h);
    const horizontalOnly = h === 'l' || h === 'r', verticalOnly = h === 't' || h === 'b' || h === 'hz';
    const p = { x: v.x + (verticalOnly ? 0 : d[0] * step), y: v.y + (horizontalOnly ? 0 : d[1] * step) };
    applyHandle(h, { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }, null);
  });

  el.editBtn.addEventListener('click', () => (state.editing ? closeEditor() : openEditor()));
  el.done.addEventListener('click', () => { closeEditor(); el.editBtn.focus({ preventScroll: true }); });
}

// ---------------------------------------------------------------------------
// Sliders
// ---------------------------------------------------------------------------

function syncSliderLabels() {
  el.lensOut.textContent = `${Math.round(state.lens)}°`;
  el.heightOut.textContent = `${state.camH.toFixed(2)} m`;
}
function initSliders() {
  el.lens.addEventListener('input', () => {
    state.lens = parseFloat(el.lens.value);
    syncSliderLabels();
    if (state.photo && renderer) updateRoom();
  });
  el.height.addEventListener('input', () => {
    state.camH = parseFloat(el.height.value);
    syncSliderLabels();
    if (state.photo && renderer) updateRoom();
  });
}

// ---------------------------------------------------------------------------
// Mirror picker UI
// ---------------------------------------------------------------------------

function shapeIcon(def) {
  const vbW = 100, vbH = 125, pad = 10;
  const k = Math.min((vbW - pad * 2) / def.w, (vbH - pad * 2) / def.h);
  const pts = shapeFor(def, 0).getPoints(48);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(vbW / 2 + p.x * k).toFixed(1)},${(vbH / 2 - p.y * k).toFixed(1)}`).join('') + 'Z';
  const stroke = def.frame > 0 ? '#A8823A' : '#9AA09E';
  return `<svg viewBox="0 0 ${vbW} ${vbH}" aria-hidden="true" focusable="false"><path d="${d}" fill="#E6E9E7" stroke="${stroke}" stroke-width="${def.frame > 0 ? 4 : 2}"/></svg>`;
}

const cm = (m) => Math.round(m * 100);
const dimsText = (def) => `${cm(def.w)} × ${cm(def.h)} cm`;

function renderMirrorList() {
  el.mirrorList.innerHTML = MIRRORS.map((def) => `
    <button type="button" class="mirror-card" role="radio" id="mirror-${def.id}" data-mirror="${def.id}"
      aria-checked="${def.id === state.mirrorId}" tabindex="${def.id === state.mirrorId ? 0 : -1}">
      <span class="mirror-thumb" data-shape-fallback="${def.id}">${def.slug
        ? `<img src="/images/products/${def.slug}.jpg" alt="" loading="lazy" width="60" height="75">`
        : shapeIcon(def)}</span>
      <span class="mirror-text">
        ${def.soon ? '<span class="soon-tag">Coming soon</span>' : ''}
        <span class="mirror-name">${def.name}</span>
        <span class="mirror-meta"><span>${dimsText(def)}</span>${def.price ? `<span class="price">${def.price}</span>` : ''}</span>
      </span>
    </button>`).join('');
  // Product photo still arriving? Show the shape instead.
  el.mirrorList.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      const holder = img.closest('[data-shape-fallback]');
      const def = MIRRORS.find((m) => m.id === holder.dataset.shapeFallback);
      holder.innerHTML = shapeIcon(def);
    }, { once: true });
  });
}

function selectMirror(id, focus) {
  if (id === state.mirrorId && mirror) return;
  state.mirrorId = id;
  const def = mirrorDef();
  if (def.floor) state.mount = 'lean';
  syncMirrorUi();
  if (focus) $(`#mirror-${id}`).focus();
  if (!renderer || !state.room) return;
  defaultPlacement();
  buildMirror();
}

function setWall(wall, rebuild = true) {
  state.wall = wall;
  document.querySelectorAll('[data-wall]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wall === wall)));
  if (rebuild && state.room) { defaultPlacement(); placeMirror(); }
}

function setMount(mount) {
  state.mount = mount;
  syncMirrorUi();
  if (state.room) { defaultPlacement(); placeMirror(); }
}

function syncMirrorUi() {
  const def = mirrorDef();
  el.mirrorList.querySelectorAll('[data-mirror]').forEach((b) => {
    const on = b.dataset.mirror === def.id;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  el.mountGroup.hidden = !def.floor;
  document.querySelectorAll('[data-mount]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mount === state.mount)));
  el.selName.textContent = def.short;
  el.dims.textContent = `${dimsText(def)} · ${def.note}`;
  if (def.soon) {
    el.addBtn.removeAttribute('data-add');
    el.addBtn.disabled = true;
    el.addBtn.textContent = 'Coming soon';
  } else {
    el.addBtn.setAttribute('data-add', def.slug);
    el.addBtn.disabled = false;
    el.addBtn.textContent = `Add to bag · ${def.price}`;
  }
}

function initMirrorUi() {
  renderMirrorList();
  syncMirrorUi();
  el.mirrorList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mirror]');
    if (b) selectMirror(b.dataset.mirror);
  });
  el.mirrorList.addEventListener('keydown', (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = MIRRORS.findIndex((m) => m.id === state.mirrorId);
    selectMirror(MIRRORS[(i + keys[e.key] + MIRRORS.length) % MIRRORS.length].id, true);
  });
  document.querySelectorAll('[data-wall]').forEach((b) => b.addEventListener('click', () => setWall(b.dataset.wall)));
  document.querySelectorAll('[data-mount]').forEach((b) => b.addEventListener('click', () => setMount(b.dataset.mount)));
  el.reset.addEventListener('click', () => resetView());
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  initMirrorUi();
  initSliders();
  initEditor();
  initPhotoInputs();

  if (!hasWebGL2()) {
    showCover('3D isn\'t available here', 'This browser has WebGL turned off or doesn\'t support it, so we can\'t show the 3D preview. Try the latest Chrome, Safari, Firefox or Edge, or switch on hardware acceleration.');
    el.reset.disabled = true;
  } else {
    try {
      initThree();
      initDrag();
    } catch (e) {
      renderer = null;
      showCover('3D isn\'t available here', 'We couldn\'t start 3D graphics in this browser. Try the latest Chrome, Safari, Firefox or Edge.');
    }
  }
  loadSample('living');

  // Small handle for automated checks and debugging.
  window.mhViz = {
    state,
    get camera() { return camera; },
    get controls() { return controls; },
    mirrorScreenPoint() {
      if (!mirror) return null;
      const v = new THREE.Vector3();
      mirror.reflector.getWorldPosition(v);
      v.project(camera);
      const b = renderer.domElement.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    render() { needsRender = true; }
  };
}

boot();
