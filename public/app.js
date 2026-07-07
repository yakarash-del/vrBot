import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ---------- Admin-editable configuration ----------
const CONFIG = await fetch("/api/config")
  .then((r) => r.json())
  .catch(() => ({ avatar: "male", name: "דוד כהן", greeting: "" }));
const FIRST_NAME = (CONFIG.name || "דוד").split(" ")[0];
const IS_FEMALE = CONFIG.avatar === "female";
document.getElementById("header-title").textContent = "שיחה עם " + FIRST_NAME;

// ---------- Renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background:#111;color:#fca5a5;font-size:18px;text-align:center;padding:30px;z-index:100";
  overlay.textContent = "לא ניתן להפעיל גרפיקה תלת-ממדית (WebGL) בדפדפן הזה. נסו דפדפן אחר או בדקו שהאצת חומרה מופעלת.";
  document.body.appendChild(overlay);
  throw err;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
document.getElementById("app").appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1320);

// Image-based lighting for realistic PBR materials
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 50);

// Player rig — the visitor "sits" across the desk from the manager
const rig = new THREE.Group();
rig.position.set(0, 0, 0.25);
camera.position.set(0, 1.45, 0);
rig.add(camera);
scene.add(rig);

const texLoader = new THREE.TextureLoader();

// ---------- Lights ----------
scene.add(new THREE.AmbientLight(0x2c3448, 1.2));

// warm key spotlight over the desk (main shadow caster)
const keyLight = new THREE.SpotLight(0xffe6c4, 55, 12, Math.PI / 3.4, 0.6, 1.6);
keyLight.position.set(0.6, 2.85, -0.7);
keyLight.target.position.set(0, 0.8, -1.7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0004;
keyLight.shadow.radius = 6;
scene.add(keyLight, keyLight.target);

// cool moonlight fill from the window (left)
const windowFill = new THREE.DirectionalLight(0x7ea0e8, 0.9);
windowFill.position.set(-4, 2.4, -0.5);
windowFill.target.position.set(0.5, 1, -1.5);
scene.add(windowFill, windowFill.target);

// warm desk lamp
const deskLampLight = new THREE.PointLight(0xffb45e, 7, 4.5, 1.8);
deskLampLight.position.set(0.92, 1.18, -1.45);
scene.add(deskLampLight);

// gentle rim light behind the manager for separation from the wall
const rimLight = new THREE.PointLight(0xaec6ff, 4, 4, 1.8);
rimLight.position.set(-0.6, 2.1, -2.75);
scene.add(rimLight);

// ---------- Room shell ----------
const ROOM = { w: 6.2, d: 6.2, h: 3 };

// Hardwood floor (PBR)
const woodDiffuse = texLoader.load("textures/hardwood2_diffuse.jpg");
const woodBump = texLoader.load("textures/hardwood2_bump.jpg");
const woodRough = texLoader.load("textures/hardwood2_roughness.jpg");
woodDiffuse.colorSpace = THREE.SRGBColorSpace;
for (const t of [woodDiffuse, woodBump, woodRough]) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.2, 3.2);
  t.anisotropy = 8;
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshStandardMaterial({
    map: woodDiffuse,
    bumpMap: woodBump,
    bumpScale: 0.6,
    roughnessMap: woodRough,
    roughness: 0.75,
    metalness: 0.05,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// area rug under the sitting area
const rug = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 2.6),
  new THREE.MeshStandardMaterial({ color: 0x2b3e5c, roughness: 1 })
);
rug.rotation.x = -Math.PI / 2;
rug.position.set(0, 0.006, -1.1);
rug.receiveShadow = true;
scene.add(rug);
const rugBorder = new THREE.Mesh(
  new THREE.PlaneGeometry(3.55, 2.75),
  new THREE.MeshStandardMaterial({ color: 0x1c2a40, roughness: 1 })
);
rugBorder.rotation.x = -Math.PI / 2;
rugBorder.position.set(0, 0.004, -1.1);
scene.add(rugBorder);

// walls — warm executive paint + dark wood accent wall behind the manager
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 0.95 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.65 });

function makeWall(w, h, x, y, z, ry, mat = wallMat) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  wall.position.set(x, y, z);
  wall.rotation.y = ry;
  wall.receiveShadow = true;
  scene.add(wall);
  return wall;
}
makeWall(ROOM.w, ROOM.h, 0, ROOM.h / 2, -ROOM.d / 2, 0, accentMat); // back (behind manager)
makeWall(ROOM.w, ROOM.h, 0, ROOM.h / 2, ROOM.d / 2, Math.PI);
makeWall(ROOM.d, ROOM.h, ROOM.w / 2, ROOM.h / 2, 0, -Math.PI / 2);
makeWall(ROOM.d, ROOM.h, -ROOM.w / 2, ROOM.h / 2, 0, Math.PI / 2);

// wood slat detail on the accent wall
for (let i = 0; i < 12; i++) {
  const slat = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, ROOM.h, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.55 })
  );
  slat.position.set(-ROOM.w / 2 + 0.35 + i * 0.52, ROOM.h / 2, -ROOM.d / 2 + 0.015);
  scene.add(slat);
}

// baseboards
const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.6 });
for (const [w, x, z, ry] of [
  [ROOM.w, 0, -ROOM.d / 2 + 0.02, 0],
  [ROOM.w, 0, ROOM.d / 2 - 0.02, Math.PI],
  [ROOM.d, ROOM.w / 2 - 0.02, 0, -Math.PI / 2],
  [ROOM.d, -ROOM.w / 2 + 0.02, 0, Math.PI / 2],
]) {
  const bb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.03), baseboardMat);
  bb.position.set(x, 0.06, z);
  bb.rotation.y = ry;
  scene.add(bb);
}

// ceiling with recessed light panel
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 })
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = ROOM.h;
scene.add(ceiling);
const lightPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 1.0),
  new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe9bf, emissiveIntensity: 1.6 })
);
lightPanel.rotation.x = Math.PI / 2;
lightPanel.position.set(0.4, ROOM.h - 0.01, -0.9);
scene.add(lightPanel);

// ---------- Window with night-city view (left wall) ----------
function makeCityTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 640;
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, "#060d24");
  sky.addColorStop(0.55, "#12224d");
  sky.addColorStop(1, "#2a3763");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 640);
  // moon
  ctx.fillStyle = "#f5f0dc";
  ctx.beginPath(); ctx.arc(820, 110, 42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(245,240,220,0.25)";
  ctx.beginPath(); ctx.arc(820, 110, 60, 0, Math.PI * 2); ctx.fill();
  // buildings
  let x = 0;
  while (x < 1024) {
    const bw = 55 + Math.random() * 80;
    const bh = 180 + Math.random() * 280;
    ctx.fillStyle = `rgb(${14 + Math.random() * 10}, ${18 + Math.random() * 12}, ${34 + Math.random() * 16})`;
    ctx.fillRect(x, 640 - bh, bw, bh);
    // lit windows
    for (let wx = x + 8; wx < x + bw - 10; wx += 16) {
      for (let wy = 640 - bh + 12; wy < 620; wy += 22) {
        if (Math.random() < 0.4) {
          ctx.fillStyle = Math.random() < 0.8 ? "rgba(255,224,150,0.9)" : "rgba(160,200,255,0.85)";
          ctx.fillRect(wx, wy, 8, 11);
        }
      }
    }
    x += bw + 6;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const windowGroup = new THREE.Group();
const winFrameMat = new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: 0.5, metalness: 0.2 });
const cityView = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 1.55),
  new THREE.MeshBasicMaterial({ map: makeCityTexture() })
);
cityView.rotation.y = Math.PI / 2;
windowGroup.add(cityView);
// frame
for (const [w, h, y, z] of [
  [2.7, 0.09, 0.82, 0], [2.7, 0.09, -0.82, 0],
]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), winFrameMat);
  bar.position.set(0.01, y, z);
  windowGroup.add(bar);
}
for (const z of [-1.3, 0, 1.3]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.75, 0.09), winFrameMat);
  bar.position.set(0.01, 0, z);
  windowGroup.add(bar);
}
// sill
const sill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 2.8), winFrameMat);
sill.position.set(0.05, -0.9, 0);
windowGroup.add(sill);
windowGroup.position.set(-ROOM.w / 2 + 0.02, 1.75, -0.4);
scene.add(windowGroup);

// ---------- Wall decor ----------
function makeFramedArt(w, h, drawFn) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.4, metalness: 0.3 })
  );
  group.add(frame);
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round((512 * h) / w);
  drawFn(c.getContext("2d"), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
  );
  art.position.z = 0.025;
  group.add(art);
  return group;
}
// abstract art on the right wall
const art1 = makeFramedArt(1.1, 0.75, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1d3557"); g.addColorStop(0.5, "#457b9d"); g.addColorStop(1, "#e63946");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = ["#f1faee", "#a8dadc", "#ffb703"][i % 3];
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 15 + Math.random() * 55, 0, Math.PI * 2);
    ctx.fill();
  }
});
art1.position.set(ROOM.w / 2 - 0.03, 1.75, -0.8);
art1.rotation.y = -Math.PI / 2;
scene.add(art1);

// diploma behind the manager
const diploma = makeFramedArt(0.55, 0.42, (ctx, w, h) => {
  ctx.fillStyle = "#f3ecd9"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#8a6d3b"; ctx.lineWidth = 10; ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = "#3b3428"; ctx.textAlign = "center"; ctx.direction = "rtl";
  ctx.font = "bold 44px Georgia"; ctx.fillText("תעודת הוקרה", w / 2, h * 0.36);
  ctx.font = "26px Georgia"; ctx.fillText("מנהל השנה", w / 2, h * 0.58);
  ctx.font = "20px Georgia"; ctx.fillText("★ ★ ★", w / 2, h * 0.78);
});
diploma.position.set(1.35, 2.0, -ROOM.d / 2 + 0.05);
scene.add(diploma);

// wall clock (animated hands)
const clockGroup = new THREE.Group();
const clockFace = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.22, 0.03, 40),
  new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.6 })
);
clockFace.rotation.x = Math.PI / 2;
clockGroup.add(clockFace);
const clockRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.22, 0.018, 12, 40),
  new THREE.MeshStandardMaterial({ color: 0x1c1712, metalness: 0.5, roughness: 0.35 })
);
clockGroup.add(clockRim);
const hourHand = new THREE.Mesh(
  new THREE.BoxGeometry(0.02, 0.1, 0.008),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
hourHand.position.z = 0.022;
const minuteHand = new THREE.Mesh(
  new THREE.BoxGeometry(0.014, 0.16, 0.008),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
minuteHand.position.z = 0.028;
hourHand.geometry.translate(0, 0.05, 0);
minuteHand.geometry.translate(0, 0.08, 0);
clockGroup.add(hourHand, minuteHand);
clockGroup.position.set(-1.6, 2.25, -ROOM.d / 2 + 0.06);
scene.add(clockGroup);

// ---------- Furniture ----------
const deskWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.35, metalness: 0.05 });
const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.4, metalness: 0.6 });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1e2229, roughness: 0.55 });

// Executive desk
const desk = new THREE.Group();
const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.055, 1.0), deskWoodMat);
deskTop.position.y = 0.76;
deskTop.castShadow = true;
deskTop.receiveShadow = true;
desk.add(deskTop);
const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.02, 1.04), new THREE.MeshStandardMaterial({ color: 0x332214, roughness: 0.3 }));
deskEdge.position.y = 0.735;
desk.add(deskEdge);
// side panels instead of legs (executive style)
for (const s of [-1, 1]) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.9), deskWoodMat);
  panel.position.set(s * 1.1, 0.37, 0);
  panel.castShadow = true;
  desk.add(panel);
}
const modestyPanel = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.52, 0.04), deskWoodMat);
modestyPanel.position.set(0, 0.46, 0.44);
desk.add(modestyPanel);
// leather desk mat
const deskMat = new THREE.Mesh(
  new THREE.BoxGeometry(0.85, 0.008, 0.55),
  new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.7 })
);
deskMat.position.set(0, 0.792, -0.05);
desk.add(deskMat);
desk.position.set(0, 0, -1.45);
scene.add(desk);

// laptop
const laptop = new THREE.Group();
const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.24), darkMetalMat);
laptop.add(lapBase);
const lapScreen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.01), darkMetalMat);
lapScreen.position.set(0, 0.115, -0.125);
lapScreen.rotation.x = -0.22;
laptop.add(lapScreen);
const lapGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(0.31, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x0c1420, emissive: 0x3a6ea8, emissiveIntensity: 0.7 })
);
lapGlow.position.set(0, 0.115, -0.119);
lapGlow.rotation.x = -0.22;
laptop.add(lapGlow);
laptop.position.set(-0.55, 0.795, -1.35);
laptop.rotation.y = 0.35;
scene.add(laptop);

// desk lamp (brass)
const lampGroup = new THREE.Group();
const brassMat = new THREE.MeshStandardMaterial({ color: 0x8a6b35, metalness: 0.85, roughness: 0.3 });
const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.025, 24), brassMat);
lampGroup.add(lampBase);
const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 12), brassMat);
lampPole.position.y = 0.18;
lampGroup.add(lampPole);
const lampShade = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.11, 0.12, 24, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x1f5c46, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide })
);
lampShade.position.y = 0.38;
lampGroup.add(lampShade);
const lampBulb = new THREE.Mesh(
  new THREE.SphereGeometry(0.035, 14, 12),
  new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45e, emissiveIntensity: 2.2 })
);
lampBulb.position.y = 0.36;
lampGroup.add(lampBulb);
lampGroup.position.set(0.92, 0.79, -1.5);
scene.add(lampGroup);

// coffee mug + papers
const mug = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.035, 0.095, 20),
  new THREE.MeshStandardMaterial({ color: 0xb43a3a, roughness: 0.35 })
);
mug.position.set(0.42, 0.845, -1.2);
mug.castShadow = true;
scene.add(mug);
const papers = new THREE.Mesh(
  new THREE.BoxGeometry(0.24, 0.006, 0.3),
  new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 })
);
papers.position.set(0.35, 0.795, -1.62);
papers.rotation.y = -0.2;
scene.add(papers);

// name plate
function makeTextTexture(text, w, h, font, bg, fg) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const namePlate = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.08, 0.025),
  [brassMat, brassMat, brassMat, brassMat,
   new THREE.MeshStandardMaterial({
     map: makeTextTexture(CONFIG.name, 512, 100, "bold 54px Georgia", "#2a1d10", "#e8c87a"),
     metalness: 0.4, roughness: 0.35,
   }),
   brassMat]
);
namePlate.position.set(-0.05, 0.835, -1.02);
namePlate.rotation.x = -0.18;
scene.add(namePlate);

// Manager's high-back chair
const chair = new THREE.Group();
const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.52), leatherMat);
seatCushion.position.y = 0.52;
chair.add(seatCushion);
const backCushion = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.85, 0.12), leatherMat);
backCushion.position.set(0, 1.0, -0.26);
backCushion.rotation.x = -0.06;
chair.add(backCushion);
const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), leatherMat);
headrest.position.set(0, 1.5, -0.28);
chair.add(headrest);
for (const s of [-1, 1]) {
  const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.4), darkMetalMat);
  armrest.position.set(s * 0.33, 0.72, -0.02);
  chair.add(armrest);
}
const chairPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12), darkMetalMat);
chairPost.position.y = 0.26;
chair.add(chairPost);
for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2;
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.3), darkMetalMat);
  leg.position.set(Math.sin(a) * 0.16, 0.03, Math.cos(a) * 0.16);
  leg.rotation.y = a;
  chair.add(leg);
}
chair.position.set(0, 0, -2.1);
chair.castShadow = true;
scene.add(chair);

// Visitor chair (behind the camera — you're sitting on it)
const visitorChair = chair.clone();
visitorChair.scale.set(0.9, 0.85, 0.9);
visitorChair.position.set(0, 0, 0.35);
visitorChair.rotation.y = Math.PI;
scene.add(visitorChair);

// Bookshelf
const shelf = new THREE.Group();
const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.5 });
const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.25, 0.32), shelfMat);
shelfBody.position.y = 1.125;
shelfBody.castShadow = true;
shelf.add(shelfBody);
const bookColors = [0x9e3b3b, 0x35608f, 0x3f8f63, 0x9e8a3b, 0x6d4a94, 0xb06a35, 0x4a4a55, 0x7d3558];
for (let row = 0; row < 4; row++) {
  let x = -0.6;
  while (x < 0.58) {
    const bw = 0.045 + Math.random() * 0.06;
    const bh = 0.26 + Math.random() * 0.1;
    const lean = Math.random() < 0.08;
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(bw, bh, 0.2),
      new THREE.MeshStandardMaterial({
        color: bookColors[Math.floor(Math.random() * bookColors.length)],
        roughness: 0.75,
      })
    );
    book.position.set(x + bw / 2, 0.32 + row * 0.52 + bh / 2, 0.08);
    if (lean) book.rotation.z = 0.12;
    shelf.add(book);
    x += bw + 0.012;
  }
}
shelf.position.set(2.0, 0, -2.85);
scene.add(shelf);

// Plant
const plantGroup = new THREE.Group();
const pot = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.12, 0.26, 20),
  new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.8 })
);
pot.position.y = 0.13;
pot.castShadow = true;
plantGroup.add(pot);
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6e3e, roughness: 0.8, side: THREE.DoubleSide });
for (let i = 0; i < 12; i++) {
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.55 + Math.random() * 0.25, 8), leafMat);
  const a = (i / 12) * Math.PI * 2;
  const tilt = 0.3 + Math.random() * 0.35;
  leaf.position.set(Math.cos(a) * 0.08, 0.45, Math.sin(a) * 0.08);
  leaf.rotation.set(Math.cos(a) * tilt, 0, Math.sin(a) * -tilt);
  plantGroup.add(leaf);
}
plantGroup.position.set(-2.0, 0, -2.6);
scene.add(plantGroup);

// ---------- The Manager: realistic Ready Player Me avatar ----------
let avatarHead = null;       // Head bone
let avatarNeck = null;
let avatarSpine = null;
let avatarEyes = [];         // eye bones
let avatarMorphMeshes = [];  // meshes with morph targets
let avatarMixer = null;
let fallbackManager = null;

new GLTFLoader().load(
  IS_FEMALE ? "avatar-female.glb" : "avatar-male.glb",
  (gltf) => {
    const avatar = gltf.scene;
    avatar.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (o.morphTargetDictionary) avatarMorphMeshes.push(o);
      }
    });
    avatarHead = avatar.getObjectByName("Head");
    avatarNeck = avatar.getObjectByName("Neck");
    avatarSpine = avatar.getObjectByName("Spine1") || avatar.getObjectByName("Spine");
    for (const n of ["LeftEye", "RightEye"]) {
      const e = avatar.getObjectByName(n);
      if (e) avatarEyes.push(e);
    }

    // --- Pose: from T-pose to sitting behind the desk ---
    const bone = (n) => avatar.getObjectByName(n);
    // arms down along the body, hands resting toward the desk
    const lArm = bone("LeftArm"), rArm = bone("RightArm");
    const lFore = bone("LeftForeArm"), rFore = bone("RightForeArm");
    if (lArm) lArm.rotation.set(1.18, 0, 0.06);
    if (rArm) rArm.rotation.set(1.26, 0, -0.06);
    if (lFore) lFore.rotation.set(0, 0, 0);
    if (rFore) rFore.rotation.set(0, 0, 0);
    // sit: thighs forward, knees bent (mostly hidden by the desk)
    for (const [up, low, s] of [["LeftUpLeg", "LeftLeg", 1], ["RightUpLeg", "RightLeg", -1]]) {
      const u = bone(up), l = bone(low);
      if (u) { u.rotation.x = -1.45; u.rotation.z = s * 0.08; }
      if (l) { l.rotation.x = 1.35; }
    }
    avatar.updateMatrixWorld(true);

    // position so the head lands at a natural seated height on the chair
    const headWorldY = avatarHead
      ? avatarHead.getWorldPosition(new THREE.Vector3()).y
      : 1.6;
    const targetHeadY = 1.33;
    avatar.position.set(0, targetHeadY - headWorldY, -1.98);
    scene.add(avatar);

    // subtle resting smile
    setMorph("mouthSmile", 0.18);

    if (gltf.animations?.length) {
      avatarMixer = new THREE.AnimationMixer(avatar);
      const idle = gltf.animations[0];
      if (idle) avatarMixer.clipAction(idle).play();
    }
  },
  undefined,
  (err) => {
    console.error("Avatar failed to load, using fallback figure", err);
    fallbackManager = buildFallbackManager();
    scene.add(fallbackManager);
  }
);

function setMorph(name, value) {
  for (const mesh of avatarMorphMeshes) {
    const idx = mesh.morphTargetDictionary?.[name];
    if (idx !== undefined && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[idx] = value;
    }
  }
}

// simple fallback figure if the GLB cannot load
function buildFallbackManager() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x27324a, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a679, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 20), suit);
  torso.position.y = 1.0;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 20), skin);
  head.position.y = 1.42;
  g.add(head);
  g.position.set(0, 0, -1.95);
  return g;
}

// ---------- 3D Chat panel ----------
const PANEL_W = 1024, PANEL_H = 640;
const panelCanvas = document.createElement("canvas");
panelCanvas.width = PANEL_W;
panelCanvas.height = PANEL_H;
const panelCtx = panelCanvas.getContext("2d");
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const chatPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.15, 0.72),
  new THREE.MeshBasicMaterial({ map: panelTex, transparent: true })
);
chatPanel.position.set(-1.45, 1.72, -1.35);
chatPanel.rotation.y = 0.62;
scene.add(chatPanel);

function wrapLine(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const panelMessages = [];
function drawPanel() {
  const ctx = panelCtx;
  ctx.clearRect(0, 0, PANEL_W, PANEL_H);
  ctx.fillStyle = "rgba(13, 17, 27, 0.9)";
  ctx.beginPath();
  ctx.roundRect(0, 0, PANEL_W, PANEL_H, 30);
  ctx.fill();
  ctx.strokeStyle = "rgba(150, 180, 255, 0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#a9c1ff";
  ctx.font = "bold 38px Arial";
  ctx.fillText("💬 שיחה עם " + FIRST_NAME, PANEL_W - 44, 58);
  ctx.strokeStyle = "rgba(150,180,255,0.25)";
  ctx.beginPath(); ctx.moveTo(40, 84); ctx.lineTo(PANEL_W - 40, 84); ctx.stroke();

  ctx.font = "31px Arial";
  const maxWidth = PANEL_W - 110;
  const rendered = [];
  for (let i = panelMessages.length - 1; i >= 0 && rendered.length < 13; i--) {
    const m = panelMessages[i];
    const prefix = m.who === "user" ? "אתם: " : FIRST_NAME + ": ";
    const lines = wrapLine(ctx, prefix + m.text, maxWidth);
    for (let j = lines.length - 1; j >= 0; j--) {
      rendered.unshift({ text: lines[j], who: m.who });
    }
  }
  let y = 128;
  for (const line of rendered.slice(-13)) {
    ctx.fillStyle = line.who === "user" ? "#9dbdff" : "#a5edbb";
    ctx.fillText(line.text, PANEL_W - 54, y);
    y += 39;
  }
  panelTex.needsUpdate = true;
}
drawPanel();

// ---------- VR preset-question buttons ----------
const PRESETS = [
  `שלום ${FIRST_NAME}, מה שלומך?`,
  "ספרו לי על עצמכם",
  "במה אפשר להתחיל?",
];
const vrButtons = [];
PRESETS.forEach((q, i) => {
  const tex = makeTextTexture(q, 640, 110, "bold 42px Arial", "#20304f", "#dce7ff");
  const btn = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.13, 0.025),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
  );
  btn.position.set(1.35, 1.78 - i * 0.19, -1.3);
  btn.rotation.y = -0.55;
  btn.userData.question = q;
  scene.add(btn);
  vrButtons.push(btn);
});

// ---------- Chat logic ----------
const history = [];
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatMic = document.getElementById("chat-mic");
const chatTts = document.getElementById("chat-tts");
const chatCont = document.getElementById("chat-cont");
let waiting = false;
let talkingTimer = 0;   // fallback mouth animation when TTS is unavailable
let isSpeaking = false; // true while the browser is voicing David's reply

// ---------- Voice output (text-to-speech) ----------
let voiceEnabled = localStorage.getItem("managerVoice") !== "off";
let hebrewVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const hebrew = voices.filter((v) => v.lang?.toLowerCase().startsWith("he"));
  // best-effort gender match by common voice names (Windows: Asaf=male, Hila=female)
  const female = hebrew.filter((v) => /hila|female|woman|נקבה/i.test(v.name));
  const male = hebrew.filter((v) => /asaf|male|man|זכר/i.test(v.name) && !/female|woman/i.test(v.name));
  hebrewVoice = (IS_FEMALE ? female[0] || hebrew[0] : male[0] || hebrew[0]) || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
} else {
  chatTts.style.display = "none";
}

function updateTtsButton() {
  chatTts.textContent = voiceEnabled ? "🔊" : "🔇";
  chatTts.classList.toggle("off", !voiceEnabled);
}
updateTtsButton();
chatTts.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem("managerVoice", voiceEnabled ? "on" : "off");
  if (!voiceEnabled) stopVoice();
  updateTtsButton();
});

let currentAudio = null;

function stopVoice() {
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.pause();
    currentAudio = null;
  }
  isSpeaking = false;
}

// Primary voice: neural TTS generated on the server (works on Quest, supports
// Hebrew / English / Arabic). Falls back to browser speechSynthesis, then to a
// silent mouth animation.
async function speak(text) {
  if (!voiceEnabled) return;
  stopVoice();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("tts " + res.status);
    const url = URL.createObjectURL(await res.blob());
    currentAudio = new Audio(url);
    currentAudio.onplay = () => { isSpeaking = true; };
    currentAudio.onended = () => {
      isSpeaking = false;
      URL.revokeObjectURL(url);
      currentAudio = null;
      autoListen(); // continuous-conversation mode: reopen the mic
    };
    currentAudio.onerror = () => { isSpeaking = false; };
    await currentAudio.play();
  } catch {
    speakBrowser(text);
  }
}

function speakBrowser(text) {
  if (!("speechSynthesis" in window) || !(window.speechSynthesis.getVoices?.() || []).length) {
    talkingTimer = Math.min(7, 1.5 + text.length * 0.045);
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "he-IL";
  if (hebrewVoice) utter.voice = hebrewVoice;
  utter.rate = 1.0;
  utter.pitch = IS_FEMALE ? 1.05 : 0.85;
  utter.onstart = () => { isSpeaking = true; };
  utter.onend = () => {
    isSpeaking = false;
    autoListen();
  };
  utter.onerror = () => {
    isSpeaking = false;
    talkingTimer = Math.min(7, 1.5 + text.length * 0.045);
  };
  window.speechSynthesis.speak(utter);
}

// ---------- Continuous conversation mode ----------
let continuousMode = localStorage.getItem("managerContinuous") === "on";

function updateContButton() {
  chatCont.classList.toggle("off", !continuousMode);
}
updateContButton();
chatCont.addEventListener("click", () => {
  continuousMode = !continuousMode;
  localStorage.setItem("managerContinuous", continuousMode ? "on" : "off");
  updateContButton();
  if (continuousMode && !listening && !waiting && !isSpeaking) autoListen();
});

function autoListen() {
  if (!continuousMode || !HAS_VOICE_INPUT || listening || waiting || document.hidden) return;
  setTimeout(() => {
    if (!continuousMode || listening || waiting || isSpeaking) return;
    startVoiceInput();
  }, 400);
}

// ---------- Voice input ----------
// Two paths: native SpeechRecognition (desktop Chrome/Edge — fast, streaming),
// or MediaRecorder + server-side Whisper (Quest and any other browser).
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const CAN_RECORD = Boolean(navigator.mediaDevices?.getUserMedia);
const HAS_VOICE_INPUT = Boolean(SpeechRec || CAN_RECORD);
let recognition = null;
let listening = false;

// language for native recognition (Whisper auto-detects on its own)
const SR_LANGS = { he: "he-IL", en: "en-US", ar: "ar-SA" };
let srLang = localStorage.getItem("managerLang") || "he";

function setListeningUI(on, label) {
  listening = on;
  chatMic.classList.toggle("listening", on);
  chatInput.placeholder = on ? (label || "מקשיב... דברו עכשיו") : "כתבו הודעה למנהל...";
}

if (SpeechRec) {
  recognition = new SpeechRec();
  recognition.lang = SR_LANGS[srLang] || "he-IL";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let interim = "", final = "";
    for (const result of event.results) {
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    chatInput.value = final || interim;
    if (final.trim()) {
      chatInput.value = "";
      sendMessage(final);
    }
  };
  recognition.onstart = () => setListeningUI(true);
  recognition.onend = () => setListeningUI(false);
  recognition.onerror = (e) => {
    setListeningUI(false);
    if (e.error === "not-allowed") {
      addHtmlMessage("system", "אין הרשאת מיקרופון. אשרו גישה למיקרופון בדפדפן.");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      addHtmlMessage("system", "זיהוי הדיבור נכשל (" + e.error + "). נסו שוב.");
    }
  };
}

// --- Recorder path (Quest): record → auto-stop on silence → Whisper on server ---
let mediaRecorder = null;
let recStream = null;
let vadCtx = null;

async function startRecording() {
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    addHtmlMessage("system", "אין הרשאת מיקרופון. אשרו גישה למיקרופון בדפדפן.");
    return;
  }
  const chunks = [];
  mediaRecorder = new MediaRecorder(recStream);
  mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    cleanupRecording();
    const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
    mediaRecorder = null;
    if (blob.size < 2000) return; // too short — nothing was said
    setListeningUI(false);
    chatInput.placeholder = "מתמלל...";
    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
      const data = await res.json();
      chatInput.placeholder = "כתבו הודעה למנהל...";
      if (!res.ok) {
        addHtmlMessage("system", data.error || "התמלול נכשל.");
      } else if (data.text?.trim()) {
        sendMessage(data.text);
      }
    } catch {
      chatInput.placeholder = "כתבו הודעה למנהל...";
      addHtmlMessage("system", "שגיאת תקשורת בתמלול.");
    }
  };

  // simple voice-activity detection: stop ~1.4s after speech goes quiet
  vadCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = vadCtx.createMediaStreamSource(recStream);
  const analyser = vadCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let spoke = false;
  let quietMs = 0;
  let lastTick = performance.now();
  const startedAt = lastTick;

  const vadTick = () => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    const now = performance.now();
    const dtMs = now - lastTick;
    lastTick = now;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    const rms = Math.sqrt(sum / buf.length);
    if (rms > 0.03) { spoke = true; quietMs = 0; } else { quietMs += dtMs; }
    const tooLong = now - startedAt > 12000;
    const doneTalking = spoke && quietMs > 1400;
    const gaveUp = !spoke && now - startedAt > 6000;
    if (tooLong || doneTalking || gaveUp) {
      if (!spoke) { cleanupRecording(); mediaRecorder = null; setListeningUI(false); return; }
      mediaRecorder.stop();
      return;
    }
    setTimeout(vadTick, 90);
  };

  mediaRecorder.start();
  setListeningUI(true);
  setTimeout(vadTick, 90);
}

function cleanupRecording() {
  recStream?.getTracks().forEach((t) => t.stop());
  recStream = null;
  vadCtx?.close().catch(() => {});
  vadCtx = null;
}

// --- Unified entry points ---
function startVoiceInput() {
  if (listening) return;
  stopVoice(); // don't transcribe the avatar's own voice
  if (recognition) {
    try { recognition.start(); } catch { /* already starting */ }
  } else if (CAN_RECORD) {
    startRecording();
  }
}

function stopVoiceInput() {
  if (recognition && listening) recognition.stop();
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
}

if (HAS_VOICE_INPUT) {
  chatMic.addEventListener("click", () => {
    if (listening) stopVoiceInput();
    else startVoiceInput();
  });
} else {
  chatMic.classList.add("unsupported");
  chatCont.classList.add("unsupported");
}

// --- Recognition-language selector (affects native recognition only) ---
const langSelect = document.getElementById("lang-select");
if (langSelect) {
  langSelect.value = srLang;
  langSelect.addEventListener("change", () => {
    srLang = langSelect.value;
    localStorage.setItem("managerLang", srLang);
    if (recognition) recognition.lang = SR_LANGS[srLang] || "he-IL";
  });
}

// ---------- Opening greeting ----------
let greeted = false;
function greetVisitor() {
  if (greeted) return;
  greeted = true;
  // Not pushed into `history` — the Messages API requires the first turn to be a user turn.
  const greeting =
    CONFIG.greeting || `שלום, ברוכים הבאים! אני ${CONFIG.name}. שבו בנוח - במה אפשר לעזור?`;
  panelMessages.push({ who: "manager", text: greeting });
  addHtmlMessage("manager", greeting);
  drawPanel();
  speak(greeting);
}
// speech synthesis needs a user gesture first — greet on the first interaction
window.addEventListener("pointerdown", greetVisitor, { once: true });
window.addEventListener("keydown", greetVisitor, { once: true });
renderer.xr.addEventListener("sessionstart", greetVisitor);

// 3D mic button inside VR (native recognition or server-side Whisper)
if (HAS_VOICE_INPUT) {
  const micTex = makeTextTexture("🎤 דברו אליי", 640, 110, "bold 46px Arial", "#5c1e1e", "#ffd9d9");
  const micBtn = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.13, 0.025),
    new THREE.MeshStandardMaterial({ map: micTex, roughness: 0.5 })
  );
  micBtn.position.set(1.35, 1.78 - PRESETS.length * 0.19, -1.3);
  micBtn.rotation.y = -0.55;
  micBtn.userData.action = "mic";
  scene.add(micBtn);
  vrButtons.push(micBtn);
}

function activateButton(obj) {
  if (obj.userData.action === "mic") {
    if (listening) stopVoiceInput();
    else startVoiceInput();
    return;
  }
  if (obj.userData.question) sendMessage(obj.userData.question);
}

function addHtmlMessage(who, text) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendMessage(text) {
  text = (text || "").trim();
  if (!text || waiting) return;
  waiting = true;
  chatSend.disabled = true;

  history.push({ role: "user", content: text });
  panelMessages.push({ who: "user", text });
  addHtmlMessage("user", text);
  drawPanel();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    const reply = data.reply || data.error || "מצטער, משהו השתבש.";
    history.push({ role: "assistant", content: reply });
    panelMessages.push({ who: "manager", text: reply });
    addHtmlMessage("manager", reply);
    drawPanel();
    speak(reply);
  } catch (e) {
    addHtmlMessage("system", "שגיאת תקשורת עם השרת.");
  } finally {
    waiting = false;
    chatSend.disabled = false;
    chatInput.focus();
  }
}

chatSend.addEventListener("click", () => { sendMessage(chatInput.value); chatInput.value = ""; });
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { sendMessage(chatInput.value); chatInput.value = ""; }
});

// ---------- VR controllers ----------
const raycaster = new THREE.Raycaster();
const controllerModelFactory = new XRControllerModelFactory();
const tempMatrix = new THREE.Matrix4();

for (const i of [0, 1]) {
  const controller = renderer.xr.getController(i);
  controller.addEventListener("selectstart", () => {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const hits = raycaster.intersectObjects(vrButtons, false);
    if (hits.length > 0) activateButton(hits[0].object);
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5),
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x88aaff }));
  controller.add(line);
  rig.add(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  rig.add(grip);
}

// ---------- Desktop mouse look + click ----------
let isDragging = false, dragMoved = false, prevX = 0, prevY = 0, yaw = 0, pitch = 0;
renderer.domElement.addEventListener("mousedown", (e) => {
  isDragging = true; dragMoved = false; prevX = e.clientX; prevY = e.clientY;
});
window.addEventListener("mouseup", () => { isDragging = false; });
window.addEventListener("mousemove", (e) => {
  if (!isDragging) {
    // hover highlight on the 3D buttons
    if (!renderer.xr.isPresenting) {
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(vrButtons, false);
      setHovered(hits.length > 0 ? hits[0].object : null);
    }
    return;
  }
  dragMoved = true;
  yaw -= (e.clientX - prevX) * 0.004;
  pitch -= (e.clientY - prevY) * 0.004;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  prevX = e.clientX; prevY = e.clientY;
  camera.rotation.set(pitch, yaw, 0, "YXZ");
});
renderer.domElement.addEventListener("click", (e) => {
  if (dragMoved) return;
  const mouse = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(vrButtons, false);
  if (hits.length > 0) activateButton(hits[0].object);
});

// ---------- Button hover highlight ----------
let hoveredBtn = null;
function setHovered(btn) {
  if (hoveredBtn === btn) return;
  if (hoveredBtn) hoveredBtn.material.emissive.setHex(0x000000);
  hoveredBtn = btn;
  if (hoveredBtn) hoveredBtn.material.emissive.setHex(0x2a4a80);
  renderer.domElement.style.cursor = hoveredBtn ? "pointer" : "";
}

// ---------- Animation loop ----------
const clock = new THREE.Clock();
const camWorldPos = new THREE.Vector3();
const headWorldPos = new THREE.Vector3();
let nextBlink = 2 + Math.random() * 3;
let blinkPhase = -1;
// idle gaze wander: occasionally David glances aside, like a real person
let gazeOffset = 0;
let gazeTimer = 5 + Math.random() * 4;

function renderFrame() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if (avatarMixer) avatarMixer.update(dt);

  camera.getWorldPosition(camWorldPos);

  // idle gaze wander — brief sideways glances between interactions
  gazeTimer -= dt;
  const engaged = isSpeaking || listening || waiting || talkingTimer > 0;
  if (gazeTimer <= 0) {
    if (gazeOffset === 0 && !engaged) {
      gazeOffset = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2);
      gazeTimer = 0.8 + Math.random() * 0.9; // glance duration
    } else {
      gazeOffset = 0;
      gazeTimer = 5 + Math.random() * 5; // until the next glance
    }
  }
  if (engaged) gazeOffset = 0; // always face the visitor while interacting

  // head + eyes track the visitor
  if (avatarHead) {
    avatarHead.getWorldPosition(headWorldPos);
    const dir = camWorldPos.clone().sub(headWorldPos);
    let targetYaw = THREE.MathUtils.clamp(Math.atan2(dir.x, dir.z), -0.65, 0.65) + gazeOffset;
    let targetPitch = THREE.MathUtils.clamp(
      -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)),
      -0.35, 0.4
    );
    // gentle nodding while speaking
    if (isSpeaking || talkingTimer > 0) targetPitch += Math.sin(t * 2.3) * 0.03;
    // attentive tilt + slight lean while listening to the visitor
    const targetTilt = listening ? 0.09 : 0;
    if (listening) targetPitch += 0.04;

    avatarHead.rotation.y += (targetYaw - avatarHead.rotation.y) * 0.07;
    avatarHead.rotation.x += (targetPitch - avatarHead.rotation.x) * 0.07;
    avatarHead.rotation.z += (targetTilt - avatarHead.rotation.z) * 0.05;
    if (avatarNeck) {
      avatarNeck.rotation.y = avatarHead.rotation.y * 0.3;
    }
    for (const eye of avatarEyes) {
      eye.rotation.y = targetYaw * 0.25;
    }
  }

  // subtle breathing through the spine
  if (avatarSpine) avatarSpine.rotation.x = Math.sin(t * 1.6) * 0.012;

  // hover highlight for the VR controllers' laser pointers
  if (renderer.xr.isPresenting) {
    let hit = null;
    for (const i of [0, 1]) {
      const controller = renderer.xr.getController(i);
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
      const hits = raycaster.intersectObjects(vrButtons, false);
      if (hits.length > 0) { hit = hits[0].object; break; }
    }
    setHovered(hit);
  }

  // blinking
  nextBlink -= dt;
  if (nextBlink <= 0 && blinkPhase < 0) {
    blinkPhase = 0;
    nextBlink = 2 + Math.random() * 4;
  }
  if (blinkPhase >= 0) {
    blinkPhase += dt * 9;
    const v = blinkPhase < 0.5 ? blinkPhase * 2 : Math.max(0, 2 - blinkPhase * 2);
    setMorph("eyesClosed", v);
    if (blinkPhase >= 1) blinkPhase = -1;
  }

  // talking: animated mouth via morph targets, synced to the voice
  if (talkingTimer > 0) talkingTimer -= dt;
  if (isSpeaking || talkingTimer > 0) {
    const openness =
      0.25 + 0.35 * Math.abs(Math.sin(t * 9.5)) + 0.2 * Math.abs(Math.sin(t * 15.3));
    setMorph("mouthOpen", openness);
    setMorph("mouthSmile", 0.1);
  } else {
    setMorph("mouthOpen", 0);
    setMorph("mouthSmile", 0.18);
  }

  // fallback figure micro-motion
  if (fallbackManager) fallbackManager.scale.y = 1 + Math.sin(t * 1.8) * 0.006;

  // lamp flickers softly while "thinking"
  deskLampLight.intensity = waiting ? 7 + Math.sin(t * 9) * 2.5 : 7;

  // wall clock shows real time
  const now = new Date();
  hourHand.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6);
  minuteHand.rotation.z = -now.getMinutes() * (Math.PI / 30);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(renderFrame);
// Paint the first frame immediately — requestAnimationFrame is suspended in
// hidden/background tabs, so without this the canvas stays black until the
// tab becomes visible.
renderFrame();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderFrame();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
