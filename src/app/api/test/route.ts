import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.mercadolibre.com/sites/MLB/search?q=leite&limit=2', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    const status = res.status;
    const body = await res.text();

    return NextResponse.json({ status, body: body.slice(0, 500) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
