import { initializeImageMagick } from '@imagemagick/magick-wasm';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function initMagick(): Promise<void> {
  if (isInitialized) return;
  
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Fetch the WASM file from the public folder
        const response = await fetch('/magick.wasm');
        if (!response.ok) {
          throw new Error('Failed to load magick.wasm');
        }
        
        const wasmBytes = await response.arrayBuffer();
        await initializeImageMagick(new Uint8Array(wasmBytes));
        isInitialized = true;
        console.log('ImageMagick WASM initialized successfully');
      } catch (error) {
        console.error('ImageMagick initialization failed:', error);
        initPromise = null; // Allow retry
        throw error;
      }
    })();
  }
  
  return initPromise;
}
