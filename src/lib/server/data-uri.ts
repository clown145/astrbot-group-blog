const textEncoder = new TextEncoder();

export interface DecodedDataUri {
  contentType: string;
  bytes: Uint8Array;
}

export function decodeDataUri(input: string): DecodedDataUri | null {
  const match = input.match(/^data:([^;,]+)?(?:;(base64))?,([\s\S]*)$/i);
  if (!match) {
    return null;
  }

  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const body = match[3] ?? "";

  try {
    if (isBase64) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return {
        contentType,
        bytes,
      };
    }

    return {
      contentType,
      bytes: textEncoder.encode(decodeURIComponent(body)),
    };
  } catch {
    return null;
  }
}

export function guessFileExtension(contentType: string): string {
  const normalized = contentType.toLowerCase();
  switch (normalized) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}
