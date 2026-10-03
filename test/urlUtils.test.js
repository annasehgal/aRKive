import test from 'node:test';
import assert from 'node:assert/strict';
import { domainFor, normalizeUrl, parseHttpUrl } from '../src/urlUtils.js';

test('normalizes obvious tracking and URL variations', () => {
  assert.equal(
    normalizeUrl('HTTPS://www.Example.com:443/path/?b=2&utm_source=x&a=1#top'),
    'https://www.example.com/path?a=1&b=2'
  );
});

test('adds https when scheme is omitted', () => {
  assert.equal(parseHttpUrl('example.com/resource').toString(), 'https://example.com/resource');
});

test('rejects non-http schemes', () => {
  assert.throws(() => parseHttpUrl('javascript:alert(1)'), /Only http and https/);
});

test('extracts display domain', () => {
  assert.equal(domainFor('https://www.github.com/openai'), 'github.com');
});

