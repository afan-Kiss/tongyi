const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { ROOT } = require('../config');

const execFileAsync = promisify(execFile);

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const LOCAL_FFMPEG = path.join(ROOT, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe');

async function findFfmpeg() {
  const candidates = [];
  if (fs.existsSync(LOCAL_FFMPEG)) candidates.push(LOCAL_FFMPEG);
  candidates.push('ffmpeg', 'ffmpeg.exe');

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['-version']);
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

async function probeVideo(ffmpeg, inputPath) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=width,height,duration,codec_type,codec_name',
      '-of',
      'json',
      inputPath,
    ]);
    const json = JSON.parse(stdout || '{}');
    const streams = Array.isArray(json.streams) ? json.streams : [];
    const videoStream = streams.find((s) => s.codec_type === 'video') || streams[0] || {};
    const format = json.format || {};
    const duration = Number(videoStream.duration) || Number(format.duration) || 0;
    return {
      width: Number(videoStream.width) || 720,
      height: Number(videoStream.height) || 1280,
      duration: duration > 0 ? duration : 0,
      codec: String(videoStream.codec_name || ''),
      format: String(format.format_name || ''),
    };
  } catch {
    return { width: 720, height: 1280, duration: 0, codec: '', format: '' };
  }
}

function looksLikeWebm(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
}

function pickVideoExt(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'].includes(ext)) return ext;
  return '.mp4';
}

async function probeVideoBuffer(ffmpeg, inputBuffer, originalName = '') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiangyu-vid-probe-'));
  const probePath = path.join(tmpDir, `probe${pickVideoExt(originalName)}`);
  fs.writeFileSync(probePath, inputBuffer);
  try {
    return await probeVideo(ffmpeg, probePath);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/** ≤100MB 且非 WebM：不转码不压缩，只读元数据 */
async function prepareVideoForSend(inputBuffer, options = {}) {
  const maxBytes = Number(options.maxBytes || MAX_VIDEO_BYTES);
  if (inputBuffer.length <= maxBytes && !looksLikeWebm(inputBuffer)) {
    const ffmpeg = await findFfmpeg();
    let meta = { width: 720, height: 1280, duration: 0 };
    if (ffmpeg) {
      try {
        const probed = await probeVideoBuffer(ffmpeg, inputBuffer, options.originalName);
        meta = {
          width: probed.width,
          height: probed.height,
          duration: probed.duration,
        };
      } catch {
        // keep defaults
      }
    }
    return {
      buffer: inputBuffer,
      compressed: false,
      transcoded: false,
      skipped: true,
      size: inputBuffer.length,
      meta,
    };
  }
  return compressVideoBuffer(inputBuffer, options);
}

async function remuxCopyToMp4(ffmpeg, inputPath, outputPath) {
  await execFileAsync(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

/** 格式转换（WebM 等 → MP4），尽量保持画质 */
async function transcodeToMp4(ffmpeg, inputPath, outputPath) {
  await execFileAsync(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

/** 超过 100MB 时才降画质压缩 */
async function compressToFit(ffmpeg, inputPath, outputPath, maxBytes) {
  const attempts = [
    { crf: 28, scale: null },
    { crf: 32, scale: '1280:-2' },
    { crf: 36, scale: '960:-2' },
    { crf: 40, scale: '720:-2' },
    { crf: 42, scale: '540:-2' },
  ];

  for (const attempt of attempts) {
    const args = ['-y', '-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', String(attempt.crf)];
    if (attempt.scale) args.push('-vf', `scale=${attempt.scale}`);
    args.push('-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outputPath);

    await execFileAsync(ffmpeg, args);
    const stat = fs.statSync(outputPath);
    if (stat.size <= maxBytes) {
      return { ok: true, size: stat.size, crf: attempt.crf };
    }
  }
  return { ok: false };
}

async function compressVideoBuffer(inputBuffer, options = {}) {
  const maxBytes = Number(options.maxBytes || MAX_VIDEO_BYTES);
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    if (looksLikeWebm(inputBuffer)) {
      throw new Error('录制的是 WebM 格式，需要 ffmpeg 转成 MP4 后才能发送，请先安装 ffmpeg');
    }
    if (inputBuffer.length <= maxBytes) {
      return {
        buffer: inputBuffer,
        compressed: false,
        size: inputBuffer.length,
        meta: { width: 720, height: 1280, duration: 0 },
      };
    }
    throw new Error('视频超过 100MB 且未安装 ffmpeg，请先安装 ffmpeg 或手动压缩后再上传');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiangyu-vid-'));
  const inputPath = path.join(tmpDir, 'input.bin');
  const outputPath = path.join(tmpDir, 'output.mp4');
  fs.writeFileSync(inputPath, inputBuffer);

  try {
    const inputMeta = await probeVideo(ffmpeg, inputPath);
    const isMp4H264 =
      /mp4/i.test(inputMeta.format || '') &&
      (!inputMeta.codec || inputMeta.codec === 'h264') &&
      !looksLikeWebm(inputBuffer);

    // 已是 MP4/H.264 且 ≤100MB：原样发送，不压画质
    if (isMp4H264 && inputBuffer.length <= maxBytes) {
      return {
        buffer: inputBuffer,
        compressed: false,
        transcoded: false,
        size: inputBuffer.length,
        meta: {
          width: inputMeta.width,
          height: inputMeta.height,
          duration: inputMeta.duration,
        },
      };
    }

    const mustTranscode = looksLikeWebm(inputBuffer) || !isMp4H264;

    if (mustTranscode) {
      let converted = false;
      if (/mp4/i.test(inputMeta.format || '') && !looksLikeWebm(inputBuffer)) {
        try {
          await remuxCopyToMp4(ffmpeg, inputPath, outputPath);
          converted = true;
        } catch {
          converted = false;
        }
      }
      if (!converted) {
        await transcodeToMp4(ffmpeg, inputPath, outputPath);
      }
      const meta = await probeVideo(ffmpeg, outputPath);
      const stat = fs.statSync(outputPath);
      if (stat.size <= maxBytes) {
        return {
          buffer: fs.readFileSync(outputPath),
          compressed: false,
          transcoded: true,
          size: stat.size,
          meta,
        };
      }
      // 转码后仍超 100MB，才进入压缩流程
      const fit = await compressToFit(ffmpeg, inputPath, outputPath, maxBytes);
      if (!fit.ok) {
        throw new Error('无法将视频压缩到 100MB 以内，请缩短时长或降低分辨率后重试');
      }
      const outMeta = await probeVideo(ffmpeg, outputPath);
      return {
        buffer: fs.readFileSync(outputPath),
        compressed: true,
        transcoded: true,
        size: fit.size,
        meta: outMeta,
        crf: fit.crf,
      };
    }

    // 非 MP4 且超大等边界情况：仅做体积压缩
    const fit = await compressToFit(ffmpeg, inputPath, outputPath, maxBytes);
    if (!fit.ok) {
      throw new Error('无法将视频压缩到 100MB 以内，请缩短时长或降低分辨率后重试');
    }
    const outMeta = await probeVideo(ffmpeg, outputPath);
    return {
      buffer: fs.readFileSync(outputPath),
      compressed: true,
      transcoded: false,
      size: fit.size,
      meta: outMeta,
      crf: fit.crf,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function extractCoverJpeg(ffmpeg, videoPath) {
  const coverPath = videoPath.replace(/\.[^.]+$/, '-cover.jpg');
  await execFileAsync(ffmpeg, [
    '-y',
    '-ss',
    '0',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    coverPath,
  ]);
  return fs.readFileSync(coverPath);
}

module.exports = {
  MAX_VIDEO_BYTES,
  findFfmpeg,
  prepareVideoForSend,
  compressVideoBuffer,
  probeVideo,
  extractCoverJpeg,
  pickVideoExt,
};
