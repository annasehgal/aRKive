export function parseHttpUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('URL is required');
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs can be saved');
  }
  url.hash = '';
  return url;
}

export function normalizeUrl(input) {
  const url = parseHttpUrl(input);
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  const removable = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid'
  ]);
  for (const key of [...url.searchParams.keys()]) {
    if (removable.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export function domainFor(input) {
  return parseHttpUrl(input).hostname.replace(/^www\./i, '');
}

