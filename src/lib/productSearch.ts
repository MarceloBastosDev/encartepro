// Simple in-memory cache: key -> { results, timestamp }
const cache = new Map<string, { results: ProductImage[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export interface ProductImage {
  id: string;
  title: string;
  image: string;
  sourceUrl: string;
  site: string;
  score: number;
  price?: number;
}

interface MLProduct {
  id: string;
  title: string;
  thumbnail: string;
  permalink: string;
  price: number;
}

interface MLSearchResponse {
  results: MLProduct[];
  paging: { total: number; offset: number; limit: number };
}

// Melhora resolução da thumbnail do Mercado Livre
// Padrão: "https://http2.mlstatic.com/D_NQ_NP_XXXXX-X.jpg"
// Suffix -I = small, -O = original, -F = full
function upgradeMLImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/-[A-Z]\.jpg(\?.*)?$/, '-O.jpg')
    .replace(/-[A-Z]\.webp(\?.*)?$/, '-O.webp');
}

async function searchProductsAndExtractImages(query: string): Promise<ProductImage[]> {
  // Verifica cache
  const cacheKey = query.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[productSearch] Cache hit: "${query}"`);
    return cached.results;
  }

  console.log(`[productSearch] Buscando no Mercado Livre: "${query}"`);

  // API pública do Mercado Livre - Brasil (site ID: MLB)
  const mlUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20`;

  const res = await fetch(mlUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Mercado Livre API error: ${res.status}`);
  }

  const data: MLSearchResponse = await res.json();
  const products = data.results ?? [];

  console.log(`[productSearch] ${products.length} produtos encontrados para "${query}"`);

  const results: ProductImage[] = products
    .filter(p => p.thumbnail && p.title)
    .map((p, i) => ({
      id: p.id ?? `ml-${i}`,
      title: p.title,
      image: upgradeMLImageUrl(p.thumbnail),
      sourceUrl: p.permalink,
      site: 'mercadolivre.com.br',
      score: 1,
      price: p.price,
    }));

  cache.set(cacheKey, { results, ts: Date.now() });

  return results;
}

export { searchProductsAndExtractImages };
