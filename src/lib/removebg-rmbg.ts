// Remoção de fundo via @imgly/background-removal
// - proxyToWorker: true → roda em Web Worker, nunca trava o browser
// - model: 'medium'     → muito mais preciso que o 'small' padrão
// - Sem dependências extras, sem API, sem limite de uso

import { removeBackground as imglyRemove } from '@imgly/background-removal';

/** Redimensiona para no máximo maxDim px antes de processar —
 *  melhora velocidade e precisão em imagens grandes. */
async function resizeBlob(blob: Blob, maxDim = 1024): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) { resolve(blob); return; }
      const scale = maxDim / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(width  * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => resolve(b ?? blob), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

export async function removeBackgroundRMBG(
  blob: Blob,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.('Preparando imagem…');
  const prepared = await resizeBlob(blob, 1024);

  onProgress?.('Carregando modelo…');

  const result = await imglyRemove(prepared, {
    proxyToWorker: true,            // Web Worker — nunca trava o browser
    model: 'medium',                // Modelo mais preciso (não o 'small' padrão)
    output: { format: 'image/png', quality: 1 },
    progress: (key: string, current: number, total: number) => {
      if (!total) return;
      const pct = Math.round((current / total) * 100);
      onProgress?.(
        key.includes('inference')
          ? `Processando… ${pct}%`
          : `Baixando modelo… ${pct}%`
      );
    },
  });

  return result;
}
