import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }       from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader }   from 'three/addons/shaders/VignetteShader.js';
import { FXAAShader }       from 'three/addons/shaders/FXAAShader.js';

// ── Constants ───────────────────────────────────────────
const CW        = 8;      // corridor width
const CH        = 5;      // corridor height
const HALF_W    = CW / 2; // 4
const SPACING   = 7;      // Z gap between painting pairs
const START_Z   = -4;     // Z of first painting pair
const N_WALL    = 6;      // paintings per wall (12 total)
const P_W       = 2.2;    // painting width
const P_H       = 2.8;    // painting height
const P_Y       = 2.3;    // painting center height
const FR_T      = 0.07;   // frame thickness
const FR_D      = 0.09;   // frame depth
const EYE_Y     = 1.7;
const MOVE_SPD  = 0.07;
const LOOK_SPD  = 0.022;
const MAX_YAW   = Math.PI * 0.42;
const MAX_PITCH = 0.32;   // ~18°

const MIN_CAM_Z = START_Z - (N_WALL - 1) * SPACING - 3; // past last pair
const MAX_CAM_Z = 2;

// ── Mobile detection ────────────────────────────────────
const isMobile = ('ontouchstart' in window) ||
  window.matchMedia('(pointer: coarse)').matches;

// ── DOM ─────────────────────────────────────────────────
const canvas    = document.getElementById('canvas');
const loadingEl = document.getElementById('loading');
const barFill   = document.getElementById('bar-fill');
const barPct    = document.getElementById('bar-pct');
const panel     = document.getElementById('info-panel');
const btnClose  = document.getElementById('btn-close');

// ── Three.js core ────────────────────────────────────────
THREE.Cache.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d2c8);
scene.fog = new THREE.Fog(0xd8d2c8, 28, 52);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, EYE_Y, MAX_CAM_Z);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile,
  powerPreference: 'high-performance',
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ── Post-processing ──────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

if (!isMobile) {
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.25, 0.4, 0.82
  );
  composer.addPass(bloom);
}

const vignette = new ShaderPass(VignetteShader);
vignette.uniforms['offset'].value   = 0.88;
vignette.uniforms['darkness'].value = 0.55;
composer.addPass(vignette);

let fxaaPass;
if (!isMobile) {
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(1 / innerWidth, 1 / innerHeight);
  composer.addPass(fxaaPass);
}

const doRender = () => composer.render();
camera.userData.composer = composer;

// ── Loading manager ──────────────────────────────────────
const manager = new THREE.LoadingManager();
manager.onProgress = (_, loaded, total) => {
  const pct = Math.round((loaded / total) * 100);
  barFill.style.width = pct + '%';
  barPct.textContent  = pct + '%';
};
manager.onLoad = () => {
  setTimeout(() => {
    loadingEl.classList.add('fade');
    loadingEl.addEventListener('transitionend', () => loadingEl.remove(), { once: true });
  }, 400);
};

// ── Lighting ─────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xfff8f0, 0.55));

// Warm entrance fill
const entryLight = new THREE.PointLight(0xfff5e4, 1.2, 10);
entryLight.position.set(0, CH - 0.4, 1);
scene.add(entryLight);

// ── Corridor geometry ────────────────────────────────────
function buildCorridor() {
  const corridorLen = Math.abs(MIN_CAM_Z) + 6;
  const centerZ     = (MAX_CAM_Z + MIN_CAM_Z) / 2;

  const wallMat    = new THREE.MeshBasicMaterial({ color: 0xdcd6cc });
  const floorMat   = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ceilMat    = new THREE.MeshBasicMaterial({ color: 0xd8d2c8 });
  const backMat    = new THREE.MeshBasicMaterial({ color: 0xdcd6cc });

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CW, corridorLen), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, centerZ);
  scene.add(floor);

  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CW, corridorLen), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CH, centerZ);
  scene.add(ceil);

  // left wall  (normal → +X)
  const lWall = new THREE.Mesh(new THREE.PlaneGeometry(corridorLen, CH), wallMat);
  lWall.rotation.y = Math.PI / 2;
  lWall.position.set(-HALF_W, CH / 2, centerZ);
  scene.add(lWall);

  // right wall (normal → -X)
  const rWall = new THREE.Mesh(new THREE.PlaneGeometry(corridorLen, CH), wallMat);
  rWall.rotation.y = -Math.PI / 2;
  rWall.position.set(HALF_W, CH / 2, centerZ);
  scene.add(rWall);

  // back wall  (normal → +Z, faces camera)
  const bWall = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), backMat);
  bWall.position.set(0, CH / 2, MIN_CAM_Z - 2);
  scene.add(bWall);

  return floorMat;
}

// ── Painting factory ─────────────────────────────────────
const frameMat = new THREE.MeshStandardMaterial({
  color: 0x4a3820, roughness: 0.55, metalness: 0.28,
});

function makePainting(texture, side, wallIdx) {
  const group = new THREE.Group();
  const zPos  = START_Z - wallIdx * SPACING;
  const xPos  = side === 'left' ? -(HALF_W - 0.04) : (HALF_W - 0.04);

  // Canvas plane
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(P_W, P_H),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  group.add(painting);

  // Frame — 4 bars around the canvas
  const fw = P_W + FR_T * 2;
  const fh = P_H + FR_T * 2;

  const barH = new THREE.Mesh(new THREE.BoxGeometry(fw, FR_T, FR_D), frameMat);
  const barV = new THREE.Mesh(new THREE.BoxGeometry(FR_T, fh, FR_D), frameMat);

  const top    = barH.clone(); top.position.y    =  P_H / 2 + FR_T / 2;
  const bottom = barH.clone(); bottom.position.y = -(P_H / 2 + FR_T / 2);
  const left   = barV.clone(); left.position.x   = -(P_W / 2 + FR_T / 2);
  const right  = barV.clone(); right.position.x  =  P_W / 2 + FR_T / 2;

  group.add(top, bottom, left, right);

  // Orient against wall
  group.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  group.position.set(xPos, P_Y, zPos);

  // Spotlight aimed at painting center
  const spotX = side === 'left' ? -(HALF_W - 1.8) : (HALF_W - 1.8);
  const spot   = new THREE.SpotLight(0xfff8ec, isMobile ? 1.5 : 2.5, 8, Math.PI / 6, 0.4);
  spot.position.set(spotX, CH - 0.35, zPos);

  const target = new THREE.Object3D();
  target.position.set(xPos, P_Y, zPos);
  scene.add(target);
  spot.target = target;
  scene.add(spot);

  return { group, painting };
}

// ── Input state ──────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true;  e.preventDefault(); });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

let yaw = 0, pitch = 0;
let camZ = MAX_CAM_Z;

// Mouse look (drag)
let dragging   = false;
let lastMX = 0, lastMY = 0;
let dragDX = 0, dragDY = 0;

canvas.addEventListener('mousedown', e => {
  dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  dragDX = 0; dragDY = 0;
});
canvas.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastMX;
  const dy = e.clientY - lastMY;
  dragDX += Math.abs(dx); dragDY += Math.abs(dy);
  yaw   -= dx * 0.003;
  pitch -= dy * 0.003;
  yaw   = Math.max(-MAX_YAW,   Math.min(MAX_YAW,   yaw));
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  lastMX = e.clientX; lastMY = e.clientY;
});
canvas.addEventListener('mouseup',    () => dragging = false);
canvas.addEventListener('mouseleave', () => dragging = false);

// Hover cursor (throttled)
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let   paintingMeshes = [];
let   obraData       = [];
let   lastHover = 0;

window.addEventListener('mousemove', e => {
  if (Date.now() - lastHover < 40) return;
  lastHover = Date.now();
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(paintingMeshes);
  canvas.classList.toggle('hover-painting', hits.length > 0);
});

// Touch look
let touchX0 = 0, touchY0 = 0, touchActive = false;
canvas.addEventListener('touchstart', e => {
  touchX0 = e.touches[0].clientX;
  touchY0 = e.touches[0].clientY;
  touchActive = true;
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  if (!touchActive) return;
  yaw   += (e.touches[0].clientX - touchX0) * 0.004;
  pitch += (e.touches[0].clientY - touchY0) * 0.004;
  yaw   = Math.max(-MAX_YAW,   Math.min(MAX_YAW,   yaw));
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  touchX0 = e.touches[0].clientX;
  touchY0 = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', () => touchActive = false);

// Mobile buttons
const mb = { fwd: false, back: false, left: false, right: false };
function bindBtn(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const on  = () => mb[key] = true;
  const off = () => mb[key] = false;
  el.addEventListener('touchstart', e => { on();  e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend',   off);
  el.addEventListener('mousedown',  on);
  el.addEventListener('mouseup',    off);
}
bindBtn('mc-fwd',  'fwd');
bindBtn('mc-back', 'back');
bindBtn('mc-left', 'left');
bindBtn('mc-right','right');

// ── Info panel ───────────────────────────────────────────
function openPanel(obra) {
  document.getElementById('p-titulo').textContent = obra.titulo;
  document.getElementById('p-autor').textContent  = obra.autor.toUpperCase();
  document.getElementById('p-anio').textContent   = obra.anio;
  document.getElementById('p-desc').textContent   = obra.descripcion;
  panel.classList.add('open');
}
btnClose.addEventListener('click', () => panel.classList.remove('open'));

// Click/tap on painting
function onPick(clientX, clientY) {
  mouse.x =  (clientX / innerWidth)  * 2 - 1;
  mouse.y = -(clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(paintingMeshes);
  if (hits.length > 0) openPanel(obraData[hits[0].object.userData.idx]);
}

canvas.addEventListener('click', e => {
  if (dragDX + dragDY > 6) return; // was a drag, not a click
  onPick(e.clientX, e.clientY);
});

// Touch tap (only if minimal movement)
let tapX = 0, tapY = 0;
canvas.addEventListener('touchstart', e => {
  tapX = e.touches[0].clientX; tapY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', e => {
  const t  = e.changedTouches[0];
  const dx = t.clientX - tapX;
  const dy = t.clientY - tapY;
  if (Math.hypot(dx, dy) < 10) onPick(t.clientX, t.clientY);
});

// ── Update ───────────────────────────────────────────────
function update() {
  if (keys['KeyW'] || keys['ArrowUp']    || mb.fwd)   camZ -= MOVE_SPD;
  if (keys['KeyS'] || keys['ArrowDown']  || mb.back)  camZ += MOVE_SPD;
  if (keys['KeyA'] || keys['ArrowLeft']  || mb.left)  { yaw += LOOK_SPD; }
  if (keys['KeyD'] || keys['ArrowRight'] || mb.right) { yaw -= LOOK_SPD; }

  camZ  = Math.max(MIN_CAM_Z, Math.min(MAX_CAM_Z, camZ));
  yaw   = Math.max(-MAX_YAW,  Math.min(MAX_YAW,   yaw));
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));

  camera.position.z = camZ;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);

  const comp = camera.userData.composer;
  if (comp) {
    comp.setSize(innerWidth, innerHeight);
    if (fxaaPass)
      fxaaPass.uniforms['resolution'].value.set(1 / innerWidth, 1 / innerHeight);
  }
});

// ── Animate ───────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  update();
  doRender();
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  const floorMat = buildCorridor();

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ── Parquet floor texture ───────────────────────────────
  new THREE.TextureLoader(manager).load(
    'texturas/textures/herringbone_parquet_diff_4k.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 28);
      tex.anisotropy = maxAniso;
      floorMat.map = tex;
      floorMat.color.setRGB(1.55, 1.2, 0.9);
      floorMat.needsUpdate = true;
    }
  );


  const res   = await fetch('obras.json');
  const obras = await res.json();

  const loader = new THREE.TextureLoader(manager);

  obras.forEach((obra, i) => {
    const side     = i % 2 === 0 ? 'left' : 'right';
    const wallIdx  = Math.floor(i / 2);

    const texture = loader.load(
      `obras/${encodeURIComponent(obra.imagen)}`,
      tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; },
      undefined,
      () => console.warn('No se pudo cargar:', obra.imagen)
    );

    const { group, painting } = makePainting(texture, side, wallIdx);
    scene.add(group);

    painting.userData.idx = i;
    paintingMeshes.push(painting);
    obraData.push(obra);
  });

  animate();
}

init();
