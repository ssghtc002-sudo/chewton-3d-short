import * as THREE from 'three';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t) {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeOutQuint(t) {
  const u = 1 - clamp01(t);
  return 1 - u * u * u * u * u;
}

const SHOT_TRANSITIONS = {
  hook_apple_drop: { duration: 0.0, whipFov: 0.0, whipRoll: 0.0 },
  two_shot_poke: { duration: 0.24, whipFov: 1.5, whipRoll: 0.02 },
  apple_reveal_whip: { duration: 0.17, whipFov: 4.5, whipRoll: -0.08 },
  wig_float_chaos: { duration: 0.19, whipFov: 4.0, whipRoll: 0.08 },
  upside_down_montage: { duration: 0.26, whipFov: 3.5, whipRoll: -0.06 },
  rebrand_hero_lowangle: { duration: 0.09, whipFov: 2.5, whipRoll: 0.0 },
  bonk_impact_wide: { duration: 0.06, whipFov: 2.0, whipRoll: 0.0 },
  outro_dazed_closeup: { duration: 0.14, whipFov: 1.5, whipRoll: 0.02 }
};

export function createCameraDirector(camera, timeline = {}) {
  const beats = Array.isArray(timeline.beats) ? timeline.beats : [];
  const sfxEvents = Array.isArray(timeline.sfxEvents) ? timeline.sfxEvents : [];
  const anchors = timeline.worldAnchors || {};

  const defaultHead = new THREE.Vector3(
    ...(anchors.chewtonHeadRestPos || [-0.35, 1.65, 0.0])
  );
  const defaultApple = new THREE.Vector3(
    ...(anchors.appleHoverSpot || [0.25, 1.80, 0.42])
  );

  // Pre-allocated scratch vectors & scalar holder (zero per-frame GC!)
  const currPos = new THREE.Vector3();
  const currLook = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevLook = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const finalLook = new THREE.Vector3();
  const safeHead = new THREE.Vector3();
  const safeApple = new THREE.Vector3();

  const currScalars = { fov: 44, roll: 0, swayAmp: 1.0 };
  const prevScalars = { fov: 44, roll: 0, swayAmp: 1.0 };

  function findBeatAt(t) {
    if (beats.length === 0) return null;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (t >= b.start && t < b.end) return b;
    }
    return t < beats[0].start ? beats[0] : beats[beats.length - 1];
  }

  function computeFallbackShake(t) {
    let total = 0;
    for (let i = 0; i < sfxEvents.length; i++) {
      const ev = sfxEvents[i];
      const dt = t - ev.time;
      if (dt >= 0 && dt < 0.75) {
        let weight = 0;
        if (ev.type === 'bonk') weight = 1.0;
        else if (ev.type === 'vine_boom') weight = 0.55;
        else if (ev.type === 'boing') weight = 0.42;
        else if (ev.type === 'bling') weight = 0.25;
        else if (ev.type === 'record_scratch') weight = 0.30;
        if (weight > 0) {
          total = Math.max(total, weight * Math.exp(-dt * 7.5));
        }
      }
    }
    return clamp01(total);
  }

  function evalShotPose(shotName, t, beat, headPos, applePos, outPos, outLook, outScalars) {
    const beatStart = beat ? beat.start : 0;
    const beatEnd = beat ? beat.end : 30;
    const localT = Math.max(0, t - beatStart);
    const beatNorm = clamp01((t - beatStart) / Math.max(0.001, beatEnd - beatStart));

    switch (shotName) {
      case 'hook_apple_drop': {
        // 0.0 -> 1.15: establish tree branch [0.15, 2.95, 0.25] & Chewton reading below
        // 1.15 -> 1.85: track apple drop down to [0.25, 1.80, 0.42]
        // 1.85 -> 3.20: dramatic vine_boom freeze punch-in
        const trackDrop = smoothstep(1.12, 1.86, t);
        const freezePunch = t >= 1.85 ? easeOutCubic(clamp01((t - 1.85) / 0.24)) : 0;
        const appleY = lerp(2.95, clamp(applePos.y, 1.72, 2.95), trackDrop);

        const basePosX = lerp(-0.08, 0.00, trackDrop) + freezePunch * 0.03;
        const basePosY = lerp(2.28, 1.78, trackDrop) - freezePunch * 0.04;
        const basePosZ = lerp(4.32, 3.26, trackDrop) - freezePunch * 0.28;

        const lookX = lerp(-0.06, -0.04, trackDrop);
        const lookY = lerp(2.26, appleY - 0.34, trackDrop) + freezePunch * 0.02;
        const lookZ = lerp(0.05, 0.16, trackDrop);

        outPos.set(basePosX, basePosY, basePosZ);
        outLook.set(lookX, lookY, lookZ);
        outScalars.fov = lerp(46.8, 42.5, trackDrop) - freezePunch * 3.0;
        outScalars.roll = freezePunch * -0.018;
        outScalars.swayAmp = 0.85;
        break;
      }

      case 'two_shot_poke': {
        // Medium two-shot framing Chewton [-0.35, 1.65, 0.0] & Apple [0.25, 1.80, 0.42]
        const leanIn = smoothstep(3.2, 6.35, t);
        const boingDt = t - 6.45;
        const boingPunch = boingDt >= 0 ? Math.exp(-boingDt * 4.5) : 0;
        const boingSettle = smoothstep(6.45, 6.72, t);
        const scratchDt = t - 7.38;
        const scratchTilt = scratchDt >= 0 ? smoothstep(7.38, 7.49, t) * 0.04 : 0;

        outPos.set(
          lerp(-0.05, -0.02, leanIn) + boingSettle * 0.02,
          lerp(1.72, 1.70, leanIn) - boingPunch * 0.03,
          lerp(3.30, 3.06, leanIn) - boingSettle * 0.20 - boingPunch * 0.14
        );
        outLook.set(
          lerp(-0.07, -0.05, leanIn),
          lerp(1.44, 1.46, leanIn),
          0.16
        );
        outScalars.fov = lerp(43.8, 42.2, leanIn) - boingSettle * 1.8 - boingPunch * 2.4;
        outScalars.roll = scratchTilt;
        outScalars.swayAmp = 0.8;
        break;
      }

      case 'apple_reveal_whip': {
        // Tight punch-in onto floating Apple [0.25, 1.80, 0.42] as sassy face pops out at 7.55s
        const popDt = t - 7.55;
        const facePop = popDt >= 0 ? Math.exp(-popDt * 7.5) * Math.sin(popDt * 24) : 0;
        const drift = smoothstep(7.5, 10.6, t);

        const ax = clamp(applePos.x, 0.05, 0.50);
        const ay = clamp(applePos.y, 1.55, 2.20);
        const az = clamp(applePos.z, 0.15, 0.65);

        outPos.set(
          ax + 0.05 - drift * 0.11,
          ay + 0.02 + Math.sin(localT * 1.4) * 0.02,
          az + 1.44 - drift * 0.08 - Math.max(0, facePop) * 0.10
        );
        // Aim slightly below Apple's center so Apple sits upper-middle above bottom subtitles
        outLook.set(ax - 0.02, ay - 0.13, az);
        outScalars.fov = 40.5 - facePop * 2.2;
        outScalars.roll = -0.038 + Math.sin(localT * 1.8) * 0.015;
        outScalars.swayAmp = 0.55;
        break;
      }

      case 'wig_float_chaos': {
        // Whip back to Chewton [-0.35, 0..1.25, 0.0], tilting up to track detached wig & quill
        const lift = smoothstep(10.6, 13.2, t);
        const headY = clamp(headPos.y, 1.50, 2.95);
        const targetLookY = lerp(1.52, headY - 0.05, 0.72);

        outPos.set(
          -0.20 + Math.sin(localT * 1.3) * 0.04,
          1.32 + lift * 0.62,
          3.22 + lift * 0.28
        );
        outLook.set(-0.28, targetLookY, 0.02);
        outScalars.fov = 45.5 + lift * 1.5;
        outScalars.roll = -0.095 * lift;
        outScalars.swayAmp = 1.05;
        break;
      }

      case 'upside_down_montage': {
        // Slow orbital arc + Dutch tilt around floating Chewton, Apple, & Twist 2 props
        const orbitAngle = lerp(-0.32, 0.34, beatNorm);
        const radius = 4.26;
        const pivotX = -0.08;
        const pivotY = 1.72;
        const pivotZ = -0.02;

        const boomDt = t - 19.25;
        const boomPunch = boomDt >= 0 ? Math.exp(-boomDt * 5.0) : 0;
        const zoomDist = radius - boomPunch * 0.36;

        outPos.set(
          pivotX + Math.sin(orbitAngle) * zoomDist,
          pivotY + 0.04 + Math.sin(localT * 0.9) * 0.16,
          pivotZ + Math.cos(orbitAngle) * zoomDist
        );
        outLook.set(
          pivotX,
          pivotY + Math.sin(localT * 0.7) * 0.06,
          pivotZ
        );
        outScalars.fov = 49.0 - boomPunch * 4.2;
        outScalars.roll = 0.13 * Math.sin(localT * 0.75) + 0.06;
        outScalars.swayAmp = 1.15;
        break;
      }

      case 'rebrand_hero_lowangle': {
        // Dramatic low-angle hero push-in looking up at Chewton [-0.35, 1.45, 0.0] in spotlight
        const push = smoothstep(19.8, 25.8, t);
        const blingDt = t - 19.85;
        const blingPop = blingDt >= 0 ? Math.exp(-blingDt * 6.5) : 0;

        outPos.set(
          lerp(-0.18, -0.22, push),
          lerp(0.56, 0.68, push),
          lerp(3.26, 2.74, push) - blingPop * 0.14
        );
        outLook.set(
          lerp(-0.17, -0.21, push),
          lerp(1.42, 1.46, push),
          0.05
        );
        outScalars.fov = lerp(46.5, 42.5, push) - blingPop * 2.4;
        outScalars.roll = 0.02;
        outScalars.swayAmp = 0.65;
        break;
      }

      case 'bonk_impact_wide': {
        // Wide dramatic impact frame capturing Apple slam at [-0.35, 1.82, 0.0] & shockwave ring
        const bonkDt = t - 25.86;
        const bonkImpact = bonkDt >= 0 ? Math.exp(-bonkDt * 5.2) : 0;

        outPos.set(
          0.04,
          1.46 - bonkImpact * 0.06,
          4.38 + bonkImpact * 0.18
        );
        outLook.set(-0.08, 1.16, 0.05);
        outScalars.fov = 49.0 + bonkImpact * 3.5;
        outScalars.roll = bonkImpact * -0.025;
        outScalars.swayAmp = 1.0;
        break;
      }

      case 'outro_dazed_closeup': {
        // Tight comedic close-up on dazed Chewton (head ~1.35) & smiling foreground Apple [0.25, 0.22, 0.42]
        const creep = smoothstep(27.9, 30.0, t);
        outPos.set(
          lerp(0.02, 0.00, creep),
          lerp(1.02, 0.96, creep),
          lerp(3.22, 2.98, creep)
        );
        outLook.set(-0.06, 0.68, 0.14);
        outScalars.fov = lerp(43.5, 41.5, creep);
        outScalars.roll = -0.022 * Math.sin(localT * 2.4);
        outScalars.swayAmp = 0.7;
        break;
      }

      default: {
        outPos.set(0.0, 1.65, 3.6);
        outLook.set(-0.05, 1.4, 0.1);
        outScalars.fov = 45;
        outScalars.roll = 0;
        outScalars.swayAmp = 0.8;
        break;
      }
    }
  }

  function update(t = 0, state = {}) {
    const activeBeat = state.activeBeat || findBeatAt(t);
    const shotName =
      (activeBeat && (activeBeat.cameraShot || (activeBeat.camera && activeBeat.camera.shotType))) ||
      'hook_apple_drop';

    if (state.chewtonHeadPos) {
      safeHead.copy(state.chewtonHeadPos);
    } else {
      safeHead.copy(defaultHead);
    }

    if (state.applePos) {
      safeApple.copy(state.applePos);
    } else {
      safeApple.copy(defaultApple);
    }

    evalShotPose(shotName, t, activeBeat, safeHead, safeApple, currPos, currLook, currScalars);

    let blendedFov = currScalars.fov;
    let blendedRoll = currScalars.roll;
    let swayAmp = currScalars.swayAmp;

    finalPos.copy(currPos);
    finalLook.copy(currLook);

    // Analytical whip-pan / cut transition from the preceding beat
    if (activeBeat && beats.length > 1) {
      const beatIdx = beats.indexOf(activeBeat);
      const trans = SHOT_TRANSITIONS[shotName] || { duration: 0.2, whipFov: 2.0, whipRoll: 0.0 };
      const elapsedInBeat = t - activeBeat.start;

      if (beatIdx > 0 && trans.duration > 0.001 && elapsedInBeat >= 0 && elapsedInBeat < trans.duration) {
        const prevBeat = beats[beatIdx - 1];
        const prevShot =
          prevBeat.cameraShot || (prevBeat.camera && prevBeat.camera.shotType) || 'hook_apple_drop';

        evalShotPose(
          prevShot,
          activeBeat.start,
          prevBeat,
          safeHead,
          safeApple,
          prevPos,
          prevLook,
          prevScalars
        );

        const u = clamp01(elapsedInBeat / trans.duration);
        const eased = easeOutQuint(u);
        const whipBell = Math.sin(u * Math.PI);

        finalPos.lerpVectors(prevPos, currPos, eased);
        finalLook.lerpVectors(prevLook, currLook, eased);
        blendedFov = lerp(prevScalars.fov, currScalars.fov, eased) + whipBell * trans.whipFov;
        blendedRoll = lerp(prevScalars.roll, currScalars.roll, eased) + whipBell * trans.whipRoll;
        swayAmp = lerp(prevScalars.swayAmp, currScalars.swayAmp, eased);
      }
    }

    // Subtle organic handheld breathing sway
    const swayX = (Math.sin(t * 1.13) * 0.012 + Math.sin(t * 2.47) * 0.004) * swayAmp;
    const swayY = (Math.cos(t * 1.51) * 0.010 + Math.cos(t * 0.71) * 0.006) * swayAmp;
    const swayRoll = Math.sin(t * 0.92) * 0.006 * swayAmp;

    // Damped spring impact shake
    const rawShake = state.sfxShake !== undefined ? state.sfxShake : computeFallbackShake(t);
    const shake = clamp01(rawShake);
    const shakeX = shake * (Math.sin(t * 53.0) * 0.075 + Math.cos(t * 89.0) * 0.035);
    const shakeY = shake * (Math.cos(t * 61.0) * 0.075 + Math.sin(t * 97.0) * 0.032);
    const shakeRoll = shake * (Math.sin(t * 47.0) * 0.038 + Math.cos(t * 79.0) * 0.016);

    camera.position.set(
      finalPos.x + swayX + shakeX,
      finalPos.y + swayY + shakeY,
      finalPos.z
    );
    camera.lookAt(finalLook.x + shakeX * 0.35, finalLook.y + shakeY * 0.35, finalLook.z);
    camera.rotateZ(blendedRoll + swayRoll + shakeRoll);

    if (Math.abs(camera.fov - blendedFov) > 1e-4) {
      camera.fov = blendedFov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    update
  };
}
