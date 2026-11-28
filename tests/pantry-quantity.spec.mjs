import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('keeps legacy fridge selections and compares known and unknown ingredient quantities', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('recipeLabPantryV1','["대파","양파"]'));
  await page.reload();
  await page.locator('#openFridge').click();
  await page.locator('#openPantryQuantities').click();
  const modal = page.getByRole('dialog',{name:'냉장고 수량 관리'});
  await expect(modal.getByRole('button',{name:'대파 · 수량 미확인'})).toBeVisible();
  await modal.getByRole('button',{name:'양파 · 수량 미확인'}).click();
  await modal.getByLabel('보유 수량').fill('0.25');
  await modal.getByLabel('보유 단위').fill('개');
  await modal.getByRole('button',{name:'수량 저장'}).click();
  await expect(modal.getByRole('button',{name:'양파 · 0.25 개'})).toBeVisible();
  expect(await modal.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect((await modal.getByRole('button',{name:'수량 저장'}).boundingBox()).height).toBeGreaterThanOrEqual(44);
  const dir = process.env.RECIPE_LAB_CAPTURE_DIR;
  if (dir) {
    await mkdir(dir,{recursive:true});
    await page.screenshot({path:join(dir,testInfo.project.name+'-pantry-quantity.png')});
  }
  await page.locator('#closePantryQuantities').click();
  const card = page.locator('#fridgeResults [data-recipe="54"]');
  await card.getByText('필요·보유·부족 수량',{exact:true}).click();
  await expect(card).toContainText('양파 · 필요 1 개 · 보유 0.25 개 · 부족 0.75 개');
  await expect(card).toContainText('대파 · 필요 1 대 · 보유 수량 미확인');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recipeLabPantryV1')))).toEqual(['대파','양파']);
  expect(errors).toEqual([]);
});

test('registers purchases after confirmation and deducts cooking usage once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('recipeLabShoppingV13','{"물|ml":{"label":"물 1,500 ml","done":true},"양파|개":{"label":"양파 0.5 개","done":true}}'));
  await page.locator('#v13Shopping').click();
  await page.locator('#registerPantryPurchases').click();
  const purchases = page.getByRole('dialog',{name:'구매한 재료를 냉장고에 등록'});
  await expect(purchases).toContainText('수량 또는 단위 직접 확인');
  await expect(purchases.getByLabel('양파 실제 구매량')).toHaveValue('1');
  page.once('dialog',dialog=>dialog.dismiss());
  await purchases.getByRole('button',{name:'양파 냉장고에 등록'}).click();
  await expect(purchases.getByRole('button',{name:'양파 냉장고에 등록'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await purchases.getByRole('button',{name:'양파 냉장고에 등록'}).click();
  await expect(purchases).toContainText('냉장고에 등록됨');
  await page.locator('#closePantryPurchases').click();
  await page.locator('#registerPantryPurchases').click();
  await expect(purchases.getByRole('button',{name:'양파 냉장고에 등록'})).toHaveCount(0);
  await page.locator('#closePantryPurchases').click();
  await page.locator('#v13Close').click();
  await page.locator('#search').fill('만원찜닭');
  await page.locator('#recipes [data-id="54"] .recipe-info').click();
  await page.getByRole('button',{name:'요리 시작'}).click();
  const cook = page.locator('#cookingMode');
  for (let i = 0; i < 8; i++) await cook.getByRole('button',{name:'다음 단계'}).click();
  await cook.getByRole('button',{name:'요리 완료'}).click();
  const amount = () => page.evaluate(() => JSON.parse(localStorage.getItem('recipeLabPantryQuantitiesV1')).stock.양파.amount);
  expect(await amount()).toBe(1);
  await expect(cook.locator('#cookingStockReview')).toContainText('닭볶음탕용 닭 · 필요 1 kg');
  page.once('dialog',dialog=>dialog.accept());
  const apply = cook.getByRole('button',{name:'확인 가능한 사용량 차감'});
  await apply.click();
  await expect(apply).toBeDisabled();
  expect(await amount()).toBe(0);
});

test('backs up, validates and restores all data while rejecting malformed files', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('recipeLabFavorites','[1]');
    localStorage.setItem('recipeLabPantryV1','["양파"]');
    localStorage.setItem('recipeLabMealPlanV1','{"family":3,"slots":{},"submitted":{}}');
  });
  const downloaded = page.waitForEvent('download');
  await page.locator('#backupAllData').click();
  const backup = await (await downloaded).path();
  await page.evaluate(() => localStorage.setItem('recipeLabFavorites','[2]'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#allDataFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  expect(await page.evaluate(()=>localStorage.getItem('recipeLabFavorites'))).toBe('[2]');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#allDataFile').setInputFiles(backup);
  await expect.poll(() => page.evaluate(()=>localStorage.getItem('recipeLabFavorites'))).toBe('[1]');
  await expect(page.locator('#recipes [data-id="1"] .heart')).toHaveClass(/saved/);
});
