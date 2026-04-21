"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./ProductSearch.module.css";

interface ProductResult {
  id: string;
  title: string;
  image: string;
  preview: string;
  price?: string;
  url?: string;
}

interface ProductSearchProps {
  onSelectImage?: (file: File, title: string) => void;
}

export default function ProductSearch({ onSelectImage }: ProductSearchProps) {
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<ProductResult[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [searched, setSearched]     = useState(false);
  const [page, setPage]             = useState(0);
  const [hasMore, setHasMore]       = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toast, setToast]           = useState<string | null>(null);
  const toastTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuery = useRef("");
  const ddgVqd    = useRef<string>(""); // token reutilizado na paginação

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  // Busca produtos nas lojas (VTEX + OFF) via API route
  async function fetchStorePage(q: string, p: number): Promise<ProductResult[]> {
    const res = await fetch(`/api/scrape?q=${encodeURIComponent(q)}&page=${p}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  }

  // Busca imagens no DuckDuckGo via proxy (funciona com o IP do servidor Next.js)
  async function fetchDdgPage(q: string, p: number): Promise<ProductResult[]> {
    try {
      const term   = `${q} produto supermercado embalagem`;
      const offset = p * 24;
      const vqd    = p === 0 ? '' : ddgVqd.current;
      const params = new URLSearchParams({ q: term, s: String(offset) });
      if (vqd) params.set('vqd', vqd);

      const res = await fetch(`/api/ddg?${params}`);
      if (!res.ok) return [];
      const data = await res.json();

      // Guarda o token para as próximas páginas
      if (data.vqd) ddgVqd.current = data.vqd;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.results ?? []).slice(0, 24).map((r: any, i: number) => ({
        id: `ddg_p${p}_${offset + i}`,
        title: r.title ?? q,
        image: r.image ?? '',
        preview: r.thumbnail ?? r.image ?? '',
      })).filter((r: ProductResult) => r.image);
    } catch {
      return [];
    }
  }

  async function fetchPage(q: string, p: number): Promise<ProductResult[]> {
    // VTEX+OFF e DDG em paralelo; mescla sem duplicatas
    const [store, ddg] = await Promise.all([
      fetchStorePage(q, p),
      fetchDdgPage(q, p),
    ]);
    const seen = new Set<string>();
    const merged: ProductResult[] = [];
    for (const r of [...store, ...ddg]) {
      if (r.image && !seen.has(r.image)) { seen.add(r.image); merged.push(r); }
    }
    return merged;
  }

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    setResults([]);
    setPage(0);
    setHasMore(false);
    lastQuery.current = q;

    try {
      const items = await fetchPage(q, 0);
      setResults(items);
      setHasMore(items.length >= 20); // se veio cheio, provavelmente tem mais
    } catch (err) {
      console.error('[ProductSearch]', err);
      setError("Não foi possível buscar. Verifique se o servidor está rodando.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const items = await fetchPage(lastQuery.current, nextPage);
      setResults(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const fresh = items.filter(r => !existingIds.has(r.id));
        return [...prev, ...fresh];
      });
      setPage(nextPage);
      setHasMore(items.length >= 20);
    } catch (err) {
      console.error('[ProductSearch loadMore]', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCardClick = async (product: ProductResult) => {
    if (downloading) return;
    setDownloading(product.id);

    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(product.image)}`);
      if (!res.ok) throw new Error("proxy falhou");

      const blob = await res.blob();
      const ext = product.image.match(/\.(png|webp|jpe?g)/i)?.[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const safeName = product.title.slice(0, 40).replace(/[^a-z0-9]/gi, "_");
      const file = new File([blob], `${safeName}.${ext}`, { type: blob.type || "image/jpeg" });

      onSelectImage?.(file, product.title);
      showToast(`✓ "${product.title.slice(0, 34)}…" adicionado ao editor!`);
    } catch {
      showToast("Não foi possível carregar esta imagem. Tente outra.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Barra de busca */}
      <form className={styles.searchBar} onSubmit={handleSearch}>
        <input
          className={styles.input}
          type="text"
          placeholder='Buscar produto… ex: "leite tirol", "cebola", "pão francês"'
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          className={styles.searchBtn}
          disabled={loading || !query.trim()}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {loading && (
        <div className={styles.status}>
          <div className={styles.spinner} />
          Buscando produtos…
        </div>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <div className={styles.status}>
          Nenhum produto encontrado para <strong>"{query}"</strong>.<br />
          Tente outro termo ou verifique a ortografia.
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className={styles.grid}>
            {results.map(product => (
              <div
                key={product.id}
                className={`${styles.card} ${downloading === product.id ? styles.cardLoading : ""}`}
                onClick={() => handleCardClick(product)}
                title={product.title}
              >
                <div className={styles.imageWrap}>
                  {downloading === product.id ? (
                    <div className={styles.downloadOverlay}>
                      <div className={styles.spinner} />
                      <span>Carregando…</span>
                    </div>
                  ) : (
                    <>
                      <img
                        className={styles.image}
                        src={product.preview}
                        alt={product.title}
                        loading="lazy"
                        onError={e => {
                          const img = e.currentTarget;
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = "1";
                            img.src = product.image;
                          } else {
                            const card = img.closest(`.${styles.card}`) as HTMLElement | null;
                            if (card) card.style.display = 'none';
                          }
                        }}
                      />
                      <div className={styles.overlay}>
                        <span className={styles.overlayText}>Usar no editor</span>
                      </div>
                    </>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.title}>{product.title}</p>
                  {product.price && <p className={styles.price}>{product.price}</p>}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className={styles.loadMoreWrap}>
              <button
                className={styles.loadMoreBtn}
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><span className={styles.spinnerInline} /> Carregando…</>
                ) : (
                  "Carregar mais"
                )}
              </button>
            </div>
          )}
        </>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
