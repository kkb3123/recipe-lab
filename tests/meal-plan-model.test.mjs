import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendMealShopping, copyPreviousWeek, emptyPlan, entriesFor, monday, shiftDate, shoppingFor } from '../public/meal-plan-model.js';

test('navigates Monday-based calendar weeks across month and year boundaries', () => {
  assert.equal(monday('2027-01-03'), '2026-12-28');
  assert.equal(shiftDate('2026-12-28', 7), '2027-01-04');
  const source = { id: 3, servings: 4 };
  assert.deepEqual(copyPreviousWeek({ '2026-12-28/아침': source, '2027-01-04/아침': { id: 4 }, '2026-12-28/저녁': source }, '2027-01-04')['2027-01-04/저녁'], source);
  assert.deepEqual(copyPreviousWeek({ '2026-12-28/아침': source, '2027-01-04/아침': { id: 4 } }, '2027-01-04')['2027-01-04/아침'], { id: 4 });
});

test('aggregates same and compatible units, keeps original amounts and prior checked entries', () => {
  const recipes = new Map([
    [1, { id: 1, baseServings: 2, ingredients: [{ name: '물', amount: 200, unit: 'ml' }, { name: '감자', amount: 2, unit: '개' }] }],
    [2, { id: 2, baseServings: null, ingredients: [{ name: '물', amount: 1, unit: 'L' }, { name: '감자', amount: 300, unit: 'g' }] }],
  ]);
  const plan = { ...emptyPlan(), family: 4, slots: { '2026-11-23/아침': { id: 1 }, '2026-11-24/점심': { id: 2, servings: 8 } } };
  const entries = entriesFor(plan, ['2026-11-23', '2026-11-24'], recipes);
  assert.equal(entries[1].servings, null);
  const batch = shoppingFor(entries);
  assert.equal(batch['물|ml'].label, '물 1400 ml');
  assert.equal(batch['감자|개'].label, '감자 4 개');
  assert.equal(batch['감자|g'].label, '감자 300 g');
  const old = { '물|ml': { label: '물 500 ml', done: true } };
  const appended = appendMealShopping(old, batch);
  assert.deepEqual(appended['물|ml'], old['물|ml']);
  assert.deepEqual(appended['물 (식단)|ml'], { label: '물 (식단) 1400 ml', done: false });
});
