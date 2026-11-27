import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('edits, moves, copies, restores and deletes meals by calendar date', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#openMealPlan').click();
  const plan = page.getByRole('dialog', { name: '일주일 식단' });
  await expect(plan).toBeVisible();
  await plan.getByLabel('기준 날짜', { exact: true }).fill('2026-11-23');
  await plan.getByLabel('기본 가족 인분').fill('4');
  await plan.getByRole('button', { name: '가족 인분 저장' }).click();
  await plan.getByRole('button', { name: '2026-11-23 아침 · 메뉴 추가' }).click();
  await plan.getByLabel('레시피', { exact: true }).selectOption('62');
  await plan.getByRole('button', { name: '끼니 저장' }).click();
  const entry = plan.getByRole('button', { name: '2026-11-23 아침 · 우유 버터 봉골레 · 4인분' });
  await expect(entry).toBeVisible();
  await entry.click();
  await plan.getByLabel('끼니 날짜').fill('2026-11-24');
  await plan.getByLabel('끼니 인분').fill('3');
  await plan.getByRole('button', { name: '끼니 저장' }).click();
  const moved = plan.getByRole('button', { name: '2026-11-24 아침 · 우유 버터 봉골레 · 3인분' });
  await expect(moved).toBeVisible();
  await expect(entry).toHaveCount(0);
  await page.reload();
  await page.locator('#openMealPlan').click();
  await plan.getByLabel('기준 날짜', { exact: true }).fill('2026-11-23');
  await expect(moved).toBeVisible();
  await plan.getByRole('button', { name: '다음 주' }).click();
  await plan.getByRole('button', { name: '지난주 메뉴 복사' }).click();
  const copied = plan.getByRole('button', { name: '2026-12-01 아침 · 우유 버터 봉골레 · 3인분' });
  await expect(copied).toBeVisible();
  expect(await plan.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  if (process.env.RECIPE_LAB_CAPTURE_DIR) {
    const dir = process.env.RECIPE_LAB_CAPTURE_DIR;
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, testInfo.project.name + '-meal-plan.png') });
  }
  await copied.click();
  await plan.getByRole('button', { name: '끼니 삭제' }).click();
  await expect(copied).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('plans from favorites and fridge, preserves original portions and deduplicates weekly shopping', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('recipeLabFavorites', '[54]');
    localStorage.setItem('recipeLabPantryV1', '["대파"]');
    localStorage.setItem('recipeLabShoppingV13', '{"물|ml":{"label":"물 500 ml","done":true}}');
  });
  await page.reload();
  await page.locator('#openMealPlan').click();
  const plan = page.locator('#mealPlan');
  await plan.getByLabel('기준 날짜', { exact: true }).fill('2026-11-23');
  await plan.getByRole('button', { name: '2026-11-23 저녁 · 메뉴 추가' }).click();
  await plan.getByLabel('레시피 보기').selectOption('favorites');
  await expect(plan.locator('#mealRecipe option')).toHaveCount(2);
  await plan.getByLabel('레시피 보기').selectOption('fridge');
  await expect(plan.locator('#mealRecipe option', { hasText: '만원찜닭' })).toHaveCount(1);
  await plan.getByLabel('레시피', { exact: true }).selectOption('54');
  await expect(plan.getByLabel('끼니 인분')).toBeDisabled();
  await plan.getByRole('button', { name: '끼니 저장' }).click();
  await expect(plan.getByRole('button', { name: /만원찜닭 · 방송 원본 분량/ })).toBeVisible();
  await plan.getByLabel('장보기 기간').selectOption('day');
  await expect(plan.locator('#mealShopping')).toContainText('물 900 ml');
  await expect(plan.locator('#mealShopping')).toContainText('대파 1 대');
  await plan.locator('#mealShopAdd').click();
  await plan.getByLabel('장보기 기간').selectOption('week');
  await plan.locator('#mealShopAdd').click();
  await expect(plan.locator('#mealStatus')).toContainText('새로 담을 식단 재료가 없어요');
  const stored = await page.evaluate(() => ({
    favorites: localStorage.getItem('recipeLabFavorites'),
    shopping: JSON.parse(localStorage.getItem('recipeLabShoppingV13')),
  }));
  expect(stored.favorites).toBe('[54]');
  expect(stored.shopping['물|ml']).toEqual({ label: '물 500 ml', done: true });
  expect(stored.shopping['물 (식단)|ml']).toEqual({ label: '물 (식단) 900 ml', done: false });
  expect(Object.keys(stored.shopping).filter(key => key.endsWith('|ml') && key.startsWith('물'))).toHaveLength(2);
});

test('shows source-verified partial cooking quantities at the chosen serving count', async ({ page }) => {
  await page.goto('/');
  await page.locator('#search').fill('우유 버터 봉골레');
  await page.locator('#recipes [data-id="62"] .recipe-info').click();
  await page.locator('#plus').click();
  await page.getByRole('button', { name: '요리 시작' }).click();
  await page.getByRole('button', { name: '다음 단계' }).click();
  await expect(page.locator('#cookingIngredients')).toContainText('단계 투입량 · 버터 30 g');
  await page.locator('#cookingIngredientsDetails summary').click();
  await expect(page.locator('#cookingAllIngredients')).toContainText('버터 60 g');
});
