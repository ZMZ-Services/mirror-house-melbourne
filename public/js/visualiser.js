// Mirror House Melbourne: "Try it in your room" visualiser.
//
// A guided, four-step flow: add a room photo, tap the corners, pick a mirror, look around.
//
// How the room is rebuilt from one photo ("tour into the picture", Horry et al. 1997, generalised):
//  * The photo is a pinhole camera at the origin, principal point at the image centre, zero roll.
//    Focal length comes from a lens angle across the photo's LONG side (phone main camera ~69°).
//  * The shopper drags dots onto the room's corner posts: each post has a floor dot (where walls meet
//    the floor) and a top dot (where they meet the ceiling, or the top of the visible wall). Posts at the
//    photo's left/right edge mark where a wall runs out of frame. Consecutive posts bound one wall.
//  * Corner posts are vertical 3D lines, so their convergence gives the camera pitch. If they're parallel
//    (a level or cropped shot), eye level comes from the walls' horizontal vanishing points instead.
//    Two adjacent walls' vanishing points can also refine the lens (orthogonal directions).
//  * Floor dots are cast onto the floor plane; top dots give the ceiling; the ceiling height (Low /
//    Normal / High) sets the real-world scale. Distances are capped at 12 m with a nudge on that dot.
//  * Every surface is painted with the photo by projecting it back out of the original camera
//    (one ShaderMaterial). Areas the photo can't see are folded back into territory it can.
//  * The mirror is real-size geometry with a planar Reflector, so it reflects the rebuilt room.
// Everything runs in the browser. Photos are never uploaded.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEG = Math.PI / 180;
const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const median = (arr) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const MAX_DIST = 12;         // metres: floor dots further than this are capped and nudged
const STANDOFF = 0.015;      // gap between wall and mirror back
const LEAN = 6 * DEG;        // floor mirror lean
const BRASS = 0xC9A45C;
const DEFAULT_LENS = 69;     // across the long side: a phone's 26 mm main camera

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Posts are in image fractions (0..1, y down). Sample photos were cropped off-centre, so they carry a
// tuned eye level (horizon) as a manual override, and a tuned lens.
const SAMPLES = {
  living: {
    src: '/images/rooms/living.jpg', label: 'Living room', horizon: 0.44, lens: 66,
    posts: [
      { edge: 'l', fx: 0, fy: 0.8075, cx: 0, cy: 0 },
      { fx: 0.217, fy: 0.6445, cx: 0.217, cy: 0.177 },
      { fx: 0.7725, fy: 0.6445, cx: 0.7725, cy: 0.177 },
      { edge: 'r', fx: 1, fy: 0.824, cx: 1, cy: 0 }
    ],
    spot: { wall: 1, frac: 0.66 }, floorSpot: { wall: 1, frac: 0.66 }
  },
  bedroom: {
    src: '/images/rooms/bedroom.jpg', label: 'Bedroom', horizon: 0.452, lens: 66,
    posts: [
      { edge: 'l', fx: 0, fy: 0.783, cx: 0, cy: 0 },
      { fx: 0.209, fy: 0.6535, cx: 0.209, cy: 0.179 },
      { fx: 0.7756, fy: 0.6535, cx: 0.7756, cy: 0.179 },
      { edge: 'r', fx: 1, fy: 0.816, cx: 1, cy: 0 }
    ],
    spot: { wall: 1, frac: 0.5 }, floorSpot: { wall: 2, frac: 0.55 }
  }
};

function layoutPreset(kind) {
  if (kind === 'two') {
    return [
      { edge: 'l', fx: 0, fy: 0.80, cx: 0, cy: 0.12 },
      { fx: 0.5, fy: 0.68, cx: 0.5, cy: 0.24 },
      { edge: 'r', fx: 1, fy: 0.80, cx: 1, cy: 0.12 }
    ];
  }
  // Three walls, one-point view: back wall plus both side walls running out of frame.
  const x0 = 0.28, x1 = 0.72, yb = 0.68, yt = 0.30, vx = 0.5, vy = 0.5;
  const edgeAt = (x, cxr) => {
    const t = (x - vx) / (cxr - vx);
    return { fy: clamp(vy + t * (yb - vy), 0.02, 0.98), cy: clamp(vy + t * (yt - vy), 0.0, 0.98) };
  };
  const L = edgeAt(0, x0), R = edgeAt(1, x1);
  return [
    { edge: 'l', fx: 0, fy: L.fy, cx: 0, cy: L.cy },
    { fx: x0, fy: yb, cx: x0, cy: yt },
    { fx: x1, fy: yb, cx: x1, cy: yt },
    { edge: 'r', fx: 1, fy: R.fy, cx: 1, cy: R.cy }
  ];
}

const MIRRORS = [
  {
    id: 'grand-royale', slug: 'grand-royale-arched-brass-floor-mirror',
    name: 'Grand Royale Arch', price: '$1,290',
    shape: 'arch', w: 0.75, h: 1.95, frame: 0.025, depth: 0.028, floor: true, hangH: 1.25
  },
  {
    id: 'ondine', slug: 'ondine-wavy-wall-mirror',
    name: 'Ondine Wavy', price: '$590',
    shape: 'wavy', w: 0.52, h: 0.90, frame: 0, depth: 0.006, hangH: 1.55
  },
  { id: 'aurelia', soon: true, name: 'Aurelia Round', shape: 'circle', w: 0.80, h: 0.80, frame: 0.03, depth: 0.03, hangH: 1.6 },
  { id: 'linea', soon: true, name: 'Linea Rectangle', shape: 'rect', w: 0.60, h: 1.60, frame: 0.02, depth: 0.025, hangH: 1.35 }
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  step: 1,
  source: 'living',          // living | bedroom | upload
  preset: SAMPLES.living,
  photo: null,               // { canvas, w, h }
  posts: SAMPLES.living.posts.map((p) => ({ ...p })),
  lens: 66, lensMode: 'manual',
  ceilingH: 2.7, ceilingMode: true, camH: 1.5,
  horizon: SAMPLES.living.horizon,   // manual eye level (fraction of height) or null for auto
  layout: null,
  mirrorId: 'grand-royale',
  mirrorWall: 1,
  mount: 'lean',
  place: { s: 0, h: 1.2 },
  touched: false              // has the shopper dragged a dot yet (hides the hand hint)
};
const mirrorDef = () => MIRRORS.find((m) => m.id === state.mirrorId);
const isLeaning = () => !!mirrorDef().floor && state.mount === 'lean';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const el = {
  header: $('#site-header'), viewport: $('#viewport'), cover: $('#viz-cover'),
  coverTitle: $('#viz-cover-title'), coverText: $('#viz-cover-text'),
  reset: $('#reset-view-btn'), coach: $('#coach'), coachOk: $('#coach-ok'),
  card: $('#step-card'), back: $('#back-btn'), dots: $('#step-dots'),
  photoInput: $('#photo-input'), cameraInput: $('#camera-input'), photoMsg: $('#photo-msg'),
  libraryBtn: $('#library-btn'),
  editor: $('#wall-editor'), editorCanvas: $('#editor-canvas'), svg: $('#editor-svg'),
  dotLayer: $('#editor-dots'), nudgeLayer: $('#editor-nudges'), loupe: $('#loupe'), hand: $('#hand-hint'), fit: $('#fit-btn'),
  roomLine: $('#room-line'), techLine: $('#tech-line'),
  undo: $('#undo-btn'), addCorner: $('#add-corner-btn'), removeCorner: $('#remove-corner-btn'), looksRight: $('#looks-right-btn'),
  lens: $('#lens-input'), lensOut: $('#lens-value'), lensAuto: $('#lens-auto'),
  ceilingMode: $('#ceiling-mode'), heightRow: $('#height-row'), height: $('#height-input'), heightOut: $('#height-value'),
  horizonMode: $('#horizon-mode'), horizonRow: $('#horizon-row'), horizonInput: $('#horizon-input'), horizonOut: $('#horizon-value'),
  mirrorList: $('#mirror-list'), mirrorDone: $('#mirror-done-btn'),
  chosenPic: $('#chosen-pic'), chosenName: $('#chosen-name'), chosenMeta: $('#chosen-meta'),
  lean: $('#lean-toggle'), leanLabel: $('#lean-label'), addBtn: $('#add-to-bag-btn'), addLabel: $('#add-to-bag-label'),
  startAgain: $('#start-again-btn')
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
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

// ---------------------------------------------------------------------------
// Geometry: posts -> camera + room
// ---------------------------------------------------------------------------

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Image line through two pixel points (homogeneous), and a finite intersection or null.
function lineThrough(p, q) { return cross3([p[0], p[1], 1], [q[0], q[1], 1]); }
function meet(l1, l2, cx, cy, L) {
  const v = cross3(l1, l2);
  if (Math.abs(v[2]) < 1e-9) return null;
  const x = v[0] / v[2], y = v[1] / v[2];
  if (!isFinite(x) || !isFinite(y) || Math.hypot(x - cx, y - cy) > 25 * L) return null;
  // Reject near-parallel lines (vanishing point far outside): weak information.
  return [x, y];
}

// Camera pitch from corner posts (vertical 3D lines). Least squares on the vertical direction
// (0, cos p, -sin p) lying in each post's plane through the camera.
function pitchFromPosts(px, f, cx, cy) {
  let a = 0, b = 0, d = 0, count = 0;
  for (const p of px) {
    if (p.edge) continue;
    const r1 = [(p.fu - cx) / f, (cy - p.fv) / f, -1];
    const r2 = [(p.cu - cx) / f, (cy - p.cv) / f, -1];
    const n = cross3(r1, r2);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) continue;
    const ny = n[1] / len, nz = n[2] / len;
    a += ny * ny; b -= ny * nz; d += nz * nz; count++;
  }
  if (!count || a + d < 1e-7) return 0;
  const tr = a + d, det = a * d - b * b;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const lmin = tr / 2 - disc, lmax = tr / 2 + disc;
  if (lmax < 1e-7) return 0;
  let c, s;
  if (Math.abs(b) > 1e-12) { c = b; s = lmin - a; } else if (a <= d) { c = 1; s = 0; } else { return 0; }
  if (c < 0) { c = -c; s = -s; }
  return clamp(Math.atan2(s, c), -30 * DEG, 30 * DEG);
}

function solveLayout(photo, posts, opt) {
  const { w, h } = photo;
  const L = Math.max(w, h);
  const ccx = w / 2;
  const px = posts.map((p) => ({
    fu: p.fx * w, fv: p.fy * h, cu: p.cx * w, cv: p.cy * h, edge: p.edge || null, top: p.cy <= 0.012
  }));
  const n = px.length;

  // Horizontal vanishing points: each wall's floor line meets its ceiling line; opposite walls'
  // floor lines meet too (rectangular room).
  const floorLines = [], wallVps = [];
  for (let j = 0; j < n - 1; j++) {
    const a = px[j], b = px[j + 1];
    floorLines.push(lineThrough([a.fu, a.fv], [b.fu, b.fv]));
    const ceil = !a.top && !b.top ? lineThrough([a.cu, a.cv], [b.cu, b.cv]) : null;
    wallVps.push(ceil ? meet(floorLines[j], ceil, ccx, h / 2, L) : null);
  }
  const oppVps = [];
  for (let j = 0; j + 2 < n - 1; j++) oppVps.push(meet(floorLines[j], floorLines[j + 2], ccx, h / 2, L));

  const fManual = (L / 2) / Math.tan(opt.lens * DEG / 2);
  let f = fManual;
  let cy = h / 2, pitch = 0, horizonSource = 'centre';

  const level = Math.abs(pitchFromPosts(px, fManual, ccx, h / 2)) < 1.5 * DEG;
  if (opt.horizon != null) {
    cy = opt.horizon * h; horizonSource = 'manual';
  } else if (level) {
    const ys = [...wallVps, ...oppVps].filter(Boolean).map((v) => v[1]).filter((y) => y > -0.3 * h && y < 1.3 * h);
    if (ys.length) { cy = clamp(median(ys), 0.2 * h, 0.8 * h); horizonSource = 'walls'; }
  }

  // Lens from two adjacent walls' vanishing points (orthogonal directions).
  const fEst = [];
  for (let j = 0; j + 1 < wallVps.length; j++) {
    const v1 = wallVps[j], v2 = wallVps[j + 1];
    if (!v1 || !v2) continue;
    const f2 = -((v1[0] - ccx) * (v2[0] - ccx) + (v1[1] - cy) * (v2[1] - cy));
    if (f2 <= 0) continue;
    const fov = 2 * Math.atan((L / 2) / Math.sqrt(f2)) / DEG;
    if (fov >= 45 && fov <= 110) fEst.push(Math.sqrt(f2));
  }
  const fAuto = fEst.length ? median(fEst) : null;
  if (opt.lensMode === 'auto' && fAuto) f = fAuto;
  if (opt.horizon == null && !level) { pitch = pitchFromPosts(px, f, ccx, h / 2); horizonSource = 'pitch'; }

  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const ray = (u, v) => {
    const x = (u - ccx) / f, y = (cy - v) / f, z = -1;
    return [x, y * cosP - z * sinP, y * sinP + z * cosP];
  };

  // Unit-height pass (camera 1 above the floor), then scale.
  function pass(maxUnits) {
    const floor = px.map((p) => {
      const d = ray(p.fu, p.fv);
      let P, capped = false;
      if (d[1] < -1e-6) {
        const t = -1 / d[1];
        P = [d[0] * t, -1, d[2] * t];
        const rho = Math.hypot(P[0], P[2]);
        if (rho > maxUnits) { P = [P[0] / rho * maxUnits, -1, P[2] / rho * maxUnits]; capped = true; }
      } else {
        const hl = Math.hypot(d[0], d[2]) || 1;
        P = [d[0] / hl * maxUnits, -1, d[2] / hl * maxUnits]; capped = true;
      }
      return { P, capped };
    });
    const ceil = px.map((p, i) => {
      const d = ray(p.cu, p.cv);
      const P = floor[i].P;
      let yc = NaN;
      if (p.edge) {
        // Edge post: top dot lies on the wall plane of its one wall.
        const j = i === 0 ? 1 : i - 1;
        const A = floor[i].P, B = floor[j] ? floor[j].P : null;
        if (B) {
          const nx = -(B[2] - A[2]), nz = B[0] - A[0];
          const den = nx * d[0] + nz * d[2];
          if (Math.abs(den) > 1e-9) {
            const t = (nx * A[0] + nz * A[2]) / den;
            if (t > 0) yc = t * d[1];
          }
        }
      }
      if (!(yc > 0)) {
        const hh = d[0] * d[0] + d[2] * d[2];
        const t = hh > 1e-12 ? (d[0] * P[0] + d[2] * P[2]) / hh : -1;
        if (t > 0) yc = t * d[1];
      }
      return yc > 0.05 && yc < 20 ? yc : NaN;
    });
    const onCeiling = ceil.filter((v, i) => isFinite(v) && !px[i].top);
    const any = ceil.filter((v) => isFinite(v));
    let H, roomH, scale;
    if (opt.ceilingMode && onCeiling.length) {
      H = opt.ceilingH / (1 + median(onCeiling)); roomH = opt.ceilingH; scale = 'ceiling';
    } else {
      H = opt.camH;
      const m = onCeiling.length ? median(onCeiling) : any.length ? median(any) : 1.8;
      roomH = H * (1 + m);
      if (!onCeiling.length) roomH = Math.max(roomH, 2.4);
      scale = 'camera';
    }
    H = clamp(H, 0.3, 3.5);
    return { floor, ceil, H, roomH, scale, noCeiling: !onCeiling.length };
  }
  let r = pass(MAX_DIST / 1.5);
  r = pass(MAX_DIST / r.H);
  const H = r.H, roomH = Math.max(r.roomH, H + 0.3);
  const yF = -H, yC = roomH - H;

  const F = r.floor.map((fp) => [fp.P[0] * H, fp.P[2] * H]);   // [x, z] in metres
  const walls = [];
  for (let j = 0; j < n - 1; j++) {
    const A = F[j], B = F[j + 1];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const t = len > 1e-6 ? [(B[0] - A[0]) / len, (B[1] - A[1]) / len] : [1, 0];
    let nrm = [-t[1], t[0]];
    if (-(nrm[0] * A[0] + nrm[1] * A[1]) < 0) nrm = [-nrm[0], -nrm[1]];
    walls.push({
      i: j, A, B, len, t, n: nrm, dist: Math.abs(nrm[0] * A[0] + nrm[1] * A[1]),
      partial: !!(px[j].edge || px[j + 1].edge), facing: nrm[1]
    });
  }
  let mainWall = 0, best = -Infinity;
  walls.forEach((wl) => { const sc = wl.len * Math.max(0.15, wl.facing); if (wl.len > 0.3 && sc > best) { best = sc; mainWall = wl.i; } });

  // Friendly nudges: one per dot, in plain words.
  const nudges = [];
  const nudge = (post, end, text) => { if (!nudges.some((q) => q.post === post && q.end === end)) nudges.push({ post, end, text }); };
  px.forEach((p, i) => {
    if (r.floor[i].capped) nudge(i, 'floor', 'Move me down to the floor');
    if (p.fv < p.cv - 4) nudge(i, 'floor', 'Move me below the top dot');
  });
  walls.forEach((wl) => {
    const far = Math.hypot(...F[wl.i]) > Math.hypot(...F[wl.i + 1]) ? wl.i : wl.i + 1;
    if (wl.dist > 10 || wl.len > 10) nudge(far, 'floor', 'Move me down to the floor');
    if (!wl.partial && wl.len < 0.8) nudge(wl.i + 1, 'floor', 'Slide me to the corner');
  });
  const firstTop = px.findIndex((p) => !p.edge && !p.top);
  const topDot = firstTop >= 0 ? firstTop : 0;
  if (r.scale === 'ceiling' && (H < 0.45 || H > 2.4)) nudge(topDot, 'ceil', 'Move me to the ceiling line');
  if (r.scale === 'camera' && (roomH > 4.6 || roomH < 2.0) && !r.noCeiling) nudge(topDot, 'ceil', 'Move me to the ceiling line');

  // Closure behind the camera so reflections have a room to show.
  const maxDepth = Math.max(1.5, ...F.map((p) => -p[1]));
  const Zf = Math.max(1.2, 0.45 * maxDepth);
  function closure(end, inner, isEdge, sideSign) {
    const out = [];
    if (isEdge && inner) {
      let dx = end[0] - inner[0], dz = end[1] - inner[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      if (dz > 0.2) {
        const tz = (Zf - end[1]) / dz;
        const t = Math.min(tz, Math.max(2, l));
        out.push([end[0] + dx * t, end[1] + dz * t]);
      }
    }
    const last = out.length ? out[out.length - 1] : end;
    let x = last[0];
    if (sideSign < 0) x = Math.min(x, -0.6); else x = Math.max(x, 0.6);
    if (last[1] < Zf - 1e-3 || x !== last[0]) out.push([x, Zf]);
    return out;
  }
  const leftClose = closure(F[0], F[1], !!px[0].edge, -1).reverse();     // ordered toward F[0]
  const rightClose = closure(F[n - 1], F[n - 2], !!px[n - 1].edge, 1);   // ordered away from F[n-1]
  const poly = [...leftClose, ...F, ...rightClose];
  const segs = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fIdx = k - leftClose.length;
    let kind = 'closure', wallIndex = -1;
    if (fIdx >= 0 && fIdx < n - 1) { kind = 'wall'; wallIndex = fIdx; }
    if (k === poly.length - 1) kind = 'front';
    segs.push({ a, b, kind, wallIndex });
  }

  const xs = F.map((p) => p[0]);
  return {
    w, h, f, cx: ccx, cy, pitch, horizonSource, fAuto, fManual,
    lensDeg: 2 * Math.atan((L / 2) / f) / DEG, lensAutoDeg: fAuto ? 2 * Math.atan((L / 2) / fAuto) / DEG : null,
    H, roomH, yF, yC, scale: r.scale, noCeiling: r.noCeiling,
    F, walls, mainWall, poly, segs, maxDepth, Zf, nudges,
    capped: r.floor.map((x) => x.capped),
    size: { width: Math.max(...xs) - Math.min(...xs), depth: maxDepth }
  };
}

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

let renderer, scene, camera, controls, roomMaterial, photoTexture;
const roomGroup = new THREE.Group();
let wallMeshes = [];
let mirror = null;
let needsRender = true;
let rafId = 0;
let lastGoodCam = new THREE.Vector3();

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x26201b, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Your room in 3D with the mirror. Drag the mirror to move it, drag the room to look around, tap a wall to move the mirror there.');
  canvas.style.touchAction = 'none';
  el.viewport.prepend(canvas);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showCover('The 3D view stopped', 'Refresh the page to carry on.');
  });

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(2.5, 3.5, 2);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xfff8ee, 0x8a7560, 0.35));
  scene.add(roomGroup);

  camera = new THREE.PerspectiveCamera(50, 1, 0.03, 120);
  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !reduceMotion.matches;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener('change', () => { needsRender = true; });
  reduceMotion.addEventListener?.('change', () => { controls.enableDamping = !reduceMotion.matches; });

  roomMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: null },
      fpx: { value: 1000 }, iw: { value: 1600 }, ih: { value: 1200 }, pcx: { value: 800 }, pcy: { value: 600 },
      cosP: { value: 1 }, sinP: { value: 0 }, maxDepth: { value: 6 }
    },
    vertexShader: /* glsl */`
      attribute vec3 aSample;
      attribute float aShade;
      varying vec3 vSample;
      varying float vShade;
      void main() {
        vSample = aSample;
        vShade = aShade;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform float fpx, iw, ih, pcx, pcy, cosP, sinP, maxDepth;
      varying vec3 vSample;
      varying float vShade;

      // World -> original camera (pitched about X, zero roll).
      vec3 toCam(vec3 p) { return vec3(p.x, p.y * cosP + p.z * sinP, -p.y * sinP + p.z * cosP); }
      vec2 uvOf(vec3 p) {
        vec3 c = toCam(p);
        float iz = 1.0 / max(-c.z, 1e-4);
        return vec2((pcx + fpx * c.x * iz) / iw, 1.0 - (pcy - fpx * c.y * iz) / ih);
      }
      bool covered(vec3 p) {
        if (toCam(p).z > -0.05) return false;
        vec2 uv = uvOf(p);
        return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
      }
      // o folded back and forth inside 0..L, so it never runs off the room.
      float foldRange(float o, float L) { float m = mod(o, 2.0 * L); return L - abs(L - m); }

      void main() {
        vec3 p = vSample;
        float shade = vShade;
        if (!covered(p)) {
          // Not in the photo (beside, below or behind the camera): slide the point deeper along the
          // room (same floor, wall or ceiling) to where the photo first sees it, mirrored about there.
          float lo = 0.3, hi = maxDepth, need = maxDepth;
          if (covered(vec3(p.x, p.y, -hi))) {
            for (int i = 0; i < 12; i++) {
              float mid = 0.5 * (lo + hi);
              if (covered(vec3(p.x, p.y, -mid))) hi = mid; else lo = mid;
            }
            need = hi;
          }
          float d0 = -p.z;
          if (d0 < need) p.z = -(need + foldRange(need - d0, max(maxDepth - need, 0.3)));
          shade *= 0.92;
        }
        vec2 uv = uvOf(p);
        uv = 1.0 - abs(1.0 - abs(uv));
        uv = clamp(uv, vec2(0.0005), vec2(0.9995));
        gl_FragColor = vec4(texture2D(map, uv).rgb * shade, 1.0);
        #include <colorspace_fragment>
      }`
  });

  new ResizeObserver(() => resize()).observe(el.viewport);
  resize();
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else startLoop(); });
  startLoop();
}

function viewSize() { return { w: Math.max(1, el.viewport.clientWidth), h: Math.max(1, el.viewport.clientHeight) }; }
function reflectorSize() {
  const { w, h } = viewSize();
  const pr = renderer.getPixelRatio();
  return { w: Math.min(2048, Math.round(w * pr)), h: Math.min(2048, Math.round(h * pr)) };
}

function resize() {
  if (renderer) {
    const { w, h } = viewSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    fitCameraLens();
    if (mirror) { const rs = reflectorSize(); mirror.reflector.getRenderTarget().setSize(rs.w, rs.h); }
    needsRender = true;
  }
  if (state.step === 2) layoutEditor();
}

// Match the 3D camera's lens to the photo: the photo "covers" the viewport, eye level where it was.
function fitCameraLens() {
  if (!camera) return;
  const { w, h } = viewSize();
  const aspect = w / h;
  const L = state.layout;
  let tanVc = 0.5, shiftY = 0;
  if (L) {
    const tanHp = (L.w / 2) / L.f, tanVp = (L.h / 2) / L.f;
    tanVc = aspect >= L.w / L.h ? tanHp / aspect : tanVp;
    shiftY = ((L.cy - L.h / 2) / L.f) / tanVc;
  }
  camera.aspect = aspect;
  camera.fov = 2 * Math.atan(tanVc) / DEG;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = shiftY;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function resetView() {
  const L = state.layout;
  if (!L || !controls) return;
  const dist = clamp(L.walls[L.mainWall] ? L.walls[L.mainWall].dist : 4, 1.5, MAX_DIST);
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  controls.target.set(0, Math.sin(L.pitch) * dist, -Math.cos(L.pitch) * dist);
  const polar0 = Math.PI / 2 + L.pitch;
  controls.minPolarAngle = clamp(polar0 - 25 * DEG, 0.1, Math.PI - 0.1);
  controls.maxPolarAngle = clamp(polar0 + 25 * DEG, 0.1, Math.PI - 0.1);
  controls.minAzimuthAngle = -40 * DEG;
  controls.maxAzimuthAngle = 40 * DEG;
  controls.minDistance = Math.min(0.8, dist * 0.5);
  controls.maxDistance = dist + L.Zf * 0.85;
  fitCameraLens();
  controls.update();
  lastGoodCam.set(0, 0, 0);
  needsRender = true;
}

function insidePoly(x, z, poly, margin) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (!inside) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < margin) return false;
  }
  return true;
}

// Keep the camera inside the room so the view stays plausible.
function clampCamera() {
  const L = state.layout;
  if (!L) return;
  const p = camera.position;
  p.y = clamp(p.y, L.yF + 0.3, L.yC - 0.15);
  if (insidePoly(p.x, p.z, L.poly, 0.2)) lastGoodCam.copy(p);
  else { p.x = lastGoodCam.x; p.z = lastGoodCam.z; }
  camera.lookAt(controls.target);
}

function frame() {
  rafId = requestAnimationFrame(frame);
  if (state.step === 2 || !state.layout || !roomMaterial.uniforms.map.value) return;
  const moved = controls.update();
  if (moved) clampCamera();
  if (moved || needsRender) { renderer.render(scene, camera); needsRender = false; }
}
function startLoop() { if (!rafId && renderer) { needsRender = true; rafId = requestAnimationFrame(frame); } }
function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

// ---------------------------------------------------------------------------
// Room meshes
// ---------------------------------------------------------------------------

function surfaceMesh(tris, samples, shade) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.setAttribute('aSample', new THREE.Float32BufferAttribute(samples || tris, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(new Array(tris.length / 3).fill(shade), 1));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, roomMaterial);
}
function quad(a, b, y0, y1) {
  return [a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]];
}

function buildRoom() {
  const L = state.layout;
  roomGroup.children.slice().forEach((m) => { roomGroup.remove(m); m.geometry.dispose(); });
  wallMeshes = [];
  if (!L) return;
  const u = roomMaterial.uniforms;
  u.fpx.value = L.f; u.iw.value = L.w; u.ih.value = L.h; u.pcx.value = L.cx; u.pcy.value = L.cy;
  u.cosP.value = Math.cos(L.pitch); u.sinP.value = Math.sin(L.pitch); u.maxDepth.value = L.maxDepth;

  const main = L.walls[L.mainWall];
  for (const s of L.segs) {
    const tris = quad(s.a, s.b, L.yF, L.yC);
    let mesh;
    if (s.kind === 'front' && main) {
      // Behind the photographer: the facing wall, as if reflected through the camera plane.
      const samples = quad(main.A, main.B, L.yF, L.yC);
      mesh = surfaceMesh(tris, samples, 0.92);
    } else {
      mesh = surfaceMesh(tris, null, 1);
    }
    if (s.kind === 'wall') { mesh.userData.wall = s.wallIndex; wallMeshes.push(mesh); }
    roomGroup.add(mesh);
  }
  const contour = L.poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const floor = [], ceil = [];
  for (const f of faces) for (const k of f) {
    floor.push(L.poly[k][0], L.yF, L.poly[k][1]);
    ceil.push(L.poly[k][0], L.yC, L.poly[k][1]);
  }
  roomGroup.add(surfaceMesh(floor, null, 1), surfaceMesh(ceil, null, 1));
  needsRender = true;
}

// ---------------------------------------------------------------------------
// Mirror shapes
// ---------------------------------------------------------------------------

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
function insetPoints(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
    return new THREE.Vector2(p.x - (ty / len) * d, p.y + (tx / len) * d);
  });
}
const wavyCache = new Map();
function wavyPts(def) {
  if (!wavyCache.has(def.id)) wavyCache.set(def.id, wavyBase(def.w, def.h));
  return wavyCache.get(def.id);
}
function shapeFor(def, inset = 0) {
  const w = def.w, h = def.h;
  const s = new THREE.Shape();
  if (def.shape === 'arch') {
    const R = w / 2, r = R - inset, cy = h / 2 - R;
    s.moveTo(-r, -h / 2 + inset); s.lineTo(r, -h / 2 + inset); s.lineTo(r, cy);
    s.absarc(0, cy, r, 0, Math.PI, false); s.lineTo(-r, -h / 2 + inset);
  } else if (def.shape === 'circle') {
    s.absarc(0, 0, w / 2 - inset, 0, Math.PI * 2, false);
  } else if (def.shape === 'rect') {
    const x = w / 2 - inset, y = h / 2 - inset;
    s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y);
  } else {
    s.setFromPoints(inset ? insetPoints(wavyPts(def), inset) : wavyPts(def));
    s.closePath();
  }
  return s;
}

function shadowTexture(def, margin, blurM, kind) {
  const W = def.w + margin * 2, H = kind === 'floor' ? def._floorDepth + margin * 2 : def.h + margin * 2;
  const cw = 160, ch = Math.round(clamp(cw * H / W, 32, 512));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  const k = cw / W, off = cw * 3;
  ctx.shadowColor = '#fff'; ctx.shadowBlur = Math.max(2, blurM * k); ctx.shadowOffsetX = off;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (kind === 'floor') ctx.rect(margin * k - off, margin * k, def.w * k, def._floorDepth * k);
  else {
    shapeFor(def, 0).getPoints(64).forEach((p, i) => {
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
  const { tex, W, H } = shadowTexture(def, kind === 'floor' ? 0.12 : 0.1, kind === 'floor' ? 0.08 : 0.05, kind);
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
    if (o.material) { if (o.material.alphaMap) o.material.alphaMap.dispose(); o.material.dispose(); }
  });
  mirror = null;
}

function buildMirror() {
  if (!renderer) return;
  disposeMirror();
  const def = mirrorDef();
  const mount = new THREE.Group(), tilt = new THREE.Group();
  mount.add(tilt);
  const pickables = [];
  let glassZ;
  if (def.frame > 0) {
    const outer = shapeFor(def, 0);
    outer.holes.push(shapeFor(def, def.frame));
    const geo = new THREE.ExtrudeGeometry(outer, {
      depth: def.depth - 0.004, curveSegments: 72, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 3
    });
    geo.translate(0, 0, 0.002);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: BRASS, metalness: 1, roughness: 0.28, envMapIntensity: 0.8 }));
    tilt.add(m); pickables.push(m);
    glassZ = def.depth - 0.009;
  } else {
    const ring = shapeFor(def, 0);
    ring.holes.push(shapeFor(def, 0.012));
    const geo = new THREE.ExtrudeGeometry(ring, {
      depth: 0.003, curveSegments: 64, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0035, bevelSegments: 3
    });
    geo.translate(0, 0, 0.0015);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xdfe3e1, metalness: 0.65, roughness: 0.14, emissive: 0x3a3e3d, envMapIntensity: 1.3 }));
    tilt.add(m); pickables.push(m);
    glassZ = 0.0042;
  }
  const rs = reflectorSize();
  const reflector = new Reflector(new THREE.ShapeGeometry(shapeFor(def, def.frame > 0 ? def.frame - 0.003 : 0.0105), 72), {
    textureWidth: rs.w, textureHeight: rs.h, color: 0xb9bcba, clipBias: 0.003
  });
  reflector.position.z = glassZ;
  tilt.add(reflector); pickables.push(reflector);

  const wallShadow = shadowMesh(def, 'wall', 0.4);
  mount.add(wallShadow);
  def._floorDepth = def.h * Math.sin(LEAN) + def.depth + 0.04;
  const floorShadow = shadowMesh(def, 'floor', 0.7);
  floorShadow.rotation.x = -Math.PI / 2;
  mount.add(floorShadow);
  scene.add(mount);
  mirror = { def, mount, tilt, reflector, pickables, wallShadow, floorShadow };
  placeMirror();
}

function currentWall() {
  const L = state.layout;
  if (!L || !L.walls.length) return null;
  state.mirrorWall = clamp(state.mirrorWall, 0, L.walls.length - 1);
  return L.walls[state.mirrorWall];
}

function fits(wall, def) { return wall && wall.len >= def.w + 0.08; }

// Pick the wall and spot for the current mirror (sample presets, else the wall facing the camera).
function defaultPlacement() {
  const L = state.layout, def = mirrorDef();
  if (!L) return;
  let spot = null;
  if (state.source !== 'upload') spot = isLeaning() ? state.preset.floorSpot : state.preset.spot;
  let wi = spot && L.walls[spot.wall] ? spot.wall : L.mainWall;
  if (!fits(L.walls[wi], def)) {
    const alt = L.walls.map((w) => w.i).filter((i) => fits(L.walls[i], def)).sort((a, b) => L.walls[b].len - L.walls[a].len)[0];
    if (alt != null) wi = alt;
  }
  state.mirrorWall = wi;
  const frac = spot && spot.wall === wi ? spot.frac : 0.5;
  state.place = { s: frac * L.walls[wi].len, h: isLeaning() ? def.h / 2 : def.hangH };
}

function clampPlacement() {
  const def = mirrorDef(), L = state.layout, wl = currentWall();
  const m = 0.03;
  const sMin = def.w / 2 + m, sMax = wl.len - def.w / 2 - m;
  state.place.s = sMin <= sMax ? clamp(state.place.s, sMin, sMax) : wl.len / 2;
  const hMin = def.h / 2 + 0.01, hMax = L.roomH - def.h / 2 - 0.02;
  state.place.h = hMin <= hMax ? clamp(state.place.h, hMin, hMax) : L.roomH / 2;
}

const _basis = new THREE.Matrix4();
function placeMirror() {
  if (!mirror || !state.layout) return;
  const wl = currentWall();
  if (!wl) return;
  const def = mirror.def, L = state.layout;
  clampPlacement();
  mirror.mount.position.set(wl.A[0] + wl.t[0] * state.place.s, L.yF, wl.A[1] + wl.t[1] * state.place.s);
  const nz = new THREE.Vector3(wl.n[0], 0, wl.n[1]);
  const nx = new THREE.Vector3(wl.n[1], 0, -wl.n[0]);
  _basis.makeBasis(nx, new THREE.Vector3(0, 1, 0), nz);
  mirror.mount.quaternion.setFromRotationMatrix(_basis);

  const lean = isLeaning(), th = lean ? LEAN : 0;
  const cy = lean ? (def.h / 2) * Math.cos(th) + 0.002 : state.place.h;
  const cz = lean ? STANDOFF + (def.h / 2) * Math.sin(th) : STANDOFF;
  mirror.tilt.position.set(0, cy, cz);
  mirror.tilt.rotation.set(-th, 0, 0);
  mirror.wallShadow.position.set(0, cy - (lean ? 0.03 : 0.018), 0.003);
  mirror.wallShadow.material.opacity = lean ? 0.2 : 0.4;
  mirror.floorShadow.visible = lean;
  mirror.floorShadow.position.set(0, 0.003, def._floorDepth / 2);
  needsRender = true;
}

// ---------------------------------------------------------------------------
// 3D pointer: drag the mirror, tap a wall
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null;
let tap = null;

function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function hitMirror(e) {
  if (!mirror) return false;
  setRay(e);
  return raycaster.intersectObjects(mirror.pickables, false).length > 0;
}
function hitWall(e) {
  setRay(e);
  const hit = raycaster.intersectObjects(wallMeshes, false)[0];
  return hit ? { wall: hit.object.userData.wall, point: hit.point } : null;
}
function wallCoords(wl, p) {
  return { s: (p.x - wl.A[0]) * wl.t[0] + (p.z - wl.A[1]) * wl.t[1], h: p.y - state.layout.yF };
}
function planeHit(e, wl) {
  setRay(e);
  const plane = new THREE.Plane(new THREE.Vector3(wl.n[0], 0, wl.n[1]), -(wl.n[0] * wl.A[0] + wl.n[1] * wl.A[1]));
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, p) ? p : null;
}

function moveMirrorToWall(wallIdx, point) {
  const def = mirrorDef(), wl = state.layout.walls[wallIdx];
  if (!fits(wl, def)) return false;
  state.mirrorWall = wallIdx;
  const c = wallCoords(wl, point);
  state.place.s = c.s;
  if (!isLeaning()) state.place.h = c.h;
  placeMirror();
  return true;
}

function initPointer() {
  const canvas = renderer.domElement;
  el.viewport.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas || state.step === 2 || drag || e.button > 0) return;
    hideCoach();
    if (!hitMirror(e)) {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    const wl = currentWall();
    const p = planeHit(e, wl);
    if (!p) return;
    const c = wallCoords(wl, p);
    drag = { id: e.pointerId, offS: state.place.s - c.s, offH: state.place.h - c.h };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    el.viewport.classList.add('is-dragging');
    e.preventDefault();
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      // Over another wall? Hop onto it (that's how you move the mirror round a corner).
      const hw = hitWall(e);
      if (hw && hw.wall !== state.mirrorWall && moveMirrorToWall(hw.wall, hw.point)) {
        drag.offS = 0;
        if (!isLeaning()) drag.offH = 0;
        return;
      }
      const wl = currentWall();
      const p = planeHit(e, wl);
      if (!p) return;
      const c = wallCoords(wl, p);
      state.place.s = c.s + drag.offS;
      if (!isLeaning()) state.place.h = c.h + drag.offH;
      placeMirror();
      return;
    }
    if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
    if (e.pointerType === 'mouse' && !e.buttons) canvas.style.cursor = hitMirror(e) ? 'grab' : '';
  });
  const end = (e) => {
    if (tap && e.pointerId === tap.id) {
      const quick = performance.now() - tap.t < 500;
      tap = null;
      if (quick && e.type === 'pointerup' && mirror) {
        const hw = hitWall(e);
        if (hw) moveMirrorToWall(hw.wall, hw.point);
      }
    }
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    controls.enabled = true;
    el.viewport.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function showCoach() {
  if (storageGet('mh-viz-coach') === '1' || !renderer) return;
  el.coach.hidden = false;
}
function hideCoach() {
  if (el.coach.hidden) return;
  el.coach.hidden = true;
  storageSet('mh-viz-coach', '1');
}

// ---------------------------------------------------------------------------
// Solve + rebuild
// ---------------------------------------------------------------------------

function solve() {
  if (!state.photo) return null;
  state.layout = solveLayout(state.photo, state.posts, {
    lens: state.lens, lensMode: state.lensMode, horizon: state.horizon,
    ceilingMode: state.ceilingMode, ceilingH: state.ceilingH, camH: state.camH
  });
  updateRoomText();
  return state.layout;
}

function rebuild3D(resetPlacement) {
  if (!state.layout || !renderer) return;
  buildRoom();
  if (resetPlacement || !mirror) defaultPlacement();
  if (!mirror) buildMirror(); else placeMirror();
  resetView();
}

const half = (x) => {
  const v = Math.round(x * 2) / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
function updateRoomText() {
  const L = state.layout;
  if (!L) return;
  el.roomLine.innerHTML = L.nudges.length
    ? 'Nearly there. Move the dot with the note.'
    : `Room about <strong>${half(Math.max(1, L.size.width))} × ${half(Math.max(1, L.size.depth))} m</strong>`;
  const lens = L.lensAutoDeg && state.lensMode === 'auto' ? `Lens auto ${Math.round(L.lensAutoDeg)}°` : `Lens ${Math.round(L.lensDeg)}°`;
  const main = L.walls[L.mainWall];
  el.techLine.textContent = `${lens} · Tilt ${Math.round(L.pitch / DEG)}° · Camera ${L.H.toFixed(2)} m up · Ceiling ${L.roomH.toFixed(2)} m` +
    (main ? ` · Facing wall ${main.len.toFixed(1)} m wide, ${main.dist.toFixed(1)} m away` : '');
  el.lensOut.textContent = `${Math.round(L.lensDeg)}°`;
  el.lensAuto.textContent = L.lensAutoDeg ? `Auto ${Math.round(L.lensAutoDeg)}°` : 'Auto';
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
  try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { src = await blobToImage(blob); }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  if (!w0 || !h0) throw new Error('decode');
  const k = Math.min(1, 2048 / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * k); canvas.height = Math.round(h0 * k);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  return { canvas, w: canvas.width, h: canvas.height };
}

function usePhoto(photo, source) {
  state.photo = photo;
  state.source = source;
  const preset = SAMPLES[source];
  state.preset = preset || null;
  state.posts = preset ? preset.posts.map((p) => ({ ...p })) : layoutPreset('three');
  state.horizon = preset ? preset.horizon : null;
  state.lens = preset ? preset.lens : DEFAULT_LENS;
  state.lensMode = preset ? 'manual' : 'auto';
  history.length = 0;
  syncSettingsUi();
  if (renderer) {
    if (photoTexture) photoTexture.dispose();
    photoTexture = new THREE.CanvasTexture(photo.canvas);
    photoTexture.colorSpace = THREE.SRGBColorSpace;
    photoTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    photoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    roomMaterial.uniforms.map.value = photoTexture;
  }
  solve();
  if (renderer) {
    if (state.mirrorWall == null) state.mirrorWall = 0;
    rebuild3D(true);
    el.cover.hidden = true;
  }
  document.querySelectorAll('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === source)));
}

async function fetchPhoto(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error('missing');
  return decodePhoto(await res.blob());
}

async function loadSample(key, nextStep) {
  setMsg('');
  try {
    usePhoto(await fetchPhoto(SAMPLES[key].src), key);
    if (nextStep) goStep(nextStep);
  } catch (e) {
    setMsg("That sample room isn't ready yet. Try your own photo.", true);
    if (renderer && !state.photo) showCover('No room yet', 'Take or pick a photo of your room.');
  }
}

function looksLikeHeic(file) { return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || ''); }

async function loadFile(file) {
  if (!file) return;
  const heic = looksLikeHeic(file);
  if (!heic && file.type && !file.type.startsWith('image/')) { setMsg("That isn't a photo. Try another one.", true); return; }
  setMsg('Opening your photo…');
  try {
    usePhoto(await decodePhoto(file), 'upload');
    setMsg('');
    goStep(2);
  } catch (e) {
    setMsg(heic
      ? "This phone photo is in HEIC format, which this browser can't open. Pick it again and choose JPEG, or set Camera › Formats › Most Compatible."
      : "We couldn't open that photo. Try another one.", true);
  }
}

function initPhotoInputs() {
  [el.photoInput, el.cameraInput].forEach((input) => input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.value = '';
    loadFile(f);
  }));
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => loadSample(b.dataset.sample, 3)));
  [el.viewport, el.card].forEach((t) => {
    t.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      el.libraryBtn.classList.add('is-over');
    });
    t.addEventListener('dragleave', () => el.libraryBtn.classList.remove('is-over'));
    t.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      el.libraryBtn.classList.remove('is-over');
      loadFile(e.dataTransfer.files[0]);
    });
  });
}

// ---------------------------------------------------------------------------
// Step 2: the corner editor
// ---------------------------------------------------------------------------

const view = { s: 1, s0: 1, ox: 0, oy: 0 };
const history = [];
let selectedPost = -1;
let editorSize = { w: 1, h: 1 };

const toScreen = (u, v) => [view.ox + u * state.photo.w * view.s, view.oy + v * state.photo.h * view.s];
const toImage = (x, y) => [(x - view.ox) / (state.photo.w * view.s), (y - view.oy) / (state.photo.h * view.s)];

function fitView() {
  const { w, h } = editorSize;
  const pad = 30;
  const s0 = Math.min((w - pad * 2) / state.photo.w, (h - pad * 2) / state.photo.h);
  view.s0 = view.s = s0;
  view.ox = (w - state.photo.w * s0) / 2;
  view.oy = (h - state.photo.h * s0) / 2;
}

function layoutEditor() {
  if (!state.photo || el.editor.hidden) return;
  const w = el.editor.clientWidth, h = el.editor.clientHeight;
  const resized = w !== editorSize.w || h !== editorSize.h;
  editorSize = { w, h };
  if (resized || view.s0 === 1) fitView();
  drawEditor();
}

function clampView() {
  const { w, h } = editorSize;
  const iw = state.photo.w * view.s, ih = state.photo.h * view.s;
  view.ox = iw <= w ? (w - iw) / 2 : clamp(view.ox, w - iw - 40, 40);
  view.oy = ih <= h ? (h - ih) / 2 : clamp(view.oy, h - ih - 40, 40);
}
function zoomAt(mx, my, k) {
  const ns = clamp(view.s * k, view.s0, view.s0 * 5);
  k = ns / view.s;
  view.ox = mx - (mx - view.ox) * k;
  view.oy = my - (my - view.oy) * k;
  view.s = ns;
  clampView();
  drawEditor();
}

function drawEditor() {
  if (!state.photo || el.editor.hidden) return;
  const { w, h } = editorSize;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = el.editorCanvas;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.photo.canvas, view.ox, view.oy, state.photo.w * view.s, state.photo.h * view.s);
  el.fit.hidden = view.s <= view.s0 * 1.01;

  const P = state.posts;
  const fl = P.map((p) => toScreen(p.fx, p.fy)), cl = P.map((p) => toScreen(p.cx, p.cy));
  const pts = (arr) => arr.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  let svg = '';
  for (let j = 0; j < P.length - 1; j++) {
    const fill = j % 2 ? 'rgba(255,253,249,0.13)' : 'rgba(227,201,143,0.2)';
    svg += `<polygon class="wall-fill" fill="${fill}" points="${pts([fl[j], fl[j + 1], cl[j + 1], cl[j]])}"/>`;
  }
  P.forEach((p, i) => { svg += `<line class="post-line" x1="${fl[i][0]}" y1="${fl[i][1]}" x2="${cl[i][0]}" y2="${cl[i][1]}"/>`; });
  svg += `<polyline class="ceil-line" points="${pts(cl)}"/><polyline class="floor-line" points="${pts(fl)}"/>`;
  for (let j = 0; j < P.length - 1; j++) {
    const mx = (fl[j][0] + fl[j + 1][0] + cl[j][0] + cl[j + 1][0]) / 4, my = (fl[j][1] + fl[j + 1][1] + cl[j][1] + cl[j + 1][1]) / 4;
    svg += `<circle class="wall-num" cx="${mx}" cy="${my}" r="13"/><text class="wall-num-text" x="${mx}" y="${my}">${j + 1}</text>`;
  }
  if (state.horizon != null) {
    const y = toScreen(0, state.horizon)[1];
    svg += `<line class="eye-line" x1="${view.ox}" y1="${y}" x2="${view.ox + state.photo.w * view.s}" y2="${y}"/>`;
  }
  el.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  el.svg.innerHTML = svg;

  // Dots
  const want = P.length * 2 + (state.horizon != null ? 1 : 0);
  if (el.dotLayer.children.length !== want) renderDots();
  const nud = state.layout ? state.layout.nudges : [];
  P.forEach((p, i) => {
    const f = el.dotLayer.querySelector(`[data-post="${i}"][data-end="floor"]`);
    const t = el.dotLayer.querySelector(`[data-post="${i}"][data-end="ceil"]`);
    f.style.left = `${fl[i][0]}px`; f.style.top = `${fl[i][1]}px`;
    t.style.left = `${cl[i][0]}px`; t.style.top = `${cl[i][1]}px`;
    f.classList.toggle('warn', nud.some((q) => q.post === i && q.end === 'floor'));
    t.classList.toggle('warn', nud.some((q) => q.post === i && q.end === 'ceil'));
  });
  const eye = el.dotLayer.querySelector('[data-end="eye"]');
  if (eye) {
    const [x, y] = toScreen(0.5, state.horizon);
    eye.style.left = `${x}px`; eye.style.top = `${y}px`;
  }
  // Nudges (one at a time keeps it calm)
  el.nudgeLayer.innerHTML = '';
  const n0 = nud[0];
  if (n0 && !activeDrag) {
    const q = n0.end === 'floor' ? fl[n0.post] : cl[n0.post];
    const b = document.createElement('div');
    b.className = 'nudge' + (q[1] < 90 ? ' below' : '');
    b.textContent = n0.text;
    b.style.left = `${clamp(q[0], 100, w - 100)}px`;
    b.style.top = `${q[1]}px`;
    el.nudgeLayer.appendChild(b);
  }
  // Hand hint on the first corner's floor dot until the first drag
  const hintPost = P.findIndex((p) => !p.edge);
  el.hand.hidden = state.touched || hintPost < 0 || !!n0;
  if (!el.hand.hidden) { el.hand.style.left = `${fl[hintPost][0]}px`; el.hand.style.top = `${fl[hintPost][1]}px`; }

  el.undo.disabled = !history.length;
  el.addCorner.disabled = P.length >= 6;
  el.removeCorner.disabled = !P.some((p) => !p.edge) || P.length <= 2;
}

function postName(i) {
  const p = state.posts[i];
  if (p.edge === 'l') return 'Left edge';
  if (p.edge === 'r') return 'Right edge';
  return `Corner ${state.posts.slice(0, i).filter((q) => !q.edge).length + 1}`;
}

function renderDots() {
  let html = '';
  state.posts.forEach((p, i) => {
    html += `<button type="button" class="dot" data-post="${i}" data-end="floor" aria-label="${postName(i)}, floor dot. Arrow keys move it."></button>`;
    html += `<button type="button" class="dot ceil" data-post="${i}" data-end="ceil" aria-label="${postName(i)}, top dot. Arrow keys move it."></button>`;
  });
  if (state.horizon != null) html += '<button type="button" class="dot eye-dot" data-end="eye" aria-label="Eye level line. Up and down arrows move it."><span>Eye level</span></button>';
  el.dotLayer.innerHTML = html;
}

function snapshot() {
  history.push(JSON.stringify({ posts: state.posts, horizon: state.horizon }));
  if (history.length > 60) history.shift();
}
function undo() {
  const prev = history.pop();
  if (!prev) return;
  const s = JSON.parse(prev);
  state.posts = s.posts; state.horizon = s.horizon;
  syncSettingsUi();
  onPostsChanged(true);
}

function onPostsChanged(structural) {
  if (structural) renderDots();
  solve();
  drawEditor();
}

function setDot(i, end, u, v) {
  const p = state.posts[i];
  u = clamp(u, 0, 1); v = clamp(v, 0, 1);
  if (p.edge) u = p.edge === 'l' ? 0 : 1;
  else {
    // Keep corners in left-to-right order.
    const lo = i > 0 ? Math.min(state.posts[i - 1].fx, state.posts[i - 1].cx) + 0.01 : 0;
    const hi = i < state.posts.length - 1 ? Math.max(state.posts[i + 1].fx, state.posts[i + 1].cx) - 0.01 : 1;
    u = clamp(u, lo, hi);
  }
  if (end === 'floor') { p.fx = u; p.fy = v; } else { p.cx = u; p.cy = v < 0.012 ? 0 : v; }
}

let activeDrag = null;
const pointers = new Map();
let pinch = null;

function showLoupe(x, y, u, v) {
  const lp = el.loupe, size = 112;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (lp.width !== size * dpr) { lp.width = size * dpr; lp.height = size * dpr; }
  lp.hidden = false;
  const above = y - 128 > 0;
  lp.style.left = `${clamp(x - size / 2, 4, editorSize.w - size - 4)}px`;
  lp.style.top = `${above ? y - 128 - size / 2 + 20 : y + 60}px`;
  const ctx = lp.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#191613'; ctx.fillRect(0, 0, size, size);
  const zoom = 2.5 * view.s;                                 // screen px per image px in the loupe
  const sw = size / zoom;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.photo.canvas, u * state.photo.w - sw / 2, v * state.photo.h - sw / 2, sw, sw, 0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,253,249,0.95)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(size / 2, 14); ctx.lineTo(size / 2, size / 2 - 7); ctx.moveTo(size / 2, size / 2 + 7); ctx.lineTo(size / 2, size - 14);
  ctx.moveTo(14, size / 2); ctx.lineTo(size / 2 - 7, size / 2); ctx.moveTo(size / 2 + 7, size / 2); ctx.lineTo(size - 14, size / 2); ctx.stroke();
  ctx.strokeStyle = '#E3C98F'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function localPoint(e) {
  const r = el.editor.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function initEditor() {
  el.editor.addEventListener('pointerdown', (e) => {
    const dot = e.target.closest('.dot');
    const [x, y] = localPoint(e);
    if (dot) {
      e.preventDefault();
      snapshot();
      const end = dot.dataset.end;
      const i = end === 'eye' ? -1 : +dot.dataset.post;
      const cur = end === 'eye' ? toScreen(0.5, state.horizon)
        : end === 'floor' ? toScreen(state.posts[i].fx, state.posts[i].fy) : toScreen(state.posts[i].cx, state.posts[i].cy);
      activeDrag = { id: e.pointerId, i, end, dx: cur[0] - x, dy: cur[1] - y, dot };
      if (i >= 0) selectedPost = i;
      dot.classList.add('active');
      dot.setPointerCapture(e.pointerId);
      dot.focus({ preventScroll: true });
      state.touched = true;
      return;
    }
    // Background: pan when zoomed in, pinch with two fingers.
    pointers.set(e.pointerId, [x, y]);
    el.editor.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    }
  });
  el.editor.addEventListener('pointermove', (e) => {
    const [x, y] = localPoint(e);
    if (activeDrag && e.pointerId === activeDrag.id) {
      const [u, v] = toImage(x + activeDrag.dx, y + activeDrag.dy);
      if (activeDrag.end === 'eye') state.horizon = clamp(v, 0.1, 0.9);
      else setDot(activeDrag.i, activeDrag.end, u, v);
      onPostsChanged(false);
      const p = state.posts[activeDrag.i];
      if (activeDrag.end !== 'eye') {
        const uu = activeDrag.end === 'floor' ? p.fx : p.cx, vv = activeDrag.end === 'floor' ? p.fy : p.cy;
        const [sx, sy] = toScreen(uu, vv);
        showLoupe(sx, sy, uu, vv);
      }
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [x, y]);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      view.ox += mx - pinch.mx; view.oy += my - pinch.my;
      zoomAt(mx, my, d / pinch.d);
      pinch = { d, mx, my };
    } else if (pointers.size === 1 && view.s > view.s0 * 1.01) {
      view.ox += x - prev[0]; view.oy += y - prev[1];
      clampView(); drawEditor();
    }
  });
  const end = (e) => {
    if (activeDrag && e.pointerId === activeDrag.id) {
      activeDrag.dot.classList.remove('active');
      activeDrag = null;
      el.loupe.hidden = true;
      drawEditor();
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  el.editor.addEventListener('pointerup', end);
  el.editor.addEventListener('pointercancel', end);
  el.editor.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = localPoint(e);
    zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  el.fit.addEventListener('click', () => { fitView(); drawEditor(); });

  el.editor.addEventListener('keydown', (e) => {
    const dot = e.target.closest('.dot');
    if (!dot) return;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    snapshot();
    state.touched = true;
    const step = e.shiftKey ? 0.02 : 0.004;
    if (dot.dataset.end === 'eye') state.horizon = clamp(state.horizon + d[1] * step, 0.1, 0.9);
    else {
      const i = +dot.dataset.post, p = state.posts[i];
      selectedPost = i;
      const floor = dot.dataset.end === 'floor';
      setDot(i, dot.dataset.end, (floor ? p.fx : p.cx) + d[0] * step, (floor ? p.fy : p.cy) + d[1] * step);
    }
    onPostsChanged(false);
  });

  el.undo.addEventListener('click', undo);
  el.addCorner.addEventListener('click', () => {
    const P = state.posts;
    if (P.length >= 6) return;
    snapshot();
    let j = 0, best = -1;
    for (let k = 0; k < P.length - 1; k++) { const wdt = P[k + 1].fx - P[k].fx; if (wdt > best) { best = wdt; j = k; } }
    const a = P[j], b = P[j + 1];
    P.splice(j + 1, 0, { fx: (a.fx + b.fx) / 2, fy: (a.fy + b.fy) / 2, cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2 });
    selectedPost = j + 1;
    onPostsChanged(true);
  });
  el.removeCorner.addEventListener('click', () => {
    const P = state.posts;
    if (P.length <= 2) return;
    let i = selectedPost >= 0 && selectedPost < P.length && !P[selectedPost].edge ? selectedPost : -1;
    if (i < 0) for (let k = P.length - 1; k >= 0; k--) if (!P[k].edge) { i = k; break; }
    if (i < 0) return;
    snapshot();
    P.splice(i, 1);
    selectedPost = -1;
    onPostsChanged(true);
  });
  document.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => {
    snapshot();
    state.posts = layoutPreset(b.dataset.layout);
    onPostsChanged(true);
  }));
}

// ---------------------------------------------------------------------------
// Settings (ceiling chips + "More settings")
// ---------------------------------------------------------------------------

function syncSettingsUi() {
  document.querySelectorAll('[data-ceiling]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.ceiling - state.ceilingH) < 0.01)));
  el.lens.value = String(Math.round(state.lens));
  el.lensAuto.setAttribute('aria-pressed', String(state.lensMode === 'auto'));
  document.querySelectorAll('[data-lens]').forEach((b) => b.setAttribute('aria-pressed', String(state.lensMode === 'manual' && Math.abs(+b.dataset.lens - state.lens) < 0.5)));
  el.ceilingMode.checked = state.ceilingMode;
  el.heightRow.hidden = state.ceilingMode;
  el.height.value = String(state.camH);
  el.heightOut.textContent = `${state.camH.toFixed(2)} m`;
  el.horizonMode.checked = state.horizon != null;
  el.horizonRow.hidden = state.horizon == null;
  if (state.horizon != null) {
    el.horizonInput.value = String(Math.round((1 - state.horizon) * 200) / 2);
    el.horizonOut.textContent = `${Math.round((1 - state.horizon) * 100)}%`;
  }
}
function settingsChanged(structural) {
  syncSettingsUi();
  solve();
  if (state.step === 2) { if (structural) renderDots(); drawEditor(); } else rebuild3D(false);
}
function initSettings() {
  document.querySelectorAll('[data-ceiling]').forEach((b) => b.addEventListener('click', () => { state.ceilingH = +b.dataset.ceiling; settingsChanged(); }));
  el.lens.addEventListener('input', () => { state.lens = +el.lens.value; state.lensMode = 'manual'; settingsChanged(); });
  el.lensAuto.addEventListener('click', () => { state.lensMode = 'auto'; settingsChanged(); });
  document.querySelectorAll('[data-lens]').forEach((b) => b.addEventListener('click', () => { state.lens = +b.dataset.lens; state.lensMode = 'manual'; settingsChanged(); }));
  el.ceilingMode.addEventListener('change', () => { state.ceilingMode = el.ceilingMode.checked; settingsChanged(); });
  el.height.addEventListener('input', () => { state.camH = +el.height.value; settingsChanged(); });
  el.horizonMode.addEventListener('change', () => {
    state.horizon = el.horizonMode.checked ? (state.layout ? clamp(state.layout.cy / state.layout.h, 0.1, 0.9) : 0.5) : null;
    settingsChanged(true);
  });
  el.horizonInput.addEventListener('input', () => { state.horizon = 1 - +el.horizonInput.value / 100; settingsChanged(); });
}

// ---------------------------------------------------------------------------
// Step 3/4: mirrors
// ---------------------------------------------------------------------------

function shapeIcon(def) {
  const vbW = 100, vbH = 125, pad = 10;
  const k = Math.min((vbW - pad * 2) / def.w, (vbH - pad * 2) / def.h);
  const d = shapeFor(def, 0).getPoints(48).map((p, i) => `${i ? 'L' : 'M'}${(vbW / 2 + p.x * k).toFixed(1)},${(vbH / 2 - p.y * k).toFixed(1)}`).join('') + 'Z';
  const stroke = def.frame > 0 ? '#A8823A' : '#9AA09E';
  return `<svg viewBox="0 0 ${vbW} ${vbH}" aria-hidden="true" focusable="false"><path d="${d}" fill="#E6E9E7" stroke="${stroke}" stroke-width="${def.frame > 0 ? 4 : 2}"/></svg>`;
}
const cm = (m) => Math.round(m * 100);
const dimsText = (def) => `${cm(def.w)} × ${cm(def.h)} cm`;
const picHtml = (def) => (def.slug ? `<img src="/images/products/${def.slug}.jpg" alt="" loading="lazy" data-fallback="${def.id}">` : shapeIcon(def));
function wirePicFallbacks(root) {
  root.querySelectorAll('img[data-fallback]').forEach((img) => img.addEventListener('error', () => {
    const def = MIRRORS.find((m) => m.id === img.dataset.fallback);
    img.replaceWith(document.createRange().createContextualFragment(shapeIcon(def)));
  }, { once: true }));
}

function renderMirrorList() {
  el.mirrorList.innerHTML = MIRRORS.map((def) => `
    <button type="button" class="mirror-card" role="radio" id="mirror-${def.id}" data-mirror="${def.id}"
      aria-checked="${def.id === state.mirrorId}" tabindex="${def.id === state.mirrorId ? 0 : -1}">
      <span class="mirror-pic">${picHtml(def)}</span>
      <span class="mirror-name">${def.name}</span>
      <span class="mirror-meta"><span>${dimsText(def)}</span>${def.soon ? '<span class="soon">Soon</span>' : `<span class="price">${def.price}</span>`}</span>
    </button>`).join('');
  wirePicFallbacks(el.mirrorList);
}

function selectMirror(id, focus) {
  if (id === state.mirrorId && mirror) return;
  state.mirrorId = id;
  if (mirrorDef().floor) state.mount = 'lean';
  syncMirrorUi();
  if (focus) $(`#mirror-${id}`).focus();
  if (!renderer || !state.layout) return;
  const keepWall = state.mirrorWall;
  defaultPlacement();
  if (fits(state.layout.walls[keepWall], mirrorDef()) && state.source === 'upload') state.mirrorWall = keepWall;
  buildMirror();
}

function syncMirrorUi() {
  const def = mirrorDef();
  el.mirrorList.querySelectorAll('[data-mirror]').forEach((b) => {
    const on = b.dataset.mirror === def.id;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  el.chosenPic.innerHTML = picHtml(def);
  wirePicFallbacks(el.chosenPic);
  el.chosenName.textContent = def.name;
  el.chosenMeta.textContent = `${dimsText(def)} · ${def.soon ? 'Coming soon' : def.price}`;
  el.lean.hidden = !def.floor;
  el.lean.setAttribute('aria-checked', String(state.mount === 'lean'));
  el.leanLabel.textContent = state.mount === 'lean' ? 'Leaning on the floor' : 'Hanging on the wall';
  if (def.soon) {
    el.addBtn.removeAttribute('data-add');
    el.addBtn.disabled = true;
    el.addLabel.textContent = 'Coming soon';
  } else {
    el.addBtn.setAttribute('data-add', def.slug);
    el.addBtn.disabled = false;
    el.addLabel.textContent = `Add to bag · ${def.price}`;
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
  el.lean.addEventListener('click', () => {
    state.mount = state.mount === 'lean' ? 'hang' : 'lean';
    const def = mirrorDef();
    state.place.h = state.mount === 'lean' ? def.h / 2 : def.hangH;
    syncMirrorUi();
    placeMirror();
  });
  el.reset.addEventListener('click', () => resetView());
  el.coachOk.addEventListener('click', hideCoach);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function goStep(n) {
  const prev = state.step;
  state.step = n;
  for (let k = 1; k <= 4; k++) $(`#step-${k}`).hidden = k !== n;
  [...el.dots.children].forEach((li, i) => {
    if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    li.classList.toggle('done', i + 1 < n);
  });
  el.back.hidden = n === 1;
  const editing = n === 2;
  el.editor.hidden = !editing;
  el.reset.hidden = editing;
  if (editing) {
    el.coach.hidden = true;
    view.s0 = 1;
    editorSize = { w: 0, h: 0 };
    renderDots();
    requestAnimationFrame(layoutEditor);
  } else if (prev === 2 && renderer) {
    solve();
    rebuild3D(true);
  }
  if (n === 4) showCoach();
  needsRender = true;
  const title = $(`#step-${n}-title`);
  if (prev !== n && title) title.focus({ preventScroll: true });
  // Sheet height changes with the step: keep sizes in sync.
  requestAnimationFrame(() => { resize(); });
}

function initSteps() {
  el.back.addEventListener('click', () => { if (state.step > 1) goStep(state.step - 1); });
  el.looksRight.addEventListener('click', () => goStep(3));
  el.mirrorDone.addEventListener('click', () => goStep(4));
  el.startAgain.addEventListener('click', () => goStep(1));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.step === 2 && !document.querySelector('.cart-drawer.is-open')) goStep(3);
  });
}

function trackHeader() {
  const set = () => document.documentElement.style.setProperty('--hdr', `${el.header.offsetHeight}px`);
  set();
  new ResizeObserver(set).observe(el.header);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  trackHeader();
  initMirrorUi();
  initSettings();
  initEditor();
  initPhotoInputs();
  initSteps();
  syncSettingsUi();

  if (!hasWebGL2()) {
    showCover("3D isn't available here", "This browser has 3D graphics (WebGL) turned off, so we can't show the preview. Try the latest Chrome, Safari, Firefox or Edge.");
    el.reset.hidden = true;
  } else {
    try {
      initThree();
      initPointer();
    } catch (e) {
      renderer = null;
      showCover("3D isn't available here", "We couldn't start 3D graphics in this browser. Try the latest Chrome, Safari, Firefox or Edge.");
    }
  }
  loadSample('living', 0);

  // Small handle for automated checks and debugging.
  window.mhViz = {
    state, solveLayout, goStep,
    get layout() { return state.layout; },
    get camera() { return camera; },
    get controls() { return controls; },
    setPosts(posts) { state.posts = posts.map((p) => ({ ...p })); onPostsChanged(true); },
    mirrorScreenPoint() {
      if (!mirror) return null;
      const v = new THREE.Vector3();
      mirror.reflector.getWorldPosition(v);
      v.project(camera);
      const b = renderer.domElement.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    worldToScreen(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const b = renderer.domElement.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    }
  };
}

boot();
