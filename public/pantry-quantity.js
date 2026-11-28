import { buildIngredientCatalog, fridgeKey, ingredientId } from './fridge-model.js';
import { compareNeeds, deductKnownStock, emptyQuantities, purchaseFromEntry, quantityKey, recordPurchase, usageFromRecipe } from './pantry-quantity-model.js';
import { exportBackup, importBackup, shoppingKey, validateBackup, writeStorage } from './data-backup.js';

const byId = id => document.getElementById(id);
const catalog = new Map(buildIngredientCatalog(R).map(item => [item.id,item.name]));
const stockDialog = byId('pantryQuantities');
const purchaseDialog = byId('pantryPurchases');
const read = (key,fallback) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
const state = () => read(quantityKey,emptyQuantities());
const pantrySelection = () => new Set(read(fridgeKey,[]));
const stockStatus = text => { byId('pantryQuantityStatus').textContent = text; };
const button = (label,action) => {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.onclick = action;
  return control;
};
const amountText = (amount,unit) => amount.toLocaleString('ko-KR',{maximumFractionDigits:6}) + ' ' + unit;
const unitLabel = unit => unit.trim() && unit.length <= 24 && !unit.includes('|') && unit !== '원문';
const validAmount = input => input.value !== '' && Number.isFinite(input.valueAsNumber) && input.valueAsNumber >= 0;

function setUnitOptions(id) {
  const units = new Set(['개','g','kg','ml','L','대','장','모','마리','큰술','작은술','공기','봉','단']);
  for (const recipe of R) for (const item of recipe.ingredients) {
    if (ingredientId(item.name) === id && item.amount !== null) units.add(item.unit);
  }
  byId('pantryUnits').replaceChildren(...[...units].map(unit => {
    const option = document.createElement('option');
    option.value = unit;
    return option;
  }));
}

function renderStock(editorId) {
  const current = state();
  const choose = byId('pantryIngredient');
  const search = ingredientId(byId('pantryIngredientSearch').value);
  const choices = new Map([...catalog, ...[...pantrySelection(),...Object.keys(current.stock)].map(id => [id,catalog.get(id) ?? id])]);
  choose.replaceChildren(new Option('재료 선택',''), ...[...choices].filter(([id,name]) =>
    id === editorId || id.includes(search) || ingredientId(name).includes(search)).map(([id,name]) => new Option(name,id)));
  choose.value = editorId ?? '';
  setUnitOptions(choose.value);
  const stored = Object.hasOwn(current.stock,choose.value) ? current.stock[choose.value] : null;
  byId('pantryAmount').value = stored?.amount ?? '';
  byId('pantryUnit').value = stored?.unit ?? '';
  byId('pantryForget').disabled = !stored;
  byId('pantryQuantityList').replaceChildren(...[...new Set([...pantrySelection(),...Object.keys(current.stock)])].map(id => {
    const row = document.createElement('li');
    const item = Object.hasOwn(current.stock,id) ? current.stock[id] : null;
    row.append(button(choices.get(id) + ' · ' + (item ? amountText(item.amount,item.unit) : '수량 미확인'), () => {
      renderStock(id);
      byId('pantryAmount').focus();
    }));
    return row;
  }));
}

function saveStock(next,presence) {
  const updates = { [quantityKey]: next };
  if (presence) updates[fridgeKey] = [...presence];
  writeStorage(localStorage,updates);
  window.dispatchEvent(new Event('recipe-pantry-updated'));
}

byId('openPantryQuantities').onclick = () => {
  stockStatus('');
  byId('pantryIngredientSearch').value = '';
  renderStock();
  stockDialog.showModal();
};
byId('pantryIngredientSearch').oninput = () => renderStock(byId('pantryIngredient').value);
byId('pantryIngredient').onchange = event => renderStock(event.target.value);
byId('pantryQuantityForm').onsubmit = event => {
  event.preventDefault();
  const id = byId('pantryIngredient').value;
  const amount = byId('pantryAmount');
  const unit = byId('pantryUnit').value.trim();
  if (!id || !validAmount(amount) || !unitLabel(unit)) {
    stockStatus('재료와 0 이상의 수량, 단위를 입력해 주세요.');
    return;
  }
  const current = state();
  const presence = pantrySelection();
  presence.add(id);
  try {
    saveStock({ ...current, stock: { ...current.stock,[id]:{amount:amount.valueAsNumber,unit} } },presence);
    renderStock(id);
    stockStatus('수량을 저장했어요.');
  } catch { stockStatus('수량을 저장하지 못했어요.'); }
};
byId('pantryForget').onclick = () => {
  const id = byId('pantryIngredient').value;
  const current = state();
  delete current.stock[id];
  try {
    saveStock(current);
    renderStock(id);
    stockStatus('보유 표시는 유지하고 수량만 지웠어요.');
  } catch { stockStatus('수량을 지우지 못했어요.'); }
};
byId('closePantryQuantities').onclick = () => stockDialog.close();
byId('closePantryPurchases').onclick = () => purchaseDialog.close();
for (const dialog of [stockDialog,purchaseDialog]) {
  dialog.addEventListener('keydown',event => { if (event.key === 'Escape') event.stopPropagation(); });
}

function renderPurchases(message = '') {
  const current = state();
  const rows = [];
  for (const [key,entry] of Object.entries(read(shoppingKey,{}))) {
    if (!entry.done) continue;
    const row = document.createElement('li');
    const purchase = purchaseFromEntry(key,entry);
    row.textContent = entry.label + ' ';
    if (Object.hasOwn(current.receipts,key)) row.append('냉장고에 등록됨');
    else if (!purchase) row.append('수량 또는 단위 직접 확인');
    else {
      const actual = document.createElement('input');
      actual.type = 'number';
      actual.min = '0.000001';
      actual.step = 'any';
      actual.value = ['개','장','대','모','마리'].includes(purchase.unit) ? Math.ceil(purchase.amount) : purchase.amount;
      actual.setAttribute('aria-label',purchase.name + ' 실제 구매량');
      row.append(actual,' ' + purchase.unit + ' ',button(purchase.name + ' 냉장고에 등록', () => {
        if (!validAmount(actual) || actual.valueAsNumber <= 0) {
          byId('pantryPurchaseStatus').textContent = '실제 구매량을 입력해 주세요.';
          return;
        }
        const updated = { ...purchase,amount:actual.valueAsNumber };
        if (!confirm(updated.name + ' ' + amountText(updated.amount,updated.unit) + '을(를) 냉장고에 등록할까요?')) return;
        const next = recordPurchase(state(),updated);
        if (!next) { renderPurchases('이미 등록했거나 냉장고 단위와 달라요. 단위를 확인해 주세요.'); return; }
        try {
          const presence = pantrySelection();
          presence.add(updated.id);
          saveStock(next,presence);
          renderPurchases('실제 구매량을 냉장고에 등록했어요.');
        } catch { renderPurchases('냉장고에 저장하지 못했어요.'); }
      }));
    }
    rows.push(row);
  }
  byId('pantryPurchaseList').replaceChildren(...rows);
  byId('pantryPurchaseStatus').textContent = message || (rows.length ? '실제 구매 수량을 확인해 주세요.' : '체크 완료한 장보기 항목이 없어요.');
}

document.addEventListener('click',event => {
  if (!event.target.closest('#registerPantryPurchases')) return;
  renderPurchases();
  purchaseDialog.showModal();
});
window.addEventListener('recipe-shopping-cleared',event => {
  try {
    const current = state();
    for (const key of event.detail) delete current.receipts[key];
    localStorage.setItem(quantityKey,JSON.stringify(current));
  } catch {}
});

export function renderQuantityComparison(target, items) {
  const stock = state().stock;
  const list = document.createElement('ul');
  for (const item of compareNeeds(items,stock)) {
    const row = document.createElement('li');
    const need = item.amount === null ? item.quantityText : amountText(item.amount,item.unit);
    const balance = item.stored ? amountText(item.stored.amount,item.stored.unit) : '수량 미확인';
    const shortage = item.shortage === null ? (item.stored && item.available === null ? '단위 직접 확인' : '수량 직접 확인') :
      amountText(item.shortage,item.unit);
    row.textContent = item.name + (item.optional ? ' (선택)' : '') + ' · 필요 ' + need + ' · 보유 ' + balance + ' · 부족 ' + shortage;
    list.append(row);
  }
  target.replaceChildren(list);
}

document.addEventListener('toggle',event => {
  if (event.target.id === 'recipeStockComparison' && event.target.open && selected) {
    renderQuantityComparison(byId('recipeStockList'),usageFromRecipe(selected,servings));
  }
},true);

export function renderCookingStock(target, items, receipt) {
  if (receipt.rendered) return;
  receipt.rendered = true;
  const heading = document.createElement('h3');
  heading.textContent = '사용한 재료와 냉장고 수량';
  const comparison = document.createElement('div');
  renderQuantityComparison(comparison,items);
  const note = document.createElement('p');
  note.setAttribute('role','status');
  note.textContent = '선택 재료와 수량·단위가 확인되지 않은 재료는 직접 확인해 주세요.';
  const apply = button('확인 가능한 사용량 차감', () => {
    const result = deductKnownStock(state(),items);
    if (!result.count) { note.textContent = '차감할 수 있는 재료가 없어요.'; return; }
    if (!confirm('기록된 보유량이 충분하고 단위가 맞는 필수 재료 ' + result.count + '종을 냉장고에서 차감할까요?')) return;
    try {
      saveStock(result.state);
      apply.disabled = true;
      note.textContent = result.count + '종의 사용량을 차감했어요.';
    } catch { note.textContent = '냉장고에 저장하지 못했어요.'; }
  });
  target.replaceChildren(heading,comparison,apply,note);
}

byId('backupAllData').onclick = () => {
  try {
    const backup = exportBackup(localStorage);
    validateBackup(backup);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recipe-lab-backup-v2.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  } catch { alert('저장된 데이터를 백업하지 못했어요.'); }
};
byId('restoreAllData').onclick = () => byId('allDataFile').click();
byId('allDataFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw Error('백업 파일이 너무 큽니다.');
    const backup = JSON.parse(await file.text());
    validateBackup(backup);
    const scope = backup.version === 1 ? '즐겨찾기만' : '즐겨찾기·장보기·냉장고·식단을 모두';
    if (!confirm(scope + ' 백업 파일 기준으로 덮어쓸까요? 파일에 저장되지 않은 항목은 비웁니다.')) return;
    importBackup(localStorage,backup);
    location.reload();
  } catch { alert('손상되었거나 지원하지 않는 백업 파일입니다. 기존 데이터를 유지했어요.'); }
  finally { event.target.value = ''; }
};
