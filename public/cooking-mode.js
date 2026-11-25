const dialog = document.querySelector('#cookingMode');
const find = selector => dialog.querySelector(selector);
const title = find('h2');
const progress = find('#cookingProgress');
const instruction = find('#cookingInstruction');
const ingredients = find('#cookingIngredients');
const previous = find('#cookingPrevious');
const next = find('#cookingNext');
const duration = find('#cookingDuration');
const clock = find('#cookingClock');
const timerAction = find('#cookingTimerAction');
const timerStatus = find('#cookingTimerStatus');
const wakeStatus = find('#cookingWakeStatus');

let recipe;
let index;
let remaining = 0;
let deadline = 0;
let interval;
let wakeLock;
let wakeRequest = false;
let largeText = false;

function showStep({ focus = false } = {}) {
  const complete = index === recipe.steps.length;
  title.textContent = complete ? '요리 완료' : recipe.name;
  progress.textContent = complete ? `${recipe.steps.length}단계 완료` : `${index + 1} / ${recipe.steps.length}단계`;
  instruction.textContent = complete ? '모든 조리 단계를 마쳤어요.' : recipe.steps[index];
  previous.disabled = index === 0;
  next.textContent = complete ? '레시피로 돌아가기' : index === recipe.steps.length - 1 ? '요리 완료' : '다음 단계';
  find('#cookingIngredientSection').hidden = complete;
  ingredients.replaceChildren();
  if (!complete) {
    // Older recipes store prose steps. Exact mentions are shown first and the
    // full ingredient list remains available for grouped references.
    const stepText = recipe.steps[index];
    const matched = recipe.ingredients.filter(ingredient => {
      const name = ingredient.name.split('(')[0].trim();
      const literal = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const delimiters = '[ ,·/&:;.!?~–—+]';
      return new RegExp(`(?:^|${delimiters})${literal}(?:(?:으로|로|에서|에|은|는|이|가|을|를|과|와|도|만|부터|까지))?(?=$|${delimiters})`).test(stepText);
    });
    find('#cookingIngredientHeading').textContent = `이 단계에서 언급된 재료 · ${servings}인분`;
    ingredients.append(...matched.map(ingredientRow));
    find('#cookingIngredientEmpty').hidden = matched.length > 0;
    find('#cookingQuantityNote').hidden = matched.length === 0;
    find('#cookingAllIngredients').replaceChildren(...recipe.ingredients.map(ingredientRow));
  }
  if (focus) progress.focus();
}

function ingredientRow(ingredient) {
  const item = document.createElement('li');
  item.textContent = `${ingredient.name} ${fmt(ingredient.amount * servings / (recipe.baseServings || 1))} ${ingredient.unit}`;
  return item;
}

function refreshTimer() {
  if (deadline) {
    remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      deadline = 0;
      clearInterval(interval);
      timerStatus.textContent = '타이머가 끝났어요.';
    }
  }
  const seconds = Math.ceil(remaining / 1000);
  clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  timerAction.textContent = deadline ? '일시정지' : remaining ? '재개' : '시작';
}

function resetTimer() {
  clearInterval(interval);
  deadline = 0;
  remaining = 0;
  timerStatus.textContent = '';
  duration.setCustomValidity('');
  refreshTimer();
}

function startTimer() {
  const minutes = duration.valueAsNumber;
  if (!remaining && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) {
    duration.setCustomValidity('0분 초과, 1440분 이하의 시간을 입력하세요.');
    duration.reportValidity();
    return;
  }
  duration.setCustomValidity('');
  remaining ||= minutes * 60000;
  deadline = Date.now() + remaining;
  timerStatus.textContent = '';
  interval = setInterval(refreshTimer, 250);
  refreshTimer();
}

async function keepScreenOn() {
  if (!dialog.open || document.visibilityState !== 'visible' || wakeLock || wakeRequest) return;
  if (!navigator.wakeLock) {
    wakeStatus.textContent = '이 브라우저는 화면 꺼짐 방지를 지원하지 않아요.';
    return;
  }
  wakeRequest = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!dialog.open || document.visibilityState !== 'visible') {
      await lock.release();
      return;
    }
    wakeLock = lock;
    wakeStatus.textContent = '화면 꺼짐 방지 사용 중';
    lock.addEventListener('release', () => {
      if (wakeLock !== lock) return;
      wakeLock = undefined;
      if (dialog.open) wakeStatus.textContent = '화면 꺼짐 방지가 해제됐어요.';
    }, { once: true });
  } catch {
    if (dialog.open) wakeStatus.textContent = '화면 꺼짐 방지를 켤 수 없어요. 기기 설정을 확인해 주세요.';
  } finally {
    wakeRequest = false;
  }
}

document.querySelector('#detail').addEventListener('click', event => {
  if (!event.target.closest('#startCooking') || !selected) return;
  recipe = selected;
  index = 0;
  duration.value = '5';
  resetTimer();
  find('#cookingIngredientsDetails').open = false;
  showStep();
  wakeStatus.textContent = '';
  dialog.showModal();
  progress.focus();
  void keepScreenOn();
});

find('#cookingExit').onclick = () => dialog.close();
previous.onclick = () => { index--; showStep({ focus: true }); };
next.onclick = () => {
  if (index === recipe.steps.length) {
    dialog.close();
    return;
  }
  index++;
  showStep({ focus: true });
};
find('#cookingTextSize').onclick = event => {
  largeText = !largeText;
  dialog.classList.toggle('cooking-large', largeText);
  event.currentTarget.setAttribute('aria-pressed', String(largeText));
};
for (const button of dialog.querySelectorAll('[data-minutes]')) {
  button.onclick = () => { duration.value = button.dataset.minutes; resetTimer(); };
}
duration.oninput = resetTimer;
find('#cookingTimerReset').onclick = resetTimer;
timerAction.onclick = () => {
  refreshTimer();
  if (deadline) {
    deadline = 0;
    clearInterval(interval);
    refreshTimer();
  } else {
    startTimer();
  }
};
dialog.addEventListener('keydown', event => {
  // Escape should close the cooking dialog without closing the underlying recipe.
  if (event.key === 'Escape') event.stopPropagation();
});
dialog.addEventListener('close', () => {
  resetTimer();
  const lock = wakeLock;
  wakeLock = undefined;
  if (lock) void lock.release().catch(() => {});
  document.querySelector('#startCooking')?.focus();
});
document.addEventListener('visibilitychange', () => {
  if (!dialog.open || document.visibilityState !== 'visible') return;
  refreshTimer();
  void keepScreenOn();
});
