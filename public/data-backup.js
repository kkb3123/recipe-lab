import { fridgeKey } from './fridge-model.js';
import { mealPlanKey, meals } from './meal-plan-model.js';
import { quantityKey } from './pantry-quantity-model.js';

const favoritesKey = 'recipeLabFavorites';
export const shoppingKey = 'recipeLabShoppingV13';
const keys = [favoritesKey, shoppingKey, fridgeKey, quantityKey, mealPlanKey];
const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const safe = text => typeof text === 'string' && text.length > 0 && text.length <= 512 &&
  !['__proto__','prototype','constructor'].includes(text);
const id = value => Number.isSafeInteger(value) && value > 0;
const portion = value => Number.isInteger(value) && value >= 1 && value <= 30;
const slotKey = key => {
  const match = /^(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(key);
  if (!match || !meals.includes(match[2])) return false;
  const date = new Date(match[1] + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === match[1];
};
const map = (value,test) => plain(value) && Object.entries(value).every(([key,val]) => safe(key) && test(val,key));
const validators = {
  [favoritesKey]: x => Array.isArray(x) && x.every(id),
  [shoppingKey]: x => map(x, v => plain(v) && safe(v.label) && typeof v.done === 'boolean'),
  [fridgeKey]: x => Array.isArray(x) && x.every(safe),
  [quantityKey]: x => plain(x) && map(x.stock, v => plain(v) && Number.isFinite(v.amount) &&
    v.amount >= 0 && safe(v.unit)) && map(x.receipts, v => v === true),
  [mealPlanKey]: x => plain(x) && portion(x.family) && map(x.slots, (v,k) => slotKey(k) &&
    plain(v) && id(v.id) && (v.servings === null || portion(v.servings))) &&
    map(x.submitted, (v,k) => slotKey(k) && Array.isArray(v) && v.every(safe)),
};

export function exportBackup(storage) {
  return { app: 'recipe-lab', version: 2, data: Object.fromEntries(keys.map(key =>
    [key, JSON.parse(storage.getItem(key) ?? 'null')])) };
}

export function validateBackup(payload) {
  if (!plain(payload) || payload.app !== 'recipe-lab') throw Error('레시피 연구소 백업 파일이 아닙니다.');
  if (payload.version === 1 && validators[favoritesKey](payload.favorites)) return { [favoritesKey]: payload.favorites };
  if (payload.version !== 2 || !plain(payload.data) ||
      Object.keys(payload.data).length !== keys.length ||
      !keys.every(key => Object.hasOwn(payload.data,key) &&
        (payload.data[key] === null || validators[key](payload.data[key])))) {
    throw Error('지원하지 않거나 손상된 백업입니다.');
  }
  return payload.data;
}

export function writeStorage(storage, updates) {
  const previous = Object.fromEntries(Object.keys(updates).map(key => [key,storage.getItem(key)]));
  const written = [];
  try {
    for (const [key,value] of Object.entries(updates)) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key,JSON.stringify(value));
      written.push(key);
    }
  } catch (error) {
    // Restore only the keys already changed by this transaction.
    for (const key of written.reverse()) {
      if (previous[key] === null) storage.removeItem(key);
      else storage.setItem(key,previous[key]);
    }
    throw error;
  }
}

export function importBackup(storage, payload) {
  writeStorage(storage,validateBackup(payload));
}
