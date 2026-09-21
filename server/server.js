/**
 * Static host plus the bookmarklet relay. No dependencies.
 *
 * The relay is a dead drop, not a database. A bookmarklet running on Canvas
 * POSTs a scraped payload under a token; the calculator tab GETs it once and
 * the server forgets it. Nothing touches disk.
 *
 *   POST /api/sync/:token   store a payload            (CORS open, token is the secret)
 *   GET  /api/sync/:token   take the payload and clear it (same origin)
 *   GET  /api/health        liveness
 *
 * Handling of the token and payload:
 *   - Stored under sha256(token), so the store never holds a usable token.
 *   - Dropped after TTL_MS, or on first successful read, whichever is sooner.
 *   - Bounded by both an entry count and a byte budget, so the memory the
 *     relay can hold is fixed regardless of how large the payloads are.
 *   - Never logged. Request logging records method, path and status only.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');

/**
 * Sub-path this app is served under, e.g. "/CSE2407". Leave unset when it has
 * the origin to itself, or when the reverse proxy already strips the prefix.
 *
 * Setting it when the proxy also strips is harmless: the prefix is removed
 * only if it is actually present, so both arrangements work.
 */
const BASE_PATH = ('/' + String(process.env.BASE_PATH || '').trim())
  .replace(/\/+/g, '/').replace(/\/$/, '');

const TTL_MS = Number(process.env.SYNC_TTL_MS || 15 * 60 * 1000);
const MAX_BODY = Number(process.env.SYNC_MAX_BODY || 128 * 1024);
const MAX_ENTRIES = Number(process.env.SYNC_MAX_ENTRIES || 5000);
const MAX_BYTES = Number(process.env.SYNC_MAX_BYTES || 64 * 1024 * 1024);
const RATE_LIMIT = Number(process.env.SYNC_RATE_LIMIT || 60); // requests per window per IP
const RATE_WINDOW_MS = 60 * 1000;

const STATIC_FILES = new Set([
  '/index.html',
  '/favicon.svg',
  '/css/styles.css',
  '/js/data.js',
  '/js/engine.js',
  '/js/syllabus.js',
  '/js/ingest.js',
  '/js/leverage.js',
  '/js/tooltip.js',
  '/js/app.js',
  '/js/bookmarklet.js',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------- the drop --- */

const drop = new Map(); // sha256(token) -> { payload, bytes, expires }

/**
 * Running total of payload bytes held.
 *
 * Capping the number of entries is not enough on its own: 5000 entries of the
 * 128 KB maximum is 625 MB, which would exhaust a small container even though
 * a real scrape is about 10 KB. The byte budget is the cap that actually
 * bounds memory; the entry count just bounds bookkeeping.
 */
let dropBytes = 0;

const keyOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function forget(key) {
  const entry = drop.get(key);
  if (!entry) return;
  dropBytes -= entry.bytes;
  drop.delete(key);
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of drop) if (entry.expires <= now) forget(key);
}
setInterval(sweep, 60 * 1000).unref();

/* ---------------------------------------------------------- rate limiter --- */

const buckets = new Map(); // ip -> { count, resets }

function overRateLimit(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.resets <= now) {
    b = { count: 0, resets: now + RATE_WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count += 1;
  if (buckets.size > 10000) buckets.clear();
  return b.count > RATE_LIMIT;
}

/* ----------------------------------------------------------------- utils --- */

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function send(res, status, body, headers = {}) {
  const base = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  res.writeHead(status, Object.assign(base, headers));
  res.end(body);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    headers,
  ));
}

/** Read a capped request body. Rejects rather than buffering without limit. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        chunks.length = 0;
        // Drain the rest instead of destroying the socket. Cutting the client
        // off mid-upload resets the connection and it sees a network error
        // rather than the 413 explaining what went wrong. Nothing is buffered
        // while draining, and a client that keeps talking well past the limit
        // gets hung up on anyway.
        req.resume();
        const runaway = setTimeout(() => req.destroy(), 5000);
        runaway.unref();
        req.on('end', () => clearTimeout(runaway));
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', (err) => { if (!done) { done = true; reject(err); } });
  });
}

/** A token has to look like one before it is used as a map key. */
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

/* ------------------------------------------------------------------ sync --- */

const CORS_POST = {
  // The token is the secret, and the relay reads no cookies, so any origin may
  // post. A bookmarklet can run on any school's Canvas host.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

async function handleSync(req, res, token, method) {
  if (!TOKEN_RE.test(token)) {
    return sendJson(res, 400, { error: 'bad token' }, method === 'POST' ? CORS_POST : {});
  }
  const key = keyOf(token);

  if (method === 'OPTIONS') return send(res, 204, '', CORS_POST);

  if (method === 'POST') {
    let raw;
    try {
      raw = await readBody(req, MAX_BODY);
    } catch (err) {
      return sendJson(res, err.status || 400, { error: 'body rejected' }, CORS_POST);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return sendJson(res, 400, { error: 'not json' }, CORS_POST);
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
      return sendJson(res, 400, { error: 'expected { items: [...] }' }, CORS_POST);
    }
    if (payload.items.length > 400) {
      return sendJson(res, 400, { error: 'too many items' }, CORS_POST);
    }

    const kept = {
      source: typeof payload.source === 'string' ? payload.source.slice(0, 40) : 'unknown',
      capturedAt: typeof payload.capturedAt === 'string' ? payload.capturedAt.slice(0, 40) : null,
      items: payload.items,
    };
    const bytes = Buffer.byteLength(JSON.stringify(kept));

    // Replacing this token's own payload frees its bytes first, so re-syncing
    // never counts twice.
    forget(key);

    if (drop.size >= MAX_ENTRIES || dropBytes + bytes > MAX_BYTES) sweep();
    if (drop.size >= MAX_ENTRIES || dropBytes + bytes > MAX_BYTES) {
      return sendJson(res, 503, { error: 'relay full, try again shortly' }, CORS_POST);
    }

    drop.set(key, { payload: kept, bytes, expires: Date.now() + TTL_MS });
    dropBytes += bytes;

    return sendJson(res, 204, {}, CORS_POST);
  }

  if (method === 'GET') {
    const entry = drop.get(key);
    if (!entry || entry.expires <= Date.now()) {
      forget(key);
      return sendJson(res, 404, { error: 'nothing waiting' });
    }
    forget(key); // single read: the drop is emptied as it is collected
    return sendJson(res, 200, entry.payload);
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

/* ---------------------------------------------------------------- static --- */

/**
 * The public sub-path this request arrived under, if any.
 *
 * A reverse proxy doing path-based routing strips the prefix before the
 * request reaches us and reports it in X-Forwarded-Prefix, which is the only
 * way to know the browser is at /CSE2407 while we see /. BASE_PATH covers the
 * case where nothing strips it.
 */
function publicPrefix(req) {
  const fwd = req.headers['x-forwarded-prefix'];
  const raw = (typeof fwd === 'string' && fwd) ? fwd : BASE_PATH;
  // Only a simple path is allowed through: this ends up in the served HTML.
  if (!/^\/[A-Za-z0-9._~\-/]*$/.test(raw || '')) return '';
  return String(raw || '').replace(/\/+$/, '');
}

/**
 * Give index.html a <base> so its relative asset URLs resolve under a
 * sub-path, with or without a trailing slash on the address bar.
 *
 * Without this, visiting /CSE2407 (no slash) makes the browser resolve
 * "js/app.js" against /, and every asset 404s.
 */
function withBase(html, prefix) {
  if (!prefix) return html;
  return html.replace('<head>', `<head>\n<base href="${prefix}/">`);
}

function serveStatic(req, res, pathname) {
  const wanted = pathname === '/' ? '/index.html' : pathname;
  if (!STATIC_FILES.has(wanted)) return sendJson(res, 404, { error: 'not found' });

  const filePath = path.join(ROOT, wanted);
  // Defence in depth: the allow-list already prevents traversal.
  if (!filePath.startsWith(ROOT + path.sep)) return sendJson(res, 403, { error: 'forbidden' });

  fs.readFile(filePath, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const ext = path.extname(filePath);
    const isIndex = wanted === '/index.html';
    const body = isIndex ? withBase(buf.toString('utf8'), publicPrefix(req)) : buf;
    send(res, 200, body, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // index.html carries the asset version query strings and a per-request
      // <base>, so it must not be cached; the assets it points at are
      // immutable for a given ?v=.
      'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=3600',
      Vary: 'X-Forwarded-Prefix',
    });
  });
}

/* ---------------------------------------------------------------- server --- */

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURI(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    return sendJson(res, 400, { error: 'bad url' });
  }

  if (BASE_PATH) {
    // "/CSE2407" alone has to become "/CSE2407/", or the relative asset URLs
    // in index.html resolve one directory too high.
    if (pathname === BASE_PATH) {
      return send(res, 308, '', { Location: BASE_PATH + '/' });
    }
    if (pathname.startsWith(BASE_PATH + '/')) pathname = pathname.slice(BASE_PATH.length);
  }

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      pending: drop.size,
      pendingBytes: dropBytes,
      uptime: Math.round(process.uptime()),
    });
  }

  const sync = pathname.match(/^\/api\/sync\/([^/]+)$/);
  if (sync) {
    if (overRateLimit(clientIp(req))) return sendJson(res, 429, { error: 'slow down' });
    return handleSync(req, res, sync[1], req.method);
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `cse2407 calculator listening on http://${HOST}:${PORT}${BASE_PATH}/\n`,
  );
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    drop.clear();
    dropBytes = 0;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

module.exports = server;
