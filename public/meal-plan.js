import { fridgeKey, recommendRecipes } from './fridge-model.js';
import { appendMealShopping, copyPreviousWeek, dateKey, emptyPlan, entriesFor, mealPlanKey, meals, monday, shiftDate, shoppingFor } from './meal-plan-model.js';

const $meal = id => document.getElementById(id);
const modal = $meal('mealPlan');
const recipes = new Map(R.map(recipe => [recipe.id, recipe]));
const shoppingKey = 'recipeLabShoppingV13';
const today = () => dateKey(new Date());
const message = text => { $meal('mealStatus').textContent = text; };
const currentWeek = () => monday($meal('mealDate').value || today());
const datesOfWeek = () => Array.from({ length: 7 }, (_, i) => shiftDate(currentWeek(), i));
const validCount = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 30;
let editing = null;
let plan;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(mealPlanKey) || 'null');
    if (raw && validCount(raw.family) && raw.slots && raw.submitted) return raw;
  } catch {}
  return emptyPlan();
}

function save(next) {
  localStorage.setItem(mealPlanKey, JSON.stringify(next));
  plan = next;
}

function update(next, status) {
  try {
    save(next);
    render();
    message(status);
    return true;
  } catch {
    message('식단을 저장하지 못했어요.');
    return false;
  }
}

function control(label, action) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.onclick = action;
  return node;
}

function choices(selected) {
  const filter = $meal('mealSource').value;
  const query = $meal('mealSearch').value.trim().toLowerCase();
  const menu = $meal('mealRecipe');
  menu.replaceChildren(new Option('레시피를 선택하세요', ''));
  let pantry = [];
  try { pantry = JSON.parse(localStorage.getItem(fridgeKey) || '[]'); } catch {}
  const recommended = () => Array.isArray(pantry) && pantry.length ?
    recommendRecipes(R, new Set(pantry)).map(result => result.recipe) : [];
  const listed = filter === 'fridge' ? recommended() : R;
  for (const recipe of listed) {
    if (recipe.id !== Number(selected) && ((filter === 'favorites' && !favorites.includes(recipe.id)) ||
      (query && !recipe.name.toLowerCase().includes(query)))) continue;
    menu.add(new Option(recipe.name, recipe.id));
  }
  if (selected && !Array.from(menu.options).some(option => option.value === String(selected))) {
    menu.add(new Option(recipes.get(Number(selected)).name, selected));
  }
  menu.value = selected || '';
  const original = recipes.get(Number(menu.value))?.baseServings === null;
  $meal('mealServings').disabled = original;
  $meal('mealPortionHint').textContent = original ? '방송 원본 분량' : '비우면 기본 가족 인분을 사용합니다.';
}

function edit(key, id) {
  editing = key;
  const [date, meal] = key.split('/');
  const slot = plan.slots[key];
  $meal('mealEditor').hidden = false;
  $meal('mealTargetDate').value = date;
  $meal('mealTargetMeal').value = meal;
  $meal('mealSource').value = 'all';
  $meal('mealSearch').value = '';
  $meal('mealServings').value = slot?.servings ?? '';
  $meal('mealDelete').hidden = !slot;
  choices(id ?? slot?.id);
  $meal('mealTargetDate').focus();
}

function render() {
  $meal('mealFamily').value = plan.family;
  const week = $meal('mealWeek');
  week.replaceChildren();
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  for (const [index, date] of datesOfWeek().entries()) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = date + ' (' + days[index] + ')';
    section.append(title);
    for (const meal of meals) {
      const key = date + '/' + meal;
      const slot = plan.slots[key];
      const recipe = recipes.get(slot?.id);
      const portion = recipe?.baseServings === null ? '방송 원본 분량' : (slot?.servings ?? plan.family) + '인분';
      const button = control(meal + ' · ' + (recipe ? recipe.name + ' · ' + portion : '메뉴 추가'), () => edit(key));
      button.setAttribute('aria-label', date + ' ' + button.textContent);
      section.append(button);
    }
    week.append(section);
  }
  $meal('mealShopping').replaceChildren();
  $meal('mealShopAdd').disabled = true;
}

function selectedDates() {
  return $meal('mealScope').value === 'day' ? [$meal('mealDate').value || today()] : datesOfWeek();
}

function renderShopping() {
  const list = $meal('mealShopping');
  list.replaceChildren();
  const entries = entriesFor(plan, selectedDates(), recipes);
  for (const { label } of Object.values(shoppingFor(entries))) {
    const row = document.createElement('li');
    row.textContent = label;
    list.append(row);
  }
  $meal('mealShopAdd').disabled = list.children.length === 0;
  if (!list.children.length) message('이 기간의 식단에 메뉴를 추가해 주세요.');
  else message('재료와 구매량을 확인해 주세요. 냉장고 보유 재료도 차감하지 않습니다.');
}

function sendShopping() {
  const entries = entriesFor(plan, selectedDates(), recipes).filter(e =>
    !(plan.submitted[e.key] ?? []).includes(e.signature));
  if (!entries.length) { message('새로 담을 식단 재료가 없어요.'); return; }
  if (entries.some(e => plan.submitted[e.key]?.length) &&
    !confirm('이미 장보기에 담은 끼니가 변경되었습니다. 변경된 분량을 새 항목으로 추가할까요?')) return;
  const submitted = { ...plan.submitted };
  for (const { key, signature } of entries) submitted[key] = [...(submitted[key] ?? []), signature];
  try {
    const previous = localStorage.getItem(shoppingKey);
    const shopping = JSON.parse(previous || '{}');
    if (!shopping || typeof shopping !== 'object' || Array.isArray(shopping)) throw Error('Invalid shopping');
    localStorage.setItem(shoppingKey, JSON.stringify(appendMealShopping(shopping, shoppingFor(entries))));
    try {
      save({ ...plan, submitted });
    } catch (error) {
      if (previous === null) localStorage.removeItem(shoppingKey);
      else localStorage.setItem(shoppingKey, previous);
      throw error;
    }
    window.dispatchEvent(new Event('recipe-shopping-updated'));
    message('새 식단 재료를 장보기에 담았어요.');
  } catch {
    message('장보기 저장을 완료하지 못했어요.');
  }
}

function open(preferred) {
  plan = load();
  $meal('mealDate').value ||= today();
  $meal('mealEditor').hidden = true;
  render();
  message('');
  modal.showModal();
  if (preferred) edit(($meal('mealDate').value || today()) + '/저녁', preferred);
}

$meal('openMealPlan').onclick = () => open();
window.addFridgeRecipeToPlan = id => open(id);
$meal('closeMealPlan').onclick = () => modal.close();
$meal('mealDate').onchange = () => render();
for (const [id, delta] of [['mealPrev', -7], ['mealNext', 7]]) {
  $meal(id).onclick = () => {
    $meal('mealDate').value = shiftDate($meal('mealDate').value || today(), delta);
    render();
  };
}
$meal('mealFamilySave').onclick = () => {
  const value = $meal('mealFamily').value;
  if (validCount(value)) update({ ...plan, family: Number(value) }, '기본 가족 인분을 저장했어요.');
  else message('인분은 1~30 사이의 정수로 입력해 주세요.');
};
$meal('mealCopy').onclick = () => update({ ...plan, slots: copyPreviousWeek(plan.slots, currentWeek()) }, '지난주 메뉴를 이번 주의 빈 끼니에 복사했어요.');
$meal('mealTargetMeal').replaceChildren(...meals.map(meal => new Option(meal, meal)));
for (const id of ['mealSource', 'mealSearch', 'mealRecipe']) {
  $meal(id).oninput = () => choices($meal('mealRecipe').value);
}
$meal('mealCancel').onclick = () => { $meal('mealEditor').hidden = true; };
$meal('mealDelete').onclick = () => {
  const slots = { ...plan.slots };
  delete slots[editing];
  if (update({ ...plan, slots }, '끼니를 삭제했어요.')) $meal('mealEditor').hidden = true;
};
$meal('mealEditor').onsubmit = event => {
  event.preventDefault();
  const date = $meal('mealTargetDate').value;
  const key = date + '/' + $meal('mealTargetMeal').value;
  const recipe = recipes.get(Number($meal('mealRecipe').value));
  const value = $meal('mealServings').value;
  if (!date || !recipe || (recipe.baseServings !== null && value && !validCount(value))) {
    message('날짜와 레시피를 고르고 알맞은 인분을 입력해 주세요.');
    return;
  }
  if (key !== editing && plan.slots[key] && !confirm('이 끼니의 기존 메뉴를 바꿀까요?')) return;
  const slots = { ...plan.slots };
  delete slots[editing];
  slots[key] = { id: recipe.id, servings: recipe.baseServings === null || !value ? null : Number(value) };
  $meal('mealDate').value = date;
  if (update({ ...plan, slots }, '끼니를 저장했어요.')) $meal('mealEditor').hidden = true;
};
$meal('mealReview').onclick = renderShopping;
$meal('mealScope').onchange = renderShopping;
$meal('mealShopAdd').onclick = sendShopping;
modal.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
