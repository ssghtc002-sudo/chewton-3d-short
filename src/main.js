import * as THREE from 'three';
import { createChewtonRig } from './characters/chewtonRig.js';
import { createSassyAppleRig } from './characters/sassyAppleRig.js';
import { createOrchardWorld } from './scene/orchardWorld.js';
import { createCameraDirector } from './camera/director.js';

const WIDTH = 1080;
const HEIGHT = 1920;

const SPEAKER_STYLES = {
  narrator: {
    label: 'NARRATOR',
    color: '#FFD93D',
    glow: 'rgba(255, 217, 61, 0.55)',
  },
  chewton: {
    label: 'SIR ISAAC CHEWTON',
    color: '#5CE1E6',
    glow: 'rgba(92, 225, 230, 0.55)',
  },
  apple: {
    label: 'APPLE',
    color: '#FF6B6B',
    glow: 'rgba(255, 107, 107, 0.55)',
  },
};

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const u = clamp01((x - edge0) / (edge1 - edge0));
  return u * u * (3 - 2 * u);
}

function copyToVec3(src, dest, fallback = [0, 0, 0]) {
  if (Array.isArray(src)) {
    dest.set(src[0] ?? fallback[0], src[1] ?? fallback[1], src[2] ?? fallback[2]);
  } else if (src && typeof src.x === 'number') {
    dest.set(src.x, src.y, src.z);
  } else {
    dest.set(fallback[0], fallback[1], fallback[2]);
  }
  return dest;
}

function buildSubtitlePages(lines) {
  const pages = [];

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const words = Array.isArray(line.words) ? line.words : [];
    if (words.length === 0) continue;

    const nextLineStart = li + 1 < lines.length ? lines[li + 1].start : 30.0;
    const chunks = [];

    if (words.length <= 7) {
      chunks.push(words);
    } else {
      const minIdx = Math.max(2, Math.floor(words.length * 0.34));
      const maxIdx = Math.min(words.length - 3, Math.ceil(words.length * 0.68));
      const midIdx = Math.floor(words.length / 2) - 1;
      let splitIdx = -1;
      let bestScore = Infinity;

      for (let i = minIdx; i <= maxIdx; i += 1) {
        const token = words[i].word || '';
        const isHardStop = /[.!?]$/.test(token);
        const isClauseStop = /[,;:—]$/.test(token);
        if (isHardStop || isClauseStop) {
          const dist = Math.abs(i - midIdx) - (isHardStop ? 1.5 : 0.6);
          if (dist < bestScore) {
            bestScore = dist;
            splitIdx = i;
          }
        }
      }

      if (splitIdx === -1) {
        splitIdx = Math.floor(words.length / 2) - 1;
      }

      chunks.push(words.slice(0, splitIdx + 1));
      chunks.push(words.slice(splitIdx + 1));
    }

    for (let ci = 0; ci < chunks.length; ci += 1) {
      const chunkWords = chunks[ci];
      const isFirst = ci === 0;
      const isLast = ci === chunks.length - 1;
      const pageStart = isFirst ? line.start : chunkWords[0].start;
      const rawEnd = isLast ? Math.min(nextLineStart - 0.03, line.end + 0.12) : chunkWords[chunkWords.length - 1].end;
      const pageEnd = Math.max(chunkWords[chunkWords.length - 1].end, rawEnd);

      pages.push({
        key: `${line.id}_${ci}`,
        speaker: line.speaker,
        start: pageStart,
        end: pageEnd,
        words: chunkWords,
      });
    }
  }

  return pages;
}

function getActiveBeat(beats, t) {
  for (let i = 0; i < beats.length; i += 1) {
    const b = beats[i];
    if (t >= b.start && (t < b.end || i === beats.length - 1)) {
      return b;
    }
  }
  return beats[beats.length - 1];
}

function computeSfxShake(sfxEvents, t) {
  const weights = {
    bonk: 1.0,
    vine_boom: 0.68,
    boing: 0.5,
    record_scratch: 0.45,
    bling: 0.4,
    whoosh: 0.18,
    shimmer: 0.1,
    daze_chime: 0.08,
  };
  let shake = 0;
  for (let i = 0; i < sfxEvents.length; i += 1) {
    const ev = sfxEvents[i];
    const dt = t - ev.time;
    if (dt >= 0 && dt < 0.45) {
      const w = weights[ev.type] ?? 0.25;
      const decayRate = ev.type === 'bonk' ? 8.5 : 12.0;
      shake = Math.max(shake, w * Math.exp(-dt * decayRate));
    }
  }
  return clamp01(shake);
}

function computeImpactFlash(t) {
  const pulses = [
    { time: 1.85, peak: 0.14, decay: 16, tint: '#fff7d6' },
    { time: 6.45, peak: 0.11, decay: 18, tint: '#ffffff' },
    { time: 7.55, peak: 0.12, decay: 16, tint: '#ffe8e0' },
    { time: 19.25, peak: 0.12, decay: 16, tint: '#fff5cc' },
    { time: 19.85, peak: 0.21, decay: 12, tint: '#fff2b2' },
    { time: 25.86, peak: 0.38, decay: 13, tint: '#ffffff' },
  ];

  let bestOpacity = 0;
  let bestTint = '#ffffff';
  for (let i = 0; i < pulses.length; i += 1) {
    const p = pulses[i];
    const dt = t - p.time;
    if (dt >= 0 && dt < 0.35) {
      const val = p.peak * Math.exp(-dt * p.decay);
      if (val > bestOpacity) {
        bestOpacity = val;
        bestTint = p.tint;
      }
    }
  }
  return { opacity: clamp01(bestOpacity), tint: bestTint };
}

function getLipSyncValue(arr, t, fps, totalFrames) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const f = clamp(t * fps, 0, Math.min(totalFrames - 1, arr.length - 1));
  const i0 = Math.floor(f);
  const i1 = Math.min(arr.length - 1, i0 + 1);
  const frac = f - i0;
  return lerp(arr[i0] ?? 0, arr[i1] ?? 0, frac);
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function init() {
  const canvas = document.getElementById('webgl-canvas');
  if (!canvas) throw new Error('Missing #webgl-canvas');

  const [timeline, voiceManifest] = await Promise.all([
    loadJson('/config/timeline.json'),
    loadJson('/audio/output/voice_manifest.json'),
  ]);

  const duration = timeline.duration || 30.0;
  const fps = timeline.fps || 30;
  const totalFrames = timeline.totalFrames || 900;
  const sfxEvents = timeline.sfxEvents || voiceManifest.sfxEvents || [];
  const subtitlePages = buildSubtitlePages(voiceManifest.lines || []);

  // WebGLRenderer setup
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const gl = renderer.getContext();
  window.__WEBGL_INFO__ = {
    renderer: gl.getParameter(gl.RENDERER),
    vendor: gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
  };

  // Scene & Camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x94cef2);

  const camera = new THREE.PerspectiveCamera(44, WIDTH / HEIGHT, 0.1, 160);
  camera.position.set(0, 1.8, 5.2);

  // Cinematic 3-Point + Golden Hour + Rim Lighting + Twist 3 Front Key Spotlight
  const hemiLight = new THREE.HemisphereLight(0xb2e0ff, 0x9b8963, 0.92);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffe0ad, 2.15);
  sunLight.position.set(4.8, 7.6, 4.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 22;
  sunLight.shadow.camera.left = -3.4;
  sunLight.shadow.camera.right = 3.4;
  sunLight.shadow.camera.top = 4.5;
  sunLight.shadow.camera.bottom = -1.2;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xc2dcff, 0.72);
  fillLight.position.set(-4.2, 3.2, 4.0);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffb469, 1.35);
  rimLight.position.set(-1.5, 4.3, -4.6);
  scene.add(rimLight);

  // Front-angled hero fill spotlight complementing orchardWorld's overhead stageSpotLight
  const rebrandSpot = new THREE.SpotLight(0xfff1c4, 0, 16, Math.PI / 6.2, 0.52, 1.0);
  rebrandSpot.position.set(-0.75, 4.6, 2.2);
  rebrandSpot.target.position.set(-0.35, 1.6, 0.0);
  rebrandSpot.castShadow = false;
  scene.add(rebrandSpot);
  scene.add(rebrandSpot.target);

  // Instantiate Scene, Characters, and Camera Director
  const orchardWorld = createOrchardWorld();
  const chewtonRig = createChewtonRig();
  const sassyAppleRig = createSassyAppleRig();
  scene.add(orchardWorld.group);
  scene.add(chewtonRig.group);
  scene.add(sassyAppleRig.group);

  const cameraDirector = createCameraDirector(camera, timeline);

  // World anchors
  const anchors = timeline.worldAnchors || {};
  const branchAnchor = copyToVec3(
    orchardWorld.getBranchDropAnchor ? orchardWorld.getBranchDropAnchor() : null,
    new THREE.Vector3(),
    anchors.appleBranchAnchor || [0.15, 2.95, 0.25]
  );
  const hoverSpot = copyToVec3(anchors.appleHoverSpot, new THREE.Vector3(), [0.25, 1.8, 0.42]);
  const chewtonBase = copyToVec3(anchors.chewtonBasePos, new THREE.Vector3(), [-0.35, 0.0, 0.0]);
  const bonkImpactArr = [-0.35, 2.24, 0.0];

  // Reusable per-frame objects (zero allocation inside renderAtTime)
  const chewtonPos = new THREE.Vector3();
  const chewtonRot = new THREE.Euler(0, 0.22, 0, 'XYZ');
  const chewtonLookTarget = new THREE.Vector3();
  const chewtonHeadPos = new THREE.Vector3();

  const applePos = new THREE.Vector3();
  const appleRot = new THREE.Euler(0, 0, 0, 'XYZ');
  const appleLookTarget = new THREE.Vector3();
  const appleWorldPos = new THREE.Vector3();
  const noseTarget = new THREE.Vector3(-0.14, 1.72, 0.14);
  const viewerPos = new THREE.Vector3(0.0, 1.55, 3.0);

  const chewtonState = {
    position: chewtonPos,
    rotation: chewtonRot,
    pose: 'reading_under_tree',
    expression: 'curious_squint',
    mouthOpen: 0,
    wigDetached: 0,
    quillFloating: false,
    sunglassesOn: 0,
    dazeStars: 0,
    squashY: 1.0,
    lookTarget: chewtonLookTarget,
    pokeAmount: 0,
    recoilAmount: 0,
  };

  const appleState = {
    position: applePos,
    rotation: appleRot,
    scale: 1.0,
    squashY: 1.0,
    faceVisible: 0,
    expression: 'neutral_suspicious',
    mouthOpen: 0,
    lookTarget: appleLookTarget,
    glowAmount: 0,
  };

  const worldState = {
    zeroGravity: 0,
    twistPropsAlpha: 0,
    spotlight: 0,
    shockwaveProgress: 0,
    bonkTarget: bonkImpactArr,
  };

  const directorState = {
    activeBeat: timeline.beats[0],
    sfxShake: 0,
    chewtonHeadPos,
    applePos: appleWorldPos,
  };

  // HUD DOM elements
  const progressFillEl = document.getElementById('progress-fill');
  const vignetteEl = document.getElementById('vignette');
  const impactFlashEl = document.getElementById('impact-flash');
  const hookBannerEl = document.getElementById('hook-banner');
  const subtitleContainerEl = document.getElementById('subtitle-container');
  const speakerPillEl = document.getElementById('speaker-pill');
  const subtitleWordsEl = document.getElementById('subtitle-words');

  let currentPageKey = null;
  let currentWordEls = [];

  function updateHud(t, spotlightAlpha) {
    // 1. Progress bar
    const progressPct = clamp01(t / duration) * 100;
    progressFillEl.style.width = `${progressPct.toFixed(3)}%`;

    // 2. Vignette intensity (richer during Beat 5 spotlight)
    const vignetteOpacity = 0.72 + spotlightAlpha * 0.24;
    vignetteEl.style.opacity = vignetteOpacity.toFixed(3);

    // 3. Impact flash
    const flash = computeImpactFlash(t);
    impactFlashEl.style.opacity = flash.opacity.toFixed(3);
    impactFlashEl.style.background = flash.tint;

    // 4. Top Hook Banner (0.0s .. 3.2s)
    if (t <= 3.25) {
      const enterU = smoothstep(0.0, 0.22, t);
      const exitU = 1.0 - smoothstep(2.82, 3.2, t);
      const opacity = clamp01(enterU * exitU);
      const enterScale = lerp(0.86, 1.0, enterU);
      const exitLift = (1.0 - exitU) * -28;
      hookBannerEl.style.opacity = opacity.toFixed(3);
      hookBannerEl.style.transform = `translateX(-50%) translateY(${exitLift.toFixed(1)}px) scale(${enterScale.toFixed(4)})`;
    } else {
      hookBannerEl.style.opacity = '0';
    }

    // 5. YouTube Shorts Karaoke Subtitles
    let activePage = null;
    for (let i = 0; i < subtitlePages.length; i += 1) {
      const p = subtitlePages[i];
      if (t >= p.start && t <= p.end) {
        activePage = p;
        break;
      }
    }

    if (!activePage) {
      subtitleContainerEl.style.opacity = '0';
      if (currentPageKey !== null) {
        currentPageKey = null;
        currentWordEls = [];
        subtitleWordsEl.innerHTML = '';
      }
      return;
    }

    const speakerStyle = SPEAKER_STYLES[activePage.speaker] || SPEAKER_STYLES.narrator;
    const enterAlpha = smoothstep(activePage.start, activePage.start + 0.08, t);
    const fadeOutAlpha = 1.0 - smoothstep(activePage.end - 0.06, activePage.end, t);
    const containerOpacity = clamp01(Math.min(enterAlpha, Math.max(0.25, fadeOutAlpha)));
    const popY = (1.0 - enterAlpha) * 16;

    subtitleContainerEl.style.opacity = containerOpacity.toFixed(3);
    subtitleContainerEl.style.transform = `translateY(${popY.toFixed(1)}px)`;

    if (currentPageKey !== activePage.key) {
      currentPageKey = activePage.key;
      speakerPillEl.textContent = speakerStyle.label;
      speakerPillEl.style.color = speakerStyle.color;
      speakerPillEl.style.borderColor = speakerStyle.color;

      subtitleWordsEl.innerHTML = '';
      currentWordEls = [];

      for (let wi = 0; wi < activePage.words.length; wi += 1) {
        const w = activePage.words[wi];
        const span = document.createElement('span');
        const noGap = (w.word || '').endsWith('—');
        span.className = noGap ? 'sub-word no-gap' : 'sub-word';
        span.textContent = w.word;
        subtitleWordsEl.appendChild(span);
        currentWordEls.push(span);
      }
    }

    for (let wi = 0; wi < activePage.words.length; wi += 1) {
      const w = activePage.words[wi];
      const el = currentWordEls[wi];
      if (!el) continue;

      const isActive = t >= w.start && t <= w.end;
      const isSpoken = t > w.end;

      if (isActive) {
        const dtWord = Math.max(0, t - w.start);
        const popEnvelope = Math.exp(-dtWord * 22) * Math.sin(clamp01(dtWord / 0.09) * Math.PI);
        const wordScale = 1.08 + 0.06 * popEnvelope;
        el.classList.add('is-active');
        el.classList.remove('is-spoken', 'is-upcoming');
        el.style.color = speakerStyle.color;
        el.style.transform = `scale(${wordScale.toFixed(4)}) translateY(-4px)`;
        el.style.textShadow = `0 6px 0 #090b10, 0 0 24px ${speakerStyle.glow}, 0 12px 24px rgba(0,0,0,0.82)`;
      } else if (isSpoken) {
        el.classList.add('is-spoken');
        el.classList.remove('is-active', 'is-upcoming');
        el.style.color = '#ffffff';
        el.style.transform = 'scale(1)';
        el.style.textShadow = '0 6px 0 #090b10, 0 12px 24px rgba(0,0,0,0.72)';
      } else {
        el.classList.add('is-upcoming');
        el.classList.remove('is-active', 'is-spoken');
        el.style.color = '#eef2f7';
        el.style.transform = 'scale(1)';
        el.style.textShadow = '0 6px 0 #090b10, 0 12px 24px rgba(0,0,0,0.72)';
      }
    }
  }

  function evaluateAtTime(rawT) {
    const t = clamp(rawT, 0, duration);
    const activeBeat = getActiveBeat(timeline.beats, t);

    const lipChewton = getLipSyncValue(voiceManifest.lipSync?.chewton, t, fps, totalFrames);
    const lipApple = getLipSyncValue(voiceManifest.lipSync?.apple, t, fps, totalFrames);

    // ---------------------------------------------------------
    // 1. World & Atmospheric State (Zero-G, Props, Spotlight, Shockwave)
    // ---------------------------------------------------------
    let zeroGravity = 0;
    if (t >= 10.6 && t < 13.2) {
      zeroGravity = lerp(0.0, 0.65, smoothstep(10.6, 13.2, t));
    } else if (t >= 13.2 && t < 25.86) {
      zeroGravity = lerp(0.65, 1.0, smoothstep(13.2, 14.05, t));
    } else if (t >= 25.86) {
      zeroGravity = lerp(1.0, 0.0, smoothstep(25.86, 26.14, t));
    }

    let twistPropsAlpha = 0;
    if (t >= 13.45 && t < 19.6) {
      twistPropsAlpha = smoothstep(13.45, 14.2, t);
    } else if (t >= 19.6 && t < 20.15) {
      twistPropsAlpha = 1.0 - smoothstep(19.6, 20.15, t);
    }

    let spotlightAlpha = 0;
    if (t >= 19.8 && t < 25.86) {
      spotlightAlpha = smoothstep(19.8, 19.94, t);
    }

    let shockwaveProgress = 0;
    if (t >= 25.86 && t <= 26.86) {
      shockwaveProgress = clamp01((t - 25.86) / 0.96);
    }

    // Rebrand hover & exact bonk collision point (chewtonPos.y = 0.48 -> wig top y ≈ 2.24)
    const bonkDiveStartY = 3.08;
    const bonkHeadTopY = 2.24;
    const bonkHeadX = chewtonBase.x;
    const bonkHeadZ = chewtonBase.z;

    bonkImpactArr[0] = bonkHeadX;
    bonkImpactArr[1] = bonkHeadTopY;
    bonkImpactArr[2] = bonkHeadZ;

    worldState.zeroGravity = zeroGravity;
    worldState.twistPropsAlpha = twistPropsAlpha;
    worldState.spotlight = spotlightAlpha;
    worldState.shockwaveProgress = shockwaveProgress;

    // Update dynamic lighting for Beat 5 concert spotlight (balanced so velvet coat keeps rich crimson)
    sunLight.intensity = lerp(2.15, 1.05, spotlightAlpha);
    hemiLight.intensity = lerp(0.85, 0.42, spotlightAlpha);
    fillLight.intensity = lerp(0.72, 0.4, spotlightAlpha);
    rimLight.intensity = lerp(1.35, 1.75, spotlightAlpha);
    rebrandSpot.intensity = 3.8 * spotlightAlpha;

    // ---------------------------------------------------------
    // 2. Apple Animation State (pure analytical trajectory, single update!)
    // ---------------------------------------------------------
    let ax = hoverSpot.x;
    let ay = hoverSpot.y;
    let az = hoverSpot.z;
    let aRotX = 0;
    let aRotY = 0;
    let aRotZ = 0;
    let aScale = 1.0;
    let aSquashY = 1.0;
    let aGlow = 0;

    if (t < 1.15) {
      ax = branchAnchor.x + Math.sin(t * 2.4) * 0.012;
      ay = branchAnchor.y;
      az = branchAnchor.z + Math.cos(t * 1.9) * 0.008;
      aRotZ = Math.sin(t * 2.4) * 0.04;
    } else if (t < 1.85) {
      const u = (t - 1.15) / 0.7;
      const dropU = u * u;
      ax = lerp(branchAnchor.x, hoverSpot.x, dropU);
      ay = lerp(branchAnchor.y, hoverSpot.y, dropU);
      az = lerp(branchAnchor.z, hoverSpot.z, dropU);
      aSquashY = 1.0 + Math.sin(u * Math.PI) * 0.16;
      aRotY = u * 0.6;
    } else if (t < 3.2) {
      const dtFreeze = t - 1.85;
      const arrestBounce = -0.028 * Math.exp(-dtFreeze * 16) * Math.cos(dtFreeze * 36);
      ax = hoverSpot.x;
      ay = hoverSpot.y + arrestBounce + Math.sin(dtFreeze * 3.5) * 0.012;
      az = hoverSpot.z;
      aSquashY = 1.0 - 0.18 * Math.exp(-dtFreeze * 14) * Math.cos(dtFreeze * 36);
      aRotY = 0.6 + dtFreeze * 2.3;
      aGlow = 0.16 * smoothstep(1.85, 2.15, t);
    } else if (t < 7.5) {
      const bob = Math.sin((t - 3.2) * 2.8) * 0.022;
      ax = hoverSpot.x;
      ay = hoverSpot.y + bob;
      az = hoverSpot.z;
      aRotY = 0.6 + (3.2 - 1.85) * 2.3 + Math.sin(t * 1.6) * 0.25;
      aGlow = 0.14;

      if (t >= 6.45) {
        const dtPoke = t - 6.45;
        aSquashY = 1.0 - 0.4 * Math.exp(-dtPoke * 8.5) * Math.cos(dtPoke * 32);
        const boingPulse = Math.exp(-Math.pow((dtPoke - 0.14) / 0.105, 2));
        ax = lerp(ax, noseTarget.x, boingPulse);
        ay = lerp(ay, noseTarget.y, boingPulse);
        az = lerp(az, noseTarget.z, boingPulse);
      }
      if (t >= 7.38) {
        const dtScratch = t - 7.38;
        aScale = 1.0 + 0.08 * Math.exp(-dtScratch * 16);
      }
    } else if (t < 10.6) {
      const dtPop = t - 7.55;
      if (dtPop >= 0 && dtPop < 0.48) {
        aScale = 1.0 + 0.28 * Math.exp(-dtPop * 10) * Math.sin(dtPop * 30);
      }
      const u = smoothstep(7.5, 8.6, t);
      ax = hoverSpot.x;
      ay = lerp(1.8, 1.82, u) + Math.sin(t * 3.1) * 0.025;
      az = hoverSpot.z;
      aRotY = lerp(0.3, -0.22, smoothstep(7.5, 7.85, t)) + Math.sin(t * 2.4) * 0.08;
      aRotZ = Math.sin(t * 5.2) * 0.09 * Math.max(0.25, lipApple);
      aGlow = 0.28 + (dtPop >= 0 ? 0.25 * Math.exp(-dtPop * 6) : 0);
    } else if (t < 13.2) {
      const u = smoothstep(10.6, 13.2, t);
      ax = lerp(0.25, 0.32, u) + Math.sin(t * 2.2) * 0.02;
      ay = lerp(1.82, 2.05, u) + Math.cos(t * 2.7) * 0.035;
      az = lerp(0.42, 0.38, u);
      aRotY = -0.35 + Math.sin(t * 1.8) * 0.1;
      aRotZ = Math.sin(t * 2.5) * 0.06;
      aGlow = 0.24;
    } else if (t < 19.8) {
      const u = smoothstep(13.2, 19.8, t);
      ax = lerp(0.32, 0.35, u) + Math.sin((t - 13.2) * 1.85) * 0.07;
      ay = lerp(2.05, 1.95, u) + Math.cos((t - 13.2) * 2.25) * 0.085;
      az = lerp(0.38, 0.35, u) + Math.sin((t - 13.2) * 1.45) * 0.05;
      aRotX = Math.sin(t * 1.7) * 0.09;
      aRotY = -0.3 + Math.sin(t * 1.4) * 0.22;
      aRotZ = Math.cos(t * 2.0) * 0.1;
      aGlow = 0.24;
    } else if (t < 25.8) {
      const pos198X = 0.35 + Math.sin(6.6 * 1.85) * 0.07;
      const pos198Y = 1.95 + Math.cos(6.6 * 2.25) * 0.085;
      const pos198Z = 0.35 + Math.sin(6.6 * 1.45) * 0.05;

      if (t < 22.8) {
        const u = smoothstep(19.8, 22.8, t);
        ax = lerp(pos198X, 0.28, u) + Math.sin(t * 2.5) * 0.02 * u;
        ay = lerp(pos198Y, 2.05, u) + Math.cos(t * 2.9) * 0.03;
        az = lerp(pos198Z, 0.32, u);
        aRotY = -0.25 + Math.sin(t * 2.2) * 0.1;
        aRotZ = Math.sin(t * 4.4) * 0.07 * Math.max(0.2, lipApple);
      } else if (t < 25.35) {
        const u = smoothstep(22.8, 25.35, t);
        ax = lerp(0.28, 0.22, u);
        ay = lerp(2.05, 2.38, u) + Math.sin(t * 2.6) * 0.025;
        az = lerp(0.32, 0.25, u);
        aRotY = lerp(-0.25, -0.5, u);
      } else if (t < 25.6) {
        const u = smoothstep(25.35, 25.6, t);
        ax = lerp(0.22, bonkHeadX, u);
        ay = lerp(2.38, bonkDiveStartY, u);
        az = lerp(0.25, bonkHeadZ, u);
        aRotY = lerp(-0.5, 0.0, u);
        aSquashY = 1.0 - 0.12 * Math.sin(u * Math.PI);
      } else {
        const uDive = clamp01((t - 25.6) / 0.26);
        const easeDive = uDive * uDive;
        ax = bonkHeadX;
        ay = lerp(bonkDiveStartY, bonkHeadTopY, easeDive);
        az = bonkHeadZ;
        aSquashY = lerp(1.0, 1.32, uDive);
      }
      aGlow = 0.26;
    } else if (t < 27.9) {
      if (t < 25.86) {
        const uDive = clamp01((t - 25.6) / 0.26);
        const easeDive = uDive * uDive;
        ax = bonkHeadX;
        ay = lerp(bonkDiveStartY, bonkHeadTopY, easeDive);
        az = bonkHeadZ;
        aSquashY = lerp(1.0, 1.32, uDive);
      } else if (t < 26.34) {
        const dtBonk = t - 25.86;
        const uArc = smoothstep(25.86, 26.34, t);
        ax = lerp(bonkHeadX, 0.22, uArc);
        ay = lerp(bonkHeadTopY, 1.65, uArc) + Math.sin(uArc * Math.PI) * 0.42;
        az = lerp(bonkHeadZ, 0.35, uArc);
        aSquashY = 1.0 - 0.46 * Math.exp(-dtBonk * 9) * Math.cos(dtBonk * 30);
        aRotY = lerp(0.0, 0.12, uArc);
        aGlow = 0.55 * Math.exp(-dtBonk * 4);
      } else {
        ax = 0.22;
        ay = 1.65 + Math.sin((t - 26.34) * 3.2) * 0.035;
        az = 0.35;
        aRotY = 0.08 + Math.sin(t * 2.5) * 0.06;
        aRotZ = Math.sin(t * 5.0) * 0.07 * Math.max(0.25, lipApple);
        aGlow = 0.2;
      }
    } else {
      const yAt279 = 1.65 + Math.sin((27.9 - 26.34) * 3.2) * 0.035;
      if (t < 28.34) {
        const uDrop = smoothstep(27.9, 28.34, t);
        const dropEase = uDrop * uDrop;
        ax = lerp(0.22, 0.25, uDrop);
        ay = lerp(yAt279, 0.22, dropEase);
        az = lerp(0.35, 0.42, uDrop);
        aSquashY = 1.0 + Math.sin(uDrop * Math.PI) * 0.12;
      } else {
        const dtGround = t - 28.34;
        const bounce = Math.abs(Math.sin(dtGround * 11)) * 0.11 * Math.exp(-dtGround * 6);
        ax = 0.25;
        ay = 0.22 + bounce;
        az = 0.42;
        aSquashY = 1.0 - 0.25 * Math.exp(-dtGround * 10) * Math.cos(dtGround * 28);
      }
      aRotY = 0.06;
      aGlow = 0.12;
    }

    applePos.set(ax, ay, az);
    appleRot.set(aRotX, aRotY, aRotZ, 'XYZ');
    appleState.scale = aScale;
    appleState.squashY = aSquashY;
    appleState.faceVisible = t >= 7.55 ? smoothstep(7.55, 7.72, t) : 0;
    appleState.expression = activeBeat.apple?.expression || 'neutral_suspicious';
    appleState.mouthOpen = t >= 7.55 ? lipApple : 0;
    appleState.glowAmount = aGlow;

    // ---------------------------------------------------------
    // 3. Chewton Animation State (single update per frame!)
    // ---------------------------------------------------------
    let cx = chewtonBase.x;
    let cy = chewtonBase.y;
    let cz = chewtonBase.z;
    let cRotX = 0.0;
    let cRotY = 0.22;
    let cRotZ = 0.0;
    let cSquashY = 1.0;
    let cPose = activeBeat.chewton?.pose || 'reading_under_tree';
    let cExpression = activeBeat.chewton?.expression || 'curious_squint';
    let cPoke = 0;
    let cRecoil = 0;
    let wigDetached = 0;
    let quillFloating = false;
    let sunglassesOn = 0;
    let dazeStars = 0;

    if (t < 3.2) {
      cRotY = 0.22;
      if (t < 1.55) {
        chewtonLookTarget.set(-0.35, 1.08, 0.48);
      } else {
        const lookU = smoothstep(1.55, 1.88, t);
        chewtonLookTarget.set(
          lerp(-0.35, ax, lookU),
          lerp(1.08, ay, lookU),
          lerp(0.48, az, lookU)
        );
      }
    } else if (t < 7.5) {
      cRotY = lerp(0.22, 0.45, smoothstep(3.2, 3.65, t));
      if (t >= 5.9 && t < 6.85) {
        cPoke = t < 6.45
          ? smoothstep(5.9, 6.42, t)
          : 1.0 - smoothstep(6.46, 6.85, t);
      }
      if (t >= 6.46) {
        const up = smoothstep(6.46, 6.62, t);
        const settle = lerp(1.0, 0.42, smoothstep(6.62, 7.45, t));
        cRecoil = up * settle;
      }
      chewtonLookTarget.copy(applePos);
    } else if (t < 10.6) {
      cRotY = lerp(0.45, 0.55, smoothstep(7.5, 7.9, t));
      const baseDecay = 0.42 * (1.0 - smoothstep(7.5, 8.2, t));
      const popJolt = t >= 7.55 ? 0.45 * Math.exp(-(t - 7.55) * 5.5) : 0;
      cRecoil = clamp01(baseDecay + popJolt);
      chewtonLookTarget.copy(applePos);
    } else if (t < 13.2) {
      const liftU = smoothstep(10.75, 13.2, t);
      cy = lerp(0.0, 1.12, liftU);
      cRotX = lerp(0.0, 0.08, liftU);
      cRotY = lerp(0.55, 0.25, liftU);
      cRotZ = lerp(0.0, -0.08, liftU);
      wigDetached = smoothstep(10.85, 11.75, t);
      quillFloating = t >= 10.85;
      if (t >= 11.0 && t <= 12.1) {
        chewtonLookTarget.set(-0.35, 2.95, 0.15);
      } else {
        chewtonLookTarget.copy(applePos);
      }
    } else if (t < 19.8) {
      // Smooth center-of-mass tumble upside down so upside-down head sits at y≈1.05 (clear above subtitles!)
      const tumbleU = smoothstep(13.2, 14.35, t);
      cRotX = lerp(0.08, 0.22, tumbleU) + Math.sin(t * 1.4) * 0.05;
      cRotY = lerp(0.25, 0.3, tumbleU) + Math.cos(t * 1.1) * 0.08;
      cRotZ = lerp(-0.08, 3.06, tumbleU) + Math.sin(t * 1.25) * 0.05;

      const centerY132 = 1.12 + 0.88; // torso height at t=13.2
      const floatCenterY = 1.66 + Math.sin((t - 13.2) * 1.75) * 0.14;
      const curCenterY = lerp(centerY132, floatCenterY, smoothstep(13.2, 14.2, t));
      cy = curCenterY - 0.88 * Math.cos(cRotZ);

      wigDetached = t < 19.5 ? 1.0 : 1.0 - smoothstep(19.5, 19.8, t);
      quillFloating = true;
      chewtonLookTarget.lerpVectors(applePos, viewerPos, smoothstep(16.8, 18.2, t));
    } else if (t < 25.8) {
      // Heroic mid-air center-of-mass backflip upright to cy=0.48 (head at y≈2.11, torso at y≈1.36, fits low-angle framing!)
      const rotZ198 = 3.06 + Math.sin(19.8 * 1.25) * 0.05;
      const centerY198 = 1.66 + Math.sin((19.8 - 13.2) * 1.75) * 0.14;
      const flipU = smoothstep(19.8, 20.24, t);
      const bob = Math.sin((t - 19.8) * 2.1) * 0.045 * smoothstep(19.8, 20.35, t);

      cRotX = lerp(0.22, -0.06, flipU);
      cRotY = lerp(0.3, 0.15, flipU);
      const swayZ = Math.sin(t * 1.6) * 0.025 * smoothstep(20.2, 20.55, t);
      cRotZ = t < 20.24 ? lerp(rotZ198, Math.PI * 2, flipU) : swayZ;

      const targetCenterY = 1.36 + bob; // feet at 0.48, head at 2.11!
      const curCenterY = lerp(centerY198, targetCenterY, flipU);
      cy = curCenterY - 0.88 * Math.cos(cRotZ);

      wigDetached = 0;
      quillFloating = false;
      sunglassesOn = t >= 19.85 ? smoothstep(19.85, 20.06, t) : 0;
      chewtonLookTarget.set(-0.05, cy + 1.5, 3.2);
    } else if (t < 27.9) {
      if (t < 25.86) {
        const bob = Math.sin((t - 19.8) * 2.1) * 0.045;
        cy = 0.48 + bob;
        cRotX = -0.06;
        cRotY = 0.15;
        cRotZ = Math.sin(t * 1.6) * 0.025;
        cPose = 'cool_rebrand_arms_crossed';
        cExpression = 'cool_smirk';
        sunglassesOn = 1.0;
        chewtonLookTarget.set(-0.05, cy + 1.5, 3.2);
      } else {
        const yAt2586 = 0.48 + Math.sin((25.86 - 19.8) * 2.1) * 0.045;
        const fallU = smoothstep(25.86, 26.06, t);
        cy = lerp(yAt2586, 0.0, fallU * fallU);
        cRotX = lerp(-0.06, 0.12, fallU);
        cRotY = 0.15;
        cRotZ = 0.0;
        if (t >= 26.06) {
          const dtLand = t - 26.06;
          cSquashY = 1.0 - 0.34 * Math.exp(-dtLand * 10) * Math.cos(dtLand * 28);
        }
        cRecoil = Math.exp(-(t - 25.86) * 4.5);
        sunglassesOn = t < 25.95 ? 1.0 - smoothstep(25.86, 25.95, t) : 0;
        dazeStars = t >= 25.92 ? smoothstep(25.92, 26.25, t) : 0;
        chewtonLookTarget.copy(applePos);
      }
    } else {
      const u = smoothstep(27.9, 28.25, t);
      cy = 0.0;
      cRotX = lerp(0.12, 0.15, u);
      cRotY = lerp(0.15, 0.1, u);
      cRotZ = lerp(0.0, -0.06, u);
      dazeStars = 1.0;
      chewtonLookTarget.set(0.0, 1.15, 2.5);
    }

    chewtonPos.set(cx, cy, cz);
    chewtonRot.set(cRotX, cRotY, cRotZ, 'XYZ');
    chewtonState.pose = cPose;
    chewtonState.expression = cExpression;
    chewtonState.mouthOpen = lipChewton;
    chewtonState.wigDetached = wigDetached;
    chewtonState.quillFloating = quillFloating;
    chewtonState.sunglassesOn = sunglassesOn;
    chewtonState.dazeStars = dazeStars;
    chewtonState.squashY = cSquashY;
    chewtonState.pokeAmount = cPoke;
    chewtonState.recoilAmount = cRecoil;

    rebrandSpot.target.position.set(cx, cy + 1.4, cz);
    rebrandSpot.target.updateMatrixWorld();

    // ---------------------------------------------------------
    // 4. Single-Pass Updates -> MatrixWorld -> Camera -> Render -> HUD
    // ---------------------------------------------------------
    orchardWorld.update(t, worldState);
    chewtonRig.update(t, chewtonState);

    chewtonRig.group.updateMatrixWorld(true);
    const headRet = chewtonRig.getHeadWorldPos(chewtonHeadPos);
    if (headRet && headRet !== chewtonHeadPos) {
      chewtonHeadPos.copy(headRet);
    }

    if (t >= 26.05) {
      appleLookTarget.copy(viewerPos);
    } else if (t >= 9.35 && t <= 10.55) {
      appleLookTarget.lerpVectors(chewtonHeadPos, viewerPos, smoothstep(9.35, 9.7, t));
    } else {
      appleLookTarget.copy(chewtonHeadPos);
    }

    sassyAppleRig.update(t, appleState);

    scene.updateMatrixWorld(true);
    const headFinal = chewtonRig.getHeadWorldPos(chewtonHeadPos);
    if (headFinal && headFinal !== chewtonHeadPos) {
      chewtonHeadPos.copy(headFinal);
    }
    const appleFinal = sassyAppleRig.getWorldPos(appleWorldPos);
    if (appleFinal && appleFinal !== appleWorldPos) {
      appleWorldPos.copy(appleFinal);
    }

    directorState.activeBeat = activeBeat;
    directorState.sfxShake = computeSfxShake(sfxEvents, t);
    cameraDirector.update(t, directorState);

    renderer.render(scene, camera);
    updateHud(t, spotlightAlpha);
  }

  window.renderAtTime = evaluateAtTime;

  // Render initial frame synchronously so canvas is immediately valid
  const params = new URLSearchParams(window.location.search);
  const initialT = parseFloat(params.get('t') || '0') || 0;
  evaluateAtTime(initialT);

  // Signal Playwright that assets, scene, rigs, and HUD are 100% ready
  window.__SCENE_READY__ = true;

  // Optional live browser preview mode (?preview=1)
  if (params.get('preview') === '1') {
    let startMs = performance.now() - initialT * 1000;
    let paused = false;
    let lastPreviewT = initialT;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        paused = !paused;
        if (!paused) {
          startMs = performance.now() - lastPreviewT * 1000;
        }
      }
    });

    const tick = (nowMs) => {
      if (!paused) {
        const previewT = ((nowMs - startMs) * 0.001) % duration;
        lastPreviewT = previewT;
        evaluateAtTime(previewT);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

init().catch((err) => {
  console.error('FATAL INIT ERROR:', err);
  window.__SCENE_ERROR__ = String(err?.stack || err);
  throw err;
});
