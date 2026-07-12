const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function contentType(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0
    ? 'application/octet-stream'
    : contentTypes[name.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

function safeSegments(pathname: string): string[] | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return undefined
  }

  if (decoded.includes('\0') || decoded.includes('\\')) return undefined
  const segments = decoded.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) return undefined
  return segments
}

async function regularFile(path: string): Promise<Deno.FileInfo | undefined> {
  try {
    const info = await Deno.stat(path)
    return info.isFile ? info : undefined
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.NotADirectory) {
      return undefined
    }
    throw error
  }
}

export type StaticHandler = (request: Request) => Promise<Response | undefined>

export function createStaticHandler(root: string | undefined): StaticHandler {
  if (!root) return () => Promise.resolve(undefined)

  const normalizedRoot = root.replace(/\/+$/, '')
  return async (request) => {
    const segments = safeSegments(new URL(request.url).pathname)
    if (!segments) {
      return new Response('Not Found\n', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
        },
      })
    }

    let relative = segments.join('/')
    let path = `${normalizedRoot}/${relative}`
    let info = await regularFile(path)
    if (!info) {
      relative = 'index.html'
      path = `${normalizedRoot}/${relative}`
      info = await regularFile(path)
    }
    if (!info) return undefined

    const headers = new Headers({
      'content-length': String(info.size),
      'content-type': contentType(relative),
    })
    if (request.method === 'HEAD') return new Response(null, { headers })
    return new Response(await Deno.readFile(path), { headers })
  }
}
