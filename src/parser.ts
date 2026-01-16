/**
 * Supernote .note file parser
 * Simplified from supernote-typescript for Obsidian plugin use
 */

export interface SupernoteFile {
  signature: string;
  version: number;
  pageWidth: number;
  pageHeight: number;
  equipment: string;
  pages: SupernotePage[];
}

export interface SupernotePage {
  layers: SupernoteLayer[];
  layerSequence: string[];
}

export interface SupernoteLayer {
  name: string;
  protocol: string;
  bitmapData: Uint8Array | null;
}

const ADDRESS_SIZE = 4;
const LENGTH_FIELD_SIZE = 4;

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function getContentAtAddress(buffer: Uint8Array, address: number): Uint8Array | null {
  if (address === 0) return null;
  const blockLength = readUint32LE(buffer, address);
  return buffer.subarray(address + LENGTH_FIELD_SIZE, address + LENGTH_FIELD_SIZE + blockLength);
}

function uint8ArrayToString(arr: Uint8Array): string {
  return new TextDecoder('utf-8').decode(arr);
}

function extractKeyValue(content: string): Record<string, string | string[]> {
  const pattern = /<([^:<>]+):([^:<>]+)>/gm;
  const pairs = [...content.matchAll(pattern)];
  const data: Record<string, string | string[]> = {};

  for (const [, key, value] of pairs) {
    if (key in data) {
      const existing = data[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        data[key] = [existing, value];
      }
    } else {
      data[key] = value;
    }
  }
  return data;
}

function parseKeyValue(buffer: Uint8Array, address: number): Record<string, string | string[]> {
  const content = getContentAtAddress(buffer, address);
  if (content === null) return {};
  return extractKeyValue(uint8ArrayToString(content));
}

function extractNestedKeyValue(
  record: Record<string, string | string[]>,
  delimiter = '_',
  prefixes: string[] = []
): Record<string, Record<string, string>> {
  const data: Record<string, Record<string, string>> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== 'string') continue;

    let main: string | undefined;
    let sub: string | undefined;

    const idx = key.indexOf(delimiter);
    if (idx > -1) {
      main = key.substring(0, idx);
      sub = key.substring(idx + 1);
    } else {
      for (const prefix of prefixes) {
        if (key.startsWith(prefix)) {
          main = prefix;
          sub = key.substring(main.length);
          break;
        }
      }
    }

    if (main && sub) {
      if (main in data) {
        data[main][sub] = value;
      } else {
        data[main] = { [sub]: value };
      }
    }
  }
  return data;
}

export function parseSupernoteFile(buffer: Uint8Array): SupernoteFile {
  // Parse signature
  const signatureContent = uint8ArrayToString(buffer.subarray(0, 24));
  const signatureMatch = signatureContent.match(/^noteSN_FILE_VER_(\d{8})/);
  if (!signatureMatch) {
    throw new Error("Invalid Supernote file: signature doesn't match");
  }

  const signature = signatureContent;
  const version = parseInt(signatureMatch[1]);

  // Parse footer (last 4 bytes point to footer address)
  const footerAddressChunk = buffer.subarray(buffer.length - ADDRESS_SIZE);
  const footerAddress = readUint32LE(footerAddressChunk, 0);
  const footerData = parseKeyValue(buffer, footerAddress);
  const footer = extractNestedKeyValue(footerData, '_', ['PAGE']);

  // Parse header
  const headerAddress = footer.FILE?.FEATURE ? parseInt(footer.FILE.FEATURE) : 24;
  const headerData = parseKeyValue(buffer, headerAddress);

  const equipment = (headerData.APPLY_EQUIPMENT as string) || 'unknown';

  // Determine page dimensions based on device
  let pageWidth = 1404;
  let pageHeight = 1872;
  if (equipment === 'N5') {
    pageWidth = 1920;
    pageHeight = 2560;
  }

  // Parse pages
  const pageAddresses = footer.PAGE || {};
  const pageIndices = Object.keys(pageAddresses).sort((a, b) => {
    return parseInt(a) - parseInt(b);
  });

  const pages: SupernotePage[] = pageIndices.map(idx => {
    const pageAddress = parseInt(pageAddresses[idx]);
    const pageData = parseKeyValue(buffer, pageAddress);

    const layerSequence = ((pageData.LAYERSEQ as string) || 'MAINLAYER').split(',');

    const layers: SupernoteLayer[] = [];
    const layerNames = ['MAINLAYER', 'LAYER1', 'LAYER2', 'LAYER3', 'BGLAYER'];

    for (const layerName of layerNames) {
      const layerAddress = parseInt((pageData[layerName] as string) || '0');
      if (layerAddress === 0) {
        layers.push({ name: layerName, protocol: '', bitmapData: null });
        continue;
      }

      const layerData = parseKeyValue(buffer, layerAddress);
      const bitmapAddress = parseInt((layerData.LAYERBITMAP as string) || '0');
      const bitmapData = getContentAtAddress(buffer, bitmapAddress);

      layers.push({
        name: layerName,
        protocol: (layerData.LAYERPROTOCOL as string) || 'RATTA_RLE',
        bitmapData,
      });
    }

    return { layers, layerSequence };
  });

  return {
    signature,
    version,
    pageWidth,
    pageHeight,
    equipment,
    pages,
  };
}
