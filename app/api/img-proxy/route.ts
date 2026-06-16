import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  // Basic validation
  try { new URL(url) } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        // Don't send Referer — some servers block requests with wrong Referer
      },
      // Follow redirects
      redirect: 'follow',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Remote server returned ${res.status} for: ${url}` },
        { status: 502 }
      )
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'

    // Make sure it's actually an image
    if (!contentType.startsWith('image/') && !contentType.startsWith('application/octet')) {
      return NextResponse.json(
        { error: `URL returned ${contentType}, not an image` },
        { status: 400 }
      )
    }

    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Proxy error: ${err.message}` },
      { status: 500 }
    )
  }
}
