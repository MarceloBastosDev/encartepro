import { NextRequest, NextResponse } from 'next/server';

// Edge runtime: sem cold start, roda distribuído globalmente, ideal para fetches externos
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

// Lojas VTEX brasileiras com API pública — todas consultadas em paralelo
const VTEX_STORES = [
  'bistek',
  'prezunic',
  'condor',
  'sondadelivery',
  'angeloni',
];

const PAGE_SIZE = 24;

function fmt(price?: number): string | undefined {
  if (!price) return undefined;
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVtex(data: any[], account: string, from: number): ScrapeResult[] {
  return data.flatMap((p, i) => {
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
}

async function vtexSearch(query: string, page: number): Promise<ScrapeResult[]> {
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // Todas as lojas em paralelo — retorna assim que tiver resultados
  const promises = VTEX_STORES.map(async (account): Promise<ScrapeResult[]> => {
    try {
      const url =
        `https://${account}.vtexcommercestable.com.br` +
        `/api/catalog_system/pub/products/search` +
        `?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = await res.json();
      if (!Array.isArray(data) || !data.length) return [];
      return parseVtex(data, account, from);
    } catch {
      return [];
    }
  });

  const allResults = await Promise.all(promises);

  // Mescla resultados de todas as lojas, sem duplicatas por URL de imagem
  const seen  = new Set<string>();
  const merged: ScrapeResult[] = [];
  for (const list of allResults) {
    for (const r of list) {
      if (r.image && !seen.has(r.image)) {
        seen.add(r.image);
        merged.push(r);
      }
    }
  }

  return merged;
}

export async function GET(request: NextRequest) {
  const q    = request.nextUrl.searchParams.get('q')?.trim();
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '0', 10) || 0;

  if (!q) return NextResponse.json({ error: 'q obrigatório' }, { status: 400 });

  try {
    const results = await vtexSearch(q, page);
    return NextResponse.json({ results, page }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Falha ao buscar.', detail: msg }, { status: 500 });
  }
}
