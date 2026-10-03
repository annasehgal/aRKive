import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, getDbPath } from './db.js';
import { applyMetadata, createLink, deleteLink, hydrateLink, listFacets, listLinks, markMetadataFailed, recordAccess, updateLink } from './repository.js';
import { fetchMetadata } from './metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';

getDb();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
}));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: getDbPath() });
});

app.get('/api/links', (req, res, next) => {
  try {
    res.json({ links: listLinks(req.query), facets: listFacets() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/links/:id', (req, res) => {
  const link = hydrateLink(Number(req.params.id));
  if (!link) return res.status(404).json({ error: 'Link not found' });
  res.json({ link });
});

app.post('/api/links', (req, res, next) => {
  try {
    const result = createLink(req.body || {});
    res.status(result.duplicate ? 409 : 201).json(result);
    if (!result.duplicate) queueMetadata(result.link.id, result.link.url);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/links/:id', (req, res, next) => {
  try {
    const link = updateLink(Number(req.params.id), req.body || {});
    if (!link) return res.status(404).json({ error: 'Link not found' });
    res.json({ link, facets: listFacets() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/links/:id/access', (req, res) => {
  const link = recordAccess(Number(req.params.id));
  if (!link) return res.status(404).json({ error: 'Link not found' });
  res.json({ link });
});

app.post('/api/links/:id/refresh-metadata', (req, res) => {
  const link = hydrateLink(Number(req.params.id));
  if (!link) return res.status(404).json({ error: 'Link not found' });
  queueMetadata(link.id, link.url);
  res.json({ link: updateLink(link.id, {}) });
});

app.delete('/api/links/:id', (req, res) => {
  res.json({ ok: deleteLink(Number(req.params.id)) });
});

app.use((error, _req, res, _next) => {
  const status = /URL|http|https|required/i.test(error.message) ? 400 : 500;
  res.status(status).json({ error: error.message || 'Unexpected error' });
});

function queueMetadata(id, url) {
  setTimeout(async () => {
    try {
      const metadata = await fetchMetadata(url);
      applyMetadata(id, metadata);
    } catch (error) {
      markMetadataFailed(id, error.message);
    }
  }, 0);
}

app.listen(port, host, () => {
  console.log(`aRKive is running locally at http://${host}:${port}`);
  console.log(`SQLite database: ${getDbPath()}`);
});
