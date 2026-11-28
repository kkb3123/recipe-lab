import { renderQuantityComparison } from './pantry-quantity.js';
import { fridgeKey, buildIngredientCatalog, categories, recommendRecipes, mergeShopping } from './fridge-model.js';

const dialog = document.querySelector('#fridgeDialog');
const lookup = id => document.getElementById(id);
const picked = lookup('fridgePicked');
const choices = lookup('fridgeChoices');
const groups = lookup('fridgeResults');
const search = lookup('fridgeSearch');
const category = lookup('fridgeCategory');
const status = lookup('fridgeStatus');
const catalog = buildIngredientCatalog(R);
const names = new Map(catalog.map(item => [item.id, item.name]));
const queued = new Set();
window.addEventListener('recipe-pantry-updated', () => {
  try { selected = new Set(JSON.parse(localStorage.getItem(fridgeKey) || '[]')); } catch {}
  if (dialog.open) { renderChoices(); renderResults(); }
});
let selected;
try {
  const stored = JSON.parse(localStorage.getItem(fridgeKey) || '[]');
  selected = new Set(Array.isArray(stored) ? stored.filter(id => names.has(id)) : []);
} catch {
  selected = new Set();
}

function button(label, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.onclick = action;
  return element;
}

function save() {
  try {
    localStorage.setItem(fridgeKey, JSON.stringify([...selected]));
    status.textContent = '';
  } catch {
    status.textContent = '이 브라우저에 보유 재료를 저장할 수 없어요.';
  }
  renderChoices();
  renderResults();
}

function renderChoices() {
  const query = search.value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  picked.replaceChildren(...[...selected].map(id =>
    button(names.get(id) + ' 삭제', () => { selected.delete(id); save(); })));
  lookup('fridgeClear').disabled = selected.size === 0;
  const filtered = catalog.filter(item => (category.value === '전체' || category.value === item.category) &&
    (!query || item.id.includes(query) || item.name.replace(/\s+/gu, '').includes(query)));
  choices.replaceChildren(...filtered.map(item => {
    const control = button(item.name, () => {
      if (selected.has(item.id)) selected.delete(item.id);
      else selected.add(item.id);
      const index = filtered.indexOf(item);
      save();
      choices.children[index]?.focus();
    });
    control.setAttribute('aria-pressed', String(selected.has(item.id)));
    return control;
  }));
  if (!filtered.length) choices.textContent = '검색 결과가 없어요.';
}

function addMissing(recipe, missing) {
  const ready = missing.filter(item => !queued.has(`${recipe.id}:${item.id}`));
  if (!ready.length) return;
  try {
    const current = JSON.parse(localStorage.getItem('recipeLabShoppingV13') || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Unexpected shopping data');
    localStorage.setItem('recipeLabShoppingV13', JSON.stringify(mergeShopping(current, ready.flatMap(item => item.items))));
    for (const item of ready) queued.add(`${recipe.id}:${item.id}`);
    status.textContent = `${ready.length}개 재료를 장보기에 담았어요.`;
    updateButtons();
  } catch {
    status.textContent = '장보기 목록을 읽거나 저장할 수 없어요. 기존 항목은 그대로 두었습니다.';
  }
}

function updateButtons() {
  for (const control of groups.querySelectorAll('[data-queue]')) {
    const keys = JSON.parse(control.dataset.queue);
    control.disabled = keys.every(key => queued.has(key));
  }
}

function queueButton(label, recipe, items) {
  const control = button(label, () => addMissing(recipe, items));
  control.dataset.queue = JSON.stringify(items.map(item => `${recipe.id}:${item.id}`));
  return control;
}

function renderCard(result) {
  const { recipe, missing, percent, complete } = result;
  const card = document.createElement('article');
  card.className = 'fridge-card';
  card.dataset.recipe = recipe.id;
  const picture = document.createElement('div');
  picture.className = 'fridge-picture';
  picture.textContent = recipe.name;
  const photo = REVIEWED_PHOTOS[recipe.id];
  if (photo) {
    const img = document.createElement('img');
    img.src = photo.thumbnail || photo.url;
    img.alt = recipe.name + (photo.rights === 'ai-generated' ? ' AI 생성 참고 이미지' : ' 참고 이미지');
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    picture.append(img);
  }
  const title = document.createElement('h4');
  title.append(button(recipe.name, () => {
    dialog.close();
    openRecipe(recipe.id);
  }));
  const meta = document.createElement('p');
  meta.textContent = `${recipe.time}분 · 재료 충족률 ${percent}%${recipe.baseServings === null ? ' · 방송 원본 분량' : ''}`;
  const coverage = document.createElement('p');
  coverage.textContent = complete ? '필수 재료 종류가 모두 있어요.' :
    `부족한 필수 재료 ${missing.length}개`;
  card.append(picture, title, meta, coverage, button('식단에 담기', () => {
    dialog.close();
    window.addFridgeRecipeToPlan(recipe.id);
  }));
  if (photo?.rights === 'ai-generated') {
    const credit = document.createElement('small');
    credit.textContent = 'AI 생성 참고 이미지';
    card.append(credit);
  }
  if (missing.length) {
    const list = document.createElement('ul');
    for (const item of missing) {
      const line = document.createElement('li');
      const label = item.name + (item.seasoning ? ' (기본 양념)' : '') +
        (item.alternatives.length ? ` · 대체 후보 ${item.alternatives.map(id => names.get(id)).join(', ')}` : '');
      line.append(label, queueButton(item.name + ' 장보기 추가', recipe, [item]));
      list.append(line);
    }
    card.append(list, queueButton('부족한 재료 모두 장보기에 담기', recipe, missing));
  }
  const quantities = document.createElement('details');
  const quantityLabel = document.createElement('summary');
  quantityLabel.textContent = '필요·보유·부족 수량';
  const quantityList = document.createElement('div');
  quantities.append(quantityLabel,quantityList);
  quantities.ontoggle = () => {
    if (quantities.open) renderQuantityComparison(quantityList,recipe.ingredients);
  };
  card.append(quantities);
  const optional = recipe.ingredients.filter(item => item.optional).map(item => item.name);
  if (optional.length) {
    const note = document.createElement('p');
    note.textContent = '선택 재료 · ' + optional.join(', ');
    card.append(note);
  }
  return card;
}

function renderResults() {
  groups.replaceChildren();
  if (!selected.size) {
    groups.textContent = '보유 재료를 선택하면 추천 레시피를 볼 수 있어요.';
    return;
  }
  const results = recommendRecipes(R, selected);
  for (const [group, label] of ['주재료가 모두 있는 요리', '필수 재료 1~2개만 부족한 요리', '기타 추천 요리'].entries()) {
    const entries = results.filter(result => result.group === group);
    if (!entries.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = label;
    const cards = document.createElement('div');
    cards.className = 'fridge-cards';
    cards.append(...entries.map(renderCard));
    groups.append(heading, cards);
  }
  updateButtons();
}

for (const name of ['전체', ...categories]) category.add(new Option(name, name));
category.onchange = renderChoices;
search.oninput = renderChoices;
lookup('fridgeClear').onclick = () => { selected.clear(); save(); };
lookup('openFridge').onclick = () => {
  renderChoices();
  renderResults();
  dialog.showModal();
  search.focus();
};
lookup('closeFridge').onclick = () => dialog.close();
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') event.stopPropagation();
});
