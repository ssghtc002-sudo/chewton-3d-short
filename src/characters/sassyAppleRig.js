import * as THREE from 'three';

// -----------------------------------------------------------------------------
// Procedural Texture Helpers (browser CanvasTexture with safe Node fallback)
// -----------------------------------------------------------------------------
function makeProceduralTexture(width, height, drawFn, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(repeatX, repeatY);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const data = new Uint8Array(4);
  data[0] = 205;
  data[1] = 35;
  data[2] = 40;
  data[3] = 255;
  const tex = new THREE.DataTexture(data, 1, 1);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createAppleSkinTexture() {
  return makeProceduralTexture(512, 512, (ctx, w, h) => {
    // Rich crimson base gradient (darker russet in stem/calyx basins)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, '#5a1d14');
    grad.addColorStop(0.09, '#a70f1d');
    grad.addColorStop(0.28, '#d91c28');
    grad.addColorStop(0.65, '#c61422');
    grad.addColorStop(0.90, '#9b0d18');
    grad.addColorStop(1.00, '#562115');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Warm Honeycrisp golden-amber blush on side/upper cheek (stays clear of front face center)
    const drawBlushPatch = (cx, cy, rx, ry, innerColor, midColor) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0.0, innerColor);
      rg.addColorStop(0.55, midColor);
      rg.addColorStop(1.0, 'rgba(217, 28, 40, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Place golden blush artfully on cheeks & back-shoulder
    drawBlushPatch(w * 0.22, h * 0.34, 115, 130, 'rgba(248, 198, 72, 0.85)', 'rgba(235, 115, 38, 0.45)');
    drawBlushPatch(w * 0.80, h * 0.42, 95, 115, 'rgba(246, 182, 62, 0.68)', 'rgba(230, 95, 35, 0.35)');
    drawBlushPatch(w * 0.50, h * 0.26, 75, 55, 'rgba(255, 128, 65, 0.28)', 'rgba(255, 80, 45, 0)');

    // Vertical natural orchard striping streaks
    let seed = 1666;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 160; i++) {
      const x = rand() * w;
      const yStart = h * (0.06 + rand() * 0.25);
      const yEnd = h * (0.72 + rand() * 0.22);
      ctx.strokeStyle = rand() > 0.45
        ? 'rgba(255, 205, 110, 0.08)'
        : 'rgba(110, 6, 16, 0.12)';
      ctx.lineWidth = 1.2 + rand() * 3.0;
      ctx.beginPath();
      ctx.moveTo(x, yStart);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 12, h * 0.4, x + (rand() - 0.5) * 12, h * 0.65, x, yEnd);
      ctx.stroke();
    }

    // Fine golden-cream lenticel freckles/speckles
    for (let i = 0; i < 520; i++) {
      const x = rand() * w;
      const y = h * (0.10 + rand() * 0.80);
      const r = 0.8 + rand() * 1.6;
      ctx.fillStyle = rand() > 0.3
        ? 'rgba(255, 232, 168, 0.34)'
        : 'rgba(255, 248, 220, 0.25)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function createStemTexture() {
  return makeProceduralTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#4f2f19');
    grad.addColorStop(0.5, '#6d4425');
    grad.addColorStop(1, '#462916');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(30, 15, 6, 0.35)';
    for (let i = 0; i < 45; i++) {
      const x = (i / 45) * w;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (i % 2 === 0 ? 4 : -4), h);
      ctx.stroke();
    }
  });
}

function createLeafTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5ad145');
    grad.addColorStop(0.5, '#3aa32f');
    grad.addColorStop(1, '#23751e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Central bright midrib vein
    ctx.strokeStyle = '#9be868';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h);
    ctx.lineTo(w * 0.5, 0);
    ctx.stroke();

    // Herringbone lateral leaf veins
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(170, 240, 110, 0.65)';
    for (let i = 1; i <= 7; i++) {
      const y = h * (i / 8);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, y);
      ctx.quadraticCurveTo(w * 0.25, y - 16, 0, y - 34);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w * 0.5, y);
      ctx.quadraticCurveTo(w * 0.75, y - 16, w, y - 34);
      ctx.stroke();
    }
  });
}

function createSassyEyeTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.16, w * 0.5, h * 0.5, w * 0.5);
    edge.addColorStop(0, 'rgba(255,255,255,0)');
    edge.addColorStop(0.75, 'rgba(232,236,245,0.20)');
    edge.addColorStop(1, 'rgba(190,196,214,0.45)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const irisR = w * 0.165;

    // Dark outer iris ring
    ctx.fillStyle = '#183a1d';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 1.07, 0, Math.PI * 2);
    ctx.fill();

    // Vibrant emerald-amber sassy iris
    const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.2, cx, cy, irisR);
    irisGrad.addColorStop(0.0, '#b5e858');
    irisGrad.addColorStop(0.45, '#59b53a');
    irisGrad.addColorStop(1.0, '#1f5e24');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Crisp pupil
    ctx.fillStyle = '#0c0d12';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Big Pixar specular catchlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.arc(cx - irisR * 0.36, cy - irisR * 0.36, irisR * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(cx + irisR * 0.32, cy + irisR * 0.28, irisR * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

// -----------------------------------------------------------------------------
// Custom Sculpted Hero Apple Geometry (~0.172 radius)
// -----------------------------------------------------------------------------
function createAppleBodyGeometry() {
  // Lathe profile from bottom calyx pit up around plump cheeks into deep stem dimple
  const profile = [
    new THREE.Vector2(0.000, -0.122),
    new THREE.Vector2(0.032, -0.140),
    new THREE.Vector2(0.072, -0.162),
    new THREE.Vector2(0.114, -0.148),
    new THREE.Vector2(0.146, -0.100),
    new THREE.Vector2(0.166, -0.040),
    new THREE.Vector2(0.173,  0.025),
    new THREE.Vector2(0.168,  0.088),
    new THREE.Vector2(0.144,  0.142),
    new THREE.Vector2(0.102,  0.168),
    new THREE.Vector2(0.056,  0.155),
    new THREE.Vector2(0.024,  0.126),
    new THREE.Vector2(0.000,  0.105),
  ];

  // Start phi so u=0.5 faces +Z cleanly (LatheGeometry phi=0 is +Z, so phiStart = -PI keeps u=0.5 at +Z!)
  const geo = new THREE.LatheGeometry(profile, 56, -Math.PI, Math.PI * 2);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.001) {
      const theta = Math.atan2(x, z);
      // Natural 5-lobe apple shoulder & bottom dimple silhouette
      const shoulderFactor = Math.exp(-((y - 0.13) ** 2) / 0.004) + Math.exp(-((y + 0.13) ** 2) / 0.004);
      const lobe = 1.0 + (0.028 + shoulderFactor * 0.024) * Math.cos(5 * theta);
      // Slight gentle flatten on front cheek (+Z) so face reads clean from wide angles
      const frontSmooth = z > 0.12 ? 0.985 : 1.0;
      pos.setXYZ(i, x * lobe, y, z * lobe * frontSmooth);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function createLeafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.048, 0.024, 0.058, 0.085, 0.00, 0.138);
  shape.bezierCurveTo(-0.058, 0.085, -0.048, 0.024, 0, 0);

  const geo = new THREE.ShapeGeometry(shape, 16);
  // Normalize UVs cleanly to [0, 1] and bend along Z for organic 3D leaf curl
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const yn = y / 0.138;
    const archZ = Math.sin(yn * Math.PI) * 0.018 - yn * yn * 0.026 + Math.abs(x) * 0.25;
    pos.setZ(i, archZ);
    uv.setXY(i, (x + 0.055) / 0.11, 1.0 - yn);
  }
  geo.computeVertexNormals();
  return geo;
}

// -----------------------------------------------------------------------------
// Expression Targets for Sassy Apple
// -----------------------------------------------------------------------------
const APPLE_EXPRESSIONS = {
  neutral_suspicious: {
    browLY: 0.004, browLTilt: 0.12,
    browRY: 0.012, browRTilt: 0.18,
    upperLidL: -0.14, upperLidR: -0.22,
    lowerLidL: -0.10, lowerLidR: -0.10,
    smile: -0.08, mouthWide: 0.78, openBoost: 0.0, winkR: 0.0,
  },
  squash_boing: {
    browLY: 0.016, browLTilt: 0.25,
    browRY: 0.016, browRTilt: -0.25,
    upperLidL: 0.12, upperLidR: 0.12,
    lowerLidL: 0.04, lowerLidR: 0.04,
    smile: -0.20, mouthWide: 0.68, openBoost: 0.42, winkR: 0.0,
  },
  sassy_smug: {
    browLY: 0.020, browLTilt: 0.18,
    browRY: -0.004, browRTilt: -0.24,
    upperLidL: -0.16, upperLidR: -0.02,
    lowerLidL: -0.12, lowerLidR: -0.06,
    smile: 0.68, mouthWide: 1.04, openBoost: 0.05, winkR: 0.0,
  },
  amused_smirk: {
    browLY: 0.014, browLTilt: 0.14,
    browRY: 0.006, browRTilt: -0.14,
    upperLidL: -0.22, upperLidR: -0.16,
    lowerLidL: -0.12, lowerLidR: -0.10,
    smile: 0.78, mouthWide: 1.08, openBoost: 0.08, winkR: 0.0,
  },
  mischievous_grin: {
    browLY: 0.012, browLTilt: -0.20,
    browRY: 0.018, browRTilt: 0.16,
    upperLidL: -0.26, upperLidR: -0.18,
    lowerLidL: -0.14, lowerLidR: -0.14,
    smile: 0.95, mouthWide: 1.18, openBoost: 0.18, winkR: 0.0,
  },
  scheming_smirk: {
    browLY: 0.008, browLTilt: -0.28,
    browRY: 0.016, browRTilt: 0.22,
    upperLidL: -0.04, upperLidR: 0.02,
    lowerLidL: -0.04, lowerLidR: -0.04,
    smile: 0.86, mouthWide: 1.12, openBoost: 0.06, winkR: 0.0,
  },
  evil_laugh_wink: {
    browLY: 0.022, browLTilt: -0.18,
    browRY: -0.004, browRTilt: 0.12,
    upperLidL: -0.28, upperLidR: 0.96,
    lowerLidL: -0.16, lowerLidR: 0.72,
    smile: 1.05, mouthWide: 1.24, openBoost: 0.42, winkR: 1.0,
  },
  smug_subscribe_grin: {
    browLY: 0.022, browLTilt: 0.14,
    browRY: 0.002, browRTilt: -0.22,
    upperLidL: -0.20, upperLidR: -0.10,
    lowerLidL: -0.14, lowerLidR: -0.08,
    smile: 0.98, mouthWide: 1.20, openBoost: 0.14, winkR: 0.0,
  },
};

// -----------------------------------------------------------------------------
// Main Sassy Apple Rig Factory
// -----------------------------------------------------------------------------
export function createSassyAppleRig() {
  const group = new THREE.Group();
  group.name = 'SassyApple';

  const applePivot = new THREE.Group();
  applePivot.name = 'AppleBodyPivot';
  group.add(applePivot);

  // Procedural Textures & Materials
  const skinTex = createAppleSkinTexture();
  const stemTex = createStemTexture();
  const leafTex = createLeafTexture();
  const eyeTex = createSassyEyeTexture();

  const appleSkinMat = new THREE.MeshPhysicalMaterial({
    map: skinTex,
    roughness: 0.20,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 0.9,
    sheen: 0.25,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0xffbfa0),
    emissive: new THREE.Color(0x3a0603),
    emissiveIntensity: 0.14,
  });

  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xff8c3b,
    transparent: true,
    opacity: 0.0,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const stemMat = new THREE.MeshStandardMaterial({
    map: stemTex,
    roughness: 0.82,
    metalness: 0.02,
  });

  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    roughness: 0.42,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const calyxMat = new THREE.MeshStandardMaterial({
    color: 0x3b2c1a,
    roughness: 0.9,
  });

  const eyeballMat = new THREE.MeshPhysicalMaterial({
    map: eyeTex,
    roughness: 0.06,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  const lidMat = new THREE.MeshPhysicalMaterial({
    color: 0xd01824,
    roughness: 0.24,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(0x3a0603),
    emissiveIntensity: 0.14,
    side: THREE.DoubleSide,
  });

  const darkRimMat = new THREE.MeshStandardMaterial({
    color: 0x260508,
    roughness: 0.55,
  });

  const lipMat = new THREE.MeshPhysicalMaterial({
    color: 0x7d0814,
    roughness: 0.30,
    clearcoat: 0.6,
  });

  const mouthInsideMat = new THREE.MeshStandardMaterial({
    color: 0x230307,
    roughness: 0.88,
  });

  const teethMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.18,
    clearcoat: 0.7,
  });

  const tongueMat = new THREE.MeshStandardMaterial({
    color: 0xee5a75,
    roughness: 0.45,
  });

  // ---------------------------------------------------------------------------
  // Apple Body, Glow Aura, Stem, Leaf, Calyx
  // ---------------------------------------------------------------------------
  const appleBodyGeo = createAppleBodyGeometry();
  const appleBodyMesh = new THREE.Mesh(appleBodyGeo, appleSkinMat);
  appleBodyMesh.castShadow = true;
  appleBodyMesh.receiveShadow = true;
  applePivot.add(appleBodyMesh);

  // Subtle glow aura shell (visible when glowAmount > 0)
  const auraMesh = new THREE.Mesh(appleBodyGeo, auraMat);
  auraMesh.scale.setScalar(1.07);
  auraMesh.visible = false;
  applePivot.add(auraMesh);

  // Curved Woody Stem rising out of top dimple
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.100, 0.0),
    new THREE.Vector3(-0.004, 0.155, 0.003),
    new THREE.Vector3(0.006, 0.205, -0.004),
    new THREE.Vector3(0.020, 0.240, -0.010),
  ]);
  const stemMesh = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 14, 0.0115, 10, false), stemMat);
  stemMesh.castShadow = true;
  applePivot.add(stemMesh);

  // Snapped branch tip cap on top of stem
  const stemTipCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.011, 0.012, 10), stemMat);
  stemTipCap.position.set(0.020, 0.240, -0.010);
  stemTipCap.rotation.z = -0.35;
  applePivot.add(stemTipCap);

  // Vibrant Leaf attached to stem base
  const leafPivot = new THREE.Group();
  leafPivot.position.set(0.006, 0.180, 0.0);
  leafPivot.rotation.set(0.45, 0.35, -0.92);
  applePivot.add(leafPivot);

  const leafMesh = new THREE.Mesh(createLeafGeometry(), leafMat);
  leafMesh.castShadow = true;
  leafPivot.add(leafMesh);

  // Bottom dried calyx sepals
  const calyxGroup = new THREE.Group();
  calyxGroup.position.set(0, -0.126, 0);
  applePivot.add(calyxGroup);
  const sepalGeo = new THREE.ConeGeometry(0.008, 0.022, 5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sepal = new THREE.Mesh(sepalGeo, calyxMat);
    sepal.position.set(Math.cos(a) * 0.012, -0.006, Math.sin(a) * 0.012);
    sepal.rotation.x = Math.PI + Math.sin(a) * 0.55;
    sepal.rotation.z = -Math.cos(a) * 0.55;
    calyxGroup.add(sepal);
  }

  // ---------------------------------------------------------------------------
  // Pop-Out Expressive Cartoon Face (scaled cleanly by faceVisible 0..1)
  // ---------------------------------------------------------------------------
  const faceGroup = new THREE.Group();
  faceGroup.name = 'AppleFace';
  faceGroup.position.set(0, 0.012, 0.158);
  faceGroup.visible = false;
  applePivot.add(faceGroup);

  function buildAppleEye(side) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.056, 0.036, 0.0);
    // Angle eyes slightly outward along front apple curve
    eyeSocket.rotation.y = side * 0.16;
    faceGroup.add(eyeSocket);

    // Dark socket contrast ring
    const socketRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.0355, 0.0038, 10, 26),
      darkRimMat
    );
    socketRim.position.set(0, 0, 0.008);
    eyeSocket.add(socketRim);

    const eyeballPivot = new THREE.Group();
    eyeSocket.add(eyeballPivot);

    const eyeGeo = new THREE.SphereGeometry(0.035, 24, 20);
    eyeGeo.rotateY(-Math.PI / 2);
    const eyeball = new THREE.Mesh(eyeGeo, eyeballMat);
    eyeball.castShadow = true;
    eyeballPivot.add(eyeball);

    // Upper Eyelid + Thick Sassy Lash Line
    const upperLidPivot = new THREE.Group();
    eyeSocket.add(upperLidPivot);

    const upperLidGeo = new THREE.SphereGeometry(0.0378, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const upperLid = new THREE.Mesh(upperLidGeo, lidMat);
    upperLidPivot.add(upperLid);

    const lashArcGeo = new THREE.TorusGeometry(0.0382, 0.0036, 8, 24, Math.PI);
    lashArcGeo.rotateX(Math.PI / 2);
    const lashArc = new THREE.Mesh(lashArcGeo, darkRimMat);
    lashArc.position.set(0, -0.004, 0);
    upperLidPivot.add(lashArc);

    // Sassy winged outer lash flare
    const wingLash = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.018, 6), darkRimMat);
    wingLash.position.set(side * 0.038, -0.001, 0.006);
    wingLash.rotation.z = -side * 1.15;
    upperLidPivot.add(wingLash);

    // Lower Eyelid
    const lowerLidPivot = new THREE.Group();
    eyeSocket.add(lowerLidPivot);

    const lowerLidGeo = new THREE.SphereGeometry(0.0374, 20, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48);
    const lowerLid = new THREE.Mesh(lowerLidGeo, lidMat);
    lowerLidPivot.add(lowerLid);

    return { eyeSocket, eyeballPivot, upperLidPivot, lowerLidPivot };
  }

  const eyeL = buildAppleEye(1);
  const eyeR = buildAppleEye(-1);

  // Expressive 3D Arched Eyebrows
  function buildAppleBrow(side) {
    const browPivot = new THREE.Group();
    browPivot.position.set(side * 0.058, 0.086, 0.022);
    browPivot.rotation.y = side * 0.16;
    faceGroup.add(browPivot);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.030, -0.004, -0.004),
      new THREE.Vector3(-side * 0.004, 0.009, 0.006),
      new THREE.Vector3(side * 0.022, 0.007, 0.003),
      new THREE.Vector3(side * 0.036, -0.007, -0.008),
    ]);
    const browMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.0068, 8, false), darkRimMat);
    browMesh.castShadow = true;
    browPivot.add(browMesh);
    return browPivot;
  }

  const browL = buildAppleBrow(1);
  const browR = buildAppleBrow(-1);

  // Expressive 3D Talking Mouth (positioned cleanly forward of apple front curvature!)
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.048, 0.028);
  faceGroup.add(mouthGroup);

  const mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 14), mouthInsideMat);
  mouthCavity.scale.set(1.0, 0.65, 0.24);
  mouthCavity.position.set(0, 0, -0.012);
  mouthGroup.add(mouthCavity);

  const upperTeeth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.040, 0.040, 0.015, 18, 1, false, -0.88, 1.76),
    teethMat
  );
  upperTeeth.position.set(0, 0.010, -0.030);
  mouthGroup.add(upperTeeth);

  const lowerTeeth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.013, 18, 1, false, -0.82, 1.64),
    teethMat
  );
  lowerTeeth.position.set(0, -0.014, -0.030);
  mouthGroup.add(lowerTeeth);

  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), tongueMat);
  tongue.scale.set(1.15, 0.48, 0.65);
  tongue.position.set(0, -0.012, -0.008);
  mouthGroup.add(tongue);

  // 4-Quadrant Hinged Curved Lips so corners bend smoothly into grins/smirks/frowns
  function buildHalfLip(side, isUpper) {
    const pivot = new THREE.Group();
    const ySign = isUpper ? 1 : -1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0.009),
      new THREE.Vector3(side * 0.022, ySign * 0.002, 0.005),
      new THREE.Vector3(side * 0.046, 0, -0.010),
    ]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0072, 8, false), lipMat);
    pivot.add(mesh);
    mouthGroup.add(pivot);
    return pivot;
  }

  const upperLipL = buildHalfLip(1, true);
  const upperLipR = buildHalfLip(-1, true);
  const lowerLipL = buildHalfLip(1, false);
  const lowerLipR = buildHalfLip(-1, false);

  // ---------------------------------------------------------------------------
  // Pre-allocated Scratch Objects & Animation State (ZERO frame allocs!)
  // ---------------------------------------------------------------------------
  const _worldLook = new THREE.Vector3();
  const _targetLocal = new THREE.Vector3();
  const _eyeWorld = new THREE.Vector3();
  const _emissiveShade = new THREE.Color(0x3a0603);
  const _emissiveGlow = new THREE.Color(0xff4216);

  const curExpr = { ...APPLE_EXPRESSIONS.neutral_suspicious };
  let prevTime = -1;

  function setVec3OrArr(target, val, fallbackX, fallbackY, fallbackZ) {
    if (!val) {
      target.set(fallbackX, fallbackY, fallbackZ);
      return;
    }
    if (Array.isArray(val)) {
      target.set(val[0] ?? fallbackX, val[1] ?? fallbackY, val[2] ?? fallbackZ);
    } else {
      target.set(val.x ?? fallbackX, val.y ?? fallbackY, val.z ?? fallbackZ);
    }
  }

  function setRotOrArr(targetEuler, val) {
    if (!val) {
      targetEuler.set(0, 0, 0);
      return;
    }
    if (Array.isArray(val)) {
      targetEuler.set(val[0] ?? 0, val[1] ?? 0, val[2] ?? 0);
    } else {
      targetEuler.set(val.x ?? 0, val.y ?? 0, val.z ?? 0);
    }
  }

  function updateEyeLook(eye, worldTarget) {
    eye.eyeSocket.updateWorldMatrix(true, false);
    eye.eyeSocket.getWorldPosition(_eyeWorld);
    _targetLocal.copy(worldTarget);
    faceGroup.worldToLocal(_targetLocal);
    _targetLocal.sub(eye.eyeSocket.position);

    const horizDist = Math.max(0.08, Math.hypot(_targetLocal.x, _targetLocal.z));
    let yaw = Math.atan2(_targetLocal.x, Math.max(0.05, _targetLocal.z));
    let pitch = -Math.atan2(_targetLocal.y, horizDist);

    yaw = Math.max(-0.42, Math.min(0.42, yaw));
    pitch = Math.max(-0.34, Math.min(0.32, pitch));
    eye.eyeballPivot.rotation.set(pitch, yaw, 0);
  }

  // ---------------------------------------------------------------------------
  // Public API: getWorldPos & update
  // ---------------------------------------------------------------------------
  function getWorldPos(out = new THREE.Vector3()) {
    applePivot.updateWorldMatrix(true, false);
    return applePivot.getWorldPosition(out);
  }

  function update(t = 0, state = {}) {
    const dt = prevTime < 0 ? 1.0 : t - prevTime;
    const isJump = dt < 0 || dt > 0.25 || prevTime < 0;
    const lerpAlpha = isJump ? 1.0 : 1.0 - Math.exp(-dt * 15.0);
    prevTime = t;

    // 1. Position, Rotation, Scale & Volume-Preserving Squash-and-Stretch
    setVec3OrArr(group.position, state.position, 0, 0, 0);
    setRotOrArr(group.rotation, state.rotation);

    const baseScale = Math.max(0.05, state.scale ?? 1.0);
    group.scale.setScalar(baseScale);

    const squashY = Math.max(0.28, state.squashY ?? 1.0);
    const squashXZ = 1.0 / Math.sqrt(squashY);
    applePivot.scale.set(squashXZ, squashY, squashXZ);

    // Subtle secondary bounce on stem leaf reacting to squash/time
    leafPivot.rotation.x = 0.45 + Math.sin(t * 3.8) * 0.06 + (1.0 - squashY) * 0.55;
    leafPivot.rotation.z = -0.92 + Math.cos(t * 2.9) * 0.05;

    // 2. Glowing Aura & Canopy-Shade Warm Crimson Baseline Emissive
    const glowAmount = Math.max(0, Math.min(1, state.glowAmount ?? 0));
    appleSkinMat.emissive.lerpColors(_emissiveShade, _emissiveGlow, glowAmount);
    appleSkinMat.emissiveIntensity = 0.14 + glowAmount * 0.40;
    if (glowAmount > 0.01) {
      auraMesh.visible = true;
      const pulse = 1.05 + Math.sin(t * 6.0) * 0.025;
      auraMesh.scale.setScalar(pulse + glowAmount * 0.06);
      auraMat.opacity = glowAmount * 0.24;
    } else {
      auraMesh.visible = false;
    }

    // 3. Expression Blending
    const exprKey = state.expression && APPLE_EXPRESSIONS[state.expression]
      ? state.expression
      : 'neutral_suspicious';
    const targetExpr = APPLE_EXPRESSIONS[exprKey];
    for (const k in targetExpr) {
      curExpr[k] += (targetExpr[k] - curExpr[k]) * lerpAlpha;
    }

    // 4. Face Pop-Out Reveal (0 = orchard apple, 1 = expressive cartoon face!)
    const rawFaceVis = typeof state.faceVisible === 'boolean'
      ? (state.faceVisible ? 1 : 0)
      : Math.max(0, Math.min(1, state.faceVisible ?? 0));

    if (rawFaceVis <= 0.002) {
      faceGroup.visible = false;
      return;
    }
    faceGroup.visible = true;
    // Slight bouncy scale ease when popping in
    const faceScale = rawFaceVis < 1.0
      ? rawFaceVis * (1.0 + 0.16 * Math.sin(rawFaceVis * Math.PI))
      : 1.0;
    faceGroup.scale.setScalar(faceScale);

    // 5. Eyelids, Auto-Blink, Cheeky Wink & Eye Tracking
    const blinkCycle = t % 3.2;
    const autoBlink = (blinkCycle > 3.04 && blinkCycle < 3.17)
      ? Math.sin(((blinkCycle - 3.04) / 0.13) * Math.PI)
      : 0;

    // Periodic cheeky wink pulse during smug_subscribe_grin
    const subscribeWink = exprKey === 'smug_subscribe_grin'
      ? Math.max(0, Math.sin((t * 2.2) - 0.5)) > 0.72 ? 0.92 : 0.0
      : 0.0;
    const winkRAmt = Math.max(autoBlink, curExpr.winkR, subscribeWink);

    const upLidL = THREE.MathUtils.lerp(curExpr.upperLidL, 0.96, autoBlink);
    const upLidR = THREE.MathUtils.lerp(curExpr.upperLidR, 0.96, winkRAmt);
    const loLidL = THREE.MathUtils.lerp(curExpr.lowerLidL, 0.72, autoBlink);
    const loLidR = THREE.MathUtils.lerp(curExpr.lowerLidR, 0.74, winkRAmt);

    eyeL.upperLidPivot.rotation.x = -0.34 + upLidL * 0.92;
    eyeR.upperLidPivot.rotation.x = -0.34 + upLidR * 0.92;
    eyeL.lowerLidPivot.rotation.x = 0.24 - loLidL * 0.62;
    eyeR.lowerLidPivot.rotation.x = 0.24 - loLidR * 0.62;

    // Eyebrows
    browL.position.y = 0.086 + curExpr.browLY;
    browR.position.y = 0.086 + curExpr.browRY - winkRAmt * 0.008;
    browL.rotation.z = curExpr.browLTilt;
    browR.rotation.z = curExpr.browRTilt;

    // Look Tracking
    if (state.lookTarget) {
      setVec3OrArr(_worldLook, state.lookTarget, 0, 1.80, 2.0);
    } else {
      _worldLook.set(0, 1.80, 2.0);
    }
    updateEyeLook(eyeL, _worldLook);
    updateEyeLook(eyeR, _worldLook);

    // 6. Articulated Sassy Talking Mouth
    const rawMouth = Math.max(0, Math.min(1, state.mouthOpen ?? 0));
    const laughPulse = exprKey === 'evil_laugh_wink' ? Math.abs(Math.sin(t * 14.0)) * 0.35 : 0;
    const mouthAmt = Math.min(1.0, Math.max(rawMouth, curExpr.openBoost + laughPulse));

    mouthCavity.scale.set(curExpr.mouthWide, 0.08 + mouthAmt * 0.90, 0.24);
    mouthCavity.position.y = -mouthAmt * 0.008;

    const showUpperTeeth = mouthAmt > 0.14 || curExpr.smile > 0.45;
    upperTeeth.visible = showUpperTeeth;
    upperTeeth.position.y = 0.010 - (1 - mouthAmt) * 0.004;
    lowerTeeth.visible = mouthAmt > 0.22;
    lowerTeeth.position.y = -0.008 - mouthAmt * 0.018;
    tongue.visible = mouthAmt > 0.26;
    tongue.position.y = -0.010 - mouthAmt * 0.012;

    // Bend 4 lip quadrants cleanly for smiles, smirks & talking
    const cornerBend = curExpr.smile * 0.26;
    const smirkSkew = (exprKey === 'sassy_smug' || exprKey === 'scheming_smirk') ? 0.12 : 0.0;

    upperLipL.position.y = 0.004 + mouthAmt * 0.006;
    upperLipR.position.y = 0.004 + mouthAmt * 0.006;
    upperLipL.rotation.z = cornerBend * 0.72 + smirkSkew;
    upperLipR.rotation.z = -cornerBend * 0.55 + smirkSkew;

    lowerLipL.position.y = -0.004 - mouthAmt * 0.028;
    lowerLipR.position.y = -0.004 - mouthAmt * 0.028;
    lowerLipL.rotation.z = cornerBend * 0.85 + smirkSkew;
    lowerLipR.rotation.z = -cornerBend * 0.65 + smirkSkew;

    mouthGroup.scale.set(curExpr.mouthWide, 1.0, 1.0);
    mouthGroup.rotation.z = smirkSkew * 0.55;
  }

  return {
    group,
    getWorldPos,
    update,
  };
}
