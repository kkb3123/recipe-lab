import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('selects, saves, removes and clears ingredients without horizontal overflow', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#openFridge').click();
  const fridge = page.locator('#fridgeDialog');
  await fridge.locator('#fridgeSearch').fill('대 파');
  await fridge.getByRole('button', { name: '대파', exact: true }).click();
  await expect(fridge.getByRole('button', { name: '대파 삭제', exact: true })).toBeVisible();
  await page.goto('/?pwa=1');
  await page.reload();
  await page.locator('#openFridge').click();
  await expect(fridge.getByRole('button', { name: '대파 삭제', exact: true })).toBeVisible();
  expect(await fridge.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const dir = process.env.RECIPE_LAB_CAPTURE_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, testInfo.project.name + '-fridge.png') });
  }
  await fridge.getByRole('button', { name: '대파 삭제', exact: true }).click();
  await expect(fridge.locator('#fridgeResults')).toContainText('보유 재료를 선택');
  await fridge.locator('#fridgeSearch').fill('양파');
  await fridge.getByRole('button', { name: '양파', exact: true }).click();
  await fridge.locator('#fridgeClear').click();
  await expect(fridge.locator('#fridgePicked button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('adds missing original amounts and preserves legacy data and cooking-mode quantities', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('recipeLabFavorites', '[1]');
    localStorage.setItem('recipeLabShoppingV13', JSON.stringify({
      '사과|개': { label: '사과 0.5 개', done: true },
      '물|L': { label: '물 0.25 L', done: false },
    }));
  });
  await page.reload();
  await page.locator('#openFridge').click();
  await page.locator('#fridgeSearch').fill('대파');
  await page.locator('#fridgeChoices').getByRole('button', { name: '대파', exact: true }).click();
  const card = page.locator('#fridgeResults [data-recipe="54"]');
  await expect(card).toContainText('방송 원본 분량');
  await expect(card.locator('img')).toHaveAttribute('src', 'assets/recipe-54.webp');
  await expect(card.getByRole('button', { name: '고춧가루 장보기 추가' })).toHaveCount(0);
  await card.getByRole('button', { name: '물 장보기 추가', exact: true }).click();
  await card.getByRole('button', { name: '부족한 재료 모두 장보기에 담기' }).click();
  const stored = await page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem('recipeLabFavorites')),
    shopping: JSON.parse(localStorage.getItem('recipeLabShoppingV13')),
  }));
  expect(stored.favorites).toEqual([1]);
  expect(stored.shopping['사과|개']).toEqual({ label: '사과 0.5 개', done: true });
  expect(stored.shopping['물|L']).toEqual({ label: '물 1.15 L', done: false });
  expect(stored.shopping['대파|대']).toBeUndefined();
  await card.getByRole('button', { name: '만원찜닭', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('방송 원본 분량');
  await expect(page.locator('#minus')).toBeDisabled();
  await expect(page.locator('#plus')).toBeDisabled();
  await expect(page.locator('#detail .ingredient').first()).toContainText('1 kg');
  await page.getByRole('button', { name: '요리 시작' }).click();
  await expect(page.locator('#cookingMode')).toBeVisible();
  await expect(page.locator('#cookingIngredientHeading')).toContainText('방송 원본 분량');
  await page.locator('#cookingIngredientsDetails summary').click();
  await expect(page.locator('#cookingAllIngredients')).toContainText('1 kg');
  await page.locator('#cookingExit').click();
  await page.getByRole('button', { name: /장보기 목록에 담기/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipeLabShoppingV13'))['물|ml'].label)).toBe('물 900 ml');
});
