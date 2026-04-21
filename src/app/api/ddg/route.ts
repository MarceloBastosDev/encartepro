import { NextRequest, NextResponse } from 'next/server';

// Proxy leve para DuckDuckGo Images.
// O browser não pode chamar o DDG diretamente (CORS), então passamos pelo Next.js.
// Esta rota NÃO usa Edge Runtime — fica no servidor regional onde o usuário está,
// e como o request vem do servidor do usuário (não de datacenter fixo), o DDG aceita.
// Se o DDG bloquear mesmo assim, retorna vazio sem quebrar o app.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function GET(req: NextRequest) {
  const q      = req.nextUrl.searchParams.get('q')?.trim();
  const vqd    = req.nextUrl.searchParams.get('vqd')?.trim();
  const offset = req.nextUrl.searchParams.get('s') ?? '0';

  if (!q) return NextResponse.json({ results: [] });

  try {
    // Passo 1: buscar VQD token (só quando não fornecido)
    let token = vqd;
    if (!token) {
      const homeRes = await fetch(
        `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
      );
      const html = await homeRes.text();
      token =
        html.match(/vqd=([\d-]+)/)?.[1] ??
        html.match(/"vqd"\s*:\s*"([^"]+)"/)?.[1] ?? '';
    }

    if (!token) return NextResponse.json({ results: [], vqd: '' });

    // Passo 2: buscar imagens
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&o=json&p=1&s=${offset}&u=bing&f=,,,&l=pt-br&vqd=${encodeURIComponent(token)}`,
      {
        headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!imgRes.ok) return NextResponse.json({ results: [], vqd: token });

    const data = await imgRes.json();
    return NextResponse.json({ results: data.results ?? [], vqd: token });
  } catch {
    return NextResponse.json({ results: [], vqd: '' });
  }
}
