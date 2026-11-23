import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const recordHash = data => hash(JSON.stringify(data));
const html = read('../public/index.html').toString();
const recipes = JSON.parse(html.match(/^const R=(.*);$/m)[1]);
const photos = JSON.parse(html.match(/^const REVIEWED_PHOTOS = Object.freeze\((.*)\);$/m)[1]);
const baseline = JSON.parse(read('./baseline.json'));
// Ignore spacing, punctuation, and presentation variants in titles.
const normalized = name => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

test('preserves all baseline recipes', () => {
  assert.equal(baseline.length, 51);
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  for (const entry of baseline) {
    assert.ok(byId.has(entry.id), entry.name);
    assert.equal(recordHash(byId.get(entry.id)), entry.recipeHash, entry.name);
  }
});

test('rejects duplicate IDs and normalized names, including the ten existing Ryu recipes', () => {
  const names = new Set();
  const ids = new Set();
  assert.equal(baseline.filter(entry => entry.chef === '류수영').length, 10);
  for (const recipe of recipes) {
    assert.ok(!ids.has(recipe.id), `Duplicate ID: ${recipe.id}`);
    ids.add(recipe.id);
    const name = normalized(recipe.name);
    assert.ok(name && !names.has(name), `Duplicate or empty title: ${recipe.name}`);
    names.add(name);
  }
});

test('preserves manifest and icons', () => {
  for (const line of read('./assets.sha256').toString().trim().split('\n')) {
    const [checksum, path] = line.split(/\s+/);
    assert.equal(hash(read('../public/' + path)), checksum, path);
  }
});

test('publishes only attributed remote photos and includes every referenced local icon', () => {
  const credits = read('../public/photo-credits.html').toString();
  const publicEntries = readdirSync(new URL('../public/', import.meta.url), { recursive: true });
  assert.ok(publicEntries.every(path => !/\.(?:avif|bmp|gif|jpe?g|webp)$/i.test(path)));
  assert.doesNotMatch(html, /photos\//);
  assert.match(html, /href="photo-credits\.html"/);
  for (const id of [1, 15, 16, 20, 25, ...Array.from({ length: 10 }, (_, index) => 41 + index)]) {
    assert.equal(photos[id], undefined, `Photo ${id} is on hold`);
  }
  for (const [id, photo] of Object.entries(photos)) {
    assert.equal(new URL(photo.url).hostname, 'commons.wikimedia.org');
    assert.equal(new URL(photo.source).hostname, 'commons.wikimedia.org');
    assert.equal(new URL(photo.license).hostname, 'creativecommons.org');
    const credit = credits.split('\n').find(line => line.includes(`id="photo-${id}"`));
    assert.ok(credit?.includes(photo.license), `Missing license credit for photo ${id}`);
    assert.ok(credit.includes(photo.source), `Missing source credit for photo ${id}`);
  }
  for (const path of new Set(html.match(/icons\/[a-z0-9.-]+\.png/gi))) {
    assert.ok(read('../public/' + path).length > 0, path);
  }
});
