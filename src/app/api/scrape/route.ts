import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface ScrapeResult {
  id: string;
  title: string;
  image: string;
  preview: string;
  price?: string;
  url?: string;
}

// ── Caches ────────────────────────────────────────────────────────────────────
const resultCache = new Map<string, { results: ScrapeResult[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// VQD token do DuckDuckGo (necessário para paginar)
const vqdCache = new Map<string, { vqd: string; ts: number }>();
const VQD_TTL = 10 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(price?: number): string | undefined {
  if (!price) return undefined;
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

function isValidImg(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  if (/google|gstatic|ggpht|youtube|favicon|logo|icon|sprite|pixel|blank|1x1|captcha/i.test(url)) return false;
  return true;
}

const PAGE_SIZE = 24;

// ── 1. VTEX ───────────────────────────────────────────────────────────────────
const VTEX_STORES = ['bistek', 'prezunic', 'condor', 'sondadelivery', 'angeloni'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function vtexSearch(query: string, page: number): Promise<ScrapeResult[]> {
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  for (const account of VTEX_STORES) {
    try {
      const url =
        `https://${account}.vtexcommercestable.com.br` +
        `/api/catalog_system/pub/products/search` +
        `?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) { console.log(`[vtex:${account}] ${res.status}`); continue; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = await res.json();
      if (!Array.isArray(data) || !data.length) {
        console.log(`[vtex:${account}] p${page} vazio`);
        continue;
      }

      const results: ScrapeResult[] = data.flatMap((p, i) => {
        const item = p.items?.[0];
        const imgUrl: string | undefined = item?.images?.[0]?.imageUrl;
        if (!imgUrl) return [];
        return [{
          id: `vtex_${account}_${from + i}`,
          title: String(p.productName ?? ''),
          image: imgUrl,
          preview: imgUrl,
          price: fmt(item?.sellers?.[0]?.commertialOffer?.Price),
          url: p.link ?? undefined,
        }];
      });

      if (results.length) {
        console.log(`[vtex:${account}] p${page} ✓ ${results.length}`);
        return results;
      }
    } catch (e) {
      console.log(`[vtex:${account}] erro: ${String(e).slice(0, 60)}`);
    }
  }
  return [];
}

// ── 2. DuckDuckGo Images ──────────────────────────────────────────────────────
async function getVqd(query: string): Promise<string | null> {
  const key = query.toLowerCase();
  const cached = vqdCache.get(key);
  if (cached && Date.now() - cached.ts < VQD_TTL) return cached.vqd;

  try {
    const res = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      }
    );
    const html = await res.text();
    const vqd =
      html.match(/vqd=([\d-]+)/)?.[1] ??
      html.match(/"vqd"\s*:\s*"([^"]+)"/)?.[1] ??
      html.match(/vqd=([^&"'\s]+)/)?.[1];

    if (vqd) {
      vqdCache.set(key, { vqd, ts: Date.now() });
      console.log('[ddg] vqd obtido ✓');
      return vqd;
    }
    console.log('[ddg] vqd não encontrado');
  } catch (e) {
    console.log('[ddg] erro vqd:', String(e).slice(0, 60));
  }
  return null;
}

async function ddgSearch(query: string, page: number): Promise<ScrapeResult[]> {
  const searchTerm = `${query} produto supermercado embalagem`;
  const vqd = await getVqd(searchTerm);
  if (!vqd) return [];

  const offset = page * PAGE_SIZE;

  try {
    const url =
      `https://duckduckgo.com/i.js` +
      `?q=${encodeURIComponent(searchTerm)}` +
      `&o=json&p=1&s=${offset}&u=bing&f=,,,&l=pt-br&vqd=${encodeURIComponent(vqd)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://duckduckgo.com/',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) { console.log(`[ddg] i.js ${res.status}`); return []; }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = data.results ?? [];

    const results: ScrapeResult[] = items
      .filter(r => r.image && isValidImg(r.image))
      .slice(0, PAGE_SIZE)
      .map((r, i) => ({
        id: `ddg_p${page}_${offset + i}`,
        title: r.title ?? query,
        image: r.image,
        preview: r.thumbnail ?? r.image,
      }));

    console.log(`[ddg] p${page} ✓ ${results.length}`);
    return results;
  } catch (e) {
    console.log('[ddg] erro i.js:', String(e).slice(0, 60));
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const q    = request.nextUrl.searchParams.get('q')?.trim();
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '0', 10) || 0;

  if (!q) return NextResponse.json({ error: 'q obrigatório' }, { status: 400 });

  const cacheKey = `${q.toLowerCase()}__p${page}`;
  const hit = resultCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ results: hit.results, cached: true, page });
  }

  try {
    // VTEX e DuckDuckGo em paralelo
    const [vtex, ddg] = await Promise.all([
      vtexSearch(q, page),
      ddgSearch(q, page),
    ]);

    // VTEX na frente (imagens limpas de produto), DDG complementa
    const seen = new Set<string>();
    const merged: ScrapeResult[] = [];
    for (const r of [...vtex, ...ddg]) {
      if (r.image && !seen.has(r.image)) {
        seen.add(r.image);
        merged.push(r);
      }
    }

    resultCache.set(cacheKey, { results: merged, ts: Date.now() });
    return NextResponse.json({ results: merged, page });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/scrape]', msg);
    return NextResponse.json({ error: 'Falha ao buscar.', detail: msg }, { status: 500 });
  }
}
