import { ingredientId } from './fridge-model.js';

export const quantityKey = 'recipeLabPantryQuantitiesV1';
export const emptyQuantities = () => ({ stock: {}, receipts: {} });
const measures = new Map([
  ['mg',['mass',.001]], ['g',['mass',1]], ['kg',['mass',1000]],
  ['ml',['volume',1]], ['L',['volume',1000]],
]);
export const roundQuantity = amount => Number(amount.toFixed(6));

export function convertQuantity(amount, from, to) {
  if (from === to) return amount;
  const a = measures.get(from), b = measures.get(to);
  return a && b && a[0] === b[0] ? amount * a[1] / b[1] : null;
}

export function compareNeeds(items, stock) {
  const groups = [];
  for (const item of items) {
    const id = ingredientId(item.name);
    const same = item.amount === null ? null : groups.find(row => row.id === id &&
      row.amount !== null && convertQuantity(item.amount, item.unit, row.unit) !== null);
    if (same) same.amount = roundQuantity(same.amount + convertQuantity(item.amount, item.unit, same.unit));
    else groups.push({ ...item, ...(item.amount === null ? {} : { amount: roundQuantity(item.amount) }), id });
  }
  // Allocate known stock just once per compatible unit group.
  return groups.map(item => {
    const stored = Object.hasOwn(stock,item.id) ? stock[item.id] : null;
    const available = stored && convertQuantity(stored.amount, stored.unit, item.unit);
    const shortage = item.amount === null || available === null ? null : roundQuantity(Math.max(0, item.amount - available));
    return { ...item, stored, available, shortage };
  });
}

export function purchaseFromEntry(key, entry) {
  if (!entry?.done || typeof entry.label !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 2) return null;
  const [labelName, unit] = parts;
  if (!labelName || !unit || !entry.label.startsWith(labelName + ' ') || !entry.label.endsWith(' ' + unit)) return null;
  const quantity = entry.label.slice(labelName.length + 1, -unit.length - 1);
  if (!/^\d+(?:\.\d+)?$/.test(quantity) || Number(quantity) <= 0 || !Number.isFinite(Number(quantity))) return null;
  const name = labelName.replace(/ \(식단(?: \d+)?\)$/u, '');
  return { key, name, id: ingredientId(name), amount: Number(quantity), unit };
}

export function recordPurchase(state, purchase) {
  if (Object.hasOwn(state.receipts,purchase.key)) return null;
  const current = Object.hasOwn(state.stock,purchase.id) ? state.stock[purchase.id] : null;
  const added = current ? convertQuantity(purchase.amount, purchase.unit, current.unit) : purchase.amount;
  if (added === null) return null;
  return { stock: { ...state.stock, [purchase.id]: {
    amount: roundQuantity((current?.amount ?? 0) + added), unit: current?.unit ?? purchase.unit,
  } }, receipts: { ...state.receipts, [purchase.key]: true } };
}

export function usageFromRecipe(recipe, servings) {
  const factor = recipe.baseServings === null ? 1 : servings / recipe.baseServings;
  return recipe.ingredients.map(item => ({ ...item, amount: item.amount === null ? null : item.amount * factor }));
}

export function deductKnownStock(state, needs) {
  const stock = { ...state.stock };
  let count = 0;
  for (const item of compareNeeds(needs.filter(i => !i.optional), stock)) {
    if (!item.stored || item.shortage !== 0) continue;
    const amount = convertQuantity(item.amount,item.unit,item.stored.unit);
    stock[item.id] = { ...item.stored, amount: roundQuantity(Math.max(0,item.stored.amount - amount)) };
    count++;
  }
  return { state: { ...state, stock }, count };
}
