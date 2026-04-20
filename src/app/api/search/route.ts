import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory cache
const cache = new Map<string, { results: ImageResult[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface ImageResult {
  id: string;
  title: string;
  image: string;
  preview: string;
  site: string;
  score: number;
  price?: number;
  permalink?: string;
}

interface MLProduct {
  id: string;
  title: string;
  thumbnail: string;
  thumbnail_id?: string;
  permalink: string;
  price: number;
  condition: string;
}

interface MLSearchResponse {
  results: MLProduct[];
  paging: { total: number; offset: number; limit: number };
  error?: string;
  message?: string;
}

// Sobe a resolução da thumbnail do Mercado Livre
function upgradeMLImageUrl(url: string): string {
  if (!url) return url;
  // Troca o sufixo de tamanho (ex: -I.jpg) pela versão original (-O.jpg)
  return url
    .replace(/-[A-Z]\.jpg(\?.*)?$/, '-O.jpg')
    .replace(/-[A-Z]\.webp(\?.*)?$/, '-O.webp');
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Parâmetro "q" é obrigatório.' }, { status: 400 });
  }

  // Verifica cache
  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ results: cached.results, cached: true });
  }

  try {
    const mlUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=40`;

    console.log(`[search] Chamando ML API: ${mlUrl}`);

    const res = await fetch(mlUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    console.log(`[search] ML API status: ${res.status}`);

    if (!res.ok) {
      const body = await res.text();
      console.error(`[search] ML API error body: ${body}`);
      throw new Error(`ML API retornou ${res.status}: ${body}`);
    }

    const data: MLSearchResponse = await res.json();

    // A própria ML pode retornar um campo error
    if (data.error) {
      throw new Error(`ML API erro: ${data.error} - ${data.message}`);
    }

    const products = data.results ?? [];
    console.log(`[search] "${query}" → ${products.length} produtos`);

    const results: ImageResult[] = products
      .filter(p => p.thumbnail && p.title)
      .map((p, i) => ({
        id: p.id ?? `ml-${i}`,
        title: p.title,
        image: upgradeMLImageUrl(p.thumbnail),
        preview: p.thumbnail,
        site: 'mercadolivre.com.br',
        score: 1,
        price: p.price,
        permalink: p.permalink,
      }));

    cache.set(cacheKey, { results, ts: Date.now() });

    return NextResponse.json({ results });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[/api/search] Erro:', msg);
    return NextResponse.json(
      { error: 'Falha ao buscar produtos.', detail: msg },
      { status: 500 }
    );
  }
}
