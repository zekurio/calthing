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

const immutableCache = 'public, max-age=31536000, immutable'

export interface StaticFileSystem {
  realPath(path: string): Promise<string>
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>
  stat(path: string): Promise<{ isFile: boolean }>
}

const denoFileSystem: StaticFileSystem = {
  realPath: Deno.realPath,
  readFile: Deno.readFile,
  stat: Deno.stat,
}

export type StaticHandler = (request: Request) => Promise<Response | undefined>

export function createStaticHandler(
  root: string | undefined,
  files: StaticFileSystem = denoFileSystem,
): StaticHandler {
  if (!root) return () => Promise.resolve(undefined)

  const normalizedRoot = root.replace(/\/+$/, '') || '/'
  const realRoot = realPathIfPresent(normalizedRoot, files)
  return async (request) => {
    const segments = safeSegments(new URL(request.url).pathname)
    if (!segments) return notFound()

    let relative = segments.join('/')
    let file = await regularFile(realRoot, normalizedRoot, relative, files)
    if (!file) {
      if (hasExtension(relative)) return notFound()
      relative = 'index.html'
      file = await regularFile(realRoot, normalizedRoot, relative, files)
    }
    if (!file) return undefined

    const headers = new Headers({
      'cache-control': isHashedAsset(relative) ? immutableCache : 'no-cache',
      'content-type': contentType(relative),
      'x-content-type-options': 'nosniff',
    })
    // Return the representation for HEAD too: Deno suppresses the wire body while using it
    // to produce the same compression and length metadata as the corresponding GET.
    return new Response(await files.readFile(file.path), { headers })
  }
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

function hasExtension(relative: string): boolean {
  const name = relative.slice(relative.lastIndexOf('/') + 1)
  return name.lastIndexOf('.') > 0
}

function isHashedAsset(relative: string): boolean {
  return /^assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(relative)
}

async function regularFile(
  realRoot: Promise<string | undefined>,
  root: string,
  relative: string,
  files: StaticFileSystem,
): Promise<{ path: string } | undefined> {
  const resolvedRoot = await realRoot
  if (!resolvedRoot) return undefined

  try {
    const path = await files.realPath(rootedPath(root, relative))
    if (!isWithin(resolvedRoot, path)) return undefined
    const info = await files.stat(path)
    return info.isFile ? { path } : undefined
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

async function realPathIfPresent(
  path: string,
  files: StaticFileSystem,
): Promise<string | undefined> {
  try {
    return await files.realPath(path)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function rootedPath(root: string, relative: string): string {
  return root === '/' ? `/${relative}` : `${root}/${relative}`
}

function isWithin(root: string, path: string): boolean {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path === root || path.startsWith(prefix)
}

function isMissing(error: unknown): boolean {
  return error instanceof Deno.errors.NotFound || error instanceof Deno.errors.NotADirectory
}

function notFound(): Response {
  return new Response('Not Found\n', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}
