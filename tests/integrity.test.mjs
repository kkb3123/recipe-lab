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

test('publishes only attributed photo thumbnails and includes every referenced local icon', () => {
  const credits = read('../public/photo-credits.html').toString();
  const publicEntries = readdirSync(new URL('../public/', import.meta.url), { recursive: true });
  const images = publicEntries.filter(path => /\.(?:avif|bmp|gif|jpe?g|webp)$/i.test(path));
  assert.deepEqual(images.sort(), Object.values(photos).map(photo => photo.thumbnail).sort());
  assert.doesNotMatch(html, /photos\//);
  assert.match(html, /href="photo-credits\.html"/);
  for (const id of [1, 25, ...Array.from({ length: 10 }, (_, index) => 41 + index)]) {
    assert.equal(photos[id], undefined, `Photo ${id} is on hold`);
  }
  for (const [id, photo] of Object.entries(photos)) {
    assert.equal(photo.thumbnail, `assets/recipe-${id}.webp`);
    const thumbnail = read('../public/' + photo.thumbnail);
    assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP');
    assert.ok(thumbnail.length < 150_000, `Photo ${id} exceeds the image size budget`);
    const credit = credits.split('\n').find(line => line.includes(`id="photo-${id}"`));
    if (photo.rights === 'ai-generated') {
      assert.equal(photo.url, photo.thumbnail);
      assert.ok(photo.source.startsWith('https://github.com/kkb3123/recipe-lab/blob/main/docs/recipe-photo-queue.md#'));
      assert.match(photo.credit, /AI 생성/);
      assert.match(credit, /AI 생성 참고 이미지.*OpenAI ImageGen/);
      const original = recipes.find(recipe => String(recipe.id) === id).sourceUrl;
      if (original) assert.ok(credit.includes(new URL(original).hostname));
    } else {
      assert.equal(photo.rights, 'commons');
      assert.equal(new URL(photo.url).hostname, 'commons.wikimedia.org');
      assert.equal(new URL(photo.source).hostname, 'commons.wikimedia.org');
      assert.equal(new URL(photo.license).hostname, 'creativecommons.org');
      assert.ok(credit?.includes(photo.license), `Missing license credit for photo ${id}`);
      assert.ok(credit.includes(photo.source), `Missing source credit for photo ${id}`);
    }
  }
  for (const path of new Set(html.match(/icons\/[a-z0-9.-]+\.png/gi))) {
    assert.ok(read('../public/' + path).length > 0, path);
  }
});

function assertNewRecipe(recipe, photo) {
  for (const field of ['name', 'chef', 'difficulty', 'sourceTitle', 'tip', 'sourceNote']) {
    assert.ok(typeof recipe[field] === 'string' && recipe[field].trim(), `Missing ${field}`);
  }
  assert.ok(Number.isInteger(recipe.id) && recipe.id > 0, 'Invalid ID');
  assert.ok((recipe.baseServings === null && /인분.*미기재/.test(recipe.sourceNote)) || (Number.isInteger(recipe.baseServings) && recipe.baseServings > 0), 'Missing serving count');
  assert.ok(Number.isFinite(recipe.time) && recipe.time > 0, 'Missing cooking time');
  assert.ok(recipe.steps?.length && recipe.steps.every(step => typeof step === 'string' && step.trim()), 'Missing cooking steps');
  assert.ok(recipe.ingredients?.length && recipe.ingredients.every(item =>
    item.name?.trim() && (item.amount === null ? item.unit === "원문" && item.quantityText?.trim() : Number.isFinite(item.amount) && item.amount > 0) && item.unit?.trim()), 'Missing ingredient quantity');
  const source = new URL(recipe.sourceUrl);
  assert.equal(source.protocol, 'https:');
  assert.ok(!source.username && !source.password);
  assert.ok(source.hostname.endsWith('.kbs.co.kr') || source.hostname === 'kbs.co.kr' ||
    (source.hostname === 'www.youtube.com' && source.pathname === '/watch' && /^[\w-]{11}$/.test(source.searchParams.get('v') ?? '')),
  'Expected a KBS page or a specific YouTube video');
  assert.ok(photo?.credit && photo?.source && photo?.license && photo?.thumbnail, 'Missing documented photo permission');
}

test('checks required ingredients, original source URLs and photo credits for new recipes', () => {
  const baselineIds = new Set(baseline.map(item => item.id));
  const additions = recipes.filter(item => !baselineIds.has(item.id));
  assert.equal(new Set(additions.map(recipe => recipe.sourceUrl)).size, additions.length, 'Duplicate official post');
  for (const recipe of additions) assertNewRecipe(recipe, photos[recipe.id]);

  // Exercise the acceptance checks even when today's candidate list is empty.
  const sample = {
    id: 999, name: '테스트', chef: '테스트', difficulty: '쉬움', sourceTitle: '테스트',
    tip: '테스트', sourceNote: '테스트', baseServings: 1, time: 10,
    steps: ['테스트'], ingredients: [{ name: '테스트', amount: 1, unit: '개' }],
    sourceUrl: 'https://www.youtube.com/watch?v=91KSUbId_fE',
  };
  const photo = { credit: '테스트', source: '테스트', license: '테스트', thumbnail: '테스트' };
  assert.doesNotThrow(() => assertNewRecipe(sample, photo));
  assert.throws(() => assertNewRecipe({ ...sample, ingredients: [{ name: '테스트' }] }, photo), /quantity/);
  assert.throws(() => assertNewRecipe({ ...sample, sourceUrl: 'https://www.youtube.com/' }, photo), /specific YouTube/);
  assert.throws(() => assertNewRecipe({ ...sample, sourceUrl: 'http://vod.kbs.co.kr/' }, photo), /https/);
  assert.throws(() => assertNewRecipe(sample, null), /photo permission/);
});
