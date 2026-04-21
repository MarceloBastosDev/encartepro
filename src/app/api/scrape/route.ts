import { NextRequest, NextResponse } from 'next/server';

// Edge runtime: sem cold start, roda distribuído globalmente
export const runtime = 'edge';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface ScrapeResult {
  id: string;
  title: string;
  image: string;
  preview: string;
  price?: string;
  url?: string;
}

const PAGE_SIZE = 24;

// ── Filtro de não-alimentos ───────────────────────────────────────────────────
const NON_FOOD_RE = /brinquedo|boneca|quadro|decoraç|puzzle|jogo\s|eletron|notebook|celular|smartphone|roupa|camiseta|tênis|calçad|playstation|xbox|nintendo|dvd|blu.?ray|livro|escolar|papelaria/i;
const isFood = (t: string) => !NON_FOOD_RE.test(t);

// ── 1. VTEX ───────────────────────────────────────────────────────────────────
const VTEX_STORES = [
  'bistek', 'prezunic', 'condor', 'sondadelivery', 'angeloni',
  'gbarbosa', 'mateus', 'supernosso', 'zona-sul', 'paodeacucar',
];

function fmt(price?: number) {
  if (!price) return undefined;
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVtex(data: any[], account: string, from: number): ScrapeResult[] {
  return data.flatMap((p, i) => {
    const item = p.items?.[0];
    const img: string | undefined = item?.images?.[0]?.imageUrl;
    if (!img) return [];
    return [{
      id: `vtex_${account}_${from + i}`,
      title: String(p.productName ?? ''),
      image: img, preview: img,
      price: fmt(item?.sellers?.[0]?.commertialOffer?.Price),
      url: p.link ?? undefined,
    }];
  });
}

async function vtexSearch(query: string, page: number): Promise<ScrapeResult[]> {
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const all = await Promise.all(VTEX_STORES.map(async (account) => {
    try {
      const res = await fetch(
        `https://${account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search` +
        `?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
      );
      if (!res.ok) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = await res.json();
      if (!Array.isArray(data) || !data.length) return [];
      return parseVtex(data, account, from).filter(r => isFood(r.title));
    } catch { return []; }
  }));

  const seen = new Set<string>();
  const out: ScrapeResult[] = [];
  for (const list of all)
    for (const r of list)
      if (r.image && !seen.has(r.image)) { seen.add(r.image); out.push(r); }
  return out;
}

// ── 2. Open Food Facts ────────────────────────────────────────────────────────
async function offSearch(query: string, page: number): Promise<ScrapeResult[]> {
  try {
    const res = await fetch(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page=${page + 1}&page_size=24&fields=id,product_name,image_url,brands`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.hits ?? []).flatMap((p: any, i: number) => {
      const img: string = p.image_url ?? '';
      if (!img || /no_nutrition|placeholder/i.test(img)) return [];
      const title = [p.brands, p.product_name].filter(Boolean).join(' — ') || query;
      return [{ id: `off_${page}_${i}`, title, image: img, preview: img }];
    });
  } catch { return []; }
}

// ── 3. Bing Image Search ──────────────────────────────────────────────────────
// Bing aceita IPs de servidor (diferente do DDG) e cobre praticamente qualquer produto.
// Faz scraping do endpoint AJAX de imagens — sem chave, sem limite, funciona de Edge.
async function bingSearch(query: string, page: number): Promise<ScrapeResult[]> {
  try {
    const first = page * 28; // Bing usa offset "first"
    const term  = `${query} produto supermercado embalagem`;
    const url   =
      `https://www.bing.com/images/async` +
      `?q=${encodeURIComponent(term)}&first=${first}&count=28&adlt=off&qft=`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.bing.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const html = await res.text();

    // Bing embeds image data as JSON in the `m` attribute of <a class="iusc"> tags
    const results: ScrapeResult[] = [];
    const seen = new Set<string>();
    const re = /m="\{[^"]*&quot;murl&quot;[^"]*\}"/g;

    for (const raw of html.matchAll(re)) {
      try {
        const json = raw[0]
          .slice(3, -1)                  // remove: m=" and trailing "
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');
        const obj = JSON.parse(json);
        const murl: string = obj.murl ?? '';
        const turl: string = obj.turl ?? murl;
        if (!murl || seen.has(murl)) continue;
        if (!/\.(jpe?g|png|webp)/i.test(murl)) continue;
        // Skip clearly non-food domains
        if (/pinterest|facebook|instagram|twitter|youtube/i.test(murl)) continue;
        seen.add(murl);
        results.push({
          id: `bing_${page}_${results.length}`,
          title: obj.t ?? query,
          image: murl,
          preview: turl,
        });
        if (results.length >= 24) break;
      } catch { /* skip malformed entry */ }
    }

    return results;
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const q    = request.nextUrl.searchParams.get('q')?.trim();
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '0', 10) || 0;

  if (!q) return NextResponse.json({ error: 'q obrigatório' }, { status: 400 });

  try {
    // Três fontes em paralelo
    const [vtex, off, bing] = await Promise.all([
      vtexSearch(q, page),
      offSearch(q, page),
      bingSearch(q, page),
    ]);

    // VTEX primeiro (fotos limpas de produto), depois OFF, depois Bing
    const seen   = new Set<string>();
    const merged: ScrapeResult[] = [];
    for (const r of [...vtex, ...off, ...bing]) {
      if (r.image && !seen.has(r.image)) { seen.add(r.image); merged.push(r); }
    }

    return NextResponse.json({ results: merged, page }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Falha ao buscar.', detail: msg }, { status: 500 });
  }
}
