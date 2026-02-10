#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const ROOT_DIR = process.cwd();
const ROOT_REAL = fs.realpathSync(ROOT_DIR);

const ENTRY_FILE = path.join(ROOT_DIR, 'club.js');
const LOG_FILE = path.join(ROOT_DIR, 'sync_deps.log');
const MAP_FILE = path.join(ROOT_DIR, 'sync_deps.map.json');
const TMP_DIR = path.join(ROOT_DIR, '.sync_deps_tmp');

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024; // per-file
const DEFAULT_MAX_URLS = 20_000;
const DEFAULT_INCLUDE_HTML_LINKS = true;

const CONCURRENCY = clampInt(
  process.env.SYNC_DEPS_CONCURRENCY,
  1,
  12,
  DEFAULT_CONCURRENCY,
);
const RETRIES = clampInt(process.env.SYNC_DEPS_RETRIES, 0, 10, DEFAULT_RETRIES);
const TIMEOUT_MS = clampInt(
  process.env.SYNC_DEPS_TIMEOUT_MS,
  1_000,
  300_000,
  DEFAULT_TIMEOUT_MS,
);
const MAX_REDIRECTS = clampInt(
  process.env.SYNC_DEPS_MAX_REDIRECTS,
  0,
  20,
  DEFAULT_MAX_REDIRECTS,
);
const MAX_BYTES = clampInt(
  process.env.SYNC_DEPS_MAX_BYTES,
  1 * 1024 * 1024,
  2_000 * 1024 * 1024,
  DEFAULT_MAX_BYTES,
);
const MAX_URLS = clampInt(
  process.env.SYNC_DEPS_MAX_URLS,
  100,
  200_000,
  DEFAULT_MAX_URLS,
);
const INCLUDE_HTML_LINKS =
  (process.env.SYNC_DEPS_INCLUDE_HTML_LINKS || '').trim() === ''
    ? DEFAULT_INCLUDE_HTML_LINKS
    : String(process.env.SYNC_DEPS_INCLUDE_HTML_LINKS).trim() !== '0';

const EXCLUDED_SCHEMES = new Set([
  'data:',
  'blob:',
  'mailto:',
  'tel:',
  'javascript:',
  'chrome-extension:',
]);

const EXCLUDED_ABSOLUTE_URLS = new Set([
  'http://www.w3.org/2000/svg',
  'https://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'https://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'https://www.w3.org/1999/xlink',
]);

function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function isPathInside(childAbs, parentAbs) {
  const rel = path.relative(parentAbs, childAbs);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..');
}

function ensureDirSync(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function openLogStream() {
  ensureDirSync(path.dirname(LOG_FILE));
  return fs.createWriteStream(LOG_FILE, { flags: 'a' });
}

function logLine(stream, line) {
  const ts = new Date().toISOString();
  stream.write(`[${ts}] ${line}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeWebPath(webPath) {
  let p = String(webPath || '').trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\0/g, '');
  // normalize removes '/../' but we must reject it
  const noLead = p.replace(/^\/+/, '');
  const norm = path.posix.normalize(noLead);
  if (norm === '..' || norm.startsWith('../')) {
    throw new Error(`Refusing web path with traversal: ${webPath}`);
  }
  return '/' + norm;
}

function assertNoSymlinkInPath(absPath) {
  const rel = path.relative(ROOT_DIR, absPath);
  if (rel === '' || rel === '.' || rel.startsWith('..')) {
    throw new Error(`Refusing path outside root: ${absPath}`);
  }
  const parts = rel.split(path.sep).filter(Boolean);
  let cur = ROOT_DIR;
  for (const part of parts) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) continue;
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing to follow symlink: ${path.relative(ROOT_DIR, cur)}`);
    }
    const real = fs.realpathSync(cur);
    if (!isPathInside(real, ROOT_REAL)) {
      throw new Error(
        `Refusing path that resolves outside root: ${path.relative(ROOT_DIR, cur)}`,
      );
    }
  }
}

function safeFsPathFromWebPath(webPath) {
  const safeWeb = sanitizeWebPath(webPath);
  const rel = safeWeb.replace(/^\/+/, '');
  const abs = path.resolve(ROOT_DIR, rel);
  if (!isPathInside(abs, ROOT_DIR)) {
    throw new Error(`Refusing write outside root: ${webPath}`);
  }
  assertNoSymlinkInPath(abs);
  return abs;
}

function safeEnsureParentDirs(absFilePath) {
  const rel = path.relative(ROOT_DIR, absFilePath);
  const parts = rel.split(path.sep).filter(Boolean);
  let cur = ROOT_DIR;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = path.join(cur, parts[i]);
    if (fs.existsSync(cur)) {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        throw new Error(
          `Refusing to follow symlink dir: ${path.relative(ROOT_DIR, cur)}`,
        );
      }
      if (!st.isDirectory()) {
        throw new Error(`Expected directory: ${path.relative(ROOT_DIR, cur)}`);
      }
    } else {
      fs.mkdirSync(cur);
    }
    const real = fs.realpathSync(cur);
    if (!isPathInside(real, ROOT_REAL)) {
      throw new Error(
        `Refusing dir that resolves outside root: ${path.relative(ROOT_DIR, cur)}`,
      );
    }
  }
}

async function moveFileSafe(srcAbs, destAbs) {
  safeEnsureParentDirs(destAbs);
  assertNoSymlinkInPath(destAbs);
  try {
    await fs.promises.rename(srcAbs, destAbs);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      await fs.promises.copyFile(srcAbs, destAbs);
      await fs.promises.unlink(srcAbs);
      return;
    }
    throw e;
  }
}

function readFileUtf8Safe(absPath) {
  return fs.readFileSync(absPath, 'utf8');
}

function looksLikeDomainPath(raw) {
  const s = String(raw || '').trim();
  // domain.tld/path or domain.tld:port/path
  return /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{1,5})?\//.test(s);
}

function normalizeCandidateToUrl(raw, baseUrl, defaultOrigin) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip surrounding quotes if they sneak in (rare)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  const lower = s.toLowerCase();
  for (const scheme of EXCLUDED_SCHEMES) {
    if (lower.startsWith(scheme)) return null;
  }
  if (s.startsWith('#')) return null;

  if (s.startsWith('//')) s = 'https:' + s;
  else if (looksLikeDomainPath(s)) s = 'https://' + s;

  try {
    let url;
    if (/^https?:\/\//i.test(s)) {
      url = new URL(s);
    } else if (s.startsWith('/')) {
      if (baseUrl) url = new URL(s, baseUrl);
      else if (defaultOrigin) url = new URL(s, defaultOrigin);
      else return null;
    } else if (s.startsWith('./') || s.startsWith('../')) {
      if (!baseUrl) return null;
      url = new URL(s, baseUrl);
    } else {
      return null;
    }
    url.hash = '';
    if (EXCLUDED_ABSOLUTE_URLS.has(url.toString())) return null;
    return url;
  } catch {
    return null;
  }
}

function shouldDownloadUrl(urlObj) {
  if (!urlObj) return false;
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return false;
  const pathname = urlObj.pathname || '';
  const hasPath = pathname && pathname !== '/';
  const hasQuery = urlObj.search && urlObj.search !== '';
  if (!hasPath && !hasQuery) return false;
  // Skip obvious namespace-like urls even if they pass above
  if (urlObj.hostname === 'www.w3.org' && pathname.startsWith('/1999/')) return false;
  if (urlObj.hostname === 'www.w3.org' && pathname.startsWith('/2000/')) return false;
  return true;
}

function isProbablyTextByContentType(ct) {
  if (!ct) return false;
  const mime = String(ct).split(';')[0].trim().toLowerCase();
  if (mime.startsWith('text/')) return true;
  return (
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'text/javascript' ||
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime === 'image/svg+xml' ||
    mime === 'application/vnd.apple.mpegurl' ||
    mime === 'application/x-mpegurl'
  );
}

function extFromContentType(ct) {
  const mime = String(ct || '').split(';')[0].trim().toLowerCase();
  if (mime === 'application/javascript' || mime === 'text/javascript') return '.js';
  if (mime === 'text/css') return '.css';
  if (mime === 'application/json') return '.json';
  if (mime === 'text/html') return '.html';
  if (mime === 'application/wasm') return '.wasm';
  if (mime === 'application/vnd.apple.mpegurl' || mime === 'application/x-mpegurl')
    return '.m3u8';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/x-icon') return '.ico';
  if (mime === 'font/woff') return '.woff';
  if (mime === 'font/woff2') return '.woff2';
  if (mime === 'font/ttf') return '.ttf';
  if (mime === 'application/vnd.ms-fontobject') return '.eot';
  if (mime === 'audio/mpeg') return '.mp3';
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/wav') return '.wav';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/mp2t') return '.ts';
  if (mime === 'text/plain') return '.txt';
  return '';
}

function sniffContentType(buf) {
  if (!buf || buf.length === 0) return '';
  const b = buf;
  const asHex = (n) => b.slice(0, n).toString('hex').toLowerCase();

  // Binary signatures
  if (b.length >= 8 && asHex(8) === '89504e470d0a1a0a') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'image/jpeg';
  if (b.length >= 6 && (b.slice(0, 6).toString('ascii') === 'GIF87a' || b.slice(0, 6).toString('ascii') === 'GIF89a'))
    return 'image/gif';
  if (
    b.length >= 12 &&
    b.slice(0, 4).toString('ascii') === 'RIFF' &&
    b.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (b.length >= 4 && b.slice(0, 4).toString('ascii') === 'wOFF') return 'font/woff';
  if (b.length >= 4 && b.slice(0, 4).toString('ascii') === 'wOF2') return 'font/woff2';
  if (b.length >= 4 && asHex(4) === '0061736d') return 'application/wasm';
  if (b.length >= 4 && b.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (b.length >= 3 && b.slice(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (b.length >= 4 && b.slice(0, 4).toString('ascii') === 'ftyp') return 'video/mp4';
  if (b.length >= 4 && asHex(4) === '1a45dfa3') return 'video/webm';

  // Text-ish sniff: trim leading whitespace
  const textStart = b.slice(0, Math.min(b.length, 256)).toString('utf8');
  const trimmed = textStart.replace(/^\uFEFF/, '').trimStart();

  if (trimmed.startsWith('#EXTM3U')) return 'application/vnd.apple.mpegurl';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'application/json';
  if (trimmed.startsWith('<')) {
    const lower = trimmed.slice(0, 512).toLowerCase();
    if (lower.includes('<svg')) return 'image/svg+xml';
    return 'text/html';
  }
  if (/^(?:function|\(function|export\s+|import\s+)/.test(trimmed))
    return 'application/javascript';
  if (trimmed.startsWith('/*')) return 'text/css';

  return '';
}

function decideSaveWebPath(urlObj, contentType) {
  const pathnameRaw = urlObj.pathname || '/';
  let pathname = pathnameRaw;
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  // Normalize but keep leading slash
  pathname = '/' + path.posix.normalize(pathname.replace(/^\/+/, ''));

  const endsWithSlash = pathname.endsWith('/');
  const ext = path.posix.extname(pathname);
  const hasExt = Boolean(ext);

  if (hasExt) {
    return pathname;
  }

  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const inferredExt = extFromContentType(mime) || '.bin';

  if (mime === 'text/html') {
    if (endsWithSlash) return pathname + 'index.html';
    return pathname + '/index.html';
  }

  if (mime === 'application/json') {
    if (endsWithSlash) return pathname + 'index.json';
    return pathname + '.json';
  }

  if (mime === 'application/javascript' || mime === 'text/javascript') {
    if (endsWithSlash) return pathname + 'index.js';
    return pathname + '.js';
  }

  if (endsWithSlash) return pathname + 'index' + inferredExt;
  return pathname + inferredExt;
}

async function hashFileSha256(absPath) {
  const h = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(absPath);
    s.on('error', reject);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', resolve);
  });
  return h.digest('hex');
}

function addSuffixBeforeExt(webPath, suffix) {
  const dir = path.posix.dirname(webPath);
  const base = path.posix.basename(webPath);
  const dot = base.lastIndexOf('.');
  if (dot > 0) {
    return path.posix.join(dir, base.slice(0, dot) + suffix + base.slice(dot));
  }
  return path.posix.join(dir, base + suffix);
}

function isTextWebPath(webPath) {
  const ext = path.posix.extname(webPath).toLowerCase();
  return (
    ext === '.js' ||
    ext === '.mjs' ||
    ext === '.cjs' ||
    ext === '.css' ||
    ext === '.json' ||
    ext === '.map' ||
    ext === '.svg' ||
    ext === '.html' ||
    ext === '.htm' ||
    ext === '.xml' ||
    ext === '.txt' ||
    ext === '.m3u8' ||
    ext === '.ts'
  );
}

async function httpGetFollow(urlObj, logStream, redirectsLeft) {
  const mod = urlObj.protocol === 'http:' ? http : https;

  const res = await new Promise((resolve, reject) => {
    const req = mod.request(
      urlObj,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'sync_deps/2.0',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
        },
      },
      (response) => resolve(response),
    );
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout after ${TIMEOUT_MS}ms`));
    });
    req.end();
  });

  const status = res.statusCode || 0;
  const loc = res.headers.location;

  if (
    loc &&
    [301, 302, 303, 307, 308].includes(status) &&
    redirectsLeft > 0
  ) {
    const next = new URL(loc, urlObj);
    logLine(logStream, `redirect ${status}: ${urlObj.toString()} -> ${next.toString()}`);
    res.resume();
    return httpGetFollow(next, logStream, redirectsLeft - 1);
  }

  return { res, finalUrl: urlObj };
}

async function downloadToTemp(urlObj, logStream) {
  const { res, finalUrl } = await httpGetFollow(urlObj, logStream, MAX_REDIRECTS);
  const status = res.statusCode || 0;

  if (status !== 200) {
    const body = await readLimitedText(res, 8 * 1024);
    throw new Error(`HTTP ${status} (${finalUrl.toString()}): ${body || 'no body'}`);
  }

  const headerCt = String(res.headers['content-type'] || '');
  const headerLen = Number.parseInt(String(res.headers['content-length'] || ''), 10);
  if (Number.isFinite(headerLen) && headerLen > MAX_BYTES) {
    res.resume();
    throw new Error(`Content-Length ${headerLen} exceeds limit ${MAX_BYTES}`);
  }

  ensureDirSync(TMP_DIR);
  const tmpName =
    sha1Hex(finalUrl.toString()).slice(0, 16) +
    '_' +
    crypto.randomBytes(6).toString('hex');
  const tmpAbs = path.join(TMP_DIR, tmpName);

  const hash = crypto.createHash('sha256');
  let size = 0;
  const sniffMax = 2048;
  const sniffChunks = [];
  let sniffSize = 0;

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpAbs);

    const fail = (err) => {
      try {
        file.close(() => {});
      } catch {}
      res.destroy();
      reject(err);
    };

    res.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        fail(new Error(`Download exceeded limit ${MAX_BYTES}`));
        return;
      }
      hash.update(chunk);
      if (sniffSize < sniffMax) {
        const need = sniffMax - sniffSize;
        sniffChunks.push(chunk.slice(0, need));
        sniffSize += Math.min(need, chunk.length);
      }
    });
    res.on('error', fail);
    file.on('error', fail);
    file.on('finish', resolve);

    res.pipe(file);
  });

  const contentHash = hash.digest('hex');
  const sniffBuf = Buffer.concat(sniffChunks, sniffSize);
  const sniffCt = sniffContentType(sniffBuf);
  const finalCt =
    headerCt && headerCt.trim() && headerCt !== 'application/octet-stream'
      ? headerCt
      : sniffCt;

  return {
    tmpAbs,
    finalUrl,
    headerContentType: headerCt,
    detectedContentType: finalCt,
    sniffContentType: sniffCt,
    size,
    contentHash,
  };
}

async function readLimitedText(stream, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    size += buf.length;
    if (size >= limitBytes) break;
  }
  try {
    return Buffer.concat(chunks, Math.min(size, limitBytes)).toString('utf8');
  } catch {
    return '';
  }
}

function extractFromM3u8(text) {
  const out = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) {
      for (const m of t.matchAll(/URI\s*=\s*"(.*?)"/g)) {
        if (m[1]) out.add(m[1]);
      }
      continue;
    }
    out.add(t);
  }
  return [...out];
}

function extractFromCss(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
  )) {
    out.add(m[2]);
  }
  for (const m of String(text || '').matchAll(
    /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/gi,
  )) {
    out.add(m[2]);
  }
  for (const m of String(text || '').matchAll(
    /sourceMappingURL\s*=\s*([^\s*]+)\s*(?:\*\/)?/gi,
  )) {
    out.add(m[1]);
  }
  return [...out];
}

function extractFromHtml(text) {
  const out = [];
  const s = String(text || '');

  // Resource-ish attributes
  for (const m of s.matchAll(
    /\b(?:src|href|poster|data-src|content)\s*=\s*(['"])([^'"]+)\1/gi,
  )) {
    out.push({ kind: 'attr', value: m[2] });
  }

  // srcset
  for (const m of s.matchAll(/\bsrcset\s*=\s*(['"])([^'"]+)\1/gi)) {
    const val = m[2];
    for (const part of val.split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u) out.push({ kind: 'srcset', value: u });
    }
  }

  // <a href=...>
  for (const m of s.matchAll(/<a\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1/gi)) {
    out.push({ kind: 'a', value: m[2] });
  }

  // Inline CSS url(...)
  for (const m of s.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    out.push({ kind: 'css_url', value: m[2] });
  }

  return out;
}

function traverseJsonStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) traverseJsonStrings(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) traverseJsonStrings(v, out);
  }
}

function extractFromJson(text) {
  const out = [];
  try {
    const parsed = JSON.parse(text);
    traverseJsonStrings(parsed, out);
    return out;
  } catch {
    // Fallback: any quoted strings
    for (const m of String(text || '').matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
      out.push(m[1]);
    }
    return out;
  }
}

function walkJs(text, handlers) {
  const { onString, onTemplateChunk, onTemplate } = handlers || {};
  const len = text.length;
  let i = 0;

  const skipLineComment = () => {
    i += 2;
    while (i < len && text[i] !== '\n') i += 1;
  };

  const skipBlockComment = () => {
    i += 2;
    while (i < len) {
      if (text[i] === '*' && text[i + 1] === '/') {
        i += 2;
        return;
      }
      i += 1;
    }
  };

  const readQuoted = (quote) => {
    const start = i + 1;
    i += 1;
    while (i < len) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) {
        const raw = text.slice(start, i);
        i += 1;
        if (onString) onString(raw);
        return;
      }
      i += 1;
    }
  };

  const skipTemplateExpression = () => {
    let depth = 1;
    while (i < len) {
      const ch = text[i];
      if (ch === "'" || ch === '"') {
        const q = ch;
        i += 1;
        while (i < len) {
          const c = text[i];
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '`') {
        i += 1;
        while (i < len) {
          const c = text[i];
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === '`') {
            i += 1;
            break;
          }
          if (c === '$' && text[i + 1] === '{') {
            i += 2;
            skipTemplateExpression();
            continue;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '/' && text[i + 1] === '/') {
        skipLineComment();
        continue;
      }
      if (ch === '/' && text[i + 1] === '*') {
        skipBlockComment();
        continue;
      }
      if (ch === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        i += 1;
        if (depth === 0) return;
        continue;
      }
      i += 1;
    }
  };

  const readTemplate = () => {
    const start = i;
    i += 1; // skip `
    const parts = [];
    let chunkStart = i;
    let terminated = false;
    while (i < len) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        parts.push({ type: 'chunk', text: text.slice(chunkStart, i) });
        i += 1;
        terminated = true;
        break;
      }
      if (ch === '$' && text[i + 1] === '{') {
        parts.push({ type: 'chunk', text: text.slice(chunkStart, i) });
        i += 2;
        const exprStart = i;
        skipTemplateExpression();
        parts.push({ type: 'expr', text: text.slice(exprStart, i - 1) });
        chunkStart = i;
        continue;
      }
      i += 1;
    }
    if (!terminated) return;
    if (onTemplate) onTemplate(parts, start, i);
    for (const p of parts) {
      if (p.type === 'chunk' && onTemplateChunk) onTemplateChunk(p.text);
    }
  };

  while (i < len) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      readQuoted(ch);
      continue;
    }
    if (ch === '`') {
      readTemplate();
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      skipLineComment();
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      skipBlockComment();
      continue;
    }
    i += 1;
  }
}

function extractUrlLikeFromTextChunk(chunk) {
  const out = new Set();
  const s = String(chunk || '');

  // Absolute/protocol-relative
  for (const m of s.matchAll(
    /(https?:\/\/|\/\/)[^\s"'`<>)[\]]+/g,
  )) {
    out.add(m[0]);
  }

  // domain.tld/path (no scheme)
  for (const m of s.matchAll(
    /(?:^|[^a-zA-Z0-9_])((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{1,5})?\/[^\s"'`<>)[\]]+)/g,
  )) {
    out.add(m[1]);
  }

  // Root-relative and dot-relative
  for (const m of s.matchAll(
    /(?:^|[^a-zA-Z0-9_])((?:\/|\.\.?\/)[^\s"'`<>)[\]]+)/g,
  )) {
    out.add(m[1]);
  }

  return [...out];
}

function extractJsCandidates(jsText) {
  const candidates = [];
  const dynamicTemplates = [];

  walkJs(jsText, {
    onString: (raw) => {
      for (const c of extractUrlLikeFromTextChunk(raw)) candidates.push(c);
    },
    onTemplateChunk: (raw) => {
      for (const c of extractUrlLikeFromTextChunk(raw)) candidates.push(c);
    },
    onTemplate: (parts) => {
      const hasExpr = parts.some((p) => p.type === 'expr');
      if (!hasExpr) return;
      const joined = parts
        .filter((p) => p.type === 'chunk')
        .map((p) => p.text)
        .join('');
      // If template contains something url-like, log as dynamic unresolved
      if (
        /(https?:\/\/|\/\/)/.test(joined) ||
        joined.includes('/') ||
        joined.startsWith('/')
      ) {
        dynamicTemplates.push({
          pattern: '`' + parts.map((p) => (p.type === 'expr' ? '${…}' : p.text)).join('') + '`',
        });
      }
    },
  });

  // location.origin + "/path"
  for (const m of jsText.matchAll(
    /\b(?:window\.)?location\.origin\s*\+\s*(['"])(\/[^'"]+)\1/g,
  )) {
    candidates.push(m[2]);
  }

  return { candidates: [...new Set(candidates)], dynamicTemplates };
}

function unescapeSimpleJsString(s) {
  // Minimal unescape for common sequences; good enough for config urls
  return String(s)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"');
}

function extractConstStrings(jsText) {
  const out = new Map();

  // var/let/const x = '...'
  for (const m of jsText.matchAll(
    /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\2/g,
  )) {
    out.set(m[1], unescapeSimpleJsString(m[3]));
  }

  // var Obj = { key: 'value', ... }  (top-level string props)
  for (const m of jsText.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*{/g)) {
    const objName = m[1];
    const braceIdx = m.index + m[0].length - 1;
    const endIdx = findMatchingBrace(jsText, braceIdx);
    if (endIdx < 0) continue;
    const body = jsText.slice(braceIdx + 1, endIdx);
    for (const p of body.matchAll(
      /(^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\3/gm,
    )) {
      out.set(objName + '.' + p[2], unescapeSimpleJsString(p[4]));
    }
  }

  return out;
}

function findMatchingBrace(text, openIdx) {
  const len = text.length;
  if (text[openIdx] !== '{') return -1;
  let i = openIdx + 1;
  let depth = 1;
  while (i < len) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      const q = ch;
      i += 1;
      while (i < len) {
        const c = text[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === q) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '`') {
      // skip template (rough)
      i += 1;
      while (i < len) {
        const c = text[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') {
          i += 1;
          break;
        }
        if (c === '$' && text[i + 1] === '{') {
          i += 2;
          let d = 1;
          while (i < len && d > 0) {
            const cc = text[i];
            if (cc === "'" || cc === '"') {
              const qq = cc;
              i += 1;
              while (i < len) {
                const ccc = text[i];
                if (ccc === '\\') {
                  i += 2;
                  continue;
                }
                if (ccc === qq) {
                  i += 1;
                  break;
                }
                i += 1;
              }
              continue;
            }
            if (cc === '{') d += 1;
            else if (cc === '}') d -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < len && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < len) {
        if (text[i] === '*' && text[i + 1] === '/') {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function evalStringExpression(expr, constMap) {
  let e = String(expr || '').trim();
  if (!e) return null;

  // String literal
  const lit = e.match(/^(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1$/);
  if (lit) return unescapeSimpleJsString(lit[2]);

  // identifier/member
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(e)) {
    if (constMap.has(e)) return constMap.get(e);
    // Try to resolve .prop by prop-only keys (rare fallback)
    const last = e.split('.').pop();
    const hit = [...constMap.entries()].find(([k]) => k.endsWith('.' + last));
    if (hit) return hit[1];
    return null;
  }

  // chained .replace('a','b')
  const replaceRe =
    /^(.+?)((?:\s*\.\s*replace\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\3\s*,\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\5\s*\)\s*)+)$/;
  const rm = e.match(replaceRe);
  if (rm) {
    const baseVal = evalStringExpression(rm[1], constMap);
    if (baseVal === null) return null;
    let v = baseVal;
    const chain = rm[2];
    for (const m of chain.matchAll(
      /\.\s*replace\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\s*,\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\3\s*\)/g,
    )) {
      const from = unescapeSimpleJsString(m[2]);
      const to = unescapeSimpleJsString(m[4]);
      v = v.split(from).join(to);
    }
    return v;
  }

  return null;
}

function extractConcatCandidates(jsText, constMap) {
  const out = [];

  for (const m of jsText.matchAll(
    /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\.\s*replace\(\s*['"][^'"]*['"]\s*,\s*['"][^'"]*['"]\s*\))*)\s*\+\s*(['"])(\/[^'"]+)\2/g,
  )) {
    const baseExpr = m[1];
    const suffix = m[3];
    const baseVal = evalStringExpression(baseExpr, constMap);
    if (baseVal === null) continue;
    const joined = String(baseVal).replace(/\/+$/, '') + suffix;
    out.push(joined);
  }

  return out;
}

function addSource(mapEntry, sourceInfo) {
  if (!sourceInfo) return;
  if (!mapEntry.sources) mapEntry.sources = [];
  const s = {
    from: sourceInfo.from || '',
    kind: sourceInfo.kind || '',
    raw: sourceInfo.raw || '',
  };
  // keep small
  mapEntry.sources.push(s);
  if (mapEntry.sources.length > 25) mapEntry.sources = mapEntry.sources.slice(-25);
}

function topDomains(domainCountMap, n) {
  return [...domainCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([d, c]) => ({ domain: d, count: c }));
}

function rewriteJsText(jsText, ctx) {
  const { urlToLocal, defaultOrigin, knownOrigins, reverseLocalToRemote } = ctx;
  let replaced = 0;
  let dynamicUnresolved = 0;

  const rewriteUrlString = (rawUrl, baseUrl) => {
    const urlObj = normalizeCandidateToUrl(rawUrl, baseUrl, defaultOrigin);
    if (!urlObj) return null;
    const abs = urlObj.toString();
    const pathname = urlObj.pathname || '/';
    const ext = path.posix.extname(pathname);

    // Prefer exact mapping for query/static assets
    const mapped = urlToLocal.get(abs);
    if (mapped) {
      const hasQuery = urlObj.search && urlObj.search !== '';
      if (hasQuery || ext) return mapped.local_web_path;
    }

    // Strip origin for any url with path
    if (pathname && pathname !== '/') return pathname;

    // origin-only: rewrite to "/" only if it's one of known origins
    if (knownOrigins.has(urlObj.origin)) return '/';

    return null;
  };

  const replaceInChunk = (chunk, opts) => {
    const inTemplate = opts && opts.inTemplate;
    let updated = String(chunk);

    // Absolute/protocol-relative and domain/path
    updated = updated.replace(
      /((?:https?:\/\/|\/\/)[^\s"'`<>)[\]]+|(?:^|[^a-zA-Z0-9_])((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{1,5})?\/[^\s"'`<>)[\]]+))/g,
      (m, g1, g2) => {
        const raw = g1 || g2;
        const replacement = rewriteUrlString(raw, null);
        if (!replacement) return m;
        replaced += 1;
        return m.replace(raw, replacement);
      },
    );

    // root-relative paths with query that map to saved file names
    updated = updated.replace(/((?:\/)[^\s"'`<>)[\]]+\?[^\s"'`<>)[\]]+)/g, (m, raw) => {
      const urlObj = normalizeCandidateToUrl(raw, null, defaultOrigin);
      if (!urlObj) return m;
      const mapped = urlToLocal.get(urlObj.toString());
      if (!mapped) return m;
      replaced += 1;
      return mapped.local_web_path;
    });

    // Template helper: strip origin prefix even when ext is in another chunk
    if (inTemplate) {
      updated = updated.replace(
        /(https?:\/\/|\/\/)([a-zA-Z0-9.-]+)(?::\d{1,5})?(\/[^"'`\\s<>]+)/g,
        (_full, _proto, _host, tail) => {
          replaced += 1;
          return tail;
        },
      );
    }

    return updated;
  };

  let out = '';
  const len = jsText.length;
  let i = 0;

  const copy = (n) => {
    out += jsText.slice(i, n);
    i = n;
  };

  const skipLineComment = () => {
    const start = i;
    i += 2;
    while (i < len && jsText[i] !== '\n') i += 1;
    out += replaceInChunk(jsText.slice(start, i), { inTemplate: false });
  };

  const skipBlockComment = () => {
    const start = i;
    i += 2;
    while (i < len) {
      if (jsText[i] === '*' && jsText[i + 1] === '/') {
        i += 2;
        break;
      }
      i += 1;
    }
    out += replaceInChunk(jsText.slice(start, i), { inTemplate: false });
  };

  const readQuoted = (quote) => {
    const start = i;
    i += 1;
    while (i < len) {
      const ch = jsText[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) {
        const raw = jsText.slice(start + 1, i);
        const updated = replaceInChunk(raw, { inTemplate: false });
        out += quote + updated + quote;
        i += 1;
        return;
      }
      i += 1;
    }
    out += jsText.slice(start);
    i = len;
  };

  const skipTemplateExpression = () => {
    let depth = 1;
    while (i < len) {
      const ch = jsText[i];
      if (ch === "'" || ch === '"') {
        const q = ch;
        i += 1;
        while (i < len) {
          const c = jsText[i];
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '`') {
        // nested template: skip roughly
        i += 1;
        while (i < len) {
          const c = jsText[i];
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === '`') {
            i += 1;
            break;
          }
          if (c === '$' && jsText[i + 1] === '{') {
            i += 2;
            skipTemplateExpression();
            continue;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '/' && jsText[i + 1] === '/') {
        i += 2;
        while (i < len && jsText[i] !== '\n') i += 1;
        continue;
      }
      if (ch === '/' && jsText[i + 1] === '*') {
        i += 2;
        while (i < len) {
          if (jsText[i] === '*' && jsText[i + 1] === '/') {
            i += 2;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (ch === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        i += 1;
        if (depth === 0) return;
        continue;
      }
      i += 1;
    }
  };

  const readTemplate = () => {
    i += 1; // skip `
    const parts = [];
    let chunkStart = i;
    let terminated = false;
    while (i < len) {
      const ch = jsText[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        parts.push({ type: 'chunk', text: jsText.slice(chunkStart, i) });
        i += 1;
        terminated = true;
        break;
      }
      if (ch === '$' && jsText[i + 1] === '{') {
        parts.push({ type: 'chunk', text: jsText.slice(chunkStart, i) });
        i += 2;
        const exprStart = i;
        skipTemplateExpression();
        parts.push({ type: 'expr', text: jsText.slice(exprStart, i - 1) });
        chunkStart = i;
        continue;
      }
      i += 1;
    }

    if (!terminated) {
      out += '`' + jsText.slice(chunkStart);
      i = len;
      return;
    }

    const joinedChunks = parts
      .filter((p) => p.type === 'chunk')
      .map((p) => p.text)
      .join('');
    const looksLikeResourceTemplate =
      /\.(js|mjs|cjs|css|json|map|png|jpe?g|svg|webp|gif|woff2?|ttf|eot|mp3|mp4|webm|m3u8|ts|wasm)(\b|$)/i.test(
        joinedChunks,
      ) ||
      /(https?:\/\/|\/\/)/.test(joinedChunks);

    if (parts.some((p) => p.type === 'expr') && looksLikeResourceTemplate) {
      dynamicUnresolved += 1;
    }

    out += '`';
    for (const p of parts) {
      if (p.type === 'expr') out += '${' + p.text + '}';
      else out += replaceInChunk(p.text, { inTemplate: looksLikeResourceTemplate });
    }
    out += '`';
  };

  // location.origin + "/x" -> "/x"
  const LOCATION_ORIGIN_PLUS_RE =
    /\b(?:window\.)?location\.origin\s*\+\s*(['"])(\/[^'"]+)\1/y;

  while (i < len) {
    LOCATION_ORIGIN_PLUS_RE.lastIndex = i;
    const loc = LOCATION_ORIGIN_PLUS_RE.exec(jsText);
    if (loc) {
      out += loc[1] + loc[2] + loc[1];
      replaced += 1;
      i = LOCATION_ORIGIN_PLUS_RE.lastIndex;
      continue;
    }

    const ch = jsText[i];
    if (ch === "'" || ch === '"') {
      readQuoted(ch);
      continue;
    }
    if (ch === '`') {
      out += '`';
      readTemplate();
      continue;
    }
    if (ch === '/' && jsText[i + 1] === '/') {
      skipLineComment();
      continue;
    }
    if (ch === '/' && jsText[i + 1] === '*') {
      skipBlockComment();
      continue;
    }
    out += ch;
    i += 1;
  }

  return { text: out, replaced, dynamic_unresolved: dynamicUnresolved };
}

function rewriteGenericText(text, ctx) {
  const { urlToLocal, baseUrl, defaultOrigin, knownOrigins } = ctx;
  let replaced = 0;

  const rewriteAny = (raw) => {
    const urlObj = normalizeCandidateToUrl(raw, baseUrl, defaultOrigin);
    if (!urlObj) return null;
    const abs = urlObj.toString();
    const pathname = urlObj.pathname || '/';
    const ext = path.posix.extname(pathname);
    const mapped = urlToLocal.get(abs);
    if (mapped) {
      const hasQuery = urlObj.search && urlObj.search !== '';
      if (hasQuery || ext) return mapped.local_web_path;
    }
    if (pathname && pathname !== '/') return pathname;
    if (knownOrigins.has(urlObj.origin)) return '/';
    return null;
  };

  let out = String(text || '');

  // url(...)
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, v) => {
    const r = rewriteAny(v.trim());
    if (!r) return m;
    replaced += 1;
    return `url(${q}${r}${q})`;
  });

  // @import
  out = out.replace(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/gi, (m, q, v) => {
    const r = rewriteAny(v.trim());
    if (!r) return m;
    replaced += 1;
    return m.replace(v, r);
  });

  // sourceMappingURL
  out = out.replace(/sourceMappingURL\s*=\s*([^\s*]+)\s*(?:\*\/)?/gi, (m, v) => {
    const r = rewriteAny(v.trim());
    if (!r) return m;
    replaced += 1;
    return m.replace(v, r);
  });

  // Absolute/protocol-relative, domain/path, root-relative with query
  out = out.replace(
    /((?:https?:\/\/|\/\/)[^\s"'`<>)[\]]+|(?:^|[^a-zA-Z0-9_])((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{1,5})?\/[^\s"'`<>)[\]]+)|\/[^\s"'`<>)[\]]+\?[^\s"'`<>)[\]]+)/g,
    (m, g1, g2) => {
      const raw = g1 || g2 || m;
      const r = rewriteAny(raw);
      if (!r) return m;
      replaced += 1;
      return m.replace(raw, r);
    },
  );

  // HTML-ish attributes
  out = out.replace(
    /\b(?:src|href|poster|data-src|srcset)\s*=\s*(['"])([^'"]+)\1/gi,
    (m, q, v) => {
      const r = rewriteAny(v.trim());
      if (!r) return m;
      replaced += 1;
      return m.replace(v, r);
    },
  );

  return { text: out, replaced };
}

function postProcessClubJs(jsText) {
  let out = jsText;
  let changed = 0;

  // hostkey: turn hardcoded origin into runtime host to remove static domain
  out = out.replace(
    /\bvar\s+hostkey\s*=\s*(['"])https?:\/\/[^'"]+\1\s*\.\s*replace\(\s*(['"])http:\/\/\2\s*,\s*(['"])\3\s*\)\s*\.\s*replace\(\s*(['"])https:\/\/\4\s*,\s*(['"])\5\s*\)\s*;/g,
    () => {
      changed += 1;
      return 'var hostkey = location.host;';
    },
  );

  // typeInvoke: avoid external checks and ensure host prefix doesn't create "//"
  out = out.replace(
    /(['"])https?:\/\/[^'"]+\1\s*\.indexOf\(location\.host\)\s*>=\s*0\s*\?\s*(['"])https?:\/\/[^'"]+\2\s*:\s*host\s*\+\s*(['"])\/cors\/check\3/g,
    () => {
      changed += 1;
      return "host.replace(/\\/$/, '') + '/cors/check'";
    },
  );

  // If any remaining hardcoded origins are used as args, make them "/"
  out = out.replace(/(['"])https?:\/\/[^'"]+\1/g, (m) => {
    // keep if it's clearly part of a namespace url in inline svg
    if (/w3\.org\/(1999|2000)\//.test(m)) return m;
    changed += 1;
    return "'/'";
  });

  return { text: out, changed };
}

function extractAllCandidatesFromText(type, text) {
  if (type === 'm3u8') return extractFromM3u8(text).map((v) => ({ kind: 'm3u8', value: v }));
  if (type === 'css') return extractFromCss(text).map((v) => ({ kind: 'css', value: v }));
  if (type === 'html') return extractFromHtml(text);
  if (type === 'json') return extractFromJson(text).map((v) => ({ kind: 'json', value: v }));
  // generic fallback
  return extractUrlLikeFromTextChunk(text).map((v) => ({ kind: 'text', value: v }));
}

async function main() {
  const logStream = openLogStream();
  const startedAt = Date.now();

  const mapObj = loadMapSafe();
  const urlToLocal = new Map(); // remote abs url -> map entry
  const reverseLocalToRemote = new Map(); // local web path -> remote abs url

  // Migrate legacy map keys (local_path/local_fs) to new (local_web_path/local_fs_path)
  for (const [remote, meta] of Object.entries(mapObj)) {
    if (!meta || typeof meta !== 'object') continue;
    if (!meta.original_url && typeof remote === 'string') meta.original_url = remote;
    if (!meta.local_web_path && typeof meta.local_path === 'string')
      meta.local_web_path = meta.local_path;
    if (!meta.local_fs_path && typeof meta.local_fs === 'string')
      meta.local_fs_path = meta.local_fs;
    if (!meta.detected_type && typeof meta.content_type === 'string')
      meta.detected_type = meta.content_type;
    if (!Array.isArray(meta.sources)) meta.sources = [];
  }

  for (const [remote, meta] of Object.entries(mapObj)) {
    if (!meta || typeof meta !== 'object') continue;
    if (typeof remote !== 'string') continue;
    if (typeof meta.local_web_path !== 'string') continue;
    urlToLocal.set(remote, meta);
    reverseLocalToRemote.set(meta.local_web_path, remote);
  }

  if (!fs.existsSync(ENTRY_FILE)) {
    console.error('Missing ./club.js in current directory');
    process.exitCode = 2;
    return;
  }

  ensureDirSync(TMP_DIR);

  logLine(
    logStream,
    `start: concurrency=${CONCURRENCY} retries=${RETRIES} timeout_ms=${TIMEOUT_MS} max_redirects=${MAX_REDIRECTS} max_bytes=${MAX_BYTES} max_urls=${MAX_URLS} include_html_links=${INCLUDE_HTML_LINKS}`,
  );

  const entryText = readFileUtf8Safe(ENTRY_FILE);

  // Determine default origin from existing map or entry
  const originCounts = new Map();
  for (const remote of urlToLocal.keys()) {
    try {
      const u = new URL(remote);
      originCounts.set(u.origin, (originCounts.get(u.origin) || 0) + 1);
    } catch {}
  }
  for (const raw of extractUrlLikeFromTextChunk(entryText)) {
    const u = normalizeCandidateToUrl(raw, null, null);
    if (u) originCounts.set(u.origin, (originCounts.get(u.origin) || 0) + 1);
  }

  const defaultOrigin = topDomains(originCounts, 1)[0]
    ? topDomains(originCounts, 1)[0].domain
    : '';

  const knownOrigins = new Set([...originCounts.keys()]);

  const queue = [];
  const seen = new Set();
  const domainCounts = new Map();
  const failed = [];
  const rewritten = [];
  const rewriteCounts = new Map(); // rel fs -> count

  const addUrlTask = (urlObj, sourceInfo) => {
    if (!urlObj) return;
    if (!shouldDownloadUrl(urlObj)) return;
    const abs = urlObj.toString();
    if (seen.has(abs)) {
      const existing = urlToLocal.get(abs);
      if (existing) addSource(existing, sourceInfo);
      return;
    }
    if (seen.size >= MAX_URLS) return;
    seen.add(abs);
    queue.push({ url: abs, source: sourceInfo });
  };

  const addDynamic = (pattern, sourceInfo) => {
    if (!pattern) return;
    const key = 'dynamic:' + sha1Hex(pattern).slice(0, 12) + ':' + pattern.slice(0, 200);
    if (mapObj[key]) return;
    mapObj[key] = {
      original_url: pattern,
      status: 'dynamic_unresolved',
      local_web_path: '',
      local_fs_path: '',
      content_hash: '',
      size: 0,
      content_type: '',
      detected_type: '',
      final_url: '',
      sources: [],
    };
    addSource(mapObj[key], sourceInfo);
  };

  // Seed: absolute urls in entry strings/templates
  const jsSeeds = extractJsCandidates(entryText);
  for (const d of jsSeeds.dynamicTemplates) {
    addDynamic(d.pattern, { from: 'club.js', kind: 'js_template', raw: d.pattern });
  }

  const constMap = extractConstStrings(entryText);
  const concatSeeds = extractConcatCandidates(entryText, constMap);
  const allSeedRaws = [...jsSeeds.candidates, ...concatSeeds];

  // Also seed from existing map if local web paths appear in entry
  for (const [localWeb, remote] of reverseLocalToRemote.entries()) {
    if (entryText.includes(localWeb)) {
      try {
        addUrlTask(new URL(remote), { from: 'club.js', kind: 'map_ref', raw: localWeb });
      } catch {}
    }
  }

  for (const raw of allSeedRaws) {
    // If it's a local web path we already know, use its remote original
    if (raw && raw.startsWith('/') && reverseLocalToRemote.has(raw)) {
      const remote = reverseLocalToRemote.get(raw);
      try {
        addUrlTask(new URL(remote), { from: 'club.js', kind: 'local_ref', raw });
      } catch {}
      continue;
    }

    const u = normalizeCandidateToUrl(raw, null, defaultOrigin);
    if (!u) continue;
    addUrlTask(u, { from: 'club.js', kind: 'seed', raw });
  }

  logLine(logStream, `seeds: ${queue.length} (unique=${seen.size}) default_origin=${defaultOrigin || '(none)'}`);

  const inFlight = new Set();
  const scannedText = new Set(); // local fs path scanned

  const schedule = async () => {
    while ((queue.length || inFlight.size) && seen.size <= MAX_URLS) {
      while (queue.length && inFlight.size < CONCURRENCY) {
        const task = queue.shift();
        const p = processTask(task).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      if (inFlight.size) await Promise.race(inFlight);
    }
    if (seen.size > MAX_URLS) {
      logLine(logStream, `limit reached: seen=${seen.size} max_urls=${MAX_URLS}`);
    }
  };

  const processTask = async (task) => {
    const absUrl = task.url;
    let urlObj;
    try {
      urlObj = new URL(absUrl);
    } catch {
      return;
    }

    domainCounts.set(urlObj.hostname, (domainCounts.get(urlObj.hostname) || 0) + 1);

    const existing = urlToLocal.get(absUrl);
    if (existing && existing.local_fs_path && fs.existsSync(path.join(ROOT_DIR, existing.local_fs_path))) {
      addSource(existing, task.source);
      // Still scan for links if it's text and not scanned
      if (existing.local_web_path && isTextWebPath(existing.local_web_path)) {
        const absFs = path.join(ROOT_DIR, existing.local_fs_path);
        if (!scannedText.has(absFs)) {
          scannedText.add(absFs);
          await scanDownloadedText(absFs, existing.local_web_path, absUrl, existing.detected_type || existing.content_type);
        }
      }
      return;
    }

    let dl;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        logLine(logStream, `download: ${absUrl} (attempt ${attempt + 1})`);
        dl = await downloadToTemp(urlObj, logStream);
        break;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (attempt < RETRIES) {
          logLine(logStream, `retry: ${absUrl} ${msg}`);
          await sleep(400 * Math.pow(2, attempt));
          continue;
        }
        logLine(logStream, `failed: ${absUrl} ${msg}`);
        failed.push({ url: absUrl, error: msg });
        mapObj[absUrl] = mapObj[absUrl] || {
          original_url: absUrl,
          status: 'failed',
          local_web_path: '',
          local_fs_path: '',
          content_hash: '',
          size: 0,
          content_type: '',
          detected_type: '',
          final_url: '',
          sources: [],
        };
        mapObj[absUrl].status = 'failed';
        mapObj[absUrl].error = msg;
        addSource(mapObj[absUrl], task.source);
        return;
      }
    }

    if (!dl) return;

    const detectedType = dl.detectedContentType || dl.headerContentType || '';
    const saveWebPathBase = decideSaveWebPath(dl.finalUrl, detectedType);
    let saveWebPath = sanitizeWebPath(saveWebPathBase);

    // Host collision protection
    const existingRemoteForPath = reverseLocalToRemote.get(saveWebPath);
    if (existingRemoteForPath && existingRemoteForPath !== absUrl) {
      const h = sha1Hex(urlObj.host).slice(0, 8);
      saveWebPath = addSuffixBeforeExt(saveWebPath, `__h_${h}`);
    }

    // Query collision handling (ignore query only if content matches)
    if (urlObj.search && urlObj.search !== '') {
      const absExisting = safeFsPathFromWebPath(saveWebPath);
      if (fs.existsSync(absExisting)) {
        const existingHash = await hashFileSha256(absExisting);
        if (existingHash !== dl.contentHash) {
          const qh = sha1Hex(urlObj.search).slice(0, 8);
          saveWebPath = addSuffixBeforeExt(saveWebPath, `__q_${qh}`);
        }
      }
    }

    const destAbs = safeFsPathFromWebPath(saveWebPath);
    const destRel = path.relative(ROOT_DIR, destAbs);

    // If unchanged and same path exists, skip replace
    let status = 'downloaded';
    if (fs.existsSync(destAbs)) {
      const existingHash = await hashFileSha256(destAbs);
      if (existingHash === dl.contentHash) {
        status = 'skipped_same';
        await fs.promises.unlink(dl.tmpAbs).catch(() => {});
      }
    }

    if (status === 'downloaded') {
      await moveFileSafe(dl.tmpAbs, destAbs);
    }

    const entry = (mapObj[absUrl] = mapObj[absUrl] || {
      original_url: absUrl,
      status: status,
      local_web_path: saveWebPath,
      local_fs_path: destRel,
      content_hash: dl.contentHash,
      size: dl.size,
      content_type: dl.headerContentType || '',
      detected_type: detectedType || '',
      final_url: dl.finalUrl.toString(),
      sources: [],
    });

    entry.status = status;
    entry.local_web_path = saveWebPath;
    entry.local_fs_path = destRel;
    entry.content_hash = dl.contentHash;
    entry.size = dl.size;
    entry.content_type = dl.headerContentType || '';
    entry.detected_type = detectedType || '';
    entry.final_url = dl.finalUrl.toString();
    addSource(entry, task.source);

    urlToLocal.set(absUrl, entry);
    reverseLocalToRemote.set(saveWebPath, absUrl);

    if (isTextWebPath(saveWebPath) || isProbablyTextByContentType(detectedType)) {
      const absFs = destAbs;
      if (!scannedText.has(absFs)) {
        scannedText.add(absFs);
        await scanDownloadedText(absFs, saveWebPath, absUrl, detectedType);
      }
    }
  };

  const scanDownloadedText = async (absFsPath, webPath, remoteUrl, detectedType) => {
    let text = '';
    try {
      text = fs.readFileSync(absFsPath, 'utf8');
    } catch {
      return;
    }

    const ext = path.posix.extname(webPath).toLowerCase();
    const mime = String(detectedType || '').split(';')[0].trim().toLowerCase();

    let type = 'text';
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') type = 'js';
    else if (ext === '.css') type = 'css';
    else if (ext === '.json' || ext === '.map') type = 'json';
    else if (ext === '.html' || ext === '.htm' || ext === '.xml' || mime === 'text/html')
      type = 'html';
    else if (ext === '.svg' || mime === 'image/svg+xml') type = 'html';
    else if (ext === '.m3u8' || mime.includes('mpegurl')) type = 'm3u8';

    // JS: also extract concat candidates based on consts in the file
    if (type === 'js') {
      const js = extractJsCandidates(text);
      for (const d of js.dynamicTemplates) {
        addDynamic(d.pattern, { from: webPath, kind: 'js_template', raw: d.pattern });
      }
      const consts = extractConstStrings(text);
      const concats = extractConcatCandidates(text, consts);
      const all = [...js.candidates, ...concats];
      for (const raw of all) {
        enqueueRawCandidate(raw, remoteUrl, webPath, 'js');
      }
      return;
    }

    const extracted = extractAllCandidatesFromText(type, text);
    for (const it of extracted) {
      if (!it || !it.value) continue;
      if (type === 'html' && it.kind === 'a') {
        // include only same-origin unless explicit absolute pointing to known origins
        if (!INCLUDE_HTML_LINKS) continue;
        const u = normalizeCandidateToUrl(it.value, remoteUrl, defaultOrigin);
        if (!u) continue;
        try {
          const base = new URL(remoteUrl);
          if (u.origin !== base.origin) continue;
        } catch {
          continue;
        }
        addUrlTask(u, { from: webPath, kind: 'html_a', raw: it.value });
        logLine(logStream, `html<a>: ${webPath} -> ${u.toString()}`);
        continue;
      }
      enqueueRawCandidate(it.value, remoteUrl, webPath, it.kind || type);
    }
  };

  const enqueueRawCandidate = (raw, baseRemoteUrl, fromWebPath, kind) => {
    if (!raw) return;
    const trimmed = String(raw).trim();
    if (!trimmed) return;

    // if already a local rewritten path that maps back, use original remote
    if (trimmed.startsWith('/') && reverseLocalToRemote.has(trimmed)) {
      const remote = reverseLocalToRemote.get(trimmed);
      try {
        addUrlTask(new URL(remote), { from: fromWebPath, kind: 'local_ref', raw: trimmed });
      } catch {}
      return;
    }

    const u = normalizeCandidateToUrl(trimmed, baseRemoteUrl, defaultOrigin);
    if (!u) return;
    addUrlTask(u, { from: fromWebPath, kind, raw: trimmed });
  };

  await schedule();

  // Rewriting stage: rewrite club.js and all downloaded text files
  const rewrittenFiles = [];
  let totalReplaced = 0;
  let totalDynamicUnresolved = 0;

  const rewriteOneFile = (absFsPath, fileType, baseUrl) => {
    const old = fs.readFileSync(absFsPath, 'utf8');
    const ctx = { urlToLocal, defaultOrigin, knownOrigins, reverseLocalToRemote };
    let res;
    if (fileType === 'js') res = rewriteJsText(old, ctx);
    else res = rewriteGenericText(old, { ...ctx, baseUrl });

    let text = res.text;
    let replacedCount = res.replaced || 0;

    if (absFsPath === ENTRY_FILE) {
      const pp = postProcessClubJs(text);
      if (pp.text !== text) {
        text = pp.text;
        replacedCount += pp.changed;
      }
    }

    if (text !== old) {
      writeFileAtomic(absFsPath, text);
      rewrittenFiles.push(path.relative(ROOT_DIR, absFsPath));
      rewriteCounts.set(path.relative(ROOT_DIR, absFsPath), replacedCount);
      totalReplaced += replacedCount;
      totalDynamicUnresolved += res.dynamic_unresolved || 0;
      logLine(
        logStream,
        `rewrite: ${path.relative(ROOT_DIR, absFsPath)} replacements=${replacedCount}`,
      );
    }
  };

  rewriteOneFile(ENTRY_FILE, 'js', null);

  // Rewrite all text files we downloaded (from map)
  for (const meta of Object.values(mapObj)) {
    if (!meta || typeof meta !== 'object') continue;
    if (!meta.local_fs_path || !meta.local_web_path) continue;
    const webPath = meta.local_web_path;
    if (!isTextWebPath(webPath)) continue;
    const absFs = path.join(ROOT_DIR, meta.local_fs_path);
    if (!fs.existsSync(absFs)) continue;

    const ext = path.posix.extname(webPath).toLowerCase();
    const type = ext === '.js' || ext === '.mjs' || ext === '.cjs' ? 'js' : 'text';
    rewriteOneFile(absFs, type === 'js' ? 'js' : 'text', meta.original_url || meta.final_url);
  }

  // Verify paths referenced in club.js
  const verify = verifyLocalReferences(ENTRY_FILE);

  // Save map
  saveMapSafe(mapObj);

  const ms = Date.now() - startedAt;
  const downloadedCount = Object.values(mapObj).filter(
    (e) => e && typeof e === 'object' && (e.status === 'downloaded' || e.status === 'skipped_same'),
  ).length;

  logLine(
    logStream,
    `done: discovered=${seen.size} downloaded=${downloadedCount} rewritten_files=${rewrittenFiles.length} rewritten_total=${totalReplaced} dynamic_unresolved=${totalDynamicUnresolved} failed=${failed.length} verify_missing=${verify.missing.length} ms=${ms}`,
  );

  // Console report
  console.log('sync_deps report');
  console.log(`- discovered URLs: ${seen.size}`);
  console.log(`- downloaded (incl skipped_same): ${downloadedCount}`);
  console.log(`- rewritten files: ${rewrittenFiles.length}`);
  console.log(`- rewritten occurrences: ${totalReplaced}`);
  console.log(`- dynamic_unresolved (templates): ${totalDynamicUnresolved}`);
  const top10 = topDomains(domainCounts, 10);
  console.log(
    `- top domains: ${
      top10.length ? top10.map((x) => `${x.domain}(${x.count})`).join(', ') : '(none)'
    }`,
  );
  console.log(`- failed: ${failed.length}`);
  if (failed.length) {
    for (const f of failed.slice(0, 50)) {
      console.log(`  - ${f.url}: ${f.error}`);
    }
    if (failed.length > 50) console.log(`  ... and ${failed.length - 50} more`);
  }
  console.log(`- verify missing (club.js refs): ${verify.missing.length}`);
  if (verify.missing.length) {
    for (const m of verify.missing.slice(0, 50)) console.log(`  - ${m}`);
    if (verify.missing.length > 50)
      console.log(`  ... and ${verify.missing.length - 50} more`);
  }

  logStream.end();
}

function writeFileAtomic(absPath, text) {
  safeEnsureParentDirs(absPath);
  const dir = path.dirname(absPath);
  const tmp = path.join(dir, '.tmp_' + crypto.randomBytes(6).toString('hex'));
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, absPath);
}

function loadMapSafe() {
  try {
    if (!fs.existsSync(MAP_FILE)) return {};
    const raw = fs.readFileSync(MAP_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMapSafe(obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  writeFileAtomic(MAP_FILE, text);
}

function verifyLocalReferences(absJsPath) {
  const text = fs.readFileSync(absJsPath, 'utf8');
  const refs = new Set();

  walkJs(text, {
    onString: (raw) => {
      for (const m of raw.matchAll(/\/[A-Za-z0-9._~%!$&'()*+,;=:@\/-]+/g)) {
        refs.add(m[0]);
      }
    },
    onTemplateChunk: (raw) => {
      for (const m of raw.matchAll(/\/[A-Za-z0-9._~%!$&'()*+,;=:@\/-]+/g)) {
        refs.add(m[0]);
      }
    },
  });

  const missing = [];
  const correspondences = [];
  for (const p of refs) {
    const candidates = [];
    const base = p.split('?')[0];
    candidates.push(base);
    if (base.endsWith('/')) {
      candidates.push(base + 'index.html');
      candidates.push(base + 'index.json');
      candidates.push(base + 'index.js');
      candidates.push(base + 'index.bin');
    } else {
      candidates.push(base + '.json');
      candidates.push(base + '.js');
      candidates.push(base + '.html');
      candidates.push(base + '.css');
      candidates.push(base + '.bin');
      candidates.push(base + '/index.html');
      candidates.push(base + '/index.json');
    }

    let ok = false;
    let found = '';
    for (const c of candidates) {
      try {
        const abs = safeFsPathFromWebPath(c);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          ok = true;
          found = c;
          break;
        }
      } catch {}
    }
    if (!ok) missing.push(p);
    else if (found !== base) correspondences.push({ ref: p, file: found });
  }

  return { missing, correspondences };
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});
