import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ingredientId, recommendRecipes, mergeShopping } from '../public/fridge-model.js';

const item = (name, amount = 1, unit = '개') => ({ name, amount, unit });

test('normalizes spaces and aliases while preserving different ingredients', () => {
  assert.equal(ingredientId(' 대 파 '), '대파');
  assert.equal(ingredientId('흰 우유'), ingredientId('우유'));
  assert.equal(ingredientId('계란'), ingredientId('달걀'));
  assert.notEqual(ingredientId('쪽파'), ingredientId('대파'));
  assert.notEqual(ingredientId('삼겹살'), ingredientId('돼지고기'));
});

test('sorts recommendations and keeps missing seasonings and substitutions explicit', () => {
  const recipes = [
    { id: 1, ingredients: [item('대파'), item('물'), item('감자'), item('양파')] },
    { id: 2, ingredients: [item('달걀'), item('소금'), { ...item('후추'), optional: true }] },
    { id: 3, ingredients: [item('계란')] },
    { id: 4, ingredients: [item('대파'), item('달걀')] },
  ];
  const results = recommendRecipes(recipes, new Set(['달걀', '쪽파']));
  assert.deepEqual(results.map(r => r.recipe.id), [3, 2, 4, 1]);
  assert.equal(results[0].complete, true);
  assert.equal(results[1].complete, false);
  assert.equal(results[1].percent, 50);
  assert.deepEqual(results[1].missing.map(i => i.name), ['소금']);
  assert.deepEqual(results[2].missing[0].alternatives, ['쪽파']);
  assert.equal(results[2].complete, false);
});

test('combines only compatible quantities without changing legacy keys and other items', () => {
  const existing = { '물|ml': { label: '물 250 ml', done: false }, '양파|개': { label: '양파 0.5 개', done: true } };
  const merged = mergeShopping(existing, [item('물', .8, 'L'), item('물', 100, 'ml'), item('물', 2, 'g')]);
  assert.deepEqual(merged, { ...existing, '물|ml': { label: '물 1150 ml', done: false }, '물|g': { label: '물 2 g', done: false } });
  assert.equal(existing['물|ml'].label, '물 250 ml');
  assert.throws(() => mergeShopping({ '물|ml': { label: '직접 입력', done: false } }, [item('물', 100, 'ml')]));
});
