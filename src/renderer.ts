/**
 * Supernote page renderer
 * Decodes RLE bitmap data and renders to canvas/image
 */

import { SupernoteFile, SupernoteLayer } from './parser';

// Color palette for RLE decoding
const ENCODED_COLORS: Record<number, [number, number, number, number]> = {
  0x61: [0, 0, 0, 255],        // black
  0x62: [255, 255, 255, 0],    // background (transparent)
  0x63: [169, 169, 169, 255],  // darkGray
  0x64: [128, 128, 128, 255],  // gray
  0x65: [255, 255, 255, 255],  // white
  0x66: [0, 0, 0, 255],        // markerBlack
  0x67: [169, 169, 169, 255],  // markerDarkGray
  0x68: [128, 128, 128, 255],  // markerGray
  0x9d: [169, 169, 169, 255],  // darkGrayX2
  0xc9: [128, 128, 128, 255],  // grayX2
  0x9e: [169, 169, 169, 255],  // markerDarkGrayX2
  0xca: [128, 128, 128, 255],  // markerGrayX2
};

const SPECIAL_LENGTH_MARKER = 0xff;
const SPECIAL_LENGTH = 0x4000;

/**
 * Decode RLE-encoded bitmap data to RGBA pixel array
 */
function decodeRLE(
  buffer: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const expectedLength = width * height * 4;
  const result = new Uint8Array(expectedLength);
  let resultOffset = 0;

  let holder: [number, number] | null = null;

  for (let i = 1; i < buffer.length; i += 2) {
    let color = buffer[i - 1];
    let length = buffer[i];

    if (holder !== null) {
      const [prevColor, prevLength] = holder;
      holder = null;

      if (color === prevColor) {
        length = 1 + length + (((prevLength & 0x7f) + 1) << 7);
        writePixels(result, resultOffset, color, length);
        resultOffset += length * 4;
        continue;
      } else {
        const adjustedLength = ((prevLength & 0x7f) + 1) << 7;
        writePixels(result, resultOffset, prevColor, adjustedLength);
        resultOffset += adjustedLength * 4;
      }
    }

    if (length === SPECIAL_LENGTH_MARKER) {
      length = SPECIAL_LENGTH;
      writePixels(result, resultOffset, color, length);
      resultOffset += length * 4;
    } else if ((length & 0x80) !== 0) {
      holder = [color, length];
    } else {
      length += 1;
      writePixels(result, resultOffset, color, length);
      resultOffset += length * 4;
    }
  }

  // Handle any remaining holder
  if (holder !== null) {
    const [color, length] = holder;
    const gap = expectedLength - resultOffset;
    let adjustedLength = 0;

    for (let i = 7; i >= 0; i--) {
      const testLength = ((length & 0x7f) + 1) << i;
      if (testLength * 4 <= gap) {
        adjustedLength = testLength;
        break;
      }
    }

    if (adjustedLength > 0) {
      writePixels(result, resultOffset, color, adjustedLength);
    }
  }

  return result;
}

function writePixels(
  result: Uint8Array,
  offset: number,
  encodedColor: number,
  count: number
): void {
  const rgba = ENCODED_COLORS[encodedColor] || [0, 0, 0, 0];

  for (let i = 0; i < count; i++) {
    const idx = offset + i * 4;
    if (idx + 3 < result.length) {
      result[idx] = rgba[0];     // R
      result[idx + 1] = rgba[1]; // G
      result[idx + 2] = rgba[2]; // B
      result[idx + 3] = rgba[3]; // A
    }
  }
}

/**
 * Render a single page to ImageData
 */
export function renderPage(
  note: SupernoteFile,
  pageIndex: number
): ImageData | null {
  if (pageIndex >= note.pages.length) return null;

  const page = note.pages[pageIndex];
  const { pageWidth, pageHeight } = note;

  // Create output buffer (RGBA)
  const outputData = new Uint8Array(pageWidth * pageHeight * 4);
  // Initialize with white background
  for (let i = 0; i < outputData.length; i += 4) {
    outputData[i] = 255;     // R
    outputData[i + 1] = 255; // G
    outputData[i + 2] = 255; // B
    outputData[i + 3] = 255; // A
  }

  // Get layers in sequence order, reversed for proper compositing
  const layersToRender = page.layerSequence
    .map(name => page.layers.find(l => l.name === name))
    .filter((l): l is SupernoteLayer => l !== undefined && l.bitmapData !== null)
    .reverse();

  // Composite layers
  for (const layer of layersToRender) {
    if (!layer.bitmapData || layer.bitmapData.length === 0) continue;

    try {
      const layerData = decodeRLE(layer.bitmapData, pageWidth, pageHeight);

      // Composite layer onto output (simple over blending)
      for (let i = 0; i < layerData.length; i += 4) {
        const srcA = layerData[i + 3];
        if (srcA === 0) continue; // Skip fully transparent pixels

        if (srcA === 255) {
          // Fully opaque - direct copy
          outputData[i] = layerData[i];
          outputData[i + 1] = layerData[i + 1];
          outputData[i + 2] = layerData[i + 2];
          outputData[i + 3] = 255;
        } else {
          // Alpha blending
          const dstA = outputData[i + 3];
          const outA = srcA + dstA * (1 - srcA / 255);

          if (outA > 0) {
            outputData[i] = (layerData[i] * srcA + outputData[i] * dstA * (1 - srcA / 255)) / outA;
            outputData[i + 1] = (layerData[i + 1] * srcA + outputData[i + 1] * dstA * (1 - srcA / 255)) / outA;
            outputData[i + 2] = (layerData[i + 2] * srcA + outputData[i + 2] * dstA * (1 - srcA / 255)) / outA;
            outputData[i + 3] = outA;
          }
        }
      }
    } catch (e) {
      console.error(`Error decoding layer ${layer.name}:`, e);
    }
  }

  // Convert to grayscale for cleaner rendering
  for (let i = 0; i < outputData.length; i += 4) {
    const gray = Math.round(
      outputData[i] * 0.299 +
      outputData[i + 1] * 0.587 +
      outputData[i + 2] * 0.114
    );
    outputData[i] = gray;
    outputData[i + 1] = gray;
    outputData[i + 2] = gray;
  }

  return new ImageData(
    new Uint8ClampedArray(outputData.buffer),
    pageWidth,
    pageHeight
  );
}

/**
 * Convert ImageData to data URL
 */
export function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Render all pages to data URLs
 */
export function renderAllPages(note: SupernoteFile): string[] {
  const dataUrls: string[] = [];

  for (let i = 0; i < note.pages.length; i++) {
    const imageData = renderPage(note, i);
    if (imageData) {
      dataUrls.push(imageDataToDataUrl(imageData));
    }
  }

  return dataUrls;
}
