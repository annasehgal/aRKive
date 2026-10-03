import { parseHttpUrl } from './urlUtils.js';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8000;

export async function fetchMetadata(rawUrl) {
  const url = parseHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5',
        'user-agent': 'aRKive local metadata fetcher'
      }
    });
    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || url.toString();
    if (!response.ok) throw new Error(`Metadata request returned ${response.status}`);

    if (contentType.toLowerCase().includes('application/pdf')) {
      return {
        title: filenameTitle(finalUrl) || url.hostname,
        description: 'PDF document',
        domain: new URL(finalUrl).hostname.replace(/^www\./i, ''),
        content_type: contentType,
        favicon_url: originAsset(finalUrl, '/favicon.ico')
      };
    }

    const text = await readLimitedText(response);
    const html = text.slice(0, MAX_BYTES);
    const base = new URL(finalUrl);
    const meta = parseHtmlMetadata(html);
    return {
      title: meta.ogTitle || meta.title || filenameTitle(finalUrl) || base.hostname,
      description: meta.ogDescription || meta.description || '',
      domain: base.hostname.replace(/^www\./i, ''),
      favicon_url: absolutize(meta.icon || '/favicon.ico', base),
      image_url: absolutize(meta.ogImage, base),
      content_type: contentType
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  return new TextDecoder().decode(concat(chunks, Math.min(size, MAX_BYTES)));
}

function concat(chunks, max) {
  const output = new Uint8Array(max);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk.slice(0, max - offset), offset);
    offset += chunk.byteLength;
    if (offset >= max) break;
  }
  return output;
}

function parseHtmlMetadata(html) {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
  const metas = {};
  for (const match of html.matchAll(/<meta\s+([^>]*?)>/gi)) {
    const attrs = attrsFrom(match[1]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content) metas[key] = decodeEntities(attrs.content.trim());
  }
  let icon = '';
  for (const match of html.matchAll(/<link\s+([^>]*?)>/gi)) {
    const attrs = attrsFrom(match[1]);
    const rel = (attrs.rel || '').toLowerCase();
    if (rel.includes('icon') && attrs.href) {
      icon = attrs.href;
      break;
    }
  }
  return {
    title,
    description: metas.description || '',
    ogTitle: metas['og:title'] || '',
    ogDescription: metas['og:description'] || '',
    ogImage: metas['og:image'] || '',
    icon
  };
}

function attrsFrom(input) {
  const attrs = {};
  for (const match of input.matchAll(/([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1].toLowerCase()] = match[3] || match[4] || match[5] || '';
  }
  return attrs;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolutize(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).toString();
  } catch {
    return '';
  }
}

function originAsset(rawUrl, pathname) {
  const url = new URL(rawUrl);
  return `${url.origin}${pathname}`;
}

function filenameTitle(rawUrl) {
  const url = new URL(rawUrl);
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  return last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
}

