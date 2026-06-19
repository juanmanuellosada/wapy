import sharp from 'sharp';

export async function optimizeImage(
  input: File | Blob | ArrayBuffer | Buffer,
  opts: { maxWidth: number; quality: number }
): Promise<{ buffer: Buffer; contentType: 'image/webp'; ext: 'webp' }> {
  let buffer: Buffer;

  if (input instanceof Buffer) {
    buffer = input;
  } else if (input instanceof ArrayBuffer) {
    buffer = Buffer.from(input);
  } else {
    // File or Blob
    const arrayBuffer = await (input as Blob).arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  }

  let outputBuffer: Buffer;
  try {
    outputBuffer = await sharp(buffer)
      .rotate() // auto-orient via EXIF
      .resize({ width: opts.maxWidth, withoutEnlargement: true })
      .webp({ quality: opts.quality })
      .toBuffer();
  } catch (err) {
    throw new Error(
      `optimizeImage: sharp failed to process image — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { buffer: outputBuffer, contentType: 'image/webp', ext: 'webp' };
}
