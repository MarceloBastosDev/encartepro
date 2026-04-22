// Remoção de fundo via @imgly/background-removal
// Pipeline pós-processamento:
//   1. resizeBlob()    → redimensiona para no máximo 1024px (evita lentidão)
//   2. @imgly isnet    → remove o fundo (pode deixar furos em áreas brancas)
//   3. refineMask()    → quatro passos combinados:
//        a. Fechamento morfológico (dilata + erode, raio 8px):
//           sela corredores finos que conectam áreas brancas internas ao fundo
//        b. BFS flood-fill das bordas: qualquer pixel transparente não alcançável
//           pelas bordas é um buraco interno → torna-se opaco
//        c. Box-blur no canal alpha (raio 3): suaviza bordas, evita efeito recortado

import { removeBackground as imglyRemove } from '@imgly/background-removal';

// ── Pré-processamento ──────────────────────────────────────────────────────────
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

// ── Suavização de bordas: box-blur separável no canal alpha ──────────────────
// Aplica uma média simples com raio r em H e depois em V.
// Transforma a borda binária (0/255) em uma transição suave de ~2*r pixels.
function blurAlpha(
  alpha: Uint8ClampedArray, width: number, height: number, r: number,
): Uint8ClampedArray {
  const tmp = new Float32Array(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  const diam = 2 * r + 1;
  // Passagem horizontal
  for (let y = 0; y < height; y++) {
    let sum = 0;
    // inicializa janela
    for (let dx = -r; dx <= r; dx++) sum += alpha[y * width + Math.max(0, Math.min(width - 1, dx))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / diam;
      const leave = alpha[y * width + Math.max(0, x - r)];
      const enter = alpha[y * width + Math.min(width - 1, x + r + 1)];
      sum += enter - leave;
    }
  }
  // Passagem vertical
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -r; dy <= r; dy++) sum += tmp[Math.max(0, Math.min(height - 1, dy)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = Math.round(sum / diam);
      const leave = tmp[Math.max(0, y - r) * width + x];
      const enter = tmp[Math.min(height - 1, y + r + 1) * width + x];
      sum += enter - leave;
    }
  }
  return out;
}

// ── Morfologia: max-filter separável (dilatação) ─────────────────────────────
function boxDilate(
  alpha: Uint8ClampedArray, width: number, height: number, r: number,
): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  // Passagem horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let dx = -r; dx <= r; dx++) {
        const v = alpha[y * width + Math.max(0, Math.min(width - 1, x + dx))];
        if (v > max) max = v;
      }
      tmp[y * width + x] = max;
    }
  }
  // Passagem vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let dy = -r; dy <= r; dy++) {
        const v = tmp[Math.max(0, Math.min(height - 1, y + dy)) * width + x];
        if (v > max) max = v;
      }
      out[y * width + x] = max;
    }
  }
  return out;
}

// ── Morfologia: min-filter separável (erosão) ─────────────────────────────────
function boxErode(
  alpha: Uint8ClampedArray, width: number, height: number, r: number,
): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  // Passagem horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dx = -r; dx <= r; dx++) {
        const v = alpha[y * width + Math.max(0, Math.min(width - 1, x + dx))];
        if (v < min) min = v;
      }
      tmp[y * width + x] = min;
    }
  }
  // Passagem vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dy = -r; dy <= r; dy++) {
        const v = tmp[Math.max(0, Math.min(height - 1, y + dy)) * width + x];
        if (v < min) min = v;
      }
      out[y * width + x] = min;
    }
  }
  return out;
}

// ── Pós-processamento principal ───────────────────────────────────────────────
async function refineMask(composited: Blob, closeRadius = 8): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(composited);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Canal alpha original do modelo
      const alpha = new Uint8ClampedArray(width * height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

      // ── Passo 1: Fechamento morfológico (dilata → erode) ──────────────────
      // Sela corredores transparentes < closeRadius*2 px que ligam áreas brancas
      // internas ao fundo externo, tornando-as buracos isolados para o BFS.
      const dilated = boxDilate(alpha, width, height, closeRadius);
      const closed  = boxErode(dilated, width, height, closeRadius);

      // ── Passo 2: BFS flood-fill das bordas ────────────────────────────────
      // Pixels transparentes NÃO alcançáveis pelas bordas = buracos internos.
      const visited = new Uint8Array(width * height);
      const queue: number[] = [];

      const enqueue = (idx: number) => {
        if (!visited[idx] && closed[idx] < 128) {
          visited[idx] = 1;
          queue.push(idx);
        }
      };

      for (let x = 0; x < width; x++) {
        enqueue(x);                           // borda superior
        enqueue((height - 1) * width + x);    // borda inferior
      }
      for (let y = 1; y < height - 1; y++) {
        enqueue(y * width);                   // borda esquerda
        enqueue(y * width + width - 1);       // borda direita
      }

      let head = 0;
      while (head < queue.length) {
        const idx = queue[head++];
        const y = Math.floor(idx / width);
        const x = idx % width;
        if (y > 0)          enqueue(idx - width);
        if (y < height - 1) enqueue(idx + width);
        if (x > 0)          enqueue(idx - 1);
        if (x < width - 1)  enqueue(idx + 1);
      }

      // ── Monta alpha final (binário: produto=255, fundo=0) ─────────────────
      const finalAlpha = new Uint8ClampedArray(alpha.length);
      for (let i = 0; i < alpha.length; i++) {
        if (closed[i] >= 128 || !visited[i]) {
          finalAlpha[i] = 255;   // produto (pelo fechamento ou buraco interno)
        } else {
          finalAlpha[i] = 0;     // fundo verdadeiro
        }
      }

      // ── Passo 4: Suavização de bordas (blur raio 1 → transição de ~2px) ───
      // Evita o efeito "recorte de revista" com bordas duras/destacadas.
      const smoothAlpha = blurAlpha(finalAlpha, width, height, 3);
      for (let i = 0; i < smoothAlpha.length; i++) data[i * 4 + 3] = smoothAlpha[i];

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(b => resolve(b ?? composited), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(composited); };
    img.src = url;
  });
}

// ── API pública ────────────────────────────────────────────────────────────────
export async function removeBackgroundRMBG(
  blob: Blob,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.('Preparando imagem…');
  const prepared = await resizeBlob(blob, 1024);

  onProgress?.('Carregando modelo…');
  const composited = await imglyRemove(prepared, {
    proxyToWorker: true,
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
    progress: (key: string, current: number, total: number) => {
      if (!total) return;
      const pct = Math.round((current / total) * 100);
      onProgress?.(
        key.includes('inference')
          ? `Processando… ${pct}%`
          : `Baixando modelo… ${pct}%`,
      );
    },
  });

  onProgress?.('Refinando máscara…');
  return refineMask(composited, 8);
}
