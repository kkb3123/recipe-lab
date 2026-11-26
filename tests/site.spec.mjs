import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // External image availability is measured separately from UI regression tests.
  await page.route('https://commons.wikimedia.org/**', route => route.abort());
});

test('lists all recipes, searches, and filters by cuisine and chef', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const ranking = page.locator('.hero').getByRole('region', { name: '추천 레시피 TOP 5' });
  await expect(ranking).toBeVisible();
  await expect(ranking.locator('.rank')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(page.locator('#popularGrid')).toHaveCount(1);
  await ranking.getByRole('button').nth(1).click();
  await expect(page.locator('#detail').getByRole('heading', { name: '김치우동' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/open/);
  const cards = page.locator('#recipes .recipe');
  await expect(cards).toHaveCount(61);
  await page.locator('#search').fill('갈배제육볶음');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('갈배제육볶음');
  await page.locator('#search').press('Enter');
  await expect(page.getByRole('heading', { name: '검색 결과' })).toBeInViewport();
  await expect(page.locator('#recipeResults + #recipeDiscovery')).toHaveCount(1);
  await page.locator('#search').clear();
  await expect(page.locator('#recipeDiscovery + #recipeResults')).toHaveCount(1);
  await page.locator('#categories').getByRole('button', { name: '한식', exact: true }).click();
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(61);
  await page.locator('#categories').getByRole('button', { name: '전체', exact: true }).click();
  await page.locator('#chefs').getByRole('button', { name: '류수영', exact: true }).click();
  await expect(cards).toHaveCount(20);
  await page.locator('#sort').selectOption('quick');
  await expect(cards).toHaveCount(20);
  const credits = page.getByRole('link', { name: '사진 출처 및 라이선스' });
  await credits.click();
  await expect(page.getByRole('heading', { name: '사진 출처 및 라이선스' })).toBeVisible();
  await expect(page.locator('#photo-4')).toContainText('Cinnamontrees');
  await expect(page.locator('#photo-4').getByRole('link', { name: 'CC BY-SA 3.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0');
  expect(errors).toEqual([]);
});

test('reads legacy storage, scales recipe, and persists favorites and shopping', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('recipeLabFavorites')) {
      localStorage.setItem('recipeLabFavorites', '[1]');
      localStorage.setItem('recipeLabShoppingV13', '{"테스트|g":{"label":"테스트 10 g","done":false},"사과|개":{"label":"사과 0.5 개","done":true}}');
    }
  });
  await page.goto('/');
  const card = page.locator('#recipes [data-id="1"]');
  await expect(card.locator('.heart')).toHaveClass(/saved/);
  await card.locator('.recipe-info').click();
  const ingredient = page.locator('#detail .ingredient').first();
  const initialAmount = await ingredient.innerText();
  await page.locator('#plus').click();
  await expect(ingredient).not.toHaveText(initialAmount);
  await expect(page.locator('#detail .ingredient').filter({ hasText: '양파' }))
    .toContainText('0.75 개');
  await page.locator('.cook-steps input').first().check();
  await page.getByRole('button', { name: /장보기 목록에 담기/ }).click();
  await page.locator('#detailFav').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/open/);
  await page.locator('#v13Shopping').click();
  await page.locator('#v13Panel').getByText('테스트 10 g').click();
  await page.reload();
  await expect(card.locator('.heart')).not.toHaveClass(/saved/);
  await page.locator('#v13Shopping').click();
  await expect(page.locator('#v13Panel').getByRole('checkbox', { name: '테스트 10 g' })).toBeChecked();
  await expect(page.locator('#v13Panel').getByRole('checkbox', { name: '사과 1개 (필요량 0.5개)' })).toBeChecked();
  await expect(page.locator('#v13Panel').getByText('양파 1개 (필요량 0.75개)', { exact: true })).toBeVisible();
  await expect(page.locator('#v13Panel').getByText('다진 마늘 1.5 큰술', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem('recipeLabFavorites')),
    shopping: JSON.parse(localStorage.getItem('recipeLabShoppingV13')),
  }));
  expect(stored.favorites).toEqual([]);
  expect(stored.shopping['사과|개']).toEqual({ label: '사과 0.5 개', done: true });
  expect(stored.shopping['양파|개']).toEqual({ label: '양파 0.75 개', done: false });
  expect(stored.shopping['테스트|g']).toEqual({ label: '테스트 10 g', done: true });
  expect(Object.keys(stored.shopping).length).toBeGreaterThan(1);
  for (const value of Object.values(stored.shopping)) {
    expect(value).toEqual({ label: expect.any(String), done: expect.any(Boolean) });
  }
});

test('preserves mobile navigation and PWA assets without an active service worker', async ({ page, request }, testInfo) => {
  await page.goto('/?pwa=1');
  const tabs = page.locator('.mobile-tabs');
  if (testInfo.project.name === 'mobile') {
    await expect(tabs).toBeVisible();
    await tabs.locator('[data-tab="category"]').click();
    await expect(page.locator('#categoryGallery')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  } else {
    await expect(tabs).toBeHidden();
  }
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.start_url).toBe('./?pwa=1');
  for (const icon of manifest.icons) {
    const asset = await request.get('/' + icon.src);
    expect(asset.ok()).toBe(true);
    expect(asset.headers()['content-type']).toBe('image/png');
  }
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test('exports favorites and restores the existing backup format', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#recipes [data-id="1"] .heart').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#v13Backup').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('recipe-lab-favorites.json');
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup).toEqual({ app: 'recipe-lab', version: 1, favorites: [1] });

  page.on('dialog', dialog => dialog.accept());
  const reloaded = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  await page.locator('#v13File').setInputFiles({
    name: 'favorites.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, favorites: [2] })),
  });
  await reloaded;
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recipeLabFavorites'))).toBe('[2]');
  const favoritesButton = testInfo.project.name === 'mobile' ? '[data-tab="favorites"]' : '#favBtn';
  await page.locator(favoritesButton).click();
  await expect(page.locator('#recipes .recipe')).toHaveCount(1);
  await expect(page.locator('#recipes .recipe')).toHaveAttribute('data-id', '2');
});
