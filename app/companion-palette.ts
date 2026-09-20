/** Small, deterministic on-device palette extraction. No image ever leaves the device. */
export function drawingPalette(data: ArrayLike<number>): {
  bodyColor: string;
  accentColor: string;
  colorsFound: number;
} | null {
  const buckets = new Map<string, { count: number; sum: number[] }>();
  let pencilCount = 0;
  let pencilLuminance = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    if (
      data[i + 3] >= 180 &&
      Math.max(...rgb) - Math.min(...rgb) < 22 &&
      Math.max(...rgb) < 160
    ) {
      pencilCount++;
      pencilLuminance += (rgb[0] + rgb[1] + rgb[2]) / 3;
    }
    // Ignore paper, pencil shadows and transparent borders, not the child's colours.
    if (
      data[i + 3] < 180 ||
      Math.max(...rgb) - Math.min(...rgb) < 22 ||
      Math.min(...rgb) > 228
    )
      continue;
    const key = rgb.map((v) => Math.floor(v / 40)).join(',');
    const entry = buckets.get(key);
    if (entry) {
      entry.count++;
      rgb.forEach((v, j) => {
        entry.sum[j] += v;
      });
    } else buckets.set(key, { count: 1, sum: rgb });
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ count, sum }) => ({ count, rgb: sum.map((v) => v / count) }));
  const main = ranked[0];
  if (!main) {
    if (pencilCount < Math.max(3, (data.length / 4) * 0.008)) return null;
    const graphite = Math.round(105 + (pencilLuminance / pencilCount) * 0.3);
    return {
      bodyColor: '#ede9e1',
      accentColor:
        '#' +
        [graphite, graphite + 5, graphite + 10]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join(''),
      colorsFound: 0,
    };
  }
  const second = ranked.find(
    (entry) =>
      entry.count >= Math.max(3, main.count * 0.08) &&
      Math.hypot(...entry.rgb.map((v, i) => v - main.rgb[i])) > 95,
  );
  const hex = (rgb: number[], mix: number) =>
    '#' +
    rgb
      .map((v) =>
        Math.round(v * (1 - mix) + 255 * mix)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return {
    bodyColor: hex(main.rgb, 0.64),
    accentColor: hex(second?.rgb ?? main.rgb, 0.18),
    colorsFound: second ? 2 : 1,
  };
}
