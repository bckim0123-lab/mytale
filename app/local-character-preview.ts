export type CutoutBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PaperCutout = {
  pixels: Uint8ClampedArray;
  bounds: CutoutBounds;
  cutout: boolean;
  foregroundRatio: number;
};

export type LocalCharacterPreview = {
  image: string;
  cutout: boolean;
  foregroundRatio: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function colorDistance(
  pixels: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
) {
  const redDelta = pixels[offset] - red;
  const greenDelta = pixels[offset + 1] - green;
  const blueDelta = pixels[offset + 2] - blue;
  return Math.sqrt(
    redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta,
  );
}

function cornerSamples(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const sampleSize = clamp(Math.round(Math.min(width, height) * 0.025), 2, 16);
  const samples: Array<[number, number, number]> = [];
  const starts = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)],
  ];
  for (const [startX, startY] of starts)
    for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1)
      for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] < 16) continue;
        samples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
      }
  return samples;
}

export function removeConnectedPaperBackground(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): PaperCutout {
  const original = new Uint8ClampedArray(input);
  const pixels = new Uint8ClampedArray(input);
  const fallbackBounds = {
    left: 0,
    top: 0,
    right: Math.max(0, width - 1),
    bottom: Math.max(0, height - 1),
  };
  if (width < 3 || height < 3 || pixels.length !== width * height * 4)
    return {
      pixels: original,
      bounds: fallbackBounds,
      cutout: false,
      foregroundRatio: 1,
    };

  const samples = cornerSamples(pixels, width, height);
  if (!samples.length) {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    let foregroundPixels = 0;
    for (let index = 0; index < width * height; index += 1) {
      if (pixels[index * 4 + 3] < 24) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      foregroundPixels += 1;
    }
    return {
      pixels,
      bounds:
        right >= left && bottom >= top
          ? { left, top, right, bottom }
          : fallbackBounds,
      cutout: true,
      foregroundRatio: foregroundPixels / (width * height),
    };
  }
  const backgroundRed = median(samples.map((color) => color[0]));
  const backgroundGreen = median(samples.map((color) => color[1]));
  const backgroundBlue = median(samples.map((color) => color[2]));
  const sampleDistances = samples.map(([red, green, blue]) =>
    Math.sqrt(
      (red - backgroundRed) ** 2 +
        (green - backgroundGreen) ** 2 +
        (blue - backgroundBlue) ** 2,
    ),
  );
  const spread = median(sampleDistances);
  const threshold = clamp(38 + spread * 0.7, 38, 68);
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  const isPaper = (index: number) => {
    const offset = index * 4;
    return (
      pixels[offset + 3] < 20 ||
      colorDistance(
        pixels,
        offset,
        backgroundRed,
        backgroundGreen,
        backgroundBlue,
      ) <= threshold
    );
  };
  const enqueue = (index: number) => {
    if (visited[index] || !isPaper(index)) return;
    visited[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  for (let index = 0; index < pixelCount; index += 1)
    if (visited[index]) pixels[index * 4 + 3] = 0;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let foregroundPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const alphaOffset = index * 4 + 3;
    if (pixels[alphaOffset] < 24) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    foregroundPixels += 1;
  }
  const foregroundRatio = foregroundPixels / pixelCount;
  const removedRatio = queueEnd / pixelCount;
  const boundingArea =
    right >= left && bottom >= top
      ? (right - left + 1) * (bottom - top + 1)
      : 0;
  const looksLikeWholePaper =
    boundingArea / pixelCount >= 0.34 &&
    foregroundPixels / Math.max(1, boundingArea) >= 0.94;
  const confident =
    right >= left &&
    bottom >= top &&
    foregroundRatio >= 0.02 &&
    foregroundRatio <= 0.91 &&
    removedRatio >= 0.06 &&
    spread <= 78 &&
    !looksLikeWholePaper;

  if (!confident)
    return {
      pixels: original,
      bounds: fallbackBounds,
      cutout: false,
      foregroundRatio,
    };

  return {
    pixels,
    bounds: { left, top, right, bottom },
    cutout: true,
    foregroundRatio,
  };
}

export function createLocalCharacterPreview(
  source: HTMLImageElement,
  preservePaper = false,
): LocalCharacterPreview {
  const maxSide = 720;
  const scale = Math.min(
    1,
    maxSide / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const work = document.createElement('canvas');
  work.width = width;
  work.height = height;
  const workContext = work.getContext('2d', { willReadFrequently: true });
  if (!workContext)
    return { image: source.src, cutout: false, foregroundRatio: 1 };
  workContext.drawImage(source, 0, 0, width, height);
  const sourceData = workContext.getImageData(0, 0, width, height);
  const cutout = preservePaper
    ? {
        pixels: new Uint8ClampedArray(sourceData.data),
        bounds: { left: 0, top: 0, right: width - 1, bottom: height - 1 },
        cutout: false,
        foregroundRatio: 1,
      }
    : removeConnectedPaperBackground(sourceData.data, width, height);
  const masked = document.createElement('canvas');
  masked.width = width;
  masked.height = height;
  const maskedContext = masked.getContext('2d');
  if (!maskedContext)
    return { image: source.src, cutout: false, foregroundRatio: 1 };
  maskedContext.putImageData(
    new ImageData(new Uint8ClampedArray(cutout.pixels), width, height),
    0,
    0,
  );

  const output = document.createElement('canvas');
  output.width = maxSide;
  output.height = maxSide;
  const context = output.getContext('2d');
  if (!context) return { image: source.src, cutout: false, foregroundRatio: 1 };
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (cutout.cutout) {
    const sourceWidth = cutout.bounds.right - cutout.bounds.left + 1;
    const sourceHeight = cutout.bounds.bottom - cutout.bounds.top + 1;
    const displayScale = Math.min(570 / sourceWidth, 570 / sourceHeight);
    const displayWidth = Math.max(1, Math.round(sourceWidth * displayScale));
    const displayHeight = Math.max(1, Math.round(sourceHeight * displayScale));
    const destinationX = Math.round((maxSide - displayWidth) / 2);
    const destinationY = Math.round((maxSide - displayHeight) / 2);
    const draw = () =>
      context.drawImage(
        masked,
        cutout.bounds.left,
        cutout.bounds.top,
        sourceWidth,
        sourceHeight,
        destinationX,
        destinationY,
        displayWidth,
        displayHeight,
      );
    context.save();
    context.shadowColor = 'rgba(255, 255, 255, 0.98)';
    context.shadowBlur = 20;
    draw();
    context.restore();
    context.save();
    context.filter = 'saturate(1.12) contrast(1.035)';
    draw();
    context.restore();
  } else {
    const displayScale = Math.min(610 / width, 540 / height);
    const displayWidth = Math.max(1, Math.round(width * displayScale));
    const displayHeight = Math.max(1, Math.round(height * displayScale));
    const destinationX = Math.round((maxSide - displayWidth) / 2);
    const destinationY = Math.round((maxSide - displayHeight) / 2);
    context.save();
    context.beginPath();
    context.ellipse(360, 360, 318, 302, -0.03, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#fffdf8';
    context.fillRect(0, 0, maxSide, maxSide);
    context.filter = 'saturate(1.08) contrast(1.025)';
    context.drawImage(
      work,
      destinationX,
      destinationY,
      displayWidth,
      displayHeight,
    );
    context.restore();
  }

  return {
    image: output.toDataURL('image/png'),
    cutout: cutout.cutout,
    foregroundRatio: cutout.foregroundRatio,
  };
}
