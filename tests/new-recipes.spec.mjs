import { expect, test } from '@playwright/test';

test('new recipes show their official sources, local generated images and scaled ingredients', async ({ page }) => {
  await page.route('https://commons.wikimedia.org/**', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const search = page.locator('#search');
  for (const recipe of [
    { id: 52, query: '어묵국수', source: '1378729', ingredient: '사각어묵', adjusted: '300 g' },
    { id: 53, query: '아보카도 연어덮밥', source: '1091532', ingredient: '연어', adjusted: '600 g' },
  ]) {
    await search.fill(recipe.query);
    const card = page.locator(`#recipes [data-id="${recipe.id}"]`);
    await expect(card.getByText('AI 생성 참고 이미지', { exact: true })).toBeVisible();
    const image = card.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    await card.locator('.recipe-info').click();
    await expect(page.locator('#detail .source-link')).toHaveAttribute('href', new RegExp('^https://pbbs\\.kbs\\.co\\.kr/clip/read\\.html.*&id=' + recipe.source));
    await expect(page.locator('#detail #photoCredit')).toContainText('AI 생성 참고 이미지');
    await page.locator('#plus').click();
    await expect(page.locator('#detail .ingredient').filter({ hasText: recipe.ingredient }).first())
      .toContainText(recipe.adjusted);
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).not.toHaveClass(/open/);
  }
  expect(errors).toEqual([]);
});
