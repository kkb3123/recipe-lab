import { mergeShopping } from './fridge-model.js';

export const mealPlanKey = 'recipeLabMealPlanV1';
export const meals = ['아침', '점심', '저녁'];
export const emptyPlan = () => ({ family: 2, slots: {}, submitted: {} });

export function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

export function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days, 12));
}

export function monday(key) {
  const weekday = new Date(key + 'T12:00:00').getDay();
  return shiftDate(key, -(weekday + 6) % 7);
}

export function copyPreviousWeek(slots, start) {
  const result = { ...slots };
  for (let i = 0; i < 7; i++) {
    for (const meal of meals) {
      const target = shiftDate(start, i) + '/' + meal;
      const old = slots[shiftDate(start, i - 7) + '/' + meal];
      if (old && !result[target]) result[target] = { ...old };
    }
  }
  return result;
}

export function entriesFor(plan, dates, recipes) {
  const selected = new Set(dates);
  return Object.entries(plan.slots).flatMap(([key, slot]) => {
    const recipe = recipes.get(slot.id);
    if (!selected.has(key.split('/')[0]) || !recipe) return [];
    const servings = recipe.baseServings === null ? null : slot.servings ?? plan.family;
    const factor = servings === null ? 1 : servings / recipe.baseServings;
    const signature = JSON.stringify([slot.id, servings]);
    return [{ key, signature, recipe, servings, items: recipe.ingredients.filter(i => !i.optional).map(i => ({
      ...i, amount: i.amount === null ? null : i.amount * factor,
    })) }];
  });
}

export function shoppingFor(entries) {
  const numeric = entries.flatMap(e => e.items.filter(i => i.amount !== null));
  const qualitative = new Map();
  for (const entry of entries) {
    for (const item of entry.items.filter(i => i.amount === null)) {
      const key = item.name + '|원문';
      const labels = qualitative.get(key) ?? [];
      labels.push(item.quantityText);
      qualitative.set(key, labels);
    }
  }
  return {
    ...mergeShopping({}, numeric),
    ...Object.fromEntries([...qualitative].map(([key, labels]) => [
      key, { label: key.split('|')[0] + ' ' + labels.join(' / '), done: false },
    ])),
  };
}

export function appendMealShopping(existing, batch) {
  const shopping = { ...existing };
  for (const [key, item] of Object.entries(batch)) {
    let destination = key;
    let label = item.label;
    const [name, unit] = key.split('|');
    let number = 1;
    // Keep the legacy name|unit key and preserve prior shopping entries.
    while (Object.hasOwn(shopping, destination)) {
      const batchName = name + (number === 1 ? ' (식단)' : ' (식단 ' + number + ')');
      destination = batchName + '|' + unit;
      label = batchName + item.label.slice(name.length);
      number++;
    }
    shopping[destination] = { ...item, label };
  }
  return shopping;
}
