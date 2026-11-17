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
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const data = new Uint8Array(4);
  data[0] = 200;
  data[1] = 200;
  data[2] = 200;
  data[3] = 255;
  const tex = new THREE.DataTexture(data, 1, 1);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createSkinTexture() {
  return makeProceduralTexture(512, 512, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#f8d9c4');
    base.addColorStop(0.55, '#f4cbb0');
    base.addColorStop(1, '#e8b698');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Warm rosy cheek blushes on left/right front face UV region
    // Sphere UV: u=0.5 is +X? Actually SphereGeometry u=0.25 is +Z or u=0.5 is -X/+X depending on phiStart.
    // Using radial warm patches centered symmetrically around face front (u=0.25/0.75 handled cleanly;
    // since we rotate head mesh or set phiStart, let's match standard SphereGeometry where u=0.25 is +Z when rotated -PI/2).
    const drawBlush = (cx, cy, rx, ry, alpha) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, `rgba(226, 108, 96, ${alpha})`);
      grad.addColorStop(0.6, `rgba(226, 108, 96, ${alpha * 0.45})`);
      grad.addColorStop(1, 'rgba(226, 108, 96, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // With SphereGeometry rotated -PI/2 on Y, front (+Z) sits at u = 0.50!
    drawBlush(w * 0.39, h * 0.54, 48, 36, 0.36);
    drawBlush(w * 0.61, h * 0.54, 48, 36, 0.36);
    // Warm bridge of nose & forehead glow
    drawBlush(w * 0.50, h * 0.49, 26, 32, 0.20);
    drawBlush(w * 0.50, h * 0.34, 64, 34, 0.14);

    // Subtle painterly skin micro-variation
    let seed = 1666;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 650; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 1 + rand() * 3.5;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,240,225,0.06)' : 'rgba(195,120,90,0.045)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function createVelvetTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#6a1023');
    grad.addColorStop(0.5, '#580b1b');
    grad.addColorStop(1, '#440714');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Fine velvet weave & soft fabric nap
    let seed = 421;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? 'rgba(255,180,190,0.04)' : 'rgba(20,0,5,0.06)';
      ctx.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 1400; i++) {
      const x = rand() * w;
      const y = rand() * h;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(165, 38, 62, 0.08)' : 'rgba(30, 3, 10, 0.08)';
      ctx.fillRect(x, y, 2, 3);
    }
  }, { repeatX: 2, repeatY: 2 });
}

function createVelvetBumpTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    let seed = 991;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 2400; i++) {
      const v = Math.floor(110 + rand() * 40);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
  }, { repeatX: 3, repeatY: 3, srgb: false });
}

function createWaistcoatTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#dfb55c');
    grad.addColorStop(0.5, '#c9993c');
    grad.addColorStop(1, '#ab7d28');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle 17th-century damask diamond motif
    ctx.strokeStyle = 'rgba(255, 236, 175, 0.24)';
    ctx.lineWidth = 2;
    const step = 32;
    for (let y = 0; y < h + step; y += step) {
      for (let x = 0; x < w + step; x += step) {
        const ox = ((y / step) % 2) * (step * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + ox, y - 10);
        ctx.lineTo(x + ox + 10, y);
        ctx.lineTo(x + ox, y + 10);
        ctx.lineTo(x + ox - 10, y);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(130, 86, 18, 0.16)';
        ctx.beginPath();
        ctx.arc(x + ox, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeatX: 2, repeatY: 2 });
}

function createWigTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#faf7f0');
    grad.addColorStop(0.6, '#ece5d8');
    grad.addColorStop(1, '#d8cebe');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Fine powdered hair strand streaks
    let seed = 777;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 360; i++) {
      const x = rand() * w;
      ctx.strokeStyle = rand() > 0.45 ? 'rgba(255,255,255,0.35)' : 'rgba(175,162,144,0.22)';
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 14, h * 0.33, x + (rand() - 0.5) * 14, h * 0.66, x, h);
      ctx.stroke();
    }
  }, { repeatX: 2, repeatY: 1 });
}

function createEyeTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    // Glossy bright sclera
    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(0, 0, w, h);

    // Very subtle sclera shading near edges
    const edgeGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.14, w * 0.5, h * 0.5, w * 0.5);
    edgeGrad.addColorStop(0, 'rgba(255,255,255,0)');
    edgeGrad.addColorStop(0.75, 'rgba(232,228,236,0.22)');
    edgeGrad.addColorStop(1, 'rgba(195,188,205,0.48)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, w, h);

    // Iris centered at u=0.5, v=0.5 (when sphere is rotated so u=0.5 faces +Z)
    const cx = w * 0.5;
    const cy = h * 0.5;
    const irisR = w * 0.145;

    // Dark limbal ring
    ctx.fillStyle = '#1b3644';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 1.06, 0, Math.PI * 2);
    ctx.fill();

    // Expressive slate-blue / hazel iris gradient
    const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.25, cx, cy, irisR);
    irisGrad.addColorStop(0, '#5ea0b5');
    irisGrad.addColorStop(0.55, '#3b748c');
    irisGrad.addColorStop(1, '#1f4556');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle golden hazel inner ring & radial iris fibers
    ctx.strokeStyle = 'rgba(180, 224, 232, 0.25)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * irisR * 0.42, cy + Math.sin(a) * irisR * 0.42);
      ctx.lineTo(cx + Math.cos(a) * irisR * 0.94, cy + Math.sin(a) * irisR * 0.94);
      ctx.stroke();
    }

    // Crisp dark pupil
    ctx.fillStyle = '#0d0e14';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 0.50, 0, Math.PI * 2);
    ctx.fill();

    // Twin Pixar-style specular catchlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(cx - irisR * 0.34, cy - irisR * 0.36, irisR * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(cx + irisR * 0.30, cy + irisR * 0.28, irisR * 0.11, 0, Math.PI * 2);
    ctx.fill();
  });
}

function createSwirlTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8f5ec';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    ctx.strokeStyle = '#1c1b29';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const turns = 3.2;
    const maxR = w * 0.43;
    for (let i = 0; i <= 180; i++) {
      const f = i / 180;
      const a = f * turns * Math.PI * 2;
      const r = f * maxR;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

function createNotebookCoverTexture() {
  return makeProceduralTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#5a321b');
    grad.addColorStop(1, '#3d1f0f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Gold border framing
    ctx.strokeStyle = '#d8aa4c';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    // Gold title stamp
    ctx.fillStyle = '#e7be62';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOTES', w * 0.5, h * 0.43);
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText('1666', w * 0.5, h * 0.56);
  });
}

// -----------------------------------------------------------------------------
// Custom Stylized Geometry Builders
// -----------------------------------------------------------------------------
function createSculptedHeadGeometry() {
  const geo = new THREE.SphereGeometry(0.165, 48, 36);
  // Rotate so UV u=0.5 points toward +Z cleanly
  geo.rotateY(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Elongate head vertically for classic stylized human proportions
    y *= 1.13;

    // Smoothstep cranium & lower jaw taper (zero horizontal crease!)
    if (y > 0.05) {
      const t = Math.min(1, (y - 0.05) / 0.14);
      const s = t * t * (3 - 2 * t);
      x *= 1 - s * 0.06;
      z *= 1 - s * 0.04;
    } else if (y < -0.05) {
      const t = Math.min(1, (-0.05 - y) / 0.14);
      const s = t * t * (3 - 2 * t);
      x *= 1 - s * 0.16;
      z *= 1 - s * 0.04;
    }

    // Gentle rounded cheeks without sharp downward shelf
    if (z > 0.03) {
      const cheekL = Math.exp(-((x + 0.084) ** 2 / 0.0045 + (y + 0.025) ** 2 / 0.0048));
      const cheekR = Math.exp(-((x - 0.084) ** 2 / 0.0045 + (y + 0.025) ** 2 / 0.0048));
      const cheekAmt = (cheekL + cheekR) * 0.008;
      z += cheekAmt;
      x += Math.sign(x) * cheekAmt * 0.35;
    }

    // Gentle orbital socket recesses so eyeballs sit nestled beneath brow ridge
    if (z > 0.07) {
      const sockL = Math.exp(-((x + 0.056) ** 2 / 0.0014 + (y - 0.028) ** 2 / 0.0012));
      const sockR = Math.exp(-((x - 0.056) ** 2 / 0.0014 + (y - 0.028) ** 2 / 0.0012));
      z -= (sockL + sockR) * 0.018;

      // Subtle brow ridge protrusion right above eyes
      const brow = Math.exp(-((y - 0.068) ** 2 / 0.0008)) * Math.max(0, 1 - (x * x) / 0.018);
      z += brow * 0.010;
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCurlyRollGeometry(radius = 0.036, length = 0.16) {
  const geo = new THREE.CylinderGeometry(radius * 0.88, radius, length, 18, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const yn = y / (length * 0.5);
    const endTaper = Math.sqrt(Math.max(0.15, 1 - yn * yn * 0.78));
    const flute = 1 + 0.11 * Math.sin(angle * 4 + yn * 5.0);
    pos.setXYZ(i, x * flute * endTaper, y, z * flute * endTaper);
  }
  geo.computeVertexNormals();
  return geo;
}

function createLaceRuffleGeometry(topR, botR, height, lobes = 10) {
  const geo = new THREE.CylinderGeometry(topR, botR, height, 40, 4, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const t = (height * 0.5 - y) / height; // 0 top -> 1 bottom
    const wave = 1 + t * 0.24 * Math.sin(a * lobes);
    const yWave = y + t * 0.007 * Math.cos(a * lobes);
    pos.setXYZ(i, x * wave, yWave, z * wave);
  }
  geo.computeVertexNormals();
  return geo;
}

function createStarGeometry(outerR = 0.036, innerR = 0.016, depth = 0.012) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createSunglassesFrameGeometry() {
  const shape = new THREE.Shape();
  // Outer silhouette of stylish aviator/wayfarer front frame
  shape.moveTo(-0.145, 0.038);
  shape.quadraticCurveTo(-0.085, 0.048, -0.025, 0.036);
  shape.quadraticCurveTo(0, 0.024, 0.025, 0.036);
  shape.quadraticCurveTo(0.085, 0.048, 0.145, 0.038);
  shape.quadraticCurveTo(0.152, -0.005, 0.132, -0.038);
  shape.quadraticCurveTo(0.080, -0.056, 0.026, -0.034);
  shape.quadraticCurveTo(0.012, -0.005, 0.014, 0.012);
  shape.quadraticCurveTo(0, 0.018, -0.014, 0.012);
  shape.quadraticCurveTo(-0.012, -0.005, -0.026, -0.034);
  shape.quadraticCurveTo(-0.080, -0.056, -0.132, -0.038);
  shape.quadraticCurveTo(-0.152, -0.005, -0.145, 0.038);

  const leftHole = new THREE.Path();
  leftHole.moveTo(-0.132, 0.026);
  leftHole.quadraticCurveTo(-0.082, 0.035, -0.034, 0.024);
  leftHole.quadraticCurveTo(-0.026, -0.006, -0.038, -0.027);
  leftHole.quadraticCurveTo(-0.082, -0.042, -0.122, -0.026);
  leftHole.quadraticCurveTo(-0.138, 0.0, -0.132, 0.026);
  shape.holes.push(leftHole);

  const rightHole = new THREE.Path();
  rightHole.moveTo(0.034, 0.024);
  rightHole.quadraticCurveTo(0.082, 0.035, 0.132, 0.026);
  rightHole.quadraticCurveTo(0.138, 0.0, 0.122, -0.026);
  rightHole.quadraticCurveTo(0.082, -0.042, 0.038, -0.027);
  rightHole.quadraticCurveTo(0.026, -0.006, 0.034, 0.024);
  shape.holes.push(rightHole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.010,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0025,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createLensGeometry(side = 1) {
  const shape = new THREE.Shape();
  if (side < 0) {
    shape.moveTo(-0.134, 0.027);
    shape.quadraticCurveTo(-0.082, 0.036, -0.033, 0.025);
    shape.quadraticCurveTo(-0.025, -0.006, -0.037, -0.028);
    shape.quadraticCurveTo(-0.082, -0.043, -0.123, -0.027);
    shape.quadraticCurveTo(-0.139, 0.0, -0.134, 0.027);
  } else {
    shape.moveTo(0.033, 0.025);
    shape.quadraticCurveTo(0.082, 0.036, 0.134, 0.027);
    shape.quadraticCurveTo(0.139, 0.0, 0.123, -0.027);
    shape.quadraticCurveTo(0.082, -0.043, 0.037, -0.028);
    shape.quadraticCurveTo(0.025, -0.006, 0.033, 0.025);
  }
  return new THREE.ShapeGeometry(shape);
}

// -----------------------------------------------------------------------------
// Pose & Expression Target Definitions
// -----------------------------------------------------------------------------
const POSE_TARGETS = {
  reading_under_tree: {
    hipsY: 0.84, hipsRx: 0.02, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: 0.06, torsoRy: -0.04, torsoRz: 0.0,
    headRx: -0.08, headRy: 0.05, headRz: 0.06,
    hipLRx: -0.06, hipLRy: 0.08, hipLRz: 0.04, kneeLRx: 0.08, ankleLRx: -0.02,
    hipRRx: 0.04, hipRRy: -0.08, hipRRz: -0.04, kneeRRx: 0.06, ankleRRx: -0.08,
    shLRx: -0.68, shLRy: 0.25, shLRz: 0.24, elLRx: -0.95, wrLRx: 0.15, wrLRy: -0.35, wrLRz: 0.15,
    shRRx: -0.58, shRRy: -0.30, shRRz: -0.22, elRRx: -1.05, wrRRx: -0.10, wrRRy: 0.25, wrRRz: -0.20,
    fingerLOpen: 0.25, fingerROpen: 0.20, indexRExt: 0.1,
    notebookMode: 'handL', quillMode: 'handR',
  },
  lean_in_poke_then_recoil: {
    hipsY: 0.83, hipsRx: 0.05, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: 0.16, torsoRy: 0.12, torsoRz: 0.0,
    headRx: -0.12, headRy: 0.08, headRz: 0.05,
    hipLRx: -0.14, hipLRy: 0.06, hipLRz: 0.04, kneeLRx: 0.20, ankleLRx: -0.06,
    hipRRx: 0.08, hipRRy: -0.08, hipRRz: -0.05, kneeRRx: 0.10, ankleRRx: -0.16,
    shLRx: -0.50, shLRy: 0.22, shLRz: 0.25, elLRx: -1.00, wrLRx: 0.10, wrLRy: -0.25, wrLRz: 0.10,
    shRRx: -0.52, shRRy: -0.10, shRRz: -0.24, elRRx: -1.10, wrRRx: 0.0, wrRRy: 0.15, wrRRz: 0.0,
    fingerLOpen: 0.25, fingerROpen: 0.35, indexRExt: 0.35,
    notebookMode: 'handL', quillMode: 'handL_tuck',
  },
  shocked_lean_back: {
    hipsY: 0.81, hipsRx: -0.06, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: -0.22, torsoRy: -0.08, torsoRz: 0.04,
    headRx: -0.10, headRy: 0.14, headRz: -0.06,
    hipLRx: -0.22, hipLRy: 0.12, hipLRz: 0.08, kneeLRx: 0.36, ankleLRx: -0.12,
    hipRRx: -0.04, hipRRy: -0.12, hipRRz: -0.08, kneeRRx: 0.22, ankleRRx: -0.16,
    shLRx: -1.05, shLRy: 0.20, shLRz: 0.72, elLRx: -0.92, wrLRx: -0.25, wrLRy: 0.10, wrLRz: 0.15,
    shRRx: -1.10, shRRy: -0.20, shRRz: -0.78, elRRx: -0.88, wrRRx: -0.25, wrRRy: -0.10, wrRRz: -0.15,
    fingerLOpen: 0.95, fingerROpen: 0.95, indexRExt: 0.85,
    notebookMode: 'handL', quillMode: 'hidden',
  },
  arms_flailing_liftoff: {
    hipsY: 0.84, hipsRx: 0.05, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: -0.06, torsoRy: 0.0, torsoRz: 0.0,
    headRx: -0.14, headRy: 0.0, headRz: 0.04,
    hipLRx: -0.45, hipLRy: 0.10, hipLRz: 0.14, kneeLRx: 0.65, ankleLRx: 0.25,
    hipRRx: 0.22, hipRRy: -0.10, hipRRz: -0.14, kneeRRx: 0.42, ankleRRx: 0.30,
    shLRx: -1.45, shLRy: 0.15, shLRz: 1.05, elLRx: -0.55, wrLRx: -0.15, wrLRy: 0.0, wrLRz: 0.0,
    shRRx: -1.65, shRRy: -0.15, shRRz: -1.10, elRRx: -0.45, wrRRx: -0.15, wrRRy: 0.0, wrRRz: 0.0,
    fingerLOpen: 1.0, fingerROpen: 1.0, indexRExt: 1.0,
    notebookMode: 'floating', quillMode: 'floating',
  },
  upside_down_tumble_realization: {
    hipsY: 0.84, hipsRx: 0.06, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: 0.10, torsoRy: 0.0, torsoRz: 0.0,
    headRx: 0.06, headRy: 0.0, headRz: -0.04,
    hipLRx: -0.35, hipLRy: 0.12, hipLRz: 0.16, kneeLRx: 0.68, ankleLRx: 0.32,
    hipRRx: -0.18, hipRRy: -0.12, hipRRz: -0.16, kneeRRx: 0.52, ankleRRx: 0.28,
    shLRx: -1.55, shLRy: 0.20, shLRz: 0.68, elLRx: -1.35, wrLRx: 0.10, wrLRy: 0.25, wrLRz: 0.15,
    shRRx: -1.55, shRRy: -0.20, shRRz: -0.68, elRRx: -1.35, wrRRx: 0.10, wrRRy: -0.25, wrRRz: -0.15,
    fingerLOpen: 0.85, fingerROpen: 0.85, indexRExt: 0.85,
    notebookMode: 'floating', quillMode: 'floating',
  },
  cool_rebrand_arms_crossed: {
    hipsY: 0.84, hipsRx: -0.04, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: -0.08, torsoRy: -0.06, torsoRz: 0.02,
    headRx: -0.06, headRy: 0.08, headRz: -0.05,
    hipLRx: -0.14, hipLRy: 0.12, hipLRz: 0.08, kneeLRx: 0.22, ankleLRx: 0.20,
    hipRRx: -0.46, hipRRy: -0.12, hipRRz: -0.10, kneeRRx: 0.92, ankleRRx: 0.28,
    // Crossed arms cleanly tucked over chest without clipping
    shLRx: -0.68, shLRy: 0.56, shLRz: 0.28, elLRx: -1.42, wrLRx: 0.05, wrLRy: 0.20, wrLRz: -0.25,
    shRRx: -0.82, shRRy: -0.62, shRRz: -0.34, elRRx: -1.48, wrRRx: 0.05, wrRRy: -0.20, wrRRz: 0.25,
    fingerLOpen: 0.25, fingerROpen: 0.25, indexRExt: 0.25,
    notebookMode: 'hidden', quillMode: 'hidden',
  },
  slammed_squashed_on_ground: {
    hipsY: 0.62, hipsRx: 0.06, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: 0.16, torsoRy: 0.0, torsoRz: 0.0,
    headRx: 0.14, headRy: 0.0, headRz: 0.06,
    hipLRx: -0.92, hipLRy: 0.32, hipLRz: 0.34, kneeLRx: 1.42, ankleLRx: -0.32,
    hipRRx: -0.92, hipRRy: -0.32, hipRRz: -0.34, kneeRRx: 1.42, ankleRRx: -0.32,
    shLRx: -0.25, shLRy: 0.0, shLRz: 1.18, elLRx: -0.45, wrLRx: -0.30, wrLRy: 0.0, wrLRz: 0.25,
    shRRx: -0.25, shRRy: 0.0, shRRz: -1.18, elRRx: -0.45, wrRRx: -0.30, wrRRy: 0.0, wrRRz: -0.25,
    fingerLOpen: 1.0, fingerROpen: 1.0, indexRExt: 1.0,
    notebookMode: 'hidden', quillMode: 'hidden',
  },
  sitting_dazed_rubbing_head: {
    hipsY: 0.34, hipsRx: -0.10, hipsRy: 0.0, hipsRz: 0.0,
    torsoRx: 0.06, torsoRy: -0.05, torsoRz: -0.04,
    headRx: 0.10, headRy: 0.06, headRz: -0.10,
    // Seated legs angled cleanly on top of grass at y=0 (even with group pitch rx=0.15)
    hipLRx: -1.78, hipLRy: 0.24, hipLRz: 0.16, kneeLRx: 0.22, ankleLRx: -0.15,
    hipRRx: -1.74, hipRRy: -0.26, hipRRz: -0.18, kneeRRx: 0.28, ankleRRx: -0.15,
    // Left arm bracing back-side on grass, right hand raised rubbing sore noggin
    shLRx: 0.32, shLRy: -0.12, shLRz: 0.72, elLRx: -0.24, wrLRx: -0.55, wrLRy: 0.0, wrLRz: 0.20,
    shRRx: -2.25, shRRy: -0.36, shRRz: -0.42, elRRx: -1.68, wrRRx: 0.22, wrRRy: -0.35, wrRRz: -0.25,
    fingerLOpen: 0.65, fingerROpen: 0.35, indexRExt: 0.35,
    notebookMode: 'hidden', quillMode: 'hidden',
  },
};

const EXPRESSION_TARGETS = {
  curious_squint: {
    browLY: 0.014, browLTilt: 0.14,
    browRY: -0.004, browRTilt: -0.22,
    upperLidL: -0.22, upperLidR: -0.04,
    lowerLidL: -0.06, lowerLidR: 0.04,
    smile: 0.08, jawDrop: 0.0, mouthWide: 0.88, swirl: 0, wince: 0,
  },
  confused_then_nose_bonk: {
    browLY: 0.016, browLTilt: 0.22,
    browRY: 0.004, browRTilt: -0.12,
    upperLidL: -0.24, upperLidR: -0.16,
    lowerLidL: -0.08, lowerLidR: 0.0,
    smile: -0.20, jawDrop: 0.10, mouthWide: 0.84, swirl: 0, wince: 0,
  },
  jaw_drop: {
    browLY: 0.032, browLTilt: 0.24,
    browRY: 0.032, browRTilt: -0.24,
    upperLidL: -0.35, upperLidR: -0.35,
    lowerLidL: -0.15, lowerLidR: -0.15,
    smile: -0.20, jawDrop: 0.85, mouthWide: 0.78, swirl: 0, wince: 0,
  },
  wide_eyed_shock: {
    browLY: 0.030, browLTilt: 0.30,
    browRY: 0.030, browRTilt: -0.30,
    upperLidL: -0.38, upperLidR: -0.38,
    lowerLidL: -0.18, lowerLidR: -0.18,
    smile: -0.35, jawDrop: 0.62, mouthWide: 0.74, swirl: 0, wince: 0,
  },
  mind_blown_excited: {
    browLY: 0.032, browLTilt: 0.16,
    browRY: 0.032, browRTilt: -0.16,
    upperLidL: -0.28, upperLidR: -0.28,
    lowerLidL: 0.04, lowerLidR: 0.04,
    smile: 0.85, jawDrop: 0.45, mouthWide: 1.18, swirl: 0, wince: 0,
  },
  cool_smirk: {
    browLY: 0.018, browLTilt: 0.12,
    browRY: -0.004, browRTilt: -0.18,
    upperLidL: 0.08, upperLidR: 0.12,
    lowerLidL: 0.04, lowerLidR: 0.04,
    smile: 0.65, jawDrop: 0.05, mouthWide: 1.08, swirl: 0, wince: 0,
  },
  bonked_shock: {
    browLY: 0.024, browLTilt: -0.24,
    browRY: 0.008, browRTilt: 0.32,
    upperLidL: -0.20, upperLidR: 0.22,
    lowerLidL: -0.06, lowerLidR: 0.18,
    smile: -0.55, jawDrop: 0.32, mouthWide: 0.92, swirl: 0, wince: 0.25,
  },
  dazed_swirl_eyes: {
    browLY: 0.018, browLTilt: 0.32,
    browRY: 0.006, browRTilt: -0.18,
    upperLidL: -0.10, upperLidR: -0.02,
    lowerLidL: 0.02, lowerLidR: 0.06,
    smile: -0.45, jawDrop: 0.22, mouthWide: 0.78, swirl: 1, wince: 0,
  },
};

// -----------------------------------------------------------------------------
// Main Character Rig Factory
// -----------------------------------------------------------------------------
export function createChewtonRig() {
  const group = new THREE.Group();
  group.name = 'SirIsaacChewton';

  // Textures & Materials (created once)
  const skinTex = createSkinTexture();
  const velvetTex = createVelvetTexture();
  const velvetBump = createVelvetBumpTexture();
  const waistcoatTex = createWaistcoatTexture();
  const wigTex = createWigTexture();
  const eyeTex = createEyeTexture();
  const swirlTex = createSwirlTexture();
  const notebookTex = createNotebookCoverTexture();

  const skinMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: 0.56,
    metalness: 0.02,
    emissive: new THREE.Color(0x4a1d10),
    emissiveIntensity: 0.14,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xf0baa0,
    roughness: 0.52,
    metalness: 0.02,
    emissive: new THREE.Color(0x4a1d10),
    emissiveIntensity: 0.14,
  });
  const velvetMat = new THREE.MeshStandardMaterial({
    map: velvetTex,
    bumpMap: velvetBump,
    bumpScale: 0.004,
    roughness: 0.78,
    metalness: 0.05,
  });
  const waistcoatMat = new THREE.MeshStandardMaterial({
    map: waistcoatTex,
    roughness: 0.48,
    metalness: 0.16,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xe3b34c,
    roughness: 0.26,
    metalness: 0.85,
  });
  const laceMat = new THREE.MeshStandardMaterial({
    color: 0xf8f3e8,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const breechesMat = new THREE.MeshStandardMaterial({
    color: 0x222431,
    roughness: 0.74,
    metalness: 0.05,
  });
  const stockingMat = new THREE.MeshStandardMaterial({
    color: 0xf1ece2,
    roughness: 0.66,
    metalness: 0.02,
  });
  const leatherShoeMat = new THREE.MeshStandardMaterial({
    color: 0x161418,
    roughness: 0.34,
    metalness: 0.12,
  });
  const wigMat = new THREE.MeshStandardMaterial({
    map: wigTex,
    roughness: 0.72,
    metalness: 0.03,
  });
  const naturalHairMat = new THREE.MeshStandardMaterial({
    color: 0x3b271c,
    roughness: 0.78,
    metalness: 0.04,
  });
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x191822,
    roughness: 0.46,
    metalness: 0.08,
  });
  const eyeballMat = new THREE.MeshPhysicalMaterial({
    map: eyeTex,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const swirlMat = new THREE.MeshBasicMaterial({
    map: swirlTex,
  });
  const lidMat = new THREE.MeshStandardMaterial({
    color: 0xebb99e,
    roughness: 0.56,
    metalness: 0.02,
    emissive: new THREE.Color(0x4a1d10),
    emissiveIntensity: 0.14,
    side: THREE.DoubleSide,
  });
  const lashMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d19,
    roughness: 0.65,
  });
  const browMat = new THREE.MeshStandardMaterial({
    color: 0x4b382c,
    roughness: 0.72,
  });
  const mouthInsideMat = new THREE.MeshStandardMaterial({
    color: 0x29070d,
    roughness: 0.85,
  });
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xfbf8f0,
    roughness: 0.28,
    metalness: 0.05,
  });
  const tongueMat = new THREE.MeshStandardMaterial({
    color: 0xd96173,
    roughness: 0.48,
  });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0xc97b6c,
    roughness: 0.46,
  });
  const sunglassesFrameMat = new THREE.MeshPhysicalMaterial({
    color: 0x111116,
    roughness: 0.20,
    metalness: 0.65,
    clearcoat: 0.8,
  });
  const sunglassesLensMat = new THREE.MeshPhysicalMaterial({
    color: 0x090b14,
    roughness: 0.06,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.95,
    transparent: true,
    opacity: 0.90,
  });
  const starGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffd54a,
    emissive: 0xff9f1a,
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.65,
  });
  const notebookCoverMat = new THREE.MeshStandardMaterial({
    map: notebookTex,
    roughness: 0.55,
    metalness: 0.10,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xf7eed8,
    roughness: 0.82,
  });
  const quillMat = new THREE.MeshStandardMaterial({
    color: 0xfaf7ef,
    roughness: 0.55,
  });
  const quillGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd9ad4d,
    roughness: 0.35,
    metalness: 0.75,
  });

  // ---------------------------------------------------------------------------
  // Hierarchy Root & Squash Wrapper (feet anchored at y = 0)
  // ---------------------------------------------------------------------------
  const squashGroup = new THREE.Group();
  squashGroup.name = 'SquashRoot';
  group.add(squashGroup);

  const hipsGroup = new THREE.Group();
  hipsGroup.position.set(0, 0.84, 0);
  squashGroup.add(hipsGroup);

  // Sculpted pelvis / breeches seat
  const pelvisGeo = new THREE.SphereGeometry(0.162, 24, 18);
  pelvisGeo.scale(1.06, 0.72, 0.84);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, breechesMat);
  pelvisMesh.position.set(0, 0.01, 0);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  hipsGroup.add(pelvisMesh);

  // ---------------------------------------------------------------------------
  // Legs & Buckled 17th-Century Shoes
  // ---------------------------------------------------------------------------
  const thighGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.056, -0.38),
    new THREE.Vector2(0.068, -0.26),
    new THREE.Vector2(0.082, -0.12),
    new THREE.Vector2(0.084, 0.0),
    new THREE.Vector2(0.0, 0.02),
  ], 20);
  const kneeBandGeo = new THREE.TorusGeometry(0.058, 0.011, 10, 20);
  kneeBandGeo.rotateX(Math.PI / 2);

  const calfGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.036, -0.36),
    new THREE.Vector2(0.044, -0.24),
    new THREE.Vector2(0.059, -0.12),
    new THREE.Vector2(0.055, -0.02),
    new THREE.Vector2(0.0, 0.0),
  ], 20);

  function buildLeg(side) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.105, 0, 0);
    hipsGroup.add(hipPivot);

    const thigh = new THREE.Mesh(thighGeo, breechesMat);
    thigh.castShadow = true;
    thigh.receiveShadow = true;
    hipPivot.add(thigh);

    const kneeBand = new THREE.Mesh(kneeBandGeo, breechesMat);
    kneeBand.position.set(0, -0.36, 0);
    hipPivot.add(kneeBand);

    const kneeBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.012), brassMat);
    kneeBuckle.position.set(side * 0.056, -0.36, 0.01);
    kneeBuckle.rotation.y = side * Math.PI * 0.5;
    hipPivot.add(kneeBuckle);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipPivot.add(kneePivot);

    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), breechesMat);
    kneePivot.add(kneeCap);

    const calf = new THREE.Mesh(calfGeo, stockingMat);
    calf.castShadow = true;
    calf.receiveShadow = true;
    kneePivot.add(calf);

    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.36, 0);
    kneePivot.add(anklePivot);

    const ankleJoint = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), stockingMat);
    anklePivot.add(ankleJoint);

    // 17th-century heeled & buckled shoe (sole bottom strictly at y = -0.10 so standing y = 0!)
    const shoeGroup = new THREE.Group();
    anklePivot.add(shoeGroup);

    const shoeVamp = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.095, 8, 16), leatherShoeMat);
    shoeVamp.rotation.x = Math.PI / 2;
    shoeVamp.scale.set(1.02, 1.0, 0.72);
    shoeVamp.position.set(0, -0.055, 0.045);
    shoeVamp.castShadow = true;
    shoeGroup.add(shoeVamp);

    const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.020, 0.175), leatherShoeMat);
    shoeSole.position.set(0, -0.090, 0.046);
    shoeSole.castShadow = true;
    shoeGroup.add(shoeSole);

    const shoeHeel = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.032, 0.055), leatherShoeMat);
    shoeHeel.position.set(0, -0.084, -0.018);
    shoeGroup.add(shoeHeel);

    const tongueFlap = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.042, 0.012), leatherShoeMat);
    tongueFlap.position.set(0, -0.015, 0.045);
    tongueFlap.rotation.x = -0.36;
    shoeGroup.add(tongueFlap);

    // Brass buckle frame
    const buckleFrame = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0055, 6, 4), brassMat);
    buckleFrame.rotation.z = Math.PI / 4;
    buckleFrame.rotation.x = -0.35;
    buckleFrame.scale.set(1.15, 0.85, 1.0);
    buckleFrame.position.set(0, -0.030, 0.068);
    shoeGroup.add(buckleFrame);

    return { hipPivot, kneePivot, anklePivot };
  }

  const legL = buildLeg(1);
  const legR = buildLeg(-1);

  // ---------------------------------------------------------------------------
  // Torso, Golden Waistcoat, Burgundy Velvet Frock Coat & Lace Cravat
  // ---------------------------------------------------------------------------
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.04, 0); // World y = 0.88
  hipsGroup.add(torsoPivot);

  // Golden Brocade Waistcoat
  const waistcoatGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.0, -0.04),
    new THREE.Vector2(0.155, -0.02),
    new THREE.Vector2(0.174, 0.08),
    new THREE.Vector2(0.168, 0.22),
    new THREE.Vector2(0.175, 0.34),
    new THREE.Vector2(0.140, 0.43),
    new THREE.Vector2(0.075, 0.46),
    new THREE.Vector2(0.0, 0.46),
  ], 28);
  waistcoatGeo.scale(1.06, 1.0, 0.84);
  const waistcoatMesh = new THREE.Mesh(waistcoatGeo, waistcoatMat);
  waistcoatMesh.castShadow = true;
  waistcoatMesh.receiveShadow = true;
  torsoPivot.add(waistcoatMesh);

  // Brass waistcoat buttons down front (+Z)
  const buttonGeo = new THREE.SphereGeometry(0.0105, 12, 10);
  buttonGeo.scale(1, 1, 0.6);
  for (let i = 0; i < 6; i++) {
    const btn = new THREE.Mesh(buttonGeo, brassMat);
    const by = 0.03 + i * 0.058;
    const bz = i < 2 ? 0.146 : i < 4 ? 0.141 : 0.144 - (i - 4) * 0.012;
    btn.position.set(0, by, bz);
    torsoPivot.add(btn);
  }

  // Open-front Burgundy Velvet Coat Bodice (phi=0 is +Z, open gap in front!)
  const coatBodiceGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.166, -0.02),
    new THREE.Vector2(0.186, 0.08),
    new THREE.Vector2(0.180, 0.22),
    new THREE.Vector2(0.192, 0.35),
    new THREE.Vector2(0.160, 0.435),
    new THREE.Vector2(0.085, 0.465),
  ], 32, 0.26, Math.PI * 2 - 0.52);
  coatBodiceGeo.scale(1.07, 1.0, 0.86);
  const coatBodice = new THREE.Mesh(coatBodiceGeo, velvetMat);
  coatBodice.castShadow = true;
  coatBodice.receiveShadow = true;
  torsoPivot.add(coatBodice);

  // Flared Coat Skirt / Coattails hanging cleanly over hips
  const coatSkirtGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.245, -0.32),
    new THREE.Vector2(0.222, -0.18),
    new THREE.Vector2(0.192, -0.06),
    new THREE.Vector2(0.166, 0.0),
  ], 32, 0.32, Math.PI * 2 - 0.64);
  coatSkirtGeo.scale(1.07, 1.0, 0.86);
  const coatSkirt = new THREE.Mesh(coatSkirtGeo, velvetMat);
  coatSkirt.castShadow = true;
  coatSkirt.receiveShadow = true;
  torsoPivot.add(coatSkirt);

  // Coat Lapels & Brass Coat Buttons
  const lapelShape = new THREE.Shape();
  lapelShape.moveTo(0, 0);
  lapelShape.lineTo(0.056, 0.14);
  lapelShape.lineTo(0.018, 0.25);
  lapelShape.lineTo(-0.008, 0.23);
  lapelShape.closePath();
  const lapelGeo = new THREE.ExtrudeGeometry(lapelShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  });

  for (const side of [1, -1]) {
    const lapel = new THREE.Mesh(lapelGeo, velvetMat);
    lapel.position.set(side * 0.048, 0.18, 0.144);
    lapel.scale.x = side;
    lapel.rotation.y = -side * 0.34;
    lapel.rotation.x = -0.10;
    lapel.castShadow = true;
    torsoPivot.add(lapel);

    for (let i = 0; i < 4; i++) {
      const cBtn = new THREE.Mesh(buttonGeo, brassMat);
      cBtn.position.set(side * 0.058, 0.03 + i * 0.065, 0.148);
      cBtn.rotation.y = side * 0.32;
      torsoPivot.add(cBtn);
    }
  }

  // Velvet Stand-Up Collar
  const coatCollarGeo = new THREE.CylinderGeometry(0.088, 0.095, 0.062, 24, 1, true, 0.55, Math.PI * 2 - 1.10);
  const coatCollar = new THREE.Mesh(coatCollarGeo, velvetMat);
  coatCollar.position.set(0, 0.47, -0.005);
  torsoPivot.add(coatCollar);

  // Cream Ruffled Lace Cravat / Jabot at Throat
  const cravatGroup = new THREE.Group();
  cravatGroup.position.set(0, 0.455, 0.045);
  torsoPivot.add(cravatGroup);

  const cravatKnot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), laceMat);
  cravatKnot.scale.set(1.25, 0.85, 0.85);
  cravatKnot.position.set(0, 0.018, 0.038);
  cravatGroup.add(cravatKnot);

  const jabotTier1 = new THREE.Mesh(createLaceRuffleGeometry(0.025, 0.062, 0.055, 9), laceMat);
  jabotTier1.position.set(0, -0.022, 0.054);
  jabotTier1.rotation.x = 0.25;
  jabotTier1.scale.z = 0.48;
  cravatGroup.add(jabotTier1);

  const jabotTier2 = new THREE.Mesh(createLaceRuffleGeometry(0.032, 0.072, 0.065, 11), laceMat);
  jabotTier2.position.set(0, -0.068, 0.066);
  jabotTier2.rotation.x = 0.20;
  jabotTier2.scale.z = 0.46;
  cravatGroup.add(jabotTier2);

  // ---------------------------------------------------------------------------
  // Articulated Arms & Expressive Hands (Index Finger Rigged for Poking!)
  // ---------------------------------------------------------------------------
  const upperArmGeo = new THREE.CylinderGeometry(0.044, 0.049, 0.265, 18);
  upperArmGeo.translate(0, -0.1325, 0);
  const forearmGeo = new THREE.CylinderGeometry(0.045, 0.058, 0.225, 18);
  forearmGeo.translate(0, -0.1125, 0);
  const sleeveCuffGeo = new THREE.CylinderGeometry(0.062, 0.067, 0.055, 18);
  const wristRuffleGeo = createLaceRuffleGeometry(0.034, 0.058, 0.048, 10);

  function buildArm(side) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.215, 0.435, 0);
    torsoPivot.add(shoulderPivot);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.054, 16, 14), velvetMat);
    shoulderCap.scale.set(1.05, 1.0, 0.95);
    shoulderCap.castShadow = true;
    shoulderPivot.add(shoulderCap);

    const upperArm = new THREE.Mesh(upperArmGeo, velvetMat);
    upperArm.castShadow = true;
    shoulderPivot.add(upperArm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.265, 0);
    shoulderPivot.add(elbowPivot);

    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 12), velvetMat);
    elbowPivot.add(elbowBall);

    const forearm = new THREE.Mesh(forearmGeo, velvetMat);
    forearm.castShadow = true;
    elbowPivot.add(forearm);

    const sleeveCuff = new THREE.Mesh(sleeveCuffGeo, velvetMat);
    sleeveCuff.position.set(0, -0.20, 0);
    elbowPivot.add(sleeveCuff);

    const cuffTrim = new THREE.Mesh(new THREE.TorusGeometry(0.061, 0.005, 8, 20), brassMat);
    cuffTrim.rotation.x = Math.PI / 2;
    cuffTrim.position.set(0, -0.175, 0);
    elbowPivot.add(cuffTrim);

    const wristRuffle = new THREE.Mesh(wristRuffleGeo, laceMat);
    wristRuffle.position.set(0, -0.232, 0);
    elbowPivot.add(wristRuffle);

    const wristPivot = new THREE.Group();
    wristPivot.position.set(0, -0.245, 0);
    elbowPivot.add(wristPivot);

    // Hand Palm
    const handGroup = new THREE.Group();
    wristPivot.add(handGroup);

    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.032, 8, 12), skinMat);
    palm.scale.set(0.95, 1.0, 0.56);
    palm.position.set(0, -0.036, 0);
    palm.castShadow = true;
    handGroup.add(palm);

    // Thumb
    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(-side * 0.024, -0.022, 0.012);
    thumbPivot.rotation.set(0.18, 0, -side * 0.65);
    handGroup.add(thumbPivot);
    const thumbMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.028, 6, 10), skinMat);
    thumbMesh.position.set(0, -0.018, 0);
    thumbPivot.add(thumbMesh);

    // Index Finger (independently rigged for pointing/poking!)
    const indexPivot = new THREE.Group();
    indexPivot.position.set(-side * 0.016, -0.062, 0.004);
    handGroup.add(indexPivot);

    const indexProx = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.024, 6, 10), skinMat);
    indexProx.position.set(0, -0.016, 0);
    indexPivot.add(indexProx);

    const indexDistPivot = new THREE.Group();
    indexDistPivot.position.set(0, -0.032, 0);
    indexPivot.add(indexDistPivot);

    const indexDist = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, 0.022, 6, 10), skinMat);
    indexDist.position.set(0, -0.015, 0);
    indexDistPivot.add(indexDist);

    // Other 3 fingers (Middle, Ring, Pinky)
    const fingerPivots = [];
    const offsets = [
      { x: 0.000, len: 0.048, r: 0.0082 },
      { x: side * 0.014, len: 0.044, r: 0.0078 },
      { x: side * 0.026, len: 0.036, r: 0.0070 },
    ];
    for (let i = 0; i < offsets.length; i++) {
      const fp = new THREE.Group();
      fp.position.set(offsets[i].x, -0.062, 0.002);
      handGroup.add(fp);

      const f1 = new THREE.Mesh(new THREE.CapsuleGeometry(offsets[i].r, offsets[i].len * 0.55, 6, 10), skinMat);
      f1.position.set(0, -offsets[i].len * 0.30, 0);
      fp.add(f1);

      const fp2 = new THREE.Group();
      fp2.position.set(0, -offsets[i].len * 0.58, 0);
      fp.add(fp2);

      const f2 = new THREE.Mesh(new THREE.CapsuleGeometry(offsets[i].r * 0.9, offsets[i].len * 0.45, 6, 10), skinMat);
      f2.position.set(0, -offsets[i].len * 0.25, 0);
      fp2.add(f2);

      fingerPivots.push({ base: fp, mid: fp2 });
    }

    return {
      shoulderPivot,
      elbowPivot,
      wristPivot,
      handGroup,
      thumbPivot,
      indexPivot,
      indexDistPivot,
      fingerPivots,
    };
  }

  const armL = buildArm(1);
  const armR = buildArm(-1);

  // ---------------------------------------------------------------------------
  // Neck, Sculpted Head, Jaw, Expressive Eyes, Brows, Wig, Sunglasses & Stars
  // ---------------------------------------------------------------------------
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.13, 18), skinMat);
  neckMesh.position.set(0, 0.51, 0);
  neckMesh.castShadow = true;
  torsoPivot.add(neckMesh);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.59, 0); // Hinge at base of skull (y = 1.47)
  torsoPivot.add(headPivot);

  const headAnchor = new THREE.Group();
  headAnchor.position.set(0, 0.16, 0.01); // Center of head (standing y = 1.63)
  headPivot.add(headAnchor);

  const headGeo = createSculptedHeadGeometry();
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = false;
  headAnchor.add(headMesh);

  // Sculpted British Aristocratic Nose
  const noseGroup = new THREE.Group();
  noseGroup.position.set(0, -0.008, 0.155);
  headAnchor.add(noseGroup);

  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.036, 8, 12), noseMat);
  noseBridge.rotation.x = -0.34;
  noseBridge.position.set(0, 0.008, 0.010);
  noseBridge.castShadow = true;
  noseGroup.add(noseBridge);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.020, 16, 12), noseMat);
  noseTip.scale.set(1.05, 0.92, 1.15);
  noseTip.position.set(0, -0.014, 0.022);
  noseTip.castShadow = true;
  noseGroup.add(noseTip);

  // Stylized Ears
  const earGeo = new THREE.SphereGeometry(0.032, 16, 14);
  earGeo.scale(0.45, 1.25, 0.85);
  for (const side of [1, -1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.162, -0.012, -0.012);
    ear.rotation.y = side * 0.22;
    ear.rotation.z = -side * 0.12;
    ear.castShadow = true;
    headAnchor.add(ear);
  }

  // Real hair underneath the wig (shrunk & revealed cleanly when wig detaches!)
  const realHairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.56),
    naturalHairMat
  );
  realHairCap.scale.set(1.02, 1.12, 1.02);
  realHairCap.position.set(0, 0.018, -0.005);
  realHairCap.visible = false;
  headAnchor.add(realHairCap);

  const cowlickCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.18, 0.01),
    new THREE.Vector3(0.012, 0.225, 0.025),
    new THREE.Vector3(0.035, 0.245, 0.01),
  ]);
  const cowlickMesh = new THREE.Mesh(new THREE.TubeGeometry(cowlickCurve, 10, 0.009, 8, false), naturalHairMat);
  cowlickMesh.visible = false;
  headAnchor.add(cowlickMesh);

  // Articulated Lower Jaw & Chin
  const jawGroup = new THREE.Group();
  jawGroup.position.set(0, -0.068, 0.020); // Hinge near jaw joint
  headAnchor.add(jawGroup);

  const chinMesh = new THREE.Mesh(new THREE.SphereGeometry(0.092, 24, 18), skinMat);
  chinMesh.scale.set(0.98, 0.72, 1.04);
  chinMesh.position.set(0, -0.044, 0.045);
  chinMesh.castShadow = true;
  chinMesh.receiveShadow = false;
  jawGroup.add(chinMesh);

  // Lower Teeth & Pink Tongue inside jaw
  const lowerTeeth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.044, 0.015, 18, 1, false, -0.9, 1.8),
    teethMat
  );
  lowerTeeth.position.set(0, -0.018, 0.072);
  jawGroup.add(lowerTeeth);

  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), tongueMat);
  tongue.scale.set(1.05, 0.45, 1.25);
  tongue.position.set(0, -0.016, 0.065);
  jawGroup.add(tongue);

  // Mouth Interior & Upper Teeth & Animated Lip Curves
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.082, 0.130);
  headAnchor.add(mouthGroup);

  const mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.046, 18, 14), mouthInsideMat);
  mouthCavity.scale.set(1.0, 0.72, 0.55);
  mouthCavity.position.set(0, -0.002, -0.016);
  mouthGroup.add(mouthCavity);

  const upperTeeth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.013, 18, 1, false, -0.80, 1.6),
    teethMat
  );
  upperTeeth.position.set(0, 0.002, -0.026);
  mouthGroup.add(upperTeeth);

  // 4-Quadrant Hinged 3D Curved Upper & Lower Lips for expressive grins/frowns/smirks
  function buildChewtonHalfLip(side, isUpper) {
    const pivot = new THREE.Group();
    const ySign = isUpper ? 1 : -1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0.007),
      new THREE.Vector3(side * 0.020, ySign * 0.003, 0.003),
      new THREE.Vector3(side * 0.044, 0, -0.015),
    ]);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, isUpper ? 0.0068 : 0.0074, 8, false),
      lipMat
    );
    pivot.add(mesh);
    mouthGroup.add(pivot);
    return pivot;
  }

  const upperLipL = buildChewtonHalfLip(1, true);
  const upperLipR = buildChewtonHalfLip(-1, true);
  const lowerLipL = buildChewtonHalfLip(1, false);
  const lowerLipR = buildChewtonHalfLip(-1, false);

  // ---------------------------------------------------------------------------
  // Expressive Eyes (Glossy Sclera, Tracking Pupils, Swirl Mode, Upper/Lower Lids)
  // ---------------------------------------------------------------------------
  function buildEye(side) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.056, 0.028, 0.132);
    headAnchor.add(eyeSocket);

    const eyeballPivot = new THREE.Group();
    eyeSocket.add(eyeballPivot);

    const eyeGeo = new THREE.SphereGeometry(0.032, 24, 20);
    // Rotate so UV u=0.5 (iris) points directly out along +Z
    eyeGeo.rotateY(-Math.PI / 2);
    const eyeball = new THREE.Mesh(eyeGeo, eyeballMat);
    eyeballPivot.add(eyeball);

    // Dazed swirl disc overlay (visible only in dazed_swirl_eyes)
    const swirlDisc = new THREE.Mesh(new THREE.CircleGeometry(0.027, 24), swirlMat);
    swirlDisc.position.set(0, 0, 0.0325);
    swirlDisc.visible = false;
    eyeballPivot.add(swirlDisc);

    // Upper eyelid dome (theta 0..PI/2 covers top hemisphere; rotate.x positive tilts it down to close!)
    const upperLidPivot = new THREE.Group();
    eyeSocket.add(upperLidPivot);

    const upperLidGeo = new THREE.SphereGeometry(0.0345, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const upperLid = new THREE.Mesh(upperLidGeo, lidMat);
    upperLidPivot.add(upperLid);

    const upperLashGeo = new THREE.TorusGeometry(0.0346, 0.0028, 8, 24, Math.PI);
    upperLashGeo.rotateX(Math.PI / 2);
    const upperLash = new THREE.Mesh(upperLashGeo, lashMat);
    upperLash.position.set(0, -0.004, 0);
    upperLidPivot.add(upperLash);

    // Lower eyelid dome
    const lowerLidPivot = new THREE.Group();
    eyeSocket.add(lowerLidPivot);

    const lowerLidGeo = new THREE.SphereGeometry(0.0342, 20, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48);
    const lowerLid = new THREE.Mesh(lowerLidGeo, lidMat);
    lowerLidPivot.add(lowerLid);

    return { eyeSocket, eyeballPivot, swirlDisc, upperLidPivot, lowerLidPivot };
  }

  const eyeL = buildEye(1);
  const eyeR = buildEye(-1);

  // Articulated 3D Eyebrows
  function buildBrow(side) {
    const browPivot = new THREE.Group();
    browPivot.position.set(side * 0.056, 0.072, 0.156);
    headAnchor.add(browPivot);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.028, -0.004, -0.006),
      new THREE.Vector3(-side * 0.005, 0.007, 0.005),
      new THREE.Vector3(side * 0.022, 0.005, 0.002),
      new THREE.Vector3(side * 0.036, -0.007, -0.012),
    ]);
    const browMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.0068, 8, false), browMat);
    browMesh.castShadow = true;
    browPivot.add(browMesh);
    return browPivot;
  }

  const browL = buildBrow(1);
  const browR = buildBrow(-1);

  // ---------------------------------------------------------------------------
  // Iconic Powdered 17th-Century Curly Wig (Detachable & Float-Capable!)
  // ---------------------------------------------------------------------------
  const wigGroup = new THREE.Group();
  wigGroup.name = 'PowderedWig';
  headAnchor.add(wigGroup);

  // Crown dome with clean sculpted open hairline above eyebrows (y >= 0.085 on +Z)
  const wigCrownGeo = new THREE.SphereGeometry(0.178, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const wcPos = wigCrownGeo.attributes.position;
  for (let i = 0; i < wcPos.count; i++) {
    let wx = wcPos.getX(i);
    let wy = wcPos.getY(i);
    let wz = wcPos.getZ(i);
    // Lift front (+Z) hairline smoothly above eyebrows while keeping sides/back lush
    const frontFactor = Math.max(0, Math.min(1, (wz + 0.02) / 0.14));
    const frontSmooth = frontFactor * frontFactor * (3 - 2 * frontFactor);
    const minHairlineY = 0.088 - Math.min(1, (wx * wx) / 0.028) * 0.035;
    if (frontSmooth > 0 && wy < minHairlineY) {
      wy = wy + (minHairlineY - wy) * frontSmooth;
      // Curve gently onto forehead crown without overhang
      const rTarget = Math.sqrt(Math.max(0.001, 0.178 * 0.178 - wy * wy));
      const rCur = Math.hypot(wx, wz);
      if (rCur > 0.001) {
        const s = rTarget / rCur;
        wx *= 1 + (s - 1) * frontSmooth;
        wz *= 1 + (s - 1) * frontSmooth;
      }
    }
    wcPos.setXYZ(i, wx, wy, wz);
  }
  wigCrownGeo.computeVertexNormals();
  const wigCrown = new THREE.Mesh(wigCrownGeo, wigMat);
  wigCrown.scale.set(1.06, 1.08, 1.04);
  wigCrown.position.set(0, 0.022, -0.012);
  wigCrown.castShadow = false;
  wigGroup.add(wigCrown);

  // Twin puffed top rolls framing forehead
  const topRollGeo = createCurlyRollGeometry(0.052, 0.14);
  for (const side of [1, -1]) {
    const topPuff = new THREE.Mesh(topRollGeo, wigMat);
    topPuff.rotation.set(Math.PI / 2 - 0.18, side * 0.25, side * 0.24);
    topPuff.position.set(side * 0.082, 0.150, 0.045);
    topPuff.castShadow = true;
    wigGroup.add(topPuff);
  }

  // Three lush tiers of horizontal side curls down left & right
  const sideCurlGeo = createCurlyRollGeometry(0.038, 0.155);
  for (const side of [1, -1]) {
    for (let tier = 0; tier < 3; tier++) {
      const curl = new THREE.Mesh(sideCurlGeo, wigMat);
      curl.rotation.x = Math.PI / 2 + 0.14;
      curl.rotation.z = side * (0.12 - tier * 0.05);
      curl.position.set(
        side * (0.168 + tier * 0.010),
        0.045 - tier * 0.068,
        -0.022 - tier * 0.008
      );
      curl.castShadow = true;
      wigGroup.add(curl);
    }
  }

  // Back cascade curls & queue ponytail + black satin ribbon bow
  const backCascadeGeo = createCurlyRollGeometry(0.044, 0.18);
  for (let i = -2; i <= 2; i++) {
    const backCurl = new THREE.Mesh(backCascadeGeo, wigMat);
    backCurl.position.set(i * 0.048, -0.045, -0.145 + Math.abs(i) * 0.018);
    backCurl.rotation.x = 0.22;
    backCurl.castShadow = true;
    wigGroup.add(backCurl);
  }

  const queueTail = new THREE.Mesh(createCurlyRollGeometry(0.034, 0.16), wigMat);
  queueTail.position.set(0, -0.14, -0.165);
  queueTail.rotation.x = 0.28;
  queueTail.castShadow = true;
  wigGroup.add(queueTail);

  // Satin Bow on back queue
  const bowGroup = new THREE.Group();
  bowGroup.position.set(0, -0.095, -0.185);
  wigGroup.add(bowGroup);

  const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 10), ribbonMat);
  bowGroup.add(bowKnot);
  for (const side of [1, -1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 8, 16), ribbonMat);
    loop.position.set(side * 0.024, 0.005, 0);
    loop.scale.set(1.2, 0.75, 0.6);
    bowGroup.add(loop);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.068, 0.004), ribbonMat);
    tail.position.set(side * 0.014, -0.036, 0);
    tail.rotation.z = side * 0.26;
    bowGroup.add(tail);
  }

  // ---------------------------------------------------------------------------
  // Cool 3D Sunglasses (Snaps cleanly onto nose bridge in Beat 5!)
  // ---------------------------------------------------------------------------
  const sunglassesGroup = new THREE.Group();
  sunglassesGroup.name = 'CoolSunglasses';
  sunglassesGroup.position.set(0, 0.030, 0.172);
  sunglassesGroup.visible = false;
  headAnchor.add(sunglassesGroup);

  const frameMesh = new THREE.Mesh(createSunglassesFrameGeometry(), sunglassesFrameMat);
  frameMesh.castShadow = true;
  sunglassesGroup.add(frameMesh);

  const lensL = new THREE.Mesh(createLensGeometry(1), sunglassesLensMat);
  lensL.position.set(0, 0, 0.002);
  sunglassesGroup.add(lensL);

  const lensR = new THREE.Mesh(createLensGeometry(-1), sunglassesLensMat);
  lensR.position.set(0, 0, 0.002);
  sunglassesGroup.add(lensR);

  // Gold corner accents & temples
  for (const side of [1, -1]) {
    const goldStud = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.006), brassMat);
    goldStud.position.set(side * 0.136, 0.030, 0.006);
    sunglassesGroup.add(goldStud);

    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.009, 0.165), sunglassesFrameMat);
    temple.position.set(side * 0.145, 0.028, -0.082);
    temple.rotation.y = side * 0.06;
    sunglassesGroup.add(temple);
  }

  // ---------------------------------------------------------------------------
  // Orbiting 3D Golden Daze Stars
  // ---------------------------------------------------------------------------
  const dazeStarsGroup = new THREE.Group();
  dazeStarsGroup.name = 'DazeStars';
  dazeStarsGroup.position.set(0, 0.28, 0);
  dazeStarsGroup.visible = false;
  headAnchor.add(dazeStarsGroup);

  const starGeo = createStarGeometry(0.038, 0.016, 0.011);
  const dazeStars = [];
  for (let i = 0; i < 5; i++) {
    const starMesh = new THREE.Mesh(starGeo, starGoldMat);
    starMesh.castShadow = true;
    dazeStarsGroup.add(starMesh);
    dazeStars.push(starMesh);
  }

  // ---------------------------------------------------------------------------
  // Comedy Props: Leather Notebook & Feathered Quill
  // ---------------------------------------------------------------------------
  const notebookGroup = new THREE.Group();
  notebookGroup.name = 'LeatherNotebook';
  group.add(notebookGroup);

  const nbCoverL = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.165, 0.010), notebookCoverMat);
  nbCoverL.position.set(-0.058, 0, 0);
  nbCoverL.castShadow = true;
  notebookGroup.add(nbCoverL);

  const nbCoverR = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.165, 0.010), notebookCoverMat);
  nbCoverR.position.set(0.058, 0, 0);
  nbCoverR.castShadow = true;
  notebookGroup.add(nbCoverR);

  const nbPages = new THREE.Mesh(new THREE.BoxGeometry(0.218, 0.155, 0.016), paperMat);
  nbPages.position.set(0, 0, 0.008);
  notebookGroup.add(nbPages);

  const quillGroup = new THREE.Group();
  quillGroup.name = 'FeatherQuill';
  group.add(quillGroup);

  const quillShaftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.02, 0),
    new THREE.Vector3(0.005, 0.09, 0.008),
    new THREE.Vector3(0.016, 0.22, -0.006),
  ]);
  const quillShaft = new THREE.Mesh(new THREE.TubeGeometry(quillShaftCurve, 12, 0.0032, 6, false), quillMat);
  quillGroup.add(quillShaft);

  const quillNib = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.024, 6), quillGoldMat);
  quillNib.rotation.x = Math.PI;
  quillNib.position.set(0, -0.026, 0);
  quillGroup.add(quillNib);

  const featherShape = new THREE.Shape();
  featherShape.moveTo(0, 0);
  featherShape.quadraticCurveTo(0.028, 0.06, 0.022, 0.13);
  featherShape.quadraticCurveTo(0.008, 0.17, 0.0, 0.18);
  featherShape.quadraticCurveTo(-0.018, 0.14, -0.016, 0.07);
  featherShape.quadraticCurveTo(-0.010, 0.02, 0, 0);
  const featherGeo = new THREE.ShapeGeometry(featherShape);
  const featherMatDouble = new THREE.MeshStandardMaterial({
    color: 0xfbf8f0,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const featherPlume = new THREE.Mesh(featherGeo, featherMatDouble);
  featherPlume.position.set(0.004, 0.055, 0.004);
  featherPlume.rotation.y = 0.28;
  featherPlume.rotation.z = -0.08;
  quillGroup.add(featherPlume);

  // ---------------------------------------------------------------------------
  // Pre-allocated Scratch Objects & Smooth Animation State (ZERO frame allocs!)
  // ---------------------------------------------------------------------------
  const _targetLocal = new THREE.Vector3();
  const _worldLook = new THREE.Vector3();
  const _eyeWorld = new THREE.Vector3();
  const _handPos = new THREE.Vector3();
  const _handQuat = new THREE.Quaternion();
  const _invGroupMat = new THREE.Matrix4();
  const _handMat = new THREE.Matrix4();
  const _eulerScratch = new THREE.Euler();
  const _shWorld = new THREE.Vector3();
  const _pokeWorldTarget = new THREE.Vector3(0.115, 1.795, 0.335);
  const _pokeLocalTarget = new THREE.Vector3();
  const _elbowDir = new THREE.Vector3();
  const _dirVec = new THREE.Vector3();
  const _perpA = new THREE.Vector3();
  const _perpB = new THREE.Vector3();
  const _elbowPos = new THREE.Vector3();
  const _upperVec = new THREE.Vector3();
  const _foreVec = new THREE.Vector3();
  const _armX = new THREE.Vector3();
  const _armY = new THREE.Vector3();
  const _armZ = new THREE.Vector3();
  const _ikMat = new THREE.Matrix4();
  const _qAimA = new THREE.Quaternion();
  const _qAimB = new THREE.Quaternion();

  // Smooth runtime pose/expression state
  const curPose = { ...POSE_TARGETS.reading_under_tree };
  const curExpr = { ...EXPRESSION_TARGETS.curious_squint };
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

  function updateEyeLook(eye, worldTarget, winceAmt, swirlAmt, t) {
    eye.swirlDisc.visible = swirlAmt > 0.5;
    if (swirlAmt > 0.5) {
      eye.swirlDisc.rotation.z = -t * 9.5;
      eye.eyeballPivot.rotation.set(0, 0, 0);
      return;
    }

    eye.eyeSocket.updateWorldMatrix(true, false);
    eye.eyeSocket.getWorldPosition(_eyeWorld);
    _targetLocal.copy(worldTarget);
    headAnchor.worldToLocal(_targetLocal);
    _targetLocal.sub(eye.eyeSocket.position);

    const horizDist = Math.max(0.08, Math.hypot(_targetLocal.x, _targetLocal.z));
    let yaw = Math.atan2(_targetLocal.x, Math.max(0.05, _targetLocal.z));
    let pitch = -Math.atan2(_targetLocal.y, horizDist);

    // Clamp eye rotations to physically appealing bounds
    yaw = Math.max(-0.42, Math.min(0.42, yaw));
    pitch = Math.max(-0.34, Math.min(0.32, pitch));

    eye.eyeballPivot.rotation.set(pitch, yaw, 0);
    if (winceAmt > 0.5) {
      eye.eyeballPivot.rotation.x += 0.08;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API: getHeadWorldPos & update
  // ---------------------------------------------------------------------------
  function getHeadWorldPos(out = new THREE.Vector3()) {
    headAnchor.updateWorldMatrix(true, false);
    return headAnchor.getWorldPosition(out);
  }

  function update(t = 0, state = {}) {
    const dt = prevTime < 0 ? 1.0 : t - prevTime;
    const isJump = dt < 0 || dt > 0.25 || prevTime < 0;
    const lerpAlpha = isJump ? 1.0 : 1.0 - Math.exp(-dt * 14.0);
    prevTime = t;

    // 1. Root Transform & Squash-and-Stretch
    setVec3OrArr(group.position, state.position, 0, 0, 0);
    setRotOrArr(group.rotation, state.rotation);

    const squashY = Math.max(0.32, state.squashY ?? 1.0);
    const squashXZ = 1.0 / Math.sqrt(squashY);
    squashGroup.scale.set(squashXZ, squashY, squashXZ);

    // 2. Smoothly blend Pose & Expression targets
    const poseKey = state.pose && POSE_TARGETS[state.pose] ? state.pose : 'reading_under_tree';
    const targetPose = POSE_TARGETS[poseKey];
    for (const k in targetPose) {
      if (typeof targetPose[k] === 'number') {
        curPose[k] += (targetPose[k] - curPose[k]) * lerpAlpha;
      } else {
        curPose[k] = targetPose[k];
      }
    }

    const exprKey = state.expression && EXPRESSION_TARGETS[state.expression]
      ? state.expression
      : 'curious_squint';
    const targetExpr = EXPRESSION_TARGETS[exprKey];
    for (const k in targetExpr) {
      curExpr[k] += (targetExpr[k] - curExpr[k]) * lerpAlpha;
    }

    const pokeAmount = Math.max(0, Math.min(1, state.pokeAmount ?? 0));
    const recoilAmount = Math.max(0, Math.min(1, state.recoilAmount ?? 0));
    const mouthOpen = Math.max(0, Math.min(1, state.mouthOpen ?? 0));
    const wigDetached = Math.max(0, Math.min(1, state.wigDetached ?? 0));
    const sunglassesOn = Math.max(0, Math.min(1, state.sunglassesOn ?? 0));
    const dazeStarsAmt = Math.max(0, Math.min(1, state.dazeStars ?? 0));
    const quillFloating = Boolean(state.quillFloating);

    // 3. Secondary Motion & Comedy Beats per Pose
    const breath = Math.sin(t * 2.4) * 0.012;
    let hipsBobY = 0;
    let torsoTwistY = 0;
    let torsoLeanX = 0;
    let headBobX = 0;
    let headBobY = 0;
    let headBobZ = 0;
    let legKickL = 0;
    let legKickR = 0;
    let armFlailL = 0;
    let armFlailR = 0;

    let hipsLeanX = 0;
    let hipsTwistY = 0;
    let hipsLeanZ = 0;
    if (poseKey === 'reading_under_tree') {
      hipsBobY = Math.sin(t * 2.2) * 0.005;
      headBobX = Math.sin(t * 1.4) * 0.03;
      headBobY = Math.sin(t * 0.9) * 0.04;
      armFlailR = Math.sin(t * 4.5) * 0.05; // Gentle scribbling quill gesture
    } else if (poseKey === 'lean_in_poke_then_recoil') {
      // Lean forward & twist +Y so right shoulder (-X) reaches cleanly toward apple [0.25, 1.80, 0.42]
      hipsLeanX = pokeAmount * 0.14 - recoilAmount * 0.16;
      hipsTwistY = pokeAmount * 0.44 - recoilAmount * 0.10;
      hipsLeanZ = -pokeAmount * 0.10 + recoilAmount * 0.06;
      torsoLeanX = pokeAmount * 0.14 - recoilAmount * 0.44;
      torsoTwistY = pokeAmount * 0.56 - recoilAmount * 0.22;
      headBobX = -pokeAmount * 0.20 - recoilAmount * 0.36;
      headBobY = -pokeAmount * 0.65;
      headBobZ = recoilAmount * 0.12;
    } else if (poseKey === 'shocked_lean_back') {
      headBobY = Math.sin(t * 14.0) * 0.025;
      armFlailL = Math.sin(t * 7.5) * 0.08;
      armFlailR = -Math.sin(t * 7.5) * 0.08;
    } else if (poseKey === 'arms_flailing_liftoff') {
      hipsBobY = Math.sin(t * 3.8) * 0.03;
      legKickL = Math.sin(t * 12.0) * 0.48;
      legKickR = Math.sin(t * 12.0 + Math.PI) * 0.48;
      armFlailL = Math.sin(t * 11.0) * 0.44;
      armFlailR = Math.sin(t * 11.0 + 1.8) * 0.44;
      headBobZ = Math.sin(t * 6.5) * 0.08;
    } else if (poseKey === 'upside_down_tumble_realization') {
      hipsBobY = Math.sin(t * 2.1) * 0.03;
      legKickL = Math.sin(t * 2.8) * 0.18;
      legKickR = Math.sin(t * 2.8 + 1.4) * 0.18;
      armFlailL = Math.sin(t * 3.1) * 0.14;
      armFlailR = -Math.sin(t * 3.1) * 0.14;
      headBobY = Math.sin(t * 2.0) * 0.08;
    } else if (poseKey === 'cool_rebrand_arms_crossed') {
      hipsBobY = Math.sin(t * 3.2) * 0.022;
      headBobX = Math.sin(t * 6.4) * 0.045; // Swagger head nod to the beat
      headBobZ = Math.sin(t * 3.2) * 0.03;
    } else if (poseKey === 'slammed_squashed_on_ground') {
      const tremor = Math.sin(t * 38.0) * 0.02;
      headBobZ = tremor;
      armFlailL = tremor * 1.5;
      armFlailR = -tremor * 1.5;
    } else if (poseKey === 'sitting_dazed_rubbing_head') {
      headBobZ = Math.sin(t * 4.2) * 0.10;
      headBobY = Math.cos(t * 3.5) * 0.08;
      armFlailR = Math.sin(t * 8.5) * 0.10; // Rubbing head in circles
    }

    // Apply Hips & Torso
    hipsGroup.position.set(0, curPose.hipsY + hipsBobY, 0);
    hipsGroup.rotation.set(curPose.hipsRx + hipsLeanX, curPose.hipsRy + hipsTwistY, curPose.hipsRz + hipsLeanZ);

    torsoPivot.rotation.set(
      curPose.torsoRx + breath + torsoLeanX,
      curPose.torsoRy + torsoTwistY,
      curPose.torsoRz
    );

    // Apply Head
    headPivot.rotation.set(
      curPose.headRx + headBobX,
      curPose.headRy + headBobY,
      curPose.headRz + headBobZ
    );

    // Apply Legs
    legL.hipPivot.rotation.set(curPose.hipLRx + legKickL, curPose.hipLRy, curPose.hipLRz);
    legL.kneePivot.rotation.set(Math.max(0, curPose.kneeLRx - legKickL * 0.45), 0, 0);
    legL.anklePivot.rotation.set(curPose.ankleLRx, 0, 0);

    legR.hipPivot.rotation.set(curPose.hipRRx + legKickR, curPose.hipRRy, curPose.hipRRz);
    legR.kneePivot.rotation.set(Math.max(0, curPose.kneeRRx - legKickR * 0.45), 0, 0);
    legR.anklePivot.rotation.set(curPose.ankleRRx, 0, 0);

    // Apply Arms (Base pose + flail)
    armL.shoulderPivot.rotation.set(
      curPose.shLRx + armFlailL * 0.55,
      curPose.shLRy,
      curPose.shLRz + armFlailL
    );
    armL.elbowPivot.rotation.set(curPose.elLRx + armFlailL * 0.35, 0, 0);
    armL.wristPivot.rotation.set(curPose.wrLRx, curPose.wrLRy, curPose.wrLRz);

    armR.shoulderPivot.rotation.set(
      curPose.shRRx + armFlailR * 0.55,
      curPose.shRRy,
      curPose.shRRz - armFlailR
    );
    armR.elbowPivot.rotation.set(curPose.elRRx + armFlailR * 0.35, 0, 0);
    armR.wristPivot.rotation.set(curPose.wrRRx, curPose.wrRRy, curPose.wrRRz);

    // 4. Exact Twist-Free Analytical 2-Bone IK Reach for Right Index Finger Poking Apple
    if (pokeAmount > 0.01) {
      group.updateMatrixWorld(true);
      armR.shoulderPivot.getWorldPosition(_shWorld);

      const effectivePoke = Math.max(0, pokeAmount * (1.0 - recoilAmount * 0.85));
      _pokeLocalTarget.copy(_pokeWorldTarget);
      torsoPivot.worldToLocal(_pokeLocalTarget);

      // Vector from shoulderR to fingertip target in torsoPivot space
      _dirVec.copy(_pokeLocalTarget).sub(armR.shoulderPivot.position);
      const upperLen = 0.265;
      const foreToFingerLen = 0.375; // forearm (0.245) + palm (0.062) + index (0.068)
      const maxReach = upperLen + foreToFingerLen - 0.012;
      const dist = Math.min(maxReach, Math.max(0.18, _dirVec.length()));
      _dirVec.normalize();

      // Elbow pole pointing downward and outward-right (-X, -Y, -Z)
      _elbowDir.set(-0.55, -0.70, -0.25).normalize();
      _perpA.copy(_elbowDir).addScaledVector(_dirVec, -_elbowDir.dot(_dirVec));
      if (_perpA.lengthSq() < 1e-5) _perpA.set(0, -1, 0);
      _perpA.normalize();

      const cosA = Math.max(-1, Math.min(1,
        (upperLen * upperLen + dist * dist - foreToFingerLen * foreToFingerLen) / (2 * upperLen * dist)
      ));
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

      _elbowPos.copy(armR.shoulderPivot.position)
        .addScaledVector(_dirVec, cosA * upperLen)
        .addScaledVector(_perpA, sinA * upperLen);

      _upperVec.copy(_elbowPos).sub(armR.shoulderPivot.position).normalize();
      _foreVec.copy(_dirVec).multiplyScalar(dist).add(armR.shoulderPivot.position).sub(_elbowPos).normalize();

      // Build twist-free orthonormal basis where -armY aligns with _upperVec and armX is hinge axis
      _armY.copy(_upperVec).negate();
      _armX.crossVectors(_dirVec, _perpA);
      if (_armX.lengthSq() < 1e-6) {
        _armX.set(1, 0, 0);
      } else {
        _armX.normalize();
      }
      _armZ.crossVectors(_armX, _armY).normalize();
      _ikMat.makeBasis(_armX, _armY, _armZ);
      _qAimA.setFromRotationMatrix(_ikMat);

      _qAimB.setFromEuler(armR.shoulderPivot.rotation);
      _qAimB.slerp(_qAimA, effectivePoke);
      armR.shoulderPivot.quaternion.copy(_qAimB);

      // Compute exact elbow bend angle in the (_armY, _armZ) plane: -angle bends -Y toward +Z!
      const elbowCos = Math.max(-1, Math.min(1, _upperVec.dot(_foreVec)));
      const targetElbowAngle = -Math.acos(elbowCos);
      armR.elbowPivot.rotation.set(
        armR.elbowPivot.rotation.x + (targetElbowAngle - armR.elbowPivot.rotation.x) * effectivePoke,
        0,
        0
      );
      armR.wristPivot.rotation.x *= (1 - effectivePoke);
      armR.wristPivot.rotation.y *= (1 - effectivePoke);
      armR.wristPivot.rotation.z *= (1 - effectivePoke);
    }

    // Fingers Curl vs Spread vs Point
    const lCurl = (1 - curPose.fingerLOpen) * 1.15;
    for (let i = 0; i < armL.fingerPivots.length; i++) {
      armL.fingerPivots[i].base.rotation.x = -lCurl;
      armL.fingerPivots[i].mid.rotation.x = -lCurl * 0.9;
    }
    armL.indexPivot.rotation.x = -lCurl * 0.9;
    armL.indexDistPivot.rotation.x = -lCurl * 0.8;

    const rCurl = (1 - curPose.fingerROpen) * 1.15;
    const pokeCurlBoost = pokeAmount * (1 - recoilAmount);
    for (let i = 0; i < armR.fingerPivots.length; i++) {
      const curl = Math.max(rCurl, pokeCurlBoost * 1.35);
      armR.fingerPivots[i].base.rotation.x = -curl;
      armR.fingerPivots[i].mid.rotation.x = -curl * 0.95;
    }
    // Index finger straightens crisp for poking!
    const indexCurl = (1 - Math.max(curPose.indexRExt, pokeCurlBoost)) * 1.05;
    armR.indexPivot.rotation.x = -indexCurl;
    armR.indexDistPivot.rotation.x = -indexCurl * 0.85;

    // 5. Face Rig: Eyelids, Auto-Blink, Eyebrows, Jaw, Lips, Eye Look Tracking
    // Periodic natural blink (~every 3.6s, brief 0.14s blink) unless already shocked/wincing
    const blinkCycle = t % 3.6;
    const autoBlink = (blinkCycle > 3.42 && blinkCycle < 3.56 && curExpr.upperLidL > -0.25)
      ? Math.sin(((blinkCycle - 3.42) / 0.14) * Math.PI)
      : 0;

    // Nose-bonk wince override during recoil
    const bonkWince = exprKey === 'confused_then_nose_bonk'
      ? Math.min(1, recoilAmount * 1.4)
      : curExpr.wince;

    const lidLClose = Math.max(autoBlink, bonkWince * 0.95);
    const lidRClose = Math.max(autoBlink, bonkWince * 0.95);

    const upLidL = THREE.MathUtils.lerp(curExpr.upperLidL, 0.95, lidLClose);
    const upLidR = THREE.MathUtils.lerp(curExpr.upperLidR, 0.95, lidRClose);
    const loLidL = THREE.MathUtils.lerp(curExpr.lowerLidL, 0.72, lidLClose);
    const loLidR = THREE.MathUtils.lerp(curExpr.lowerLidR, 0.72, lidRClose);

    eyeL.upperLidPivot.rotation.x = -0.34 + upLidL * 0.92;
    eyeR.upperLidPivot.rotation.x = -0.34 + upLidR * 0.92;
    eyeL.lowerLidPivot.rotation.x = 0.25 - loLidL * 0.62;
    eyeR.lowerLidPivot.rotation.x = 0.25 - loLidR * 0.62;

    // Squish nose tip subtly on nose bonk recoil
    const noseSquish = bonkWince * 0.30;
    noseGroup.scale.set(1 + noseSquish * 0.45, 1 + noseSquish * 0.25, 1 - noseSquish * 0.65);

    // Eyebrows
    const browFurrow = bonkWince * 0.25;
    browL.position.y = 0.072 + curExpr.browLY - bonkWince * 0.008;
    browR.position.y = 0.072 + curExpr.browRY - bonkWince * 0.008;
    browL.rotation.z = curExpr.browLTilt - browFurrow;
    browR.rotation.z = curExpr.browRTilt + browFurrow;

    // Eye Look Tracking
    if (state.lookTarget) {
      setVec3OrArr(_worldLook, state.lookTarget, 0, 1.65, 2.0);
    } else {
      _worldLook.set(0, 1.65, 2.0);
    }
    updateEyeLook(eyeL, _worldLook, bonkWince, curExpr.swirl, t);
    updateEyeLook(eyeR, _worldLook, bonkWince, curExpr.swirl, t);

    // Articulated Jaw & Talking Mouth (driven by mouthOpen + expression)
    const jawAmt = Math.min(1.0, Math.max(curExpr.jawDrop, mouthOpen * 0.85));
    jawGroup.rotation.x = jawAmt * 0.42;
    jawGroup.position.y = -0.068 - jawAmt * 0.012;

    const mouthOpenFinal = Math.min(1.0, Math.max(mouthOpen, curExpr.jawDrop * 0.72));
    mouthCavity.scale.set(curExpr.mouthWide, 0.12 + mouthOpenFinal * 0.92, 0.55);
    mouthCavity.position.y = -0.002 - mouthOpenFinal * 0.012;
    upperTeeth.visible = mouthOpenFinal > 0.12 || curExpr.smile > 0.45;
    lowerTeeth.visible = mouthOpenFinal > 0.16;
    tongue.visible = mouthOpenFinal > 0.20;

    const cornerBend = curExpr.smile * 0.24;
    const smirkSkew = exprKey === 'cool_smirk' ? 0.10 : 0.0;

    upperLipL.position.y = 0.004 + mouthOpenFinal * 0.004;
    upperLipR.position.y = 0.004 + mouthOpenFinal * 0.004;
    upperLipL.rotation.z = cornerBend * 0.72 + smirkSkew;
    upperLipR.rotation.z = -cornerBend * 0.62 + smirkSkew;

    lowerLipL.position.y = -0.004 - mouthOpenFinal * 0.028;
    lowerLipR.position.y = -0.004 - mouthOpenFinal * 0.028;
    lowerLipL.rotation.z = cornerBend * 0.85 + smirkSkew;
    lowerLipR.rotation.z = -cornerBend * 0.72 + smirkSkew;

    mouthGroup.scale.set(curExpr.mouthWide, 1.0, 1.0);
    mouthGroup.rotation.z = smirkSkew * 0.6; // Cheeky smirk asymmetry

    // 6. Detachable Floating Powdered Wig & Under-Wig Hair Reveal
    realHairCap.visible = wigDetached > 0.02;
    cowlickMesh.visible = wigDetached > 0.04;
    if (cowlickMesh.visible) {
      cowlickMesh.scale.setScalar(Math.min(1, wigDetached * 2.5));
    }
    if (wigDetached > 0.001) {
      const floatBob = Math.sin(t * 3.1) * 0.032 * wigDetached;
      wigGroup.position.set(
        Math.sin(t * 1.9) * 0.024 * wigDetached,
        wigDetached * 0.24 + floatBob,
        Math.cos(t * 2.2) * 0.018 * wigDetached
      );
      wigGroup.rotation.set(
        Math.sin(t * 2.3) * 0.14 * wigDetached,
        Math.sin(t * 1.6) * 0.20 * wigDetached,
        Math.cos(t * 2.7) * 0.16 * wigDetached
      );
    } else {
      wigGroup.position.set(0, 0, 0);
      wigGroup.rotation.set(0, 0, 0);
    }

    // 7. Cool 3D Sunglasses (Snap onto nose bridge; askew if bonked!)
    if (sunglassesOn > 0.01) {
      sunglassesGroup.visible = true;
      const dropIn = 1.0 - sunglassesOn;
      sunglassesGroup.position.set(0, 0.030 + dropIn * 0.22, 0.172 + dropIn * 0.16);
      const bonkTilt = (poseKey === 'slammed_squashed_on_ground' || poseKey === 'sitting_dazed_rubbing_head') ? 0.26 : 0.0;
      sunglassesGroup.rotation.set(-dropIn * 0.45, 0, bonkTilt);
      sunglassesGroup.scale.setScalar(0.85 + 0.15 * sunglassesOn);
    } else {
      sunglassesGroup.visible = false;
    }

    // 8. Orbiting Golden Daze Stars
    if (dazeStarsAmt > 0.01) {
      dazeStarsGroup.visible = true;
      dazeStarsGroup.scale.setScalar(dazeStarsAmt);
      dazeStarsGroup.rotation.z = 0.08 * Math.sin(t * 2.0);
      dazeStarsGroup.rotation.x = 0.18;
      for (let i = 0; i < dazeStars.length; i++) {
        const angle = t * 4.2 + (i / dazeStars.length) * Math.PI * 2;
        const star = dazeStars[i];
        star.position.set(
          Math.cos(angle) * 0.24,
          Math.sin(angle * 2.0) * 0.025,
          Math.sin(angle) * 0.20
        );
        star.rotation.y = -angle + t * 3.0;
        star.rotation.z = Math.sin(t * 5.0 + i) * 0.25;
      }
    } else {
      dazeStarsGroup.visible = false;
    }

    // 9. Comedy Props: Leather Notebook & Feathered Quill
    group.updateMatrixWorld(true);
    _invGroupMat.copy(group.matrixWorld).invert();

    if (quillFloating || curPose.notebookMode === 'floating') {
      notebookGroup.visible = true;
      quillGroup.visible = true;
      // Orbit buoyantly in zero-G beside Chewton
      notebookGroup.position.set(
        -0.38 + Math.sin(t * 1.4) * 0.05,
        1.52 + Math.sin(t * 2.0) * 0.09,
        0.24 + Math.cos(t * 1.6) * 0.05
      );
      notebookGroup.rotation.set(0.45 + Math.sin(t * 1.2) * 0.25, 0.55 + t * 0.5, -0.32);

      quillGroup.position.set(
        0.34 + Math.cos(t * 1.7) * 0.05,
        1.78 + Math.cos(t * 2.3) * 0.11,
        0.22 + Math.sin(t * 1.9) * 0.04
      );
      quillGroup.rotation.set(0.35 + Math.sin(t * 1.5) * 0.28, t * 0.7, 0.48 + Math.cos(t * 1.8) * 0.2);
    } else if (curPose.notebookMode === 'handL') {
      notebookGroup.visible = true;
      armL.handGroup.getWorldPosition(_handPos);
      armL.handGroup.getWorldQuaternion(_handQuat);

      // Offset cleanly outward along left hand local palm normal (+Z) & slightly toward palm center (-Y)
      // so the leather back cover rests on the palm/fingers while white pages face upward clear of fingers!
      _dirVec.set(-0.014, -0.024, 0.050).applyQuaternion(_handQuat);
      _handPos.add(_dirVec);

      _handMat.compose(_handPos, _handQuat, _dirVec.set(1, 1, 1));
      _handMat.premultiply(_invGroupMat);
      _handMat.decompose(notebookGroup.position, notebookGroup.quaternion, _dirVec);

      _eulerScratch.set(0.18, -0.14, -0.16);
      _qAimA.setFromEuler(_eulerScratch);
      notebookGroup.quaternion.multiply(_qAimA);

      if (curPose.quillMode === 'handR') {
        quillGroup.visible = true;
        armR.handGroup.getWorldPosition(_handPos);
        armR.handGroup.getWorldQuaternion(_handQuat);
        _handMat.compose(_handPos, _handQuat, _dirVec.set(1, 1, 1));
        _handMat.premultiply(_invGroupMat);
        _handMat.decompose(quillGroup.position, quillGroup.quaternion, _dirVec);
        _eulerScratch.set(-0.65, 0.2, 0.25);
        _qAimA.setFromEuler(_eulerScratch);
        quillGroup.quaternion.multiply(_qAimA);
      } else {
        quillGroup.visible = false;
      }
    } else {
      notebookGroup.visible = false;
      quillGroup.visible = false;
    }
  }

  return {
    group,
    getHeadWorldPos,
    update,
  };
}
