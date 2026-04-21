import { NextRequest, NextResponse } from 'next/server';

// Rota server-side para Remove.bg (mais precisa que o modelo local)
// Configure REMOVEBG_API_KEY no .env.local para ativar
// Chave gratuita em: https://www.remove.bg/api
export async function POST(req: NextRequest) {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    // Sem chave configurada — cliente usa fallback local (@imgly)
    return NextResponse.json({ error: 'no_api_key' }, { status: 404 });
  }

  try {
    const inForm = await req.formData();
    const file = inForm.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'no_image' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());

    const rbForm = new FormData();
    rbForm.append('image_file', new Blob([buf], { type: 'image/png' }), 'image.png');
    rbForm.append('size', 'auto');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: rbForm,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[removebg api]', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: detail }, { status: res.status });
    }

    const outBuf = await res.arrayBuffer();
    return new NextResponse(outBuf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[removebg]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
