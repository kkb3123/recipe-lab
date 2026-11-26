export const fridgeKey = 'recipeLabPantryV1';

const aliases = new Map([['흰우유','우유'], ['계란','달걀'], ['김칫국물','김치국물']]);

export const ingredientId = name => {
  const key = name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  return aliases.get(key) ?? key;
};

const groups = {
  '채소': '대파 쪽파 양파 감자 아보카도 당근 토마토 애호박 마늘 다진마늘 통마늘 생강 다진생강 청양고추 건고추 베트남건고추 양배추 버섯 신김치 김치 얼갈이 콩나물 깻잎 오이 파프리카 상추 팽이버섯 파슬리',
  '육류': '삼겹살 돼지고기 닭 닭볶음탕용닭 닭고기 닭다리살 닭가슴살 닭정육 소고기 안심 앞다리살 다진돼지고기 소고기불고깃감 소시지 스팸 햄 돼지앞다리살',
  '해산물': '어묵 사각어묵 연어 새우 냉동새우 오징어 손질오징어 바지락 명란젓 멸치 건새우 굴',
  '계란·유제품': '달걀 달걀노른자 삶은달걀 우유 생크림 버터 체다치즈 슬라이스체다치즈 파르메산치즈',
  '곡류': '밥 쌀 찬밥 소면 중면 우동면 당면 스파게티면 파스타 파스타면 링귀니면 라멘생면 떡 밀떡 쌀떡 식빵 밀가루 찹쌀가루 전분 감자전분',
};
const categoryById = new Map(Object.entries(groups).flatMap(([category, names]) =>
  names.split(' ').map(name => [ingredientId(name), category])));
const seasonings = new Set('물 육수용물 면삶는물 면삶는소금 전분용찬물 굵은소금 소금 맛소금 설탕 황설탕 식용유 올리브유 카놀라유 후추 통후추 진간장 양조간장 간장 국간장 식초 다진마늘 참기름 들기름 통깨 깨 고춧가루 고운고춧가루 굵은고춧가루 굴소스 고추장 된장 쌈장 맛술 미림 멸치액젓 참치액 토마토소스 케첩 마요네즈 짜장가루 트러플오일'.split(' '));
const substitutes = new Map([
  ['돼지고기', ['삼겹살', '돼지앞다리살']],
  ['삼겹살', ['돼지고기']], ['대파', ['쪽파']], ['쪽파', ['대파']],
  ['베트남건고추', ['페퍼론치노', '건고추']],
]);
export const categories = [...Object.keys(groups), '기타', '기본 양념'];

export function buildIngredientCatalog(recipes) {
  const catalog = new Map();
  for (const { ingredients } of recipes) {
    for (const { name } of ingredients) {
      const id = ingredientId(name);
      if (!catalog.has(id)) catalog.set(id, {
        id, name, category: seasonings.has(id) ? '기본 양념' : categoryById.get(id) ?? '기타',
      });
    }
  }
  for (const id of new Set([...substitutes.values()].flat())) {
    if (!catalog.has(id)) catalog.set(id, { id, name: id, category: categoryById.get(id) ?? '기타' });
  }
  return [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function recommendRecipes(recipes, selected) {
  return recipes.map(recipe => {
    const required = new Map();
    for (const item of recipe.ingredients) {
      if (item.optional) continue;
      const id = ingredientId(item.name);
      if (!required.has(id)) required.set(id, { id, name: item.name, items: [], seasoning: seasonings.has(id) });
      required.get(id).items.push(item);
    }
    const missing = [...required.values()].filter(item => !selected.has(item.id)).map(item => ({
      ...item, alternatives: (substitutes.get(item.id) ?? []).filter(id => selected.has(id)),
    }));
    const covered = required.size - missing.length;
    const percent = required.size ? Math.round(covered * 100 / required.size) : 0;
    const group = missing.every(item => item.seasoning) ? 0 : missing.length <= 2 ? 1 : 2;
    return { recipe, missing, percent, group, complete: required.size > 0 && missing.length === 0 };
  }).sort((a, b) => a.group - b.group || Number(b.complete) - Number(a.complete) ||
    b.percent - a.percent || a.missing.length - b.missing.length || a.recipe.id - b.recipe.id);
}

const compatibleUnits = { mg: ['mass', .001], g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], L: ['volume', 1000] };
const factor = (from, to) => {
  if (from === to) return 1;
  const a = compatibleUnits[from], b = compatibleUnits[to];
  return a && b && a[0] === b[0] ? a[1] / b[1] : null;
};

export function mergeShopping(list, items) {
  const merged = { ...list };
  for (const item of items) {
    const sameName = key => ingredientId(key.slice(0, key.lastIndexOf('|'))) === ingredientId(item.name);
    const matched = Object.entries(merged).find(([key, entry]) => {
      if (!sameName(key) || !entry || typeof entry.label !== 'string') return false;
      const [name, unit] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)];
      return item.amount === null ? unit === item.unit : factor(item.unit, unit) !== null &&
        entry.label.startsWith(name + ' ') && entry.label.endsWith(' ' + unit) &&
        /^\d+(?:\.\d+)?$/.test(entry.label.slice(name.length + 1, -unit.length - 1));
    });
    if (matched && item.amount === null && !matched[1].done) continue;
    const key = matched?.[0] ?? item.name + '|' + item.unit;
    if (!matched && Object.hasOwn(merged, key)) throw new Error('Invalid existing shopping entry');
    const boundary = key.lastIndexOf('|');
    const name = key.slice(0, boundary), unit = key.slice(boundary + 1);
    const previous = matched && !matched[1].done && item.amount !== null ?
      Number(matched[1].label.slice(name.length + 1, -unit.length - 1)) : 0;
    const total = item.amount === null ? item.quantityText :
      `${Number((previous + item.amount * factor(item.unit, unit)).toFixed(6))} ${unit}`;
    merged[key] = { label: `${name} ${total}`, done: false };
  }
  return merged;
}
