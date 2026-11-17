import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startStaticServer } from './server.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const QA_TIMESTAMPS = [1.0, 2.3, 5.0, 6.5, 8.8, 11.8, 16.0, 21.5, 25.95, 29.0];

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

async function writeChunk(stream, buffer) {
  if (!stream.write(buffer)) {
    await new Promise((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        stream.off('drain', onDrain);
        stream.off('error', onError);
      };
      stream.on('drain', onDrain);
      stream.on('error', onError);
    });
  }
}

function formatQaFilename(idx, t) {
  const num = String(idx + 1).padStart(2, '0');
  return `qa_${num}_t${t.toFixed(2)}.png`;
}

async function captureFastPng(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
    fromSurface: true,
  });
  return Buffer.from(data, 'base64');
}

async function probeVideoFrames(filePath) {
  const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames,width,height,r_frame_rate:format=duration',
    '-of', 'json',
    filePath,
  ]);
  const info = JSON.parse(stdout);
  const stream = info.streams?.[0] || {};
  return {
    nbFrames: Number(stream.nb_frames || 0),
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    rFrameRate: stream.r_frame_rate || '',
    duration: Number(info.format?.duration || 0),
  };
}

async function launchScenePage({ serverUrl, width, height, label }) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: CHROMIUM_ARGS,
  });

  const fatalErrors = [];
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  page.on('pageerror', (err) => {
    const msg = `[${label} pageerror] ${err?.stack || err}`;
    console.error(msg);
    fatalErrors.push(msg);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = `[${label} console.error] ${msg.text()}`;
      console.error(text);
      fatalErrors.push(text);
    }
  });

  page.on('requestfailed', (req) => {
    const text = `[${label} requestfailed] ${req.url()} (${req.failure()?.errorText || 'unknown'})`;
    console.error(text);
    fatalErrors.push(text);
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      const text = `[${label} HTTP ${res.status()}] ${res.url()}`;
      console.error(text);
      fatalErrors.push(text);
    }
  });

  const targetUrl = `${serverUrl}/index.html`;
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForFunction(
    () => window.__SCENE_READY__ === true || Boolean(window.__SCENE_ERROR__),
    { timeout: 30000 }
  );

  const sceneErr = await page.evaluate(() => window.__SCENE_ERROR__ || null);
  if (sceneErr) {
    await browser.close().catch(() => {});
    throw new Error(`[${label}] Scene initialization error: ${sceneErr}`);
  }
  if (fatalErrors.length > 0) {
    await browser.close().catch(() => {});
    throw new Error(`[${label}] Fatal browser errors during load:\n${fatalErrors.join('\n')}`);
  }

  await page.evaluate(() => document.fonts.ready);
  const webglInfo = await page.evaluate(() => window.__WEBGL_INFO__ || {});
  console.log(`[${label}] WebGL ready: ${webglInfo.renderer || 'unknown'}`);

  return { browser, page, cdp, fatalErrors };
}

async function renderWorkerSegment({
  workerId,
  startFrame,
  endFrame,
  fps,
  width,
  height,
  serverUrl,
  segmentPath,
  qaByFrame,
  extraQaTimestamps,
  qaDir,
}) {
  const label = `Worker-${workerId}`;
  const count = endFrame - startFrame + 1;
  console.log(`[${label}] Starting frames ${startFrame}..${endFrame} (${count} frames) -> ${path.basename(segmentPath)}`);

  let browser;
  let ffmpegProc;

  try {
    const launched = await launchScenePage({ serverUrl, width, height, label });
    browser = launched.browser;
    const { page, cdp, fatalErrors } = launched;

    // Warm up rig lerp convergence smoothly before segment seam if startFrame > 0
    if (startFrame > 0) {
      const warmupStart = Math.max(0, startFrame - 10);
      for (let w = warmupStart; w < startFrame; w += 1) {
        await page.evaluate((timeSec) => window.renderAtTime(timeSec), w / fps);
      }
    }

    const ffmpegArgs = [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', String(fps),
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-g', String(fps),
      '-fps_mode', 'cfr',
      '-video_track_timescale', '90000',
      '-an',
      segmentPath,
    ];

    ffmpegProc = spawn('/usr/bin/ffmpeg', ffmpegArgs, {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let ffmpegStderr = '';
    ffmpegProc.stderr.on('data', (chunk) => {
      ffmpegStderr += chunk.toString();
      if (ffmpegStderr.length > 24000) {
        ffmpegStderr = ffmpegStderr.slice(-16000);
      }
    });

    let ffmpegEarlyError = null;
    const ffmpegExitPromise = new Promise((resolve, reject) => {
      ffmpegProc.once('error', (err) => {
        ffmpegEarlyError = err;
        reject(err);
      });
      ffmpegProc.once('close', (code, signal) => {
        if (code === 0) {
          resolve();
        } else {
          const err = new Error(`[${label}] FFmpeg exited with code=${code} signal=${signal}\n${ffmpegStderr}`);
          ffmpegEarlyError = err;
          reject(err);
        }
      });
    });
    ffmpegExitPromise.catch(() => {});

    ffmpegProc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        console.error(`[${label} FFmpeg stdin error]`, err);
      }
    });

    const workerStartWall = performance.now();

    for (let frame = startFrame; frame <= endFrame; frame += 1) {
      if (ffmpegEarlyError) throw ffmpegEarlyError;

      const t = frame / fps;
      await page.evaluate((timeSec) => window.renderAtTime(timeSec), t);

      if (fatalErrors.length > 0) {
        throw new Error(`[${label}] Fatal browser error at frame ${frame} (t=${t.toFixed(3)}s):\n${fatalErrors.join('\n')}`);
      }

      const pngBuffer = await captureFastPng(cdp);
      if (ffmpegEarlyError) throw ffmpegEarlyError;
      await writeChunk(ffmpegProc.stdin, pngBuffer);

      const qaEntry = qaByFrame.get(frame);
      if (qaEntry) {
        await fs.writeFile(path.join(qaDir, qaEntry.filename), pngBuffer);
      }

      const doneInWorker = frame - startFrame + 1;
      if (doneInWorker % 25 === 0 || frame === startFrame || frame === endFrame) {
        const elapsedSec = (performance.now() - workerStartWall) / 1000;
        const rate = doneInWorker / Math.max(elapsedSec, 0.001);
        const etaSec = (count - doneInWorker) / Math.max(rate, 0.001);
        console.log(
          `[${label}] Frame ${frame + 1} (${doneInWorker}/${count}, t=${t.toFixed(2)}s) | ` +
          `elapsed=${elapsedSec.toFixed(1)}s | eta=${etaSec.toFixed(1)}s`
        );
      }
    }

    // Capture any non-integer QA timestamps belonging to this worker's range
    for (const qa of extraQaTimestamps) {
      await page.evaluate((timeSec) => window.renderAtTime(timeSec), qa.t);
      if (fatalErrors.length > 0) {
        throw new Error(`[${label}] Fatal browser error at QA t=${qa.t}:\n${fatalErrors.join('\n')}`);
      }
      const qaBuffer = await captureFastPng(cdp);
      await fs.writeFile(path.join(qaDir, qa.filename), qaBuffer);
    }

    ffmpegProc.stdin.end();
    await ffmpegExitPromise;
    console.log(`[${label}] Segment complete: ${path.basename(segmentPath)}`);
  } finally {
    if (ffmpegProc && ffmpegProc.exitCode === null && !ffmpegProc.killed) {
      try {
        ffmpegProc.stdin.end();
        ffmpegProc.kill('SIGKILL');
      } catch {
        // ignore cleanup errors
      }
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function getPartFrameRange(partIndex, totalParts, totalFrames) {
  const startFrame = Math.floor(((partIndex - 1) * totalFrames) / totalParts);
  const endFrame = Math.floor((partIndex * totalFrames) / totalParts) - 1;
  return { startFrame, endFrame, count: endFrame - startFrame + 1 };
}

function getPartPath(segmentsDir, partIndex, totalParts) {
  const kStr = String(partIndex).padStart(2, '0');
  const nStr = String(totalParts).padStart(2, '0');
  return path.join(segmentsDir, `part_${kStr}_of_${nStr}.mp4`);
}

async function concatSegments(segmentPaths, outPath, concatListPath) {
  const concatContent = segmentPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n') + '\n';
  await fs.writeFile(concatListPath, concatContent, 'utf8');
  await execFileAsync('/usr/bin/ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c:v', 'copy',
    '-an',
    outPath,
  ], { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 });
}

async function renderPart({
  partIndex,
  totalParts,
  totalFrames,
  fps,
  width,
  height,
  serverUrl,
  segmentsDir,
  qaByFrame,
  extraQaTimestamps,
  qaDir,
  resume,
}) {
  const { startFrame, endFrame, count } = getPartFrameRange(partIndex, totalParts, totalFrames);
  const partPath = getPartPath(segmentsDir, partIndex, totalParts);

  if (resume && existsSync(partPath)) {
    try {
      const info = await probeVideoFrames(partPath);
      if (info.nbFrames === count && info.width === width && info.height === height) {
        console.log(`[Part ${partIndex}/${totalParts}] Skipping already verified ${path.basename(partPath)} (${count} frames)`);
        return partPath;
      }
    } catch {
      // re-render corrupt/incomplete part
    }
  }

  const partQaByFrame = new Map();
  for (const [frameIdx, entry] of qaByFrame.entries()) {
    if (frameIdx >= startFrame && frameIdx <= endFrame) {
      partQaByFrame.set(frameIdx, entry);
    }
  }
  const partExtras = extraQaTimestamps.filter((q) => {
    const f = Math.round(q.t * fps);
    return f >= startFrame && f <= endFrame;
  });

  const midFrame = startFrame + Math.floor(count / 2);
  const w0Path = path.join(segmentsDir, `.part_${partIndex}_w0.mp4`);
  const w1Path = path.join(segmentsDir, `.part_${partIndex}_w1.mp4`);
  const concatListPath = path.join(segmentsDir, `.part_${partIndex}_concat.txt`);

  console.log(`[Part ${partIndex}/${totalParts}] Rendering frames ${startFrame}..${endFrame} (${count} frames) across 2 parallel workers...`);

  try {
    if (count < 8) {
      await renderWorkerSegment({
        workerId: 0,
        startFrame,
        endFrame,
        fps,
        width,
        height,
        serverUrl,
        segmentPath: partPath,
        qaByFrame: partQaByFrame,
        extraQaTimestamps: partExtras,
        qaDir,
      });
    } else {
      const extra0 = partExtras.filter((q) => Math.round(q.t * fps) < midFrame);
      const extra1 = partExtras.filter((q) => Math.round(q.t * fps) >= midFrame);
      await Promise.all([
        renderWorkerSegment({
          workerId: 0,
          startFrame,
          endFrame: midFrame - 1,
          fps,
          width,
          height,
          serverUrl,
          segmentPath: w0Path,
          qaByFrame: partQaByFrame,
          extraQaTimestamps: extra0,
          qaDir,
        }),
        renderWorkerSegment({
          workerId: 1,
          startFrame: midFrame,
          endFrame,
          fps,
          width,
          height,
          serverUrl,
          segmentPath: w1Path,
          qaByFrame: partQaByFrame,
          extraQaTimestamps: extra1,
          qaDir,
        }),
      ]);
      await concatSegments([w0Path, w1Path], partPath, concatListPath);
    }

    const verified = await probeVideoFrames(partPath);
    if (verified.nbFrames !== count) {
      throw new Error(`[Part ${partIndex}/${totalParts}] Frame count mismatch: got ${verified.nbFrames}, expected ${count}`);
    }
    console.log(
      `[Part ${partIndex}/${totalParts}] Verified ${path.basename(partPath)}: ` +
      `${verified.nbFrames} frames, ${verified.duration.toFixed(3)}s`
    );
    return partPath;
  } finally {
    await fs.rm(w0Path, { force: true }).catch(() => {});
    await fs.rm(w1Path, { force: true }).catch(() => {});
    await fs.rm(concatListPath, { force: true }).catch(() => {});
  }
}

async function assembleFinalVideo({ totalParts, totalFrames, segmentsDir, masterAudioPath, outputVideoPath, startWall }) {
  const partPaths = [];
  let sumFrames = 0;

  for (let k = 1; k <= totalParts; k += 1) {
    const p = getPartPath(segmentsDir, k, totalParts);
    if (!existsSync(p)) {
      throw new Error(`Missing part file for assembly: ${p}`);
    }
    const expected = getPartFrameRange(k, totalParts, totalFrames).count;
    const probe = await probeVideoFrames(p);
    if (probe.nbFrames !== expected) {
      throw new Error(`Part ${k}/${totalParts} (${p}) has ${probe.nbFrames} frames, expected ${expected}`);
    }
    sumFrames += probe.nbFrames;
    partPaths.push(p);
  }

  if (sumFrames !== totalFrames) {
    throw new Error(`Assembled frame sum mismatch: ${sumFrames} != ${totalFrames}`);
  }

  const concatListPath = path.join(segmentsDir, '.concat_final.txt');
  const concatContent = partPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n') + '\n';
  await fs.writeFile(concatListPath, concatContent, 'utf8');

  console.log(`[FFmpeg] Concatenating ${partPaths.length} segments (${sumFrames} frames) and muxing ${path.basename(masterAudioPath)} -> ${outputVideoPath}`);
  await execFileAsync('/usr/bin/ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-i', masterAudioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputVideoPath,
  ], { cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024 });

  const totalElapsed = (performance.now() - startWall) / 1000;
  const stat = await fs.stat(outputVideoPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`[Done] Final render + concat/mux completed in ${totalElapsed.toFixed(1)}s`);
  console.log(`[Output] ${outputVideoPath} (${sizeMb} MB, ${stat.size} bytes)`);

  const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels',
    '-of', 'json',
    outputVideoPath,
  ]);
  console.log('[FFprobe]', stdout.trim());

  await fs.rm(segmentsDir, { recursive: true, force: true }).catch(() => {});
}

function parseCliArgs(argv) {
  let qaOnly = false;
  let assemble = false;
  let resume = false;
  let partSpec = null;
  let totalParts = 6;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--qa-only') qaOnly = true;
    else if (a === '--assemble') assemble = true;
    else if (a === '--resume') resume = true;
    else if (a === '--part' && argv[i + 1]) {
      partSpec = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--part=')) {
      partSpec = a.slice('--part='.length);
    } else if (a === '--parts' && argv[i + 1]) {
      totalParts = Number(argv[i + 1]) || 6;
      i += 1;
    } else if (a.startsWith('--parts=')) {
      totalParts = Number(a.slice('--parts='.length)) || 6;
    }
  }

  let partIndex = null;
  if (partSpec) {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(partSpec.trim());
    if (!m) {
      throw new Error(`Invalid --part specification "${partSpec}". Expected <k>/<n>, e.g. --part 1/6`);
    }
    partIndex = Number(m[1]);
    totalParts = Number(m[2]);
    if (partIndex < 1 || partIndex > totalParts) {
      throw new Error(`Invalid --part range: ${partIndex}/${totalParts}`);
    }
  }

  return { qaOnly, assemble, resume, partIndex, totalParts };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

  const timelinePath = path.join(ROOT_DIR, 'config', 'timeline.json');
  const timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));

  const fps = timeline.fps || 30;
  const totalFrames = timeline.totalFrames || 900;
  const width = timeline.resolution?.width || 1080;
  const height = timeline.resolution?.height || 1920;

  const masterAudioRel = timeline.audio?.masterPath || 'audio/output/master_audio.wav';
  const masterAudioPath = path.resolve(ROOT_DIR, masterAudioRel);
  const outputDir = path.join(ROOT_DIR, 'output');
  const qaDir = path.join(outputDir, 'qa_frames');
  const segmentsDir = path.join(outputDir, '.segments');
  const outputVideoPath = path.join(outputDir, 'chewton_theory_short.mp4');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });

  if (!cli.qaOnly && !existsSync(masterAudioPath)) {
    throw new Error(`Master audio file not found: ${masterAudioPath}`);
  }

  const startWall = performance.now();

  if (cli.assemble) {
    await assembleFinalVideo({
      totalParts: cli.totalParts,
      totalFrames,
      segmentsDir,
      masterAudioPath,
      outputVideoPath,
      startWall,
    });
    return;
  }

  // Map exact integer frames for QA timestamps where frame / fps === t
  const qaByFrame = new Map();
  const extraQaTimestamps = [];
  QA_TIMESTAMPS.forEach((tVal, idx) => {
    const nearestFrame = Math.round(tVal * fps);
    if (Math.abs(nearestFrame / fps - tVal) < 1e-6 && nearestFrame >= 0 && nearestFrame < totalFrames) {
      qaByFrame.set(nearestFrame, { idx, t: tVal, filename: formatQaFilename(idx, tVal) });
    } else {
      extraQaTimestamps.push({ idx, t: tVal, filename: formatQaFilename(idx, tVal) });
    }
  });

  const serverHandle = await startStaticServer({ rootDir: ROOT_DIR, host: '127.0.0.1', port: 0 });
  console.log(`[Server] Serving ${ROOT_DIR} at ${serverHandle.url}`);

  try {
    if (cli.qaOnly) {
      let qaBrowser;
      try {
        const launched = await launchScenePage({
          serverUrl: serverHandle.url,
          width,
          height,
          label: 'QA-Only',
        });
        qaBrowser = launched.browser;
        const { page, cdp, fatalErrors } = launched;

        console.log(`[QA-Only] Rendering ${QA_TIMESTAMPS.length} QA keyframes into ${qaDir}...`);
        for (let i = 0; i < QA_TIMESTAMPS.length; i += 1) {
          const tVal = QA_TIMESTAMPS[i];
          await page.evaluate((timeSec) => window.renderAtTime(timeSec), tVal);
          if (fatalErrors.length > 0) {
            throw new Error(`Fatal browser error at t=${tVal}:\n${fatalErrors.join('\n')}`);
          }
          const png = await captureFastPng(cdp);
          const outPath = path.join(qaDir, formatQaFilename(i, tVal));
          await fs.writeFile(outPath, png);
          console.log(`[QA] Saved ${path.basename(outPath)} (t=${tVal.toFixed(2)}s)`);
        }
      } finally {
        if (qaBrowser) {
          await qaBrowser.close().catch(() => {});
        }
      }
      return;
    }

    await fs.mkdir(segmentsDir, { recursive: true });

    if (cli.partIndex !== null) {
      await renderPart({
        partIndex: cli.partIndex,
        totalParts: cli.totalParts,
        totalFrames,
        fps,
        width,
        height,
        serverUrl: serverHandle.url,
        segmentsDir,
        qaByFrame,
        extraQaTimestamps,
        qaDir,
        resume: cli.resume,
      });
      return;
    }

    for (let k = 1; k <= cli.totalParts; k += 1) {
      await renderPart({
        partIndex: k,
        totalParts: cli.totalParts,
        totalFrames,
        fps,
        width,
        height,
        serverUrl: serverHandle.url,
        segmentsDir,
        qaByFrame,
        extraQaTimestamps,
        qaDir,
        resume: cli.resume,
      });
    }

    await assembleFinalVideo({
      totalParts: cli.totalParts,
      totalFrames,
      segmentsDir,
      masterAudioPath,
      outputVideoPath,
      startWall,
    });
  } finally {
    await serverHandle.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('RENDER PIPELINE FAILED:', err);
  process.exit(1);
});
