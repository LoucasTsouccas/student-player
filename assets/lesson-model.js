// Shared validation and grading; free writing is reviewed by the learner, not scored.
export function validateLesson(lesson) {
 if (!lesson || typeof lesson.title !== 'string' || !Array.isArray(lesson.pages) || !lesson.pages.length) throw new Error('Invalid lesson');
 const ids = new Set();
 for (const page of lesson.pages) {
  if (typeof page.title !== 'string' || typeof page.text !== 'string' || (page.minutes !== undefined && (!Number.isFinite(page.minutes) || page.minutes <= 0)) || !Array.isArray(page.tasks)) throw new Error('Invalid page');
  if (page.paragraphs && (!Array.isArray(page.paragraphs) || !page.paragraphs.every(p => typeof p === 'string'))) throw new Error('Invalid paragraphs');
  for (const task of page.tasks) {
   if (!task.id || ids.has(task.id) || typeof task.prompt !== 'string') throw new Error('Invalid task id');
   ids.add(task.id);
   if (task.type === 'choice' || task.type === 'opinion') {
    if (!Array.isArray(task.choices) || task.choices.length < 2 || !task.choices.every(c => typeof c === 'string') || (task.type === 'choice' && (!Number.isInteger(task.answer) || !task.choices[task.answer])) || typeof task.explanation !== 'string') throw new Error('Invalid choice');
   } else if (task.type === 'match') {
    if (!Array.isArray(task.options) || !task.options.every(o => typeof o === 'string') || !Array.isArray(task.rows) || !task.rows.length || !task.rows.every(r => typeof r.label === 'string' && Number.isInteger(r.answer) && task.options[r.answer])) throw new Error('Invalid matching');
   } else if (task.type === 'sequence') {
    if (!Array.isArray(task.items) || !task.items.every(i => typeof i === 'string') || !validOrder(task.initialOrder, task.items.length)) throw new Error('Invalid sequence');
   } else if (task.type === 'reflect') {
    if (typeof task.model !== 'string' || !Number.isInteger(task.minLength) || task.minLength < 1 || !Array.isArray(task.criteria) || !task.criteria.length || !task.criteria.every(c => typeof c === 'string')) throw new Error('Invalid reflection');
   } else throw new Error('Unknown task type');
  }
 }
 return lesson;
}
export function validOrder(order, length) {
 return Array.isArray(order) && order.length === length && new Set(order).size === length && order.every(i => Number.isInteger(i) && i >= 0 && i < length);
}
export function isComplete(task, state = {}) {
 if (task.type === 'choice') return state.selected === task.answer;
 if (task.type === 'opinion') return Number.isInteger(state.selected) && state.selected >= 0 && state.selected < task.choices.length;
 if (task.type === 'match') return state.checked === true && task.rows.every((r, i) => state.values?.[i] === r.answer);
 if (task.type === 'sequence') return state.checked === true && validOrder(state.order, task.items.length) && state.order.every((value, index) => value === index);
 if (task.type === 'reflect') return state.reviewed === true && typeof state.text === 'string' && state.text.trim().length >= task.minLength && task.criteria.every((_, i) => state.criteria?.[i] === true);
 return false;
}
export function pageComplete(page, states) { return page.tasks.every(task => isComplete(task, states[task.id])); }
export function freshState() { return {step: 0, tasks: {}}; }
// A stale, corrupt or manually modified session must never skip unanswered pages.
export function restoreState(raw, lesson) {
 try {
  const saved = JSON.parse(raw);
  if (saved.version !== lesson.version || saved.title !== lesson.title || !saved.tasks || typeof saved.tasks !== 'object' || Array.isArray(saved.tasks)) return freshState();
  const state = {step: 0, tasks: {}};
  for (const page of lesson.pages) for (const task of page.tasks) {
   const old = saved.tasks[task.id];
   if (!old || typeof old !== 'object') continue;
   const clean = {};
   if (task.type === 'choice' || task.type === 'opinion') {
    if (Number.isInteger(old.selected) && task.choices[old.selected]) clean.selected = old.selected;
    if (Number.isInteger(old.first) && task.choices[old.first]) clean.first = old.first;
   } else if (task.type === 'match') {
    clean.values = task.rows.map((_, i) => Number.isInteger(old.values?.[i]) && task.options[old.values[i]] ? old.values[i] : null);
    clean.checked = old.checked === true;
   } else if (task.type === 'sequence') {
    clean.order = validOrder(old.order, task.items.length) ? old.order : [...task.initialOrder];
    clean.checked = old.checked === true;
   } else {
    clean.text = typeof old.text === 'string' ? old.text.slice(0, 2000) : '';
    clean.reviewed = old.reviewed === true;
    clean.criteria = task.criteria.map((_, i) => old.criteria?.[i] === true);
   }
   state.tasks[task.id] = clean;
  }
  const firstIncomplete = lesson.pages.findIndex(page => !pageComplete(page, state.tasks));
  const maxStep = firstIncomplete < 0 ? lesson.pages.length : firstIncomplete;
  state.step = Number.isInteger(saved.step) ? Math.max(0, Math.min(saved.step, maxStep)) : 0;
  return state;
 } catch { return freshState(); }
}
