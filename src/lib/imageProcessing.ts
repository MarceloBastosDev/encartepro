import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';
import { initMagick } from './magick';
import { ImageMagick, MagickFormat } from '@imagemagick/magick-wasm';

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'svg' | 'ai' | 'eps' | 'pdf';

export async function removeBackground(file: Blob): Promise<Blob> {
  const blob = await imglyRemoveBackground(file, {
    progress: (key, current, total) => {
      console.log(`Downloading AI Model... ${key}: ${current}/${total}`);
    }
  });
  return blob;
}

export async function convertFormat(blob: Blob, format: OutputFormat, quality: number = 0.9): Promise<{ url: string, extension: string }> {
  // SVG Custom Logic (embeds raster into SVG tag)
  if (format === 'svg') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Create an SVG wrapper
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/png'); // Get base64 representation
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">
          <image href="${dataUrl}" width="${img.width}" height="${img.height}" />
        </svg>`;
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
        resolve({ url: URL.createObjectURL(svgBlob), extension: 'svg' });
      };
      img.onerror = () => reject(new Error('Failed to load image for SVG generation'));
      img.src = url;
    });
  }

  // Native Canvas Logic for web formats
  if (['png', 'jpeg', 'webp'].includes(format)) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));
        
        if (format === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        
        const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const ext = format === 'jpeg' ? 'jpg' : format;
        resolve({ url: dataUrl, extension: ext });
      };
      img.onerror = () => reject(new Error('Failed to load image for conversion'));
      img.src = url;
    });
  }

  // ImageMagick Logic for advanced formats
  await initMagick();
  
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(bytes, (image) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let targetFormat: any = MagickFormat.Png;
        let ext = format;
        
        switch (format) {
          case 'gif': targetFormat = MagickFormat.Gif; break;
          case 'bmp': targetFormat = MagickFormat.Bmp; break;
          case 'tiff': targetFormat = MagickFormat.Tiff; break;
          case 'eps': targetFormat = MagickFormat.Eps; break;
          case 'pdf': targetFormat = MagickFormat.Pdf; break;
          case 'ai': 
            targetFormat = MagickFormat.Pdf; // Use PDF for AI wrapper
            ext = 'ai';
            break;
          default:
            throw new Error('Unsupported format for ImageMagick');
        }

        image.write(targetFormat, (data) => {
          const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
          const outBlob = new Blob([buf], { type: 'application/octet-stream' });
          resolve({ url: URL.createObjectURL(outBlob), extension: ext });
        });
      });
    } catch (err) {
      console.error("ImageMagick error:", err);
      reject(err);
    }
  });
}
