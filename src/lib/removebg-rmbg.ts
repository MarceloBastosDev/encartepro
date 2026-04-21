// Remoção de fundo via RMBG-1.4 (Bria AI)
// Modelo open-source de última geração, especializado em produtos e objetos.
// Roda 100% no browser via ONNX/WASM — sem API, sem limites, sem custo.
// Primeira execução: download do modelo (~170 MB, salvo no IndexedDB depois).

import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';

// Roda sem web worker — compatível com Next.js sem config extra
if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = false;

const MODEL_ID = 'briaai/RMBG-1.4';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedModel: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedProcessor: any = null;
let loadPromise: Promise<void> | null = null;

// ── Progresso de download ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProgressCb(onProgress?: (msg: string) => void): (info: any) => void {
  return (info) => {
    if (!onProgress) return;
    if (info.status === 'progress' && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      onProgress(`Baixando modelo… ${pct}%`);
    } else if (info.status === 'initiate') {
      onProgress('Iniciando modelo IA…');
    } else if (info.status === 'done') {
      onProgress('Modelo pronto ✓');
    }
  };
}

async function loadModel(onProgress?: (msg: string) => void): Promise<void> {
  if (cachedModel && cachedProcessor) return;
  if (loadPromise) { await loadPromise; return; }

  loadPromise = (async () => {
    onProgress?.('Carregando RMBG-1.4 (1ª vez ~170 MB, salvo depois)…');

    const progressCb = makeProgressCb(onProgress);

    cachedModel = await AutoModel.from_pretrained(MODEL_ID, {
      config: { model_type: 'custom' },
      progress_callback: progressCb,
    });

    cachedProcessor = await AutoProcessor.from_pretrained(MODEL_ID, {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: 'ImageFeatureExtractor',
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        size: { width: 1024, height: 1024 },
      },
    });
  })();

  await loadPromise;
}

// ── Desenha a imagem original no canvas a partir do blob ───────────────────────
async function blobToCanvas(blob: Blob, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

// ── API pública ────────────────────────────────────────────────────────────────
export async function removeBackgroundRMBG(
  blob: Blob,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  await loadModel(onProgress);

  // Lê a imagem no formato que o modelo espera
  onProgress?.('Analisando imagem…');
  const blobUrl = URL.createObjectURL(blob);
  const image = await RawImage.fromURL(blobUrl);
  URL.revokeObjectURL(blobUrl);

  // Inferência
  onProgress?.('Removendo fundo…');
  const { pixel_values } = await cachedProcessor(image);
  const { output } = await cachedModel({ input: pixel_values });

  // Máscara float [0,1] → uint8 [0,255], redimensionada para o tamanho original
  const mask = await RawImage
    .fromTensor(output[0].mul(255).to('uint8'))
    .resize(image.width, image.height);

  // Aplica a máscara como canal alpha na imagem original
  const canvas = await blobToCanvas(blob, image.width, image.height);
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, image.width, image.height);

  for (let i = 0; i < mask.data.length; i++) {
    pixels.data[4 * i + 3] = (mask.data as Uint8Array)[i];
  }
  ctx.putImageData(pixels, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('canvas.toBlob falhou')),
      'image/png',
    );
  });
}
