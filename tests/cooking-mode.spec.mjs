import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://commons.wikimedia.org/**', route => route.abort());
});

test('cooks one step at a time with scaled ingredients and completes the recipe', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const capture = process.env.RECIPE_LAB_CAPTURE_DIR;
  if (capture) {
    await mkdir(capture, { recursive: true });
    await expect(page.locator('#splash')).toBeHidden();
    await page.screenshot({ path: join(capture, `${testInfo.project.name}-home.png`) });
  }
  await page.locator('#search').fill('김치우동');
  await page.locator('#recipes [data-id="1"]').click();
  await page.locator('#plus').click();
  await page.getByRole('button', { name: '요리 시작' }).click();
  const mode = page.getByRole('dialog', { name: '김치우동' });
  await expect(mode).toBeVisible();
  await expect(mode.locator('#cookingProgress')).toHaveText('1 / 4단계');
  await expect(mode.locator('#cookingIngredientHeading')).toContainText('3인분');
  await expect(mode.locator('#cookingIngredients')).toContainText('식용유 1.5 큰술');
  await expect(mode.getByRole('button', { name: '이전 단계' })).toBeDisabled();
  await mode.getByRole('button', { name: '큰 글씨' }).click();
  await expect(mode.getByRole('button', { name: '큰 글씨' })).toHaveAttribute('aria-pressed', 'true');
  if (capture) await page.screenshot({ path: join(capture, `${testInfo.project.name}-cooking.png`) });
  await mode.getByRole('button', { name: '다음 단계' }).click();
  await expect(mode.locator('#cookingIngredients')).toContainText('양파 0.75 개');
  await mode.getByRole('button', { name: '이전 단계' }).click();
  await expect(mode.locator('#cookingProgress')).toHaveText('1 / 4단계');
  for (let i = 0; i < 3; i++) await mode.getByRole('button', { name: '다음 단계' }).click();
  await mode.getByRole('button', { name: '요리 완료' }).click();
  await expect(page.getByRole('heading', { name: '요리 완료' })).toBeVisible();
  await page.getByRole('button', { name: '레시피로 돌아가기', exact: true }).click();
  await expect(page.locator('#cookingMode')).toBeHidden();
  await expect(page.locator('#detail').getByText('3인분')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps the timer across steps, pauses, resumes, expires and resets', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#search').fill('김치우동');
  await page.locator('#recipes [data-id="1"]').click();
  await page.getByRole('button', { name: '요리 시작' }).click();
  const mode = page.locator('#cookingMode');
  const clock = mode.getByRole('timer');
  await expect(mode.getByRole('button', { name: '3분', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: '5분', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: '10분', exact: true })).toBeVisible();
  await mode.getByRole('button', { name: '1분', exact: true }).click();
  await mode.getByRole('button', { name: '시작' }).click();
  await page.clock.fastForward(10000);
  await mode.getByRole('button', { name: '다음 단계' }).click();
  await expect(clock).toHaveText(/00:50|00:49/);
  await mode.getByRole('button', { name: '일시정지' }).click();
  const paused = await clock.innerText();
  await page.clock.fastForward(5000);
  await expect(clock).toHaveText(paused);
  await mode.getByRole('button', { name: '재개' }).click();
  await page.clock.fastForward(60000);
  await expect(clock).toHaveText('00:00');
  await expect(mode.getByText('타이머가 끝났어요.')).toBeVisible();
  await mode.getByLabel('시간(분)').fill('0.1');
  await mode.getByRole('button', { name: '시작' }).click();
  await expect(clock).toHaveText('00:06');
  await mode.getByRole('button', { name: '초기화' }).click();
  await expect(clock).toHaveText('00:00');
  await mode.getByRole('button', { name: '전체 레시피로 돌아가기' }).click();
  await expect(mode).toBeHidden();
});

test('falls back to the recipe name when an image fails and shows search feedback', async ({ page }) => {
  await page.goto('/');
  const search = page.locator('#search');
  await search.fill('된장찌개');
  const image = page.locator('#recipes [data-id="3"] img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.route('**/assets/recipe-3.webp', route => route.abort());
  await page.reload();
  await search.fill('된장찌개');
  const card = page.locator('#recipes [data-id="3"]');
  await expect(card.locator('.food-placeholder')).toBeVisible();
  await card.click();
  const photo = page.locator('#detail .detail-photo');
  await expect(photo.locator('img')).toHaveCount(0);
  await expect(photo.locator('.food-placeholder')).toBeVisible();
  await page.keyboard.press('Escape');
  await search.fill('요리검색결과없음');
  await expect(page.locator('#empty')).toBeVisible();
  await search.fill('새우젓');
  await expect(page.locator('#recipes [data-id="46"]')).toBeVisible();
  await search.fill('류수영');
  await expect(page.locator('#recipes .recipe')).toHaveCount(28);
});
