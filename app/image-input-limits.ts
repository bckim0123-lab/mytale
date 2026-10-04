// Inspect compact file headers before the browser allocates decoded pixels.
// Byte limits alone cannot catch a very large, highly compressed drawing.
export const MAX_INPUT_IMAGE_PIXELS = 64_000_000;
export const MAX_INPUT_IMAGE_SIDE = 16_000;

export function readImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, value: string) => {
    if (offset + value.length > bytes.length) return false;
    for (let index = 0; index < value.length; index++)
      if (bytes[offset + index] !== value.charCodeAt(index)) return false;
    return true;
  };
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    tag(1, 'PNG\r\n\x1a\n') &&
    tag(12, 'IHDR')
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) return null;
      if (marker === 1 || (marker >= 208 && marker <= 216)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        return length >= 8
          ? {
              width: view.getUint16(offset + 5),
              height: view.getUint16(offset + 3),
            }
          : null;
      }
      offset += length;
    }
  }
  if (bytes.length >= 20 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (data + size > bytes.length) return null;
      const uint24 = (at: number) =>
        bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
      if (tag(offset, 'VP8X') && size >= 10)
        return { width: uint24(data + 4) + 1, height: uint24(data + 7) + 1 };
      if (tag(offset, 'VP8L') && size >= 5 && bytes[data] === 47) {
        const packed = view.getUint32(data + 1, true);
        return {
          width: (packed & 16383) + 1,
          height: ((packed >>> 14) & 16383) + 1,
        };
      }
      if (
        tag(offset, 'VP8 ') &&
        size >= 10 &&
        bytes[data + 3] === 157 &&
        bytes[data + 4] === 1 &&
        bytes[data + 5] === 42
      )
        return {
          width: view.getUint16(data + 6, true) & 16383,
          height: view.getUint16(data + 8, true) & 16383,
        };
      offset = data + size + (size % 2);
    }
  }
  return null;
}

export function imageInputLimitError(source: string): string | null {
  try {
    const comma = source.indexOf(',');
    if (
      !source.startsWith('data:') ||
      comma < 0 ||
      !source.slice(0, comma).endsWith(';base64')
    )
      throw new Error('not a binary data URL');
    const binary = atob(source.slice(comma + 1));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const size = readImageDimensions(bytes);
    if (!size || !size.width || !size.height)
      throw new Error('missing dimensions');
    if (
      size.width > MAX_INPUT_IMAGE_SIDE ||
      size.height > MAX_INPUT_IMAGE_SIDE ||
      size.width * size.height > MAX_INPUT_IMAGE_PIXELS
    )
      return '그림의 가로·세로 크기가 너무 커요. 사진 앱에서 크기를 줄이거나 화면을 캡처해 다시 골라 주세요.';
    return null;
  } catch {
    return '그림 파일의 크기 정보를 읽지 못했어요. JPG, PNG, WEBP로 다시 저장해 주세요.';
  }
}
