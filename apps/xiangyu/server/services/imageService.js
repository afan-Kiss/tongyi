const sharp = require('sharp');

async function mergeImagesVertically(buffers, options = {}) {
  const gap = Number(options.gap || 8);
  const maxWidth = Number(options.maxWidth || 1200);
  const background = options.background || '#ffffff';

  if (!buffers.length) {
    throw new Error('没有可合成的图片');
  }

  const metas = await Promise.all(
    buffers.map(async (buf) => {
      const img = sharp(buf);
      const meta = await img.metadata();
      return { buf, meta };
    })
  );

  let targetWidth = Math.min(
    maxWidth,
    Math.max(...metas.map((m) => m.meta.width || 0))
  );

  const resized = await Promise.all(
    metas.map(async ({ buf, meta }) => {
      const width = meta.width || targetWidth;
      const height = meta.height || 1;
      const scale = targetWidth / width;
      const newHeight = Math.round(height * scale);
      const out = await sharp(buf)
        .resize({ width: targetWidth, height: newHeight, fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { buffer: out, width: outMeta.width, height: outMeta.height };
    })
  );

  const totalHeight = resized.reduce((sum, item, idx) => sum + item.height + (idx ? gap : 0), 0);

  const composites = [];
  let top = 0;
  for (let i = 0; i < resized.length; i += 1) {
    composites.push({ input: resized[i].buffer, top, left: 0 });
    top += resized[i].height + gap;
  }

  const merged = await sharp({
    create: {
      width: targetWidth,
      height: totalHeight,
      channels: 3,
      background,
    },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    buffer: merged,
    width: targetWidth,
    height: totalHeight,
    mime: 'image/jpeg',
  };
}

module.exports = {
  mergeImagesVertically,
};
