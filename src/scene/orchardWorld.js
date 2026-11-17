import * as THREE from 'three';

const ANCHOR_BRANCH_DROP = new THREE.Vector3(0.15, 2.95, 0.25);
const DEFAULT_BONK_TARGET = [-0.35, 1.82, 0.0];

function seededRandom(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeOutBack(x) {
  const t = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function createProceduralTexture(width, height, drawFn, options = {}) {
  const {
    srgb = true,
    repeatX = 1,
    repeatY = 1,
    wrapS = THREE.RepeatWrapping,
    wrapT = THREE.RepeatWrapping,
    anisotropy = 4,
    fallbackColor = [128, 160, 96, 255]
  } = options;

  let texture;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawFn(ctx, width, height);
    }
    texture = new THREE.CanvasTexture(canvas);
  } else {
    const data = new Uint8Array(fallbackColor);
    texture = new THREE.DataTexture(data, 1, 1);
  }

  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = wrapS;
  texture.wrapT = wrapT;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createGrassTextures() {
  const wrapDraw = (w, h, margin, fn) => {
    const offsets = [0];
    fn(0, 0);
    const nearLeft = margin.x < margin.r;
    const nearRight = margin.x > w - margin.r;
    const nearTop = margin.y < margin.r;
    const nearBot = margin.y > h - margin.r;
    if (nearLeft) offsets.push(w);
    if (nearRight) offsets.push(-w);
    const yOffsets = [0];
    if (nearTop) yOffsets.push(h);
    if (nearBot) yOffsets.push(-h);
    for (let xi = 0; xi < offsets.length; xi++) {
      for (let yi = 0; yi < yOffsets.length; yi++) {
        if (xi === 0 && yi === 0) continue;
        fn(offsets[xi], yOffsets[yi]);
      }
    }
  };

  const albedo = createProceduralTexture(
    512,
    512,
    (ctx, w, h) => {
      // Uniform base tone so periodic wrapping has zero tile-grid borders
      ctx.fillStyle = '#65ae3e';
      ctx.fillRect(0, 0, w, h);

      // Soft sunlit and shaded orchard patches wrapped seamlessly across edges
      for (let i = 0; i < 48; i++) {
        const x = seededRandom(i * 3.1) * w;
        const y = seededRandom(i * 7.3) * h;
        const r = 34 + seededRandom(i * 11.7) * 64;
        const warm = i % 2 === 0;
        wrapDraw(w, h, { x, y, r: r + 2 }, (ox, oy) => {
          const px = x + ox;
          const py = y + oy;
          const pGrad = ctx.createRadialGradient(px, py, 2, px, py, r);
          pGrad.addColorStop(0, warm ? 'rgba(148, 208, 72, 0.14)' : 'rgba(54, 114, 34, 0.12)');
          pGrad.addColorStop(1, 'rgba(101, 174, 62, 0)');
          ctx.fillStyle = pGrad;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Painterly grass strokes wrapped seamlessly across edges
      const bladeColors = ['#7dc448', '#529133', '#8fd054', '#68ad3c', '#a8d664'];
      for (let i = 0; i < 1600; i++) {
        const x = seededRandom(i * 1.73 + 5) * w;
        const y = seededRandom(i * 2.91 + 9) * h;
        const len = 6 + seededRandom(i * 4.13) * 12;
        const tilt = (seededRandom(i * 6.07) - 0.5) * 6;
        ctx.strokeStyle = bladeColors[i % bladeColors.length];
        ctx.lineWidth = 1.2 + seededRandom(i * 8.11) * 1.4;
        wrapDraw(w, h, { x, y, r: 20 }, (ox, oy) => {
          const sx = x + ox;
          const sy = y + oy;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx + tilt * 0.5, sy - len * 0.6, sx + tilt, sy - len);
          ctx.stroke();
        });
      }

      // Tiny clover specks & golden soil dots wrapped seamlessly
      for (let i = 0; i < 140; i++) {
        const x = seededRandom(i * 9.3 + 17) * w;
        const y = seededRandom(i * 5.7 + 23) * h;
        const rad = 1.6 + seededRandom(i * 3.3) * 2.0;
        ctx.fillStyle = i % 5 === 0 ? 'rgba(246, 232, 130, 0.36)' : 'rgba(63, 126, 40, 0.42)';
        wrapDraw(w, h, { x, y, r: rad + 2 }, (ox, oy) => {
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    { srgb: true, repeatX: 18, repeatY: 18 }
  );

  const bump = createProceduralTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) {
        const x = seededRandom(i * 2.13) * w;
        const y = seededRandom(i * 3.77) * h;
        const len = 6 + seededRandom(i * 4.4) * 6;
        const dx = (seededRandom(i * 7.1) - 0.5) * 4;
        const bright = Math.floor(92 + seededRandom(i * 5.19) * 124);
        ctx.strokeStyle = `rgb(${bright},${bright},${bright})`;
        ctx.lineWidth = 1.4;
        wrapDraw(w, h, { x, y, r: 16 }, (ox, oy) => {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + dx, y + oy - len);
          ctx.stroke();
        });
      }
    },
    { srgb: false, repeatX: 18, repeatY: 18 }
  );

  return { albedo, bump };
}

function createBarkTextures() {
  const albedo = createProceduralTexture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#5a3a26';
      ctx.fillRect(0, 0, w, h);

      // Vertical bark ridges
      for (let i = 0; i < 160; i++) {
        const x = seededRandom(i * 3.17) * w;
        const y = seededRandom(i * 6.41) * h;
        const rw = 3 + seededRandom(i * 2.1) * 9;
        const rh = 40 + seededRandom(i * 8.3) * 110;
        const shades = ['#3e2517', '#6d4730', '#4c2f1e', '#7e563b'];
        ctx.fillStyle = shades[i % shades.length];
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Subtle bark furrows & warm golden rim highlights
      for (let i = 0; i < 240; i++) {
        const x = seededRandom(i * 5.71) * w;
        const y = seededRandom(i * 1.93) * h;
        const len = 18 + seededRandom(i * 7.11) * 55;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(32, 18, 10, 0.55)' : 'rgba(138, 96, 65, 0.35)';
        ctx.lineWidth = 1.4 + seededRandom(i * 4.9) * 2.0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (seededRandom(i * 2.2) - 0.5) * 8, y + len * 0.5, x, y + len);
        ctx.stroke();
      }

      // Knot details
      for (let k = 0; k < 4; k++) {
        const kx = 40 + seededRandom(k * 19.3) * (w - 80);
        const ky = 70 + seededRandom(k * 23.7) * (h - 140);
        for (let r = 22; r > 4; r -= 5) {
          ctx.strokeStyle = r < 10 ? '#2b180e' : '#4a2e1d';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.ellipse(kx, ky, r * 0.65, r, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
    { srgb: true, repeatX: 2, repeatY: 4 }
  );

  const bump = createProceduralTexture(
    256,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const x = seededRandom(i * 5.71) * w;
        const y = seededRandom(i * 1.93) * h;
        const len = 20 + seededRandom(i * 7.11) * 60;
        ctx.strokeStyle = i % 2 === 0 ? '#222222' : '#d6d6d6';
        ctx.lineWidth = 2.0 + seededRandom(i * 4.9) * 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (seededRandom(i * 2.2) - 0.5) * 6, y + len);
        ctx.stroke();
      }
    },
    { srgb: false, repeatX: 2, repeatY: 4 }
  );

  return { albedo, bump };
}

function createWoodTexture() {
  return createProceduralTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#976944';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) {
        const y = seededRandom(i * 3.13) * h;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(92, 56, 30, 0.35)' : 'rgba(186, 138, 92, 0.35)';
        ctx.lineWidth = 1 + seededRandom(i * 7.7) * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.33, y + (seededRandom(i) - 0.5) * 8, w * 0.66, y + (seededRandom(i + 1) - 0.5) * 8, w, y);
        ctx.stroke();
      }
    },
    { srgb: true, repeatX: 1, repeatY: 1 }
  );
}

function createTextbookCoverTexture() {
  return createProceduralTexture(
    512,
    680,
    (ctx, w, h) => {
      // Rich royal blue hardcover base
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#18376e');
      bg.addColorStop(0.55, '#1f498f');
      bg.addColorStop(1, '#10264e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Gold double border
      ctx.strokeStyle = '#ffd452';
      ctx.lineWidth = 8;
      ctx.strokeRect(22, 22, w - 44, h - 44);
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 36, w - 72, h - 72);

      // Header band
      ctx.fillStyle = '#ffd452';
      ctx.fillRect(52, 62, w - 104, 52);
      ctx.fillStyle = '#122854';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('1666 EDITION', w / 2, 89);

      // Main title: PHYSICS:
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 76px sans-serif';
      ctx.fillText('PHYSICS:', w / 2, 185);

      // Comic Newton apple + orbital rings graphic in center
      const cx = w / 2;
      const cy = 355;
      ctx.strokeStyle = 'rgba(130, 212, 255, 0.75)';
      ctx.lineWidth = 5;
      for (let a = 0; a < 3; a++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((a * Math.PI) / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, 128, 46, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Red apple center emblem
      ctx.fillStyle = '#e62e2d';
      ctx.beginPath();
      ctx.arc(cx, cy + 8, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#53b838';
      ctx.beginPath();
      ctx.ellipse(cx + 18, cy - 42, 18, 9, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Giant tilted red stamp: CANCELLED
      ctx.save();
      ctx.translate(cx, cy + 68);
      ctx.rotate(-0.18);
      ctx.fillStyle = 'rgba(220, 28, 36, 0.94)';
      ctx.fillRect(-205, -56, 410, 112);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.strokeRect(-197, -48, 394, 96);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 66px sans-serif';
      ctx.fillText('CANCELLED', 0, 4);
      ctx.restore();

      // Bottom comic tag
      ctx.fillStyle = '#ffe373';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('NO HOMEWORK EDITION', w / 2, h - 84);
    },
    { srgb: true, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
}

function createBookPagesTexture() {
  return createProceduralTexture(
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f5ecd4';
      ctx.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 5) {
        ctx.fillStyle = y % 10 === 0 ? '#d8cbb0' : '#ebe0c6';
        ctx.fillRect(0, y, w, 2);
      }
    },
    { srgb: true, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
}

function createParchmentTexture() {
  return createProceduralTexture(
    256,
    256,
    (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.72);
      grad.addColorStop(0, '#f7ebd0');
      grad.addColorStop(1, '#d8bc8b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#4e3726';
      ctx.lineWidth = 3;
      for (let row = 0; row < 5; row++) {
        const y = 48 + row * 34;
        ctx.beginPath();
        ctx.moveTo(32, y);
        for (let x = 44; x < w - 34; x += 18) {
          ctx.lineTo(x, y + (seededRandom(row * 17 + x) - 0.5) * 9);
        }
        ctx.stroke();
      }
      // Crossed-out F = ma
      ctx.fillStyle = '#3b2416';
      ctx.font = 'italic bold 26px serif';
      ctx.fillText('F = m·a?', 52, 130);
      ctx.strokeStyle = '#c82828';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(45, 134);
      ctx.lineTo(175, 112);
      ctx.stroke();
    },
    { srgb: true, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
}

function createGlowSpriteTexture() {
  return createProceduralTexture(
    128,
    128,
    (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
      grad.addColorStop(0.28, 'rgba(255, 232, 150, 0.82)');
      grad.addColorStop(0.65, 'rgba(255, 195, 85, 0.25)');
      grad.addColorStop(1, 'rgba(255, 180, 60, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: true, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
}

function createTaperedTubeGeometry(curve, tubularSegments, radialSegments, radiusFn) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const vertexCount = (tubularSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];

  const p = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  let vIdx = 0;
  let uvIdx = 0;

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    curve.getPointAt(u, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const radius = radiusFn(u);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      // Subtle organic bark fluting along circumference
      const flute = 1 + 0.05 * Math.sin(v * 5 + u * 8) * (1 - u * 0.6);
      const r = radius * flute;

      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();

      vertex.x = p.x + r * normal.x;
      vertex.y = p.y + r * normal.y;
      vertex.z = p.z + r * normal.z;

      positions[vIdx] = vertex.x;
      positions[vIdx + 1] = vertex.y;
      positions[vIdx + 2] = vertex.z;

      normals[vIdx] = normal.x;
      normals[vIdx + 1] = normal.y;
      normals[vIdx + 2] = normal.z;

      uvs[uvIdx] = j / radialSegments;
      uvs[uvIdx + 1] = u;

      vIdx += 3;
      uvIdx += 2;
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + (j + 1);
      const d = (radialSegments + 1) * i + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function terrainHeight(x, z) {
  const distSq = x * x + z * z;
  const stageFlatness = smoothstep(2.0, 6.0, Math.sqrt(distSq));
  const gentleRoll =
    Math.sin(x * 0.22 + 0.4) * Math.cos(z * 0.20 - 0.3) * 0.65 +
    Math.sin(x * 0.11 - z * 0.14) * 0.85;
  const backRise = smoothstep(-2.5, -18.0, z) * 2.1;
  const rimRise = smoothstep(10.0, 32.0, Math.sqrt(distSq)) * 2.4;
  return stageFlatness * (gentleRoll + backRise + rimRise);
}

function createFoliageBlob(radius, seed, leafPalette) {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const cTop = new THREE.Color(leafPalette.top);
  const cMid = new THREE.Color(leafPalette.mid);
  const cBot = new THREE.Color(leafPalette.bot);
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = Math.sin(v.x * 3.1 + seed * 5.0) * Math.cos(v.y * 2.7 - seed * 3.1);
    const n2 = Math.cos(v.z * 3.4 + seed * 7.2) * 0.5;
    const scale = 1 + 0.14 * n1 + 0.08 * n2;
    v.multiplyScalar(scale);
    v.y *= 0.82; // slightly pillowy orchard canopy
    pos.setXYZ(i, v.x, v.y, v.z);

    const hNorm = clamp01((v.y / radius + 0.85) / 1.7);
    const sunSide = clamp01((-v.x * 0.45 + v.y * 0.85) / (radius * 1.4) + 0.5);
    const blend = clamp01(hNorm * 0.65 + sunSide * 0.35);
    if (blend < 0.5) {
      cTmp.copy(cBot).lerp(cMid, blend * 2);
    } else {
      cTmp.copy(cMid).lerp(cTop, (blend - 0.5) * 2);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function createMiniatureApple(appleMat, stemMat, leafMat, scale = 1.0) {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.11 * scale, 14, 12);
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z) / (0.11 * scale);
    const indent = r < 0.45 ? 1 - (0.45 - r) * 0.45 : 1.0;
    const taper = y < 0 ? 0.92 : 1.04;
    pos.setXYZ(i, x * taper, y * 0.96 * indent, z * taper);
  }
  bodyGeo.computeVertexNormals();

  const body = new THREE.Mesh(bodyGeo, appleMat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01 * scale, 0.013 * scale, 0.06 * scale, 6),
    stemMat
  );
  stem.position.y = 0.11 * scale;
  stem.rotation.z = 0.18;
  g.add(stem);

  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.036 * scale, 8, 6),
    leafMat
  );
  leaf.scale.set(1.4, 0.35, 0.75);
  leaf.position.set(0.032 * scale, 0.125 * scale, 0);
  leaf.rotation.z = 0.45;
  g.add(leaf);

  return g;
}

function createStarMesh(radius, thickness, material) {
  const shape = new THREE.Shape();
  const spikes = 4;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.34;
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.3,
    bevelSize: thickness * 0.25,
    bevelSegments: 1
  });
  geo.center();
  return new THREE.Mesh(geo, material);
}

export function createOrchardWorld() {
  const group = new THREE.Group();
  group.name = 'OrchardWorld';

  // -------------------------------------------------------------------------
  // 1. Procedural Sky Dome with Golden-Hour -> Twist 3 Concert Mood Shift
  // -------------------------------------------------------------------------
  const skyUniforms = {
    uTime: { value: 0 },
    uSpotlight: { value: 0 },
    uZeroGravity: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.52, 0.36, -0.77).normalize() }
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSpotlight;
      uniform float uZeroGravity;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, -0.2, 1.0);

        // Golden-hour storybook orchard gradient
        vec3 dayZenith = vec3(0.18, 0.45, 0.78);
        vec3 dayMid = vec3(0.47, 0.73, 0.90);
        vec3 dayHorizon = vec3(1.00, 0.74, 0.50);
        vec3 dayGround = vec3(0.86, 0.58, 0.42);

        vec3 dayCol = mix(dayHorizon, dayMid, smoothstep(0.0, 0.26, h));
        dayCol = mix(dayCol, dayZenith, smoothstep(0.22, 0.78, h));
        dayCol = mix(dayGround, dayCol, smoothstep(-0.14, 0.03, h));

        // Warm sun halo & soft solar disc
        float sunAmt = max(dot(dir, uSunDir), 0.0);
        dayCol += vec3(1.0, 0.78, 0.44) * pow(sunAmt, 7.0) * 0.42;
        dayCol += vec3(1.0, 0.94, 0.76) * smoothstep(0.996, 0.9994, sunAmt) * 0.85;

        // Twist 3 dramatic indigo concert spotlight sky
        vec3 spotZenith = vec3(0.04, 0.05, 0.17);
        vec3 spotMid = vec3(0.10, 0.11, 0.30);
        vec3 spotHorizon = vec3(0.26, 0.14, 0.36);

        vec3 spotCol = mix(spotHorizon, spotMid, smoothstep(0.0, 0.30, h));
        spotCol = mix(spotCol, spotZenith, smoothstep(0.28, 0.80, h));

        // Subtle star sparkles when spotlight mode or zero-G intensifies
        vec2 starUv = dir.xz / (abs(dir.y) + 0.35) * 32.0;
        vec2 starCell = floor(starUv);
        float starRand = hash21(starCell);
        if (starRand > 0.965 && dir.y > 0.08) {
          float dist = length(fract(starUv) - 0.5);
          float twinkle = 0.55 + 0.45 * sin(uTime * 4.0 + starRand * 40.0);
          float starGlow = smoothstep(0.28, 0.02, dist) * twinkle * uSpotlight;
          spotCol += vec3(1.0, 0.92, 0.65) * starGlow * 0.9;
        }

        // Subtle iridescent zero-G horizon boost
        dayCol += vec3(0.10, 0.06, 0.16) * uZeroGravity * smoothstep(0.0, 0.45, h) * 0.45;

        vec3 finalCol = mix(dayCol, spotCol, clamp(uSpotlight, 0.0, 1.0));
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  });

  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(120, 40, 28), skyMat);
  skyDome.name = 'SkyDome';
  group.add(skyDome);

  // -------------------------------------------------------------------------
  // 2. Stylized Layered Puffy 3D Clouds
  // -------------------------------------------------------------------------
  const cloudsGroup = new THREE.Group();
  cloudsGroup.name = 'Clouds';
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xfff5e6,
    emissive: 0xffc694,
    emissiveIntensity: 0.22,
    roughness: 0.92,
    metalness: 0.0
  });

  const cloudData = [];
  const cloudConfigs = [
    { x: -16, y: 12.5, z: -32, scale: 1.6, speed: 0.22 },
    { x: 14, y: 14.0, z: -38, scale: 1.9, speed: 0.16 },
    { x: -3.5, y: 15.2, z: -42, scale: 1.5, speed: 0.19 },
    { x: -24, y: 10.8, z: -24, scale: 1.35, speed: 0.26 },
    { x: 24, y: 11.4, z: -26, scale: 1.45, speed: 0.20 },
    { x: 7, y: 16.5, z: -48, scale: 2.1, speed: 0.14 },
    { x: -12, y: 13.8, z: 32, scale: 1.5, speed: 0.18 },
    { x: 15, y: 14.2, z: 34, scale: 1.6, speed: 0.15 }
  ];

  const puffGeo = new THREE.SphereGeometry(1, 14, 12);
  cloudConfigs.forEach((cfg, idx) => {
    const cg = new THREE.Group();
    const puffCount = 6;
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const tNorm = p / (puffCount - 1) - 0.5;
      const r = (1.15 - Math.abs(tNorm) * 0.75) * (0.85 + seededRandom(idx * 13 + p) * 0.35);
      puff.scale.set(r * 1.35, r * 0.85, r * 1.05);
      puff.position.set(
        tNorm * 3.8 + (seededRandom(idx * 7 + p) - 0.5) * 0.6,
        (1 - Math.abs(tNorm) * 1.4) * 0.55,
        (seededRandom(idx * 19 + p) - 0.5) * 0.8
      );
      cg.add(puff);
    }
    cg.position.set(cfg.x, cfg.y, cfg.z);
    cg.scale.setScalar(cfg.scale);
    cloudsGroup.add(cg);
    cloudData.push({
      mesh: cg,
      baseX: cfg.x,
      baseY: cfg.y,
      baseZ: cfg.z,
      speed: cfg.speed,
      seed: idx * 1.37
    });
  });
  group.add(cloudsGroup);

  // -------------------------------------------------------------------------
  // 3. Rolling Grassy Foreground Meadow & Distant Hills
  // -------------------------------------------------------------------------
  const { albedo: grassAlbedo, bump: grassBump } = createGrassTextures();
  const terrainGeo = new THREE.PlaneGeometry(78, 78, 84, 84);
  terrainGeo.rotateX(-Math.PI / 2);

  const tPos = terrainGeo.attributes.position;
  const tColors = new Float32Array(tPos.count * 3);
  const cGrassSun = new THREE.Color('#86cc49');
  const cGrassShade = new THREE.Color('#478831');
  const cGrassFar = new THREE.Color('#5a9848');
  const cWork = new THREE.Color();

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    const y = terrainHeight(x, z);
    tPos.setY(i, y);

    // Dappled shade under hero tree [0.65, -0.45]
    const treeDist = Math.hypot(x - 0.75, z + 0.45);
    const treeShade = 1.0 - smoothstep(0.6, 3.2, treeDist);
    const dist = Math.hypot(x, z);
    const farMix = smoothstep(8.0, 28.0, dist);

    cWork.copy(cGrassSun).lerp(cGrassShade, treeShade * 0.55);
    cWork.lerp(cGrassFar, farMix * 0.65);
    tColors[i * 3] = cWork.r;
    tColors[i * 3 + 1] = cWork.g;
    tColors[i * 3 + 2] = cWork.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: grassAlbedo,
    bumpMap: grassBump,
    bumpScale: 0.04,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'OrchardMeadow';
  group.add(terrainMesh);

  // Soft distant horizon hills framing 360 degrees
  const hillsGroup = new THREE.Group();
  hillsGroup.name = 'DistantHills';
  const hillConfigs = [
    { x: -18, z: -26, rx: 18, ry: 5.5, rz: 12, color: 0x568d4c },
    { x: 16, z: -28, rx: 20, ry: 6.2, rz: 13, color: 0x4f8449 },
    { x: 0, z: -38, rx: 28, ry: 8.5, rz: 15, color: 0x487a52 },
    { x: -32, z: -8, rx: 16, ry: 5.2, rz: 18, color: 0x52884b },
    { x: 32, z: -10, rx: 16, ry: 5.0, rz: 18, color: 0x52884b },
    { x: 0, z: 36, rx: 32, ry: 5.5, rz: 16, color: 0x4b7f4d }
  ];
  const hillBaseGeo = new THREE.SphereGeometry(1, 24, 16);
  hillConfigs.forEach((h) => {
    const mat = new THREE.MeshStandardMaterial({
      color: h.color,
      roughness: 0.94,
      metalness: 0.0
    });
    const m = new THREE.Mesh(hillBaseGeo, mat);
    m.scale.set(h.rx, h.ry, h.rz);
    m.position.set(h.x, -h.ry * 0.35, h.z);
    m.receiveShadow = true;
    hillsGroup.add(m);
  });
  group.add(hillsGroup);

  // -------------------------------------------------------------------------
  // 4. 3D Grass Tufts, Wildflowers & Mossy Stones (Instanced for speed)
  // -------------------------------------------------------------------------
  const tuftBladeGeo = new THREE.ConeGeometry(0.032, 0.22, 4);
  tuftBladeGeo.translate(0, 0.11, 0);
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0x76c243,
    roughness: 0.8
  });

  const tuftCount = 340;
  const tuftInst = new THREE.InstancedMesh(tuftBladeGeo, tuftMat, tuftCount);
  tuftInst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tuftTint = new THREE.Color();

  for (let i = 0; i < tuftCount; i++) {
    const angle = seededRandom(i * 4.31) * Math.PI * 2;
    const rad = 0.8 + Math.pow(seededRandom(i * 7.19), 0.72) * 14.5;
    let gx = Math.cos(angle) * rad;
    let gz = Math.sin(angle) * rad;
    // Keep Chewton's standing feet clear [-0.35, 0]
    if (Math.hypot(gx + 0.35, gz) < 0.55) {
      gx += 0.75;
    }
    const gy = terrainHeight(gx, gz);
    dummy.position.set(gx, gy - 0.02, gz);
    dummy.rotation.set(
      (seededRandom(i * 2.11) - 0.5) * 0.35,
      seededRandom(i * 5.23) * Math.PI * 2,
      (seededRandom(i * 9.07) - 0.5) * 0.35
    );
    const s = 0.7 + seededRandom(i * 6.43) * 0.85;
    dummy.scale.set(s, s * (0.85 + seededRandom(i * 1.9) * 0.6), s);
    dummy.updateMatrix();
    tuftInst.setMatrixAt(i, dummy.matrix);

    tuftTint.setHSL(0.25 + (seededRandom(i * 8.1) - 0.5) * 0.04, 0.58, 0.44 + seededRandom(i * 3.7) * 0.14);
    tuftInst.setColorAt(i, tuftTint);
  }
  tuftInst.instanceMatrix.needsUpdate = true;
  if (tuftInst.instanceColor) tuftInst.instanceColor.needsUpdate = true;
  group.add(tuftInst);

  // Wildflowers (stems + petals + sunny center)
  const flowerCount = 85;
  const flowerStemGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.18, 5);
  flowerStemGeo.translate(0, 0.09, 0);
  const flowerStemMat = new THREE.MeshStandardMaterial({ color: 0x4b9433, roughness: 0.8 });
  const flowerPetalGeo = new THREE.SphereGeometry(0.045, 7, 5);
  flowerPetalGeo.scale(1.15, 0.36, 1.15);
  flowerPetalGeo.translate(0, 0.18, 0);
  const flowerPetalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });

  const flowerStems = new THREE.InstancedMesh(flowerStemGeo, flowerStemMat, flowerCount);
  const flowerPetals = new THREE.InstancedMesh(flowerPetalGeo, flowerPetalMat, flowerCount);
  const flowerData = [];
  const flowerColors = [0xfff8e2, 0xffdf5e, 0xff92b2, 0xc3b4ff];

  for (let i = 0; i < flowerCount; i++) {
    const angle = seededRandom(i * 11.13 + 3) * Math.PI * 2;
    const rad = 1.25 + seededRandom(i * 5.87 + 7) * 10.5;
    const fx = Math.cos(angle) * rad;
    const fz = Math.sin(angle) * rad;
    const fy = terrainHeight(fx, fz);
    const scale = 0.8 + seededRandom(i * 3.19) * 0.55;
    flowerData.push({ x: fx, y: fy, z: fz, scale, phase: seededRandom(i * 7.7) * Math.PI * 2 });

    dummy.position.set(fx, fy - 0.01, fz);
    dummy.rotation.set(0, seededRandom(i * 2.3) * Math.PI, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    flowerStems.setMatrixAt(i, dummy.matrix);
    flowerPetals.setMatrixAt(i, dummy.matrix);

    tuftTint.setHex(flowerColors[i % flowerColors.length]);
    flowerPetals.setColorAt(i, tuftTint);
  }
  flowerStems.instanceMatrix.needsUpdate = true;
  flowerPetals.instanceMatrix.needsUpdate = true;
  if (flowerPetals.instanceColor) flowerPetals.instanceColor.needsUpdate = true;
  group.add(flowerStems, flowerPetals);

  // Mossy stones around tree roots & fence
  const stonesGroup = new THREE.Group();
  const stoneGeo = new THREE.DodecahedronGeometry(0.18, 1);
  const sPos = stoneGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const sx = sPos.getX(i);
    const sy = sPos.getY(i);
    const sz = sPos.getZ(i);
    const n = 1 + 0.16 * Math.sin(sx * 9 + sy * 7) * Math.cos(sz * 11);
    sPos.setXYZ(i, sx * n * 1.25, sy * n * 0.72, sz * n);
  }
  stoneGeo.computeVertexNormals();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7b8278, roughness: 0.9 });
  const mossCapMat = new THREE.MeshStandardMaterial({ color: 0x5c9b3a, roughness: 0.88 });

  const stonePlacements = [
    [1.12, -0.35, 0.95],
    [0.24, -0.82, 0.72],
    [1.36, -0.78, 0.65],
    [-1.45, -2.6, 1.3],
    [2.35, -2.9, 1.15],
    [-2.8, -1.9, 0.9],
    [3.1, -1.7, 1.05]
  ];
  stonePlacements.forEach(([sx, sz, sc], idx) => {
    const sg = new THREE.Group();
    const rock = new THREE.Mesh(stoneGeo, stoneMat);
    rock.castShadow = true;
    rock.receiveShadow = true;
    sg.add(rock);

    const moss = new THREE.Mesh(stoneGeo, mossCapMat);
    moss.scale.set(0.86, 0.45, 0.86);
    moss.position.y = 0.055;
    sg.add(moss);

    sg.position.set(sx, terrainHeight(sx, sz) + 0.03, sz);
    sg.rotation.y = seededRandom(idx * 4.2) * Math.PI * 2;
    sg.scale.setScalar(sc);
    stonesGroup.add(sg);
  });
  group.add(stonesGroup);

  // -------------------------------------------------------------------------
  // 5. Hero Gnarled 3D Apple Tree (Rooted at [0.65, 0.0, -0.45])
  //    Hero overhanging branch cleanly ends at [0.15, 2.95, 0.25]
  // -------------------------------------------------------------------------
  const heroTreeGroup = new THREE.Group();
  heroTreeGroup.name = 'HeroAppleTree';

  const { albedo: barkAlbedo, bump: barkBump } = createBarkTextures();
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkAlbedo,
    bumpMap: barkBump,
    bumpScale: 0.06,
    roughness: 0.9,
    metalness: 0.0
  });

  // Main Trunk
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.65, -0.06, -0.45),
    new THREE.Vector3(0.70, 0.75, -0.44),
    new THREE.Vector3(0.76, 1.60, -0.38),
    new THREE.Vector3(0.70, 2.38, -0.30),
    new THREE.Vector3(0.82, 3.15, -0.34),
    new THREE.Vector3(0.95, 3.85, -0.38)
  ]);
  const trunkGeo = createTaperedTubeGeometry(trunkCurve, 28, 12, (u) => {
    const rootFlare = u < 0.16 ? Math.pow(1 - u / 0.16, 2) * 0.14 : 0;
    return 0.24 * (1 - u * 0.68) + rootFlare;
  });
  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  heroTreeGroup.add(trunkMesh);

  // Gnarled Roots
  const rootAngles = [0.25, 1.55, 2.85, 4.05, 5.25];
  rootAngles.forEach((ang, idx) => {
    const rLen = 0.55 + seededRandom(idx * 3.9) * 0.28;
    const rx = 0.65 + Math.cos(ang) * rLen;
    const rz = -0.45 + Math.sin(ang) * rLen;
    const ry = terrainHeight(rx, rz);
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.65 + Math.cos(ang) * 0.12, 0.34, -0.45 + Math.sin(ang) * 0.12),
      new THREE.Vector3(0.65 + Math.cos(ang) * rLen * 0.55, 0.10, -0.45 + Math.sin(ang) * rLen * 0.55),
      new THREE.Vector3(rx, ry - 0.05, rz)
    ]);
    const rootGeo = createTaperedTubeGeometry(rootCurve, 10, 8, (u) => 0.11 * (1 - u * 0.78));
    const rootMesh = new THREE.Mesh(rootGeo, barkMat);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    heroTreeGroup.add(rootMesh);
  });

  // Hero Overhanging Branch -> ends cleanly at [0.15, 2.95, 0.25]
  const heroBranchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.71, 2.24, -0.31),
    new THREE.Vector3(0.56, 2.66, -0.14),
    new THREE.Vector3(0.36, 2.96, 0.06),
    new THREE.Vector3(0.22, 3.01, 0.19),
    new THREE.Vector3(0.15, 2.97, 0.25)
  ]);
  const heroBranchGeo = createTaperedTubeGeometry(heroBranchCurve, 22, 10, (u) => {
    return 0.115 * (1 - u * 0.78);
  });
  const heroBranchMesh = new THREE.Mesh(heroBranchGeo, barkMat);
  heroBranchMesh.castShadow = true;
  heroBranchMesh.receiveShadow = true;
  heroTreeGroup.add(heroBranchMesh);

  // Tiny woody twig nub & sprout leaves right above [0.15, 2.95, 0.25]
  const stemNubMat = new THREE.MeshStandardMaterial({ color: 0x4b2f1d, roughness: 0.85 });
  const stemNub = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.055, 6), stemNubMat);
  stemNub.position.set(0.15, 2.955, 0.25);
  heroTreeGroup.add(stemNub);

  const heroTwigLeafMat = new THREE.MeshStandardMaterial({
    color: 0x5fb83b,
    roughness: 0.65,
    side: THREE.DoubleSide
  });
  const twigLeaf1 = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), heroTwigLeafMat);
  twigLeaf1.scale.set(1.5, 0.28, 0.7);
  twigLeaf1.position.set(0.22, 3.03, 0.21);
  twigLeaf1.rotation.set(0.15, -0.35, 0.45);
  heroTreeGroup.add(twigLeaf1);

  const twigLeaf2 = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), heroTwigLeafMat);
  twigLeaf2.scale.set(1.4, 0.26, 0.68);
  twigLeaf2.position.set(0.10, 3.02, 0.18);
  twigLeaf2.rotation.set(-0.2, 0.45, -0.38);
  heroTreeGroup.add(twigLeaf2);

  // Secondary Crown Branches
  const secondaryBranches = [
    [
      new THREE.Vector3(0.75, 2.68, -0.33),
      new THREE.Vector3(1.15, 3.05, -0.15),
      new THREE.Vector3(1.55, 3.30, 0.02)
    ],
    [
      new THREE.Vector3(0.78, 2.95, -0.36),
      new THREE.Vector3(0.46, 3.38, -0.58),
      new THREE.Vector3(0.16, 3.68, -0.78)
    ],
    [
      new THREE.Vector3(0.84, 3.12, -0.34),
      new THREE.Vector3(1.22, 3.55, -0.68),
      new THREE.Vector3(1.58, 3.78, -0.96)
    ],
    [
      new THREE.Vector3(0.60, 2.75, -0.18),
      new THREE.Vector3(0.68, 3.28, 0.05),
      new THREE.Vector3(0.82, 3.65, 0.20)
    ]
  ];
  secondaryBranches.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = createTaperedTubeGeometry(curve, 14, 8, (u) => 0.095 * (1 - u * 0.72));
    const mesh = new THREE.Mesh(geo, barkMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    heroTreeGroup.add(mesh);
  });

  // Lush Stylized Canopy Foliage Clusters (positioned so [0.15, 2.95, 0.25] stays unobstructed!)
  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.0
  });
  const heroPalette = { top: '#8bd649', mid: '#4ca634', bot: '#296c2a' };

  const canopyBlobs = [
    [0.85, 3.95, -0.35, 1.05],
    [0.25, 3.72, -0.20, 0.72],
    [0.12, 3.58, 0.16, 0.56], // safely above 2.95 anchor (3.58 - 0.56*0.82 = 3.12!)
    [0.52, 3.68, 0.26, 0.64],
    [1.38, 3.62, -0.05, 0.88],
    [1.72, 3.32, 0.05, 0.68],
    [1.22, 4.18, -0.52, 0.92],
    [0.45, 4.25, -0.65, 0.85],
    [-0.18, 3.92, -0.58, 0.74],
    [1.60, 3.85, -0.82, 0.84],
    [0.85, 3.55, -0.98, 0.88],
    [1.05, 4.45, -0.25, 0.76],
    [0.62, 4.10, 0.02, 0.72],
    [1.32, 3.18, 0.34, 0.58]
  ];
  canopyBlobs.forEach(([cx, cy, cz, cr], idx) => {
    const geo = createFoliageBlob(cr, idx + 1, heroPalette);
    const mesh = new THREE.Mesh(geo, canopyMat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    heroTreeGroup.add(mesh);
  });

  // 9 Background Apples on the Tree (detach & float skyward when zeroGravity > 0!)
  const bgAppleMat = new THREE.MeshStandardMaterial({
    color: 0xd92626,
    roughness: 0.24,
    metalness: 0.04
  });
  const bgStemMat = new THREE.MeshStandardMaterial({ color: 0x4b2f1d, roughness: 0.8 });
  const bgLeafMat = new THREE.MeshStandardMaterial({ color: 0x62bd3c, roughness: 0.6 });

  const bgAppleSpots = [
    [0.64, 3.30, 0.32],
    [1.05, 3.18, 0.28],
    [1.46, 3.06, 0.22],
    [1.25, 3.58, 0.38],
    [0.42, 3.45, -0.10],
    [0.92, 3.85, 0.22],
    [1.62, 3.42, -0.22],
    [0.05, 3.42, -0.24],
    [1.18, 2.86, -0.04]
  ];

  const floatingApples = [];
  bgAppleSpots.forEach(([ax, ay, az], idx) => {
    const apple = createMiniatureApple(bgAppleMat, bgStemMat, bgLeafMat, 0.88 + (idx % 3) * 0.06);
    apple.position.set(ax, ay, az);
    heroTreeGroup.add(apple);
    floatingApples.push({
      mesh: apple,
      home: new THREE.Vector3(ax, ay, az),
      seed: seededRandom(idx * 17.3 + 2.1),
      driftHeight: 1.35 + seededRandom(idx * 9.7 + 1.4) * 1.65
    });
  });

  group.add(heroTreeGroup);

  // -------------------------------------------------------------------------
  // 6. Secondary Background Orchard Trees
  // -------------------------------------------------------------------------
  const bgTreesGroup = new THREE.Group();
  bgTreesGroup.name = 'BackgroundTrees';
  const bgPalette = { top: '#79be4a', mid: '#448f38', bot: '#285e2b' };
  const bgCanopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84
  });

  const bgTreeLocations = [
    { x: -4.4, z: -5.6, scale: 0.92, rot: 0.8 },
    { x: 4.8, z: -6.4, scale: 1.02, rot: -1.1 },
    { x: -7.8, z: -10.8, scale: 1.15, rot: 2.2 },
    { x: 7.4, z: -11.5, scale: 1.08, rot: -0.4 },
    { x: 0.4, z: -14.2, scale: 1.22, rot: 1.6 },
    { x: -5.8, z: 9.5, scale: 0.95, rot: 0.3 },
    { x: 6.2, z: 10.2, scale: 1.0, rot: 2.5 }
  ];

  const bgTrunkGeo = new THREE.CylinderGeometry(0.14, 0.25, 2.4, 8);
  bgTrunkGeo.translate(0, 1.2, 0);

  bgTreeLocations.forEach((loc, idx) => {
    const tg = new THREE.Group();
    const tMesh = new THREE.Mesh(bgTrunkGeo, barkMat);
    tMesh.castShadow = true;
    tMesh.receiveShadow = true;
    tg.add(tMesh);

    const blobOffsets = [
      [0, 2.95, 0, 1.08],
      [-0.65, 2.65, 0.25, 0.78],
      [0.68, 2.72, -0.18, 0.82],
      [0.12, 3.55, -0.22, 0.76]
    ];
    blobOffsets.forEach(([bx, by, bz, br], bIdx) => {
      const bMesh = new THREE.Mesh(createFoliageBlob(br, idx * 10 + bIdx, bgPalette), bgCanopyMat);
      bMesh.position.set(bx, by, bz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      tg.add(bMesh);
    });

    tg.position.set(loc.x, terrainHeight(loc.x, loc.z) - 0.05, loc.z);
    tg.rotation.y = loc.rot;
    tg.scale.setScalar(loc.scale);
    bgTreesGroup.add(tg);
  });
  group.add(bgTreesGroup);

  // -------------------------------------------------------------------------
  // 7. Rustic Wooden Pasture Fence & Harvest Props
  // -------------------------------------------------------------------------
  const woodTex = createWoodTexture();
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.86,
    metalness: 0.02
  });

  const fenceGroup = new THREE.Group();
  fenceGroup.name = 'PastureFence';
  const fencePts = [
    new THREE.Vector3(-6.8, 0, -2.6),
    new THREE.Vector3(-4.4, 0, -3.1),
    new THREE.Vector3(-2.1, 0, -3.4),
    new THREE.Vector3(0.2, 0, -3.55),
    new THREE.Vector3(2.5, 0, -3.45),
    new THREE.Vector3(4.8, 0, -3.1),
    new THREE.Vector3(7.0, 0, -2.5)
  ];

  const postGeo = new THREE.BoxGeometry(0.13, 0.92, 0.13);
  const capGeo = new THREE.ConeGeometry(0.10, 0.08, 4);
  capGeo.rotateY(Math.PI / 4);

  fencePts.forEach((pt, idx) => {
    const py = terrainHeight(pt.x, pt.z);
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(pt.x, py + 0.44, pt.z);
    post.rotation.z = (seededRandom(idx * 5.1) - 0.5) * 0.05;
    post.castShadow = true;
    post.receiveShadow = true;
    fenceGroup.add(post);

    const cap = new THREE.Mesh(capGeo, woodMat);
    cap.position.set(pt.x, py + 0.94, pt.z);
    fenceGroup.add(cap);

    if (idx < fencePts.length - 1) {
      const next = fencePts[idx + 1];
      const ny = terrainHeight(next.x, next.z);
      const dx = next.x - pt.x;
      const dy = ny - py;
      const dz = next.z - pt.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const yaw = Math.atan2(-dz, dx);

      [0.34, 0.68].forEach((railH) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.085, 0.055), woodMat);
        rail.position.set((pt.x + next.x) * 0.5, (py + ny) * 0.5 + railH, (pt.z + next.z) * 0.5);
        rail.rotation.y = yaw;
        rail.rotation.z = Math.atan2(dy, Math.hypot(dx, dz));
        rail.castShadow = true;
        rail.receiveShadow = true;
        fenceGroup.add(rail);
      });
    }
  });
  group.add(fenceGroup);

  // Wooden Harvest Crate near base of hero tree
  const crateGroup = new THREE.Group();
  crateGroup.name = 'HarvestCrate';
  const crateBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.40), woodMat);
  crateBase.position.y = 0.17;
  crateBase.castShadow = true;
  crateBase.receiveShadow = true;
  crateGroup.add(crateBase);

  // Crate trim slats
  const slatGeo = new THREE.BoxGeometry(0.55, 0.06, 0.43);
  [0.05, 0.31].forEach((sy) => {
    const slat = new THREE.Mesh(slatGeo, woodMat);
    slat.position.y = sy;
    crateGroup.add(slat);
  });
  // Two apples resting atop crate
  [
    [-0.1, 0.38, 0.05],
    [0.09, 0.38, -0.04]
  ].forEach(([cx, cy, cz]) => {
    const ca = createMiniatureApple(bgAppleMat, bgStemMat, bgLeafMat, 0.85);
    ca.position.set(cx, cy, cz);
    crateGroup.add(ca);
  });
  crateGroup.position.set(1.22, terrainHeight(1.22, -0.92), -0.92);
  crateGroup.rotation.y = -0.45;
  group.add(crateGroup);

  // 1666 Inkwell & Parchment near Chewton's reading spot (lift upward during zeroGravity!)
  const parchmentTex = createParchmentTexture();
  const parchmentMat = new THREE.MeshStandardMaterial({
    map: parchmentTex,
    roughness: 0.78,
    side: THREE.DoubleSide
  });
  const inkwellMat = new THREE.MeshStandardMaterial({
    color: 0x19202b,
    roughness: 0.25,
    metalness: 0.35
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a442,
    roughness: 0.32,
    metalness: 0.72
  });

  const groundInkGroup = new THREE.Group();
  const inkBody = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.09, 10), inkwellMat);
  inkBody.position.y = 0.045;
  inkBody.castShadow = true;
  const inkCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.024, 10), brassMat);
  inkCollar.position.y = 0.095;
  groundInkGroup.add(inkBody, inkCollar);
  const inkHome = new THREE.Vector3(-0.76, terrainHeight(-0.76, 0.28), 0.28);
  groundInkGroup.position.copy(inkHome);
  group.add(groundInkGroup);

  const groundParchment = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24, 6, 6), parchmentMat);
  groundParchment.rotation.x = -Math.PI / 2;
  groundParchment.rotation.z = 0.32;
  const parchmentHome = new THREE.Vector3(-0.62, terrainHeight(-0.62, 0.42) + 0.02, 0.42);
  groundParchment.position.copy(parchmentHome);
  groundParchment.receiveShadow = true;
  group.add(groundParchment);

  // Fallen orchard leaves on grass (swirl and float skyward during zeroGravity!)
  const leafShapeGeo = new THREE.SphereGeometry(0.055, 6, 5);
  leafShapeGeo.scale(1.45, 0.14, 0.75);
  const fallenLeafColors = [0xd67c28, 0xc75126, 0xe3a832, 0x6ca832];
  const fallenLeaves = [];
  for (let i = 0; i < 28; i++) {
    const lMat = new THREE.MeshStandardMaterial({
      color: fallenLeafColors[i % fallenLeafColors.length],
      roughness: 0.75
    });
    const leaf = new THREE.Mesh(leafShapeGeo, lMat);
    const lx = (seededRandom(i * 4.7 + 1) - 0.5) * 4.6;
    const lz = (seededRandom(i * 8.3 + 2) - 0.5) * 4.0 - 0.4;
    const ly = terrainHeight(lx, lz) + 0.015;
    leaf.position.set(lx, ly, lz);
    leaf.rotation.set(0, seededRandom(i * 3.1) * Math.PI * 2, 0);
    group.add(leaf);
    fallenLeaves.push({
      mesh: leaf,
      home: new THREE.Vector3(lx, ly, lz),
      seed: seededRandom(i * 13.7 + 0.5),
      baseRotY: leaf.rotation.y
    });
  }

  // -------------------------------------------------------------------------
  // 8. Golden-Hour God-Ray Light Shafts + Floating Pollen Dust Motes
  // -------------------------------------------------------------------------
  const sunbeamsGroup = new THREE.Group();
  sunbeamsGroup.name = 'GoldenHourSunbeams';
  const sunbeamUniforms = {
    uOpacity: { value: 1.0 },
    uTime: { value: 0.0 }
  };
  const sunbeamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: sunbeamUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 2.2);
        float verticalFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.15, vUv.y);
        float shimmer = 0.85 + 0.15 * sin(uTime * 1.1 + vUv.x * 12.0);
        float alpha = fresnel * verticalFade * shimmer * 0.11 * uOpacity;
        gl_FragColor = vec4(1.0, 0.86, 0.54, alpha);
      }
    `
  });

  const beamConfigs = [
    { x: -0.9, y: 3.1, z: -1.1, rTop: 0.32, rBot: 1.35, h: 7.2, rz: -0.42, rx: 0.25 },
    { x: 0.2, y: 3.4, z: -0.9, rTop: 0.38, rBot: 1.55, h: 7.5, rz: -0.40, rx: 0.22 },
    { x: 1.3, y: 3.2, z: -1.6, rTop: 0.45, rBot: 1.75, h: 7.8, rz: -0.44, rx: 0.28 },
    { x: -2.0, y: 3.3, z: -2.2, rTop: 0.40, rBot: 1.65, h: 7.6, rz: -0.38, rx: 0.20 }
  ];
  beamConfigs.forEach((b) => {
    const geo = new THREE.CylinderGeometry(b.rTop, b.rBot, b.h, 16, 1, true);
    const mesh = new THREE.Mesh(geo, sunbeamMat);
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.set(b.rx, 0, b.rz);
    sunbeamsGroup.add(mesh);
  });
  group.add(sunbeamsGroup);

  // Floating Golden Pollen / Sparkle Dust Motes (Points)
  const moteCount = 220;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = [];
  for (let i = 0; i < moteCount; i++) {
    const mx = (seededRandom(i * 3.31) - 0.5) * 6.5;
    const my = 0.25 + seededRandom(i * 7.13) * 3.8;
    const mz = (seededRandom(i * 5.79) - 0.5) * 5.5;
    motePositions[i * 3] = mx;
    motePositions[i * 3 + 1] = my;
    motePositions[i * 3 + 2] = mz;
    moteSeeds.push({
      x: mx,
      y: my,
      z: mz,
      phase: seededRandom(i * 11.1) * Math.PI * 2,
      speed: 0.4 + seededRandom(i * 9.3) * 0.8
    });
  }
  const moteGeo = new THREE.BufferGeometry();
  const motePosAttr = new THREE.BufferAttribute(motePositions, 3);
  moteGeo.setAttribute('position', motePosAttr);

  const glowTex = createGlowSpriteTexture();
  const moteMat = new THREE.PointsMaterial({
    map: glowTex,
    color: 0xffe69c,
    size: 0.085,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pollenPoints = new THREE.Points(moteGeo, moteMat);
  pollenPoints.name = 'PollenMotes';
  group.add(pollenPoints);

  // -------------------------------------------------------------------------
  // 9. Twist 3 Dramatic Overhead Golden Spotlight Cone & Stage Pool
  // -------------------------------------------------------------------------
  const spotlightGroup = new THREE.Group();
  spotlightGroup.name = 'Twist3Spotlight';

  const spotlightUniforms = {
    uIntensity: { value: 0 },
    uTime: { value: 0 }
  };

  const spotConeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: spotlightUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.75);
        float topFade = smoothstep(1.0, 0.72, vUv.y);
        float bottomFade = smoothstep(0.0, 0.14, vUv.y);
        float streaks = 0.86 + 0.14 * sin(vUv.x * 24.0 + uTime * 2.5);
        float alpha = fresnel * topFade * bottomFade * streaks * 0.17 * uIntensity;
        vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.98, 0.88), vUv.y * 0.5);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const outerSpotCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 1.38, 6.8, 32, 1, true),
    spotConeMat
  );
  outerSpotCone.position.set(-0.35, 3.4, 0.0);
  spotlightGroup.add(outerSpotCone);

  const innerSpotCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.76, 6.8, 24, 1, true),
    spotConeMat
  );
  innerSpotCone.position.set(-0.35, 3.4, 0.0);
  spotlightGroup.add(innerSpotCone);

  // Glowing golden pool on the grass directly under Chewton
  const stagePoolMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffe27a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const stagePool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), stagePoolMat);
  stagePool.rotation.x = -Math.PI / 2;
  stagePool.position.set(-0.35, 0.025, 0.0);
  spotlightGroup.add(stagePool);

  // Real Three.js SpotLight illuminating Chewton in Twist 3
  const stageSpotLight = new THREE.SpotLight(0xffe08a, 0, 14, Math.PI * 0.22, 0.55, 1.0);
  stageSpotLight.position.set(-0.35, 6.6, 0.25);
  stageSpotLight.target.position.set(-0.35, 1.45, 0.0);
  spotlightGroup.add(stageSpotLight, stageSpotLight.target);

  spotlightGroup.visible = false;
  group.add(spotlightGroup);

  // -------------------------------------------------------------------------
  // 10. Twist 2 Surreal Floating Props (`twistPropsGroup`)
  //     Positioned cleanly inside 9:16 frame around Chewton without blocking faces
  // -------------------------------------------------------------------------
  const twistPropsGroup = new THREE.Group();
  twistPropsGroup.name = 'Twist2FloatingProps';
  twistPropsGroup.visible = false;

  // 10a. Hardcover Textbook: "PHYSICS: CANCELLED"
  const textbookGroup = new THREE.Group();
  const coverTex = createTextbookCoverTexture();
  const pagesTex = createBookPagesTexture();
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.42 });
  const spineMat = new THREE.MeshStandardMaterial({ color: 0x153061, roughness: 0.48 });
  const pagesMat = new THREE.MeshStandardMaterial({ map: pagesTex, roughness: 0.8 });

  const frontCover = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.50, 0.016), coverMat);
  frontCover.position.z = 0.042;
  const backCover = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.50, 0.016), spineMat);
  backCover.position.z = -0.042;
  const bookSpine = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.50, 0.10), spineMat);
  bookSpine.position.x = -0.185;
  const pageBlock = new THREE.Mesh(new THREE.BoxGeometry(0.355, 0.47, 0.072), pagesMat);
  pageBlock.position.x = 0.008;
  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.12, 0.006),
    new THREE.MeshStandardMaterial({ color: 0xe6332e, roughness: 0.5 })
  );
  ribbon.position.set(0.06, -0.27, 0.015);
  ribbon.rotation.z = 0.12;
  textbookGroup.add(frontCover, backCover, bookSpine, pageBlock, ribbon);
  textbookGroup.traverse((c) => {
    if (c.isMesh) c.castShadow = true;
  });
  const textbookHome = new THREE.Vector3(-0.68, 2.46, -0.20);
  textbookGroup.position.copy(textbookHome);
  twistPropsGroup.add(textbookGroup);

  // 10b. Floating Ceramic Coffee Mug + Upward-Floating Coffee Spheres
  const coffeeGroup = new THREE.Group();
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f0, roughness: 0.25 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x24829c, roughness: 0.3 });
  const coffeeLiquidMat = new THREE.MeshStandardMaterial({
    color: 0x3b1f10,
    roughness: 0.14,
    metalness: 0.08
  });

  const mugMeshGroup = new THREE.Group();
  const mugWall = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.074, 0.17, 18, 1, true), mugMat);
  const mugInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.074, 0.068, 0.16, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.35, side: THREE.BackSide })
  );
  const mugBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.018, 16), mugMat);
  mugBottom.position.y = -0.078;
  const mugRim = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.007, 8, 18), mugMat);
  mugRim.rotation.x = Math.PI / 2;
  mugRim.position.y = 0.085;
  const mugStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0835, 0.081, 0.032, 18, 1, true), stripeMat);
  mugStripe.position.y = 0.025;
  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.048, 0.012, 8, 16, Math.PI * 1.15),
    mugMat
  );
  mugHandle.position.set(0.076, 0.0, 0);
  mugHandle.rotation.z = -Math.PI * 0.56;
  const coffeePool = new THREE.Mesh(new THREE.CircleGeometry(0.072, 16), coffeeLiquidMat);
  coffeePool.rotation.x = -Math.PI / 2;
  coffeePool.position.y = 0.04;
  mugMeshGroup.add(mugWall, mugInner, mugBottom, mugRim, mugStripe, mugHandle, coffeePool);
  mugMeshGroup.rotation.set(0.32, -0.4, -0.45);
  coffeeGroup.add(mugMeshGroup);

  const coffeeBlobs = [];
  const coffeeBlobOffsets = [
    [0.01, 0.16, 0.02, 0.042],
    [-0.04, 0.25, 0.04, 0.032],
    [0.05, 0.32, -0.02, 0.048],
    [-0.02, 0.42, 0.01, 0.026],
    [0.04, 0.49, 0.03, 0.034],
    [-0.05, 0.20, -0.03, 0.022]
  ];
  const blobSphereGeo = new THREE.SphereGeometry(1, 14, 12);
  coffeeBlobOffsets.forEach(([bx, by, bz, br], idx) => {
    const blob = new THREE.Mesh(blobSphereGeo, coffeeLiquidMat);
    blob.scale.set(br, br * 1.06, br);
    blob.position.set(bx, by, bz);
    blob.castShadow = true;
    coffeeGroup.add(blob);
    coffeeBlobs.push({ mesh: blob, base: new THREE.Vector3(bx, by, bz), phase: idx * 1.1 });
  });

  const coffeeHome = new THREE.Vector3(0.56, 1.44, -0.14);
  coffeeGroup.position.copy(coffeeHome);
  twistPropsGroup.add(coffeeGroup);

  // 10c. Floating Cheesy Pepperoni Pizza Slice
  const pizzaGroup = new THREE.Group();
  const cheeseMat = new THREE.MeshStandardMaterial({ color: 0xffcf3d, roughness: 0.45 });
  const crustMat = new THREE.MeshStandardMaterial({ color: 0xd99043, roughness: 0.78 });
  const pepperoniMat = new THREE.MeshStandardMaterial({ color: 0xb8221e, roughness: 0.35 });
  const basilMat = new THREE.MeshStandardMaterial({ color: 0x3b8a29, roughness: 0.65 });

  const sliceShape = new THREE.Shape();
  sliceShape.moveTo(0, 0.20);
  sliceShape.lineTo(-0.14, -0.15);
  sliceShape.quadraticCurveTo(0, -0.18, 0.14, -0.15);
  sliceShape.closePath();

  const cheeseSliceGeo = new THREE.ExtrudeGeometry(sliceShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2
  });
  cheeseSliceGeo.center();
  const cheeseMesh = new THREE.Mesh(cheeseSliceGeo, cheeseMat);
  cheeseMesh.rotation.x = -Math.PI / 2;
  cheeseMesh.castShadow = true;
  pizzaGroup.add(cheeseMesh);

  // Golden baked crust along back edge
  const crustMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.24, 6, 10), crustMat);
  crustMesh.rotation.z = Math.PI / 2;
  crustMesh.position.set(0, 0.004, 0.16);
  pizzaGroup.add(crustMesh);

  // Pepperoni discs
  const pepGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.01, 12);
  [
    [0.0, 0.022, -0.05],
    [-0.055, 0.022, 0.06],
    [0.052, 0.022, 0.05],
    [0.005, 0.022, 0.095]
  ].forEach(([px, py, pz]) => {
    const pep = new THREE.Mesh(pepGeo, pepperoniMat);
    pep.position.set(px, py, pz);
    pizzaGroup.add(pep);
  });

  // Tiny stretchy cheese drips & basil flakes
  [
    [-0.07, -0.028, -0.02, 0.014],
    [0.06, -0.032, 0.01, 0.016],
    [0.0, -0.026, -0.13, 0.012]
  ].forEach(([dx, dy, dz, dr]) => {
    const drip = new THREE.Mesh(blobSphereGeo, cheeseMat);
    drip.scale.set(dr, dr * 1.8, dr);
    drip.position.set(dx, dy, dz);
    pizzaGroup.add(drip);
  });
  [
    [-0.02, 0.025, 0.01],
    [0.04, 0.025, -0.02]
  ].forEach(([bx, by, bz]) => {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.014), basilMat);
    leaf.position.set(bx, by, bz);
    leaf.rotation.y = bx * 12;
    pizzaGroup.add(leaf);
  });

  const pizzaHome = new THREE.Vector3(-0.74, 1.30, 0.12);
  pizzaGroup.position.copy(pizzaHome);
  pizzaGroup.scale.setScalar(1.08);
  twistPropsGroup.add(pizzaGroup);

  // 10d. Floating Leather/Parchment Scroll & Feather Quill
  const scrollQuillGroup = new THREE.Group();
  const scrollTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.34, 14),
    parchmentMat
  );
  scrollTube.rotation.z = Math.PI / 2;
  const scrollBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.037, 0.037, 0.035, 14),
    new THREE.MeshStandardMaterial({ color: 0xc92828, roughness: 0.4 })
  );
  scrollBand.rotation.z = Math.PI / 2;
  scrollQuillGroup.add(scrollTube, scrollBand);

  const quillGroup = new THREE.Group();
  const quillShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.008, 0.30, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.5 })
  );
  const quillPlume = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 })
  );
  quillPlume.scale.set(0.65, 2.5, 0.16);
  quillPlume.position.y = 0.07;
  quillGroup.add(quillShaft, quillPlume);
  quillGroup.position.set(0.14, 0.12, 0.05);
  quillGroup.rotation.set(0.2, 0.1, -0.42);
  scrollQuillGroup.add(quillGroup);

  const scrollHome = new THREE.Vector3(0.42, 2.52, -0.24);
  scrollQuillGroup.position.copy(scrollHome);
  twistPropsGroup.add(scrollQuillGroup);

  group.add(twistPropsGroup);

  // -------------------------------------------------------------------------
  // 11. Final BONK Shockwave Group (torus shockwave + flash + star bursts)
  // -------------------------------------------------------------------------
  const shockwaveGroup = new THREE.Group();
  shockwaveGroup.name = 'BonkShockwave';
  shockwaveGroup.visible = false;

  const shockTorusMat = new THREE.MeshBasicMaterial({
    color: 0xffe46b,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.075, 14, 48), shockTorusMat);
  shockRing1.rotation.x = Math.PI / 2;
  shockwaveGroup.add(shockRing1);

  const shockTorusMat2 = new THREE.MeshBasicMaterial({
    color: 0xff8c2b,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.055, 12, 42), shockTorusMat2);
  shockRing2.rotation.set(Math.PI / 2 - 0.32, 0.25, 0);
  shockwaveGroup.add(shockRing2);

  const shockFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfff8d6,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockFlash = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), shockFlashMat);
  shockwaveGroup.add(shockFlash);

  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffdf4d,
    transparent: true,
    opacity: 1.0
  });
  const shockSparks = [];
  for (let i = 0; i < 12; i++) {
    const star = createStarMesh(0.11, 0.03, sparkMat);
    const phi = (i / 12) * Math.PI * 2;
    const elev = ((i % 3) - 1) * 0.42;
    const dir = new THREE.Vector3(Math.cos(phi) * Math.cos(elev), Math.sin(elev), Math.sin(phi) * Math.cos(elev)).normalize();
    shockwaveGroup.add(star);
    shockSparks.push({ mesh: star, dir, spin: (i % 2 === 0 ? 1 : -1) * (5 + (i % 4)) });
  }

  group.add(shockwaveGroup);

  // Pre-allocated work variables so update() creates zero garbage
  const dayCloudColor = new THREE.Color(0xfff5e6);
  const spotCloudColor = new THREE.Color(0x3a3769);
  const dayCloudEmissive = new THREE.Color(0xffc694);
  const spotCloudEmissive = new THREE.Color(0x251a4a);

  function getBranchDropAnchor() {
    return ANCHOR_BRANCH_DROP.clone();
  }

  function update(t = 0, state = {}) {
    const zeroG = clamp01(state.zeroGravity ?? 0);
    const twistAlpha = clamp01(state.twistPropsAlpha ?? 0);
    const spotVal = clamp01(state.spotlight ?? 0);
    const shockP = clamp01(state.shockwaveProgress ?? 0);
    const bonkTarget = state.bonkTarget || DEFAULT_BONK_TARGET;

    // 1. Sky dome + clouds + sunbeams
    skyUniforms.uTime.value = t;
    skyUniforms.uSpotlight.value = spotVal;
    skyUniforms.uZeroGravity.value = zeroG;

    cloudMat.color.copy(dayCloudColor).lerp(spotCloudColor, spotVal);
    cloudMat.emissive.copy(dayCloudEmissive).lerp(spotCloudEmissive, spotVal);

    for (let i = 0; i < cloudData.length; i++) {
      const c = cloudData[i];
      const driftX = ((c.baseX + t * c.speed + 35) % 70) - 35;
      c.mesh.position.x = driftX;
      c.mesh.position.y = c.baseY + Math.sin(t * 0.45 + c.seed) * 0.25 + zeroG * 0.65;
    }

    sunbeamUniforms.uTime.value = t;
    sunbeamUniforms.uOpacity.value = 1.0 - spotVal * 0.88;
    sunbeamsGroup.visible = sunbeamUniforms.uOpacity.value > 0.02;

    // 2. Wildflowers gentle wind sway
    for (let i = 0; i < flowerData.length; i++) {
      const f = flowerData[i];
      dummy.position.set(f.x, f.y - 0.01 + zeroG * 0.04, f.z);
      dummy.rotation.set(
        Math.sin(t * 2.1 + f.phase) * 0.09,
        f.phase,
        Math.cos(t * 1.7 + f.phase) * 0.08
      );
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      flowerStems.setMatrixAt(i, dummy.matrix);
      flowerPetals.setMatrixAt(i, dummy.matrix);
    }
    flowerStems.instanceMatrix.needsUpdate = true;
    flowerPetals.instanceMatrix.needsUpdate = true;

    // 3. Background tree apples detaching & floating upward in zeroGravity
    for (let i = 0; i < floatingApples.length; i++) {
      const fa = floatingApples[i];
      const bob = Math.sin(t * 1.8 + fa.seed * 6.28) * 0.14 * zeroG;
      const swayX = Math.sin(t * 1.15 + fa.seed * 11.0) * 0.16 * zeroG;
      const swayZ = Math.cos(t * 1.25 + fa.seed * 9.0) * 0.12 * zeroG;
      fa.mesh.position.set(
        fa.home.x + swayX,
        fa.home.y + zeroG * fa.driftHeight + bob,
        fa.home.z + swayZ
      );
      fa.mesh.rotation.set(
        zeroG * Math.sin(t * 1.1 + fa.seed * 5.0) * 0.8,
        zeroG * (t * 0.9 + fa.seed * 4.0),
        zeroG * Math.cos(t * 0.95 + fa.seed * 3.0) * 0.6
      );
    }

    // 4. 1666 ground inkwell, parchment & fallen leaves rising in zeroGravity
    groundInkGroup.position.set(
      inkHome.x + Math.sin(t * 1.4) * 0.08 * zeroG,
      inkHome.y + zeroG * 1.45 + Math.sin(t * 2.1) * 0.08 * zeroG,
      inkHome.z + Math.cos(t * 1.2) * 0.06 * zeroG
    );
    groundInkGroup.rotation.set(zeroG * 0.35 * Math.sin(t * 1.5), t * 0.5 * zeroG, zeroG * 0.25);

    groundParchment.position.set(
      parchmentHome.x + Math.cos(t * 1.3) * 0.1 * zeroG,
      parchmentHome.y + zeroG * 1.25 + Math.cos(t * 1.9) * 0.09 * zeroG,
      parchmentHome.z
    );
    groundParchment.rotation.x = -Math.PI / 2 + zeroG * (0.45 + Math.sin(t * 1.7) * 0.25);
    groundParchment.rotation.z = 0.32 + zeroG * Math.sin(t * 1.1) * 0.4;

    for (let i = 0; i < fallenLeaves.length; i++) {
      const fl = fallenLeaves[i];
      const lift = zeroG * (1.1 + fl.seed * 2.3);
      fl.mesh.position.set(
        fl.home.x + Math.sin(t * 1.5 + fl.seed * 10.0) * 0.22 * zeroG,
        fl.home.y + lift + Math.sin(t * 2.2 + fl.seed * 8.0) * 0.1 * zeroG,
        fl.home.z + Math.cos(t * 1.3 + fl.seed * 7.0) * 0.18 * zeroG
      );
      fl.mesh.rotation.set(
        zeroG * Math.sin(t * 2.0 + fl.seed * 5.0) * 1.2,
        fl.baseRotY + zeroG * t * (0.8 + fl.seed),
        zeroG * Math.cos(t * 1.7 + fl.seed * 4.0) * 0.9
      );
    }

    // 5. Golden Pollen / Sparkle Dust Motes
    const mArr = motePosAttr.array;
    for (let i = 0; i < moteCount; i++) {
      const s = moteSeeds[i];
      const upFlow = zeroG > 0 ? ((t * (0.55 + s.speed * 0.5) * zeroG) % 4.0) : 0;
      mArr[i * 3] = s.x + Math.sin(t * 0.65 * s.speed + s.phase) * (0.18 + 0.14 * zeroG);
      mArr[i * 3 + 1] = ((s.y + Math.sin(t * 0.8 + s.phase) * 0.15 + upFlow) % 4.2) + 0.2;
      mArr[i * 3 + 2] = s.z + Math.cos(t * 0.58 * s.speed + s.phase) * 0.18;
    }
    motePosAttr.needsUpdate = true;
    moteMat.opacity = 0.68 + spotVal * 0.25;

    // 6. Twist 2 Surreal Floating Props
    if (twistAlpha <= 0.001) {
      twistPropsGroup.visible = false;
    } else {
      twistPropsGroup.visible = true;

      const sBook = easeOutBack(clamp01(twistAlpha * 1.15));
      textbookGroup.scale.setScalar(sBook);
      textbookGroup.position.set(
        textbookHome.x + Math.sin(t * 0.9) * 0.04,
        textbookHome.y + Math.sin(t * 1.45 + 0.4) * 0.075,
        textbookHome.z + Math.cos(t * 1.0) * 0.03
      );
      textbookGroup.rotation.set(
        0.16 + Math.sin(t * 1.1) * 0.10,
        0.34 + Math.sin(t * 0.75) * 0.14,
        -0.12 + Math.cos(t * 0.95) * 0.08
      );

      const sCoffee = easeOutBack(clamp01((twistAlpha - 0.06) * 1.18));
      coffeeGroup.scale.setScalar(sCoffee);
      coffeeGroup.position.set(
        coffeeHome.x + Math.cos(t * 1.05) * 0.04,
        coffeeHome.y + Math.sin(t * 1.6 + 1.5) * 0.07,
        coffeeHome.z
      );
      coffeeGroup.rotation.set(
        Math.sin(t * 0.95) * 0.12,
        -0.3 + Math.sin(t * 0.7) * 0.22,
        Math.cos(t * 1.1) * 0.1
      );
      for (let i = 0; i < coffeeBlobs.length; i++) {
        const cb = coffeeBlobs[i];
        const rise = ((t * 0.18 + cb.phase * 0.15) % 0.32);
        cb.mesh.position.set(
          cb.base.x + Math.sin(t * 2.3 + cb.phase) * 0.022,
          cb.base.y + rise * 0.45 + Math.sin(t * 2.0 + cb.phase) * 0.02,
          cb.base.z + Math.cos(t * 2.1 + cb.phase) * 0.022
        );
      }

      const sPizza = easeOutBack(clamp01((twistAlpha - 0.12) * 1.2));
      pizzaGroup.scale.setScalar(sPizza * 1.08);
      pizzaGroup.position.set(
        pizzaHome.x + Math.sin(t * 1.1 + 2.1) * 0.035,
        pizzaHome.y + Math.cos(t * 1.5 + 0.8) * 0.07,
        pizzaHome.z
      );
      pizzaGroup.rotation.set(
        0.58 + Math.sin(t * 1.25) * 0.22,
        t * 0.65,
        0.22 + Math.cos(t * 1.1) * 0.18
      );

      const sScroll = easeOutBack(clamp01((twistAlpha - 0.15) * 1.22));
      scrollQuillGroup.scale.setScalar(sScroll);
      scrollQuillGroup.position.set(
        scrollHome.x + Math.cos(t * 0.95) * 0.035,
        scrollHome.y + Math.sin(t * 1.4 + 2.4) * 0.075,
        scrollHome.z
      );
      scrollQuillGroup.rotation.set(
        0.25 + Math.sin(t * 1.0) * 0.14,
        -0.3 + Math.cos(t * 0.85) * 0.22,
        -0.18 + Math.sin(t * 1.2) * 0.10
      );
    }

    // 7. Twist 3 Dramatic Spotlight
    if (spotVal <= 0.001) {
      spotlightGroup.visible = false;
      stageSpotLight.intensity = 0;
    } else {
      spotlightGroup.visible = true;
      spotlightUniforms.uIntensity.value = spotVal;
      spotlightUniforms.uTime.value = t;
      stagePoolMat.opacity = Math.min(0.42, spotVal * 0.42);
      stageSpotLight.intensity = Math.min(3.6, spotVal * 3.6);
    }

    // 8. Final BONK Shockwave & Star Burst
    if (shockP <= 0.001 || shockP >= 0.999) {
      shockwaveGroup.visible = false;
    } else {
      shockwaveGroup.visible = true;
      shockwaveGroup.position.set(bonkTarget[0], bonkTarget[1], bonkTarget[2]);

      const easeRing = 1 - Math.pow(1 - shockP, 3);
      const ringScale1 = 0.15 + easeRing * 2.55;
      const ringScale2 = 0.12 + easeRing * 2.15;
      const fade = 1 - Math.pow(shockP, 1.45);

      shockRing1.scale.set(ringScale1, ringScale1, ringScale1 * (1 - shockP * 0.45));
      shockTorusMat.opacity = fade * 0.95;

      shockRing2.scale.set(ringScale2, ringScale2, ringScale2 * (1 - shockP * 0.45));
      shockTorusMat2.opacity = fade * 0.85;

      const flashFade = Math.max(0, 1 - shockP / 0.28);
      const flashScale = 0.55 + Math.min(shockP / 0.28, 1) * 0.75;
      shockFlash.scale.setScalar(flashScale);
      shockFlashMat.opacity = flashFade * flashFade * 0.35;

      sparkMat.opacity = fade;
      for (let i = 0; i < shockSparks.length; i++) {
        const sp = shockSparks[i];
        const dist = 0.15 + easeRing * 1.85;
        sp.mesh.position.copy(sp.dir).multiplyScalar(dist);
        sp.mesh.rotation.z = t * sp.spin;
        sp.mesh.rotation.y = sp.spin * 0.4;
        const starScale = (1 - shockP * 0.65) * 1.15;
        sp.mesh.scale.setScalar(Math.max(0.01, starScale));
      }
    }
  }

  return {
    group,
    getBranchDropAnchor,
    update
  };
}
