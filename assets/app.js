import {validateLesson, isComplete, pageComplete, freshState, restoreState} from './lesson-model.js';
const app = document.querySelector('#app');
const grade = document.body.dataset.grade;
const labels = {a:'Α΄', b:'Β΄', c:'Γ΄', d:'Δ΄', e:'Ε΄', st:'Στ΄'};
function node(tag, text, className) {
 const el = document.createElement(tag);
 if (text !== undefined) el.textContent = text;
 if (className) el.className = className;
 return el;
}
function message(text) { app.replaceChildren(node('p', text)); }
async function json(path) {
 const response = await fetch(new URL(path, import.meta.url), {cache:'no-store'});
 if (!response.ok) throw new Error('HTTP ' + response.status);
 return response.json();
}
async function start() {
 if (!labels[grade]) { message('Δεν βρέθηκε η τάξη.'); return; }
 document.title = labels[grade] + ' Τάξη – Μάθημα Σήμερα | Student Player';
 try {
  const assignments = await json('../assignments.json');
  if (!Object.hasOwn(assignments, grade)) throw new Error('Missing grade');
  const id = assignments[grade];
  if (id === null) { message('Δεν υπάρχει ενεργό μάθημα για σήμερα'); return; }
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid lesson');
  const lesson = validateLesson(await json('../lessons/' + id + '.json'));
  const storageKey = 'student-player:' + grade + ':' + id;
  let state = freshState();
  let storageAvailable = true;
  try { state = restoreState(sessionStorage.getItem(storageKey), lesson); } catch { storageAvailable = false; }
  const save = () => {
   try { sessionStorage.setItem(storageKey, JSON.stringify({...state, version:lesson.version, title:lesson.title})); }
   catch { storageAvailable = false; }
  };
  function render() {
   app.replaceChildren();
   if (state.step === lesson.pages.length) { renderEnd(); return; }
   const page = lesson.pages[state.step];
   app.append(node('p', lesson.title, 'lesson-title'));
   const progress = node('progress');
   progress.max = lesson.pages.length; progress.value = state.step + 1;
   progress.setAttribute('aria-label', 'Πρόοδος μαθήματος');
   app.append(node('p', 'Οθόνη ' + (state.step + 1) + ' από ' + lesson.pages.length + ' · Περίπου ' + page.minutes + ' λεπτά', 'progress'), progress);
   const heading = node('h2', page.title);
   app.append(heading, node('p', page.text));
   for (const paragraph of page.paragraphs || []) app.append(node('p', paragraph, 'reading'));
   const taskArea = node('div', undefined, 'task-area');
   const navigation = node('div', undefined, 'actions');
   const back = node('button', '← Πίσω', 'secondary');
   back.disabled = state.step === 0;
   back.onclick = () => { state.step--; save(); render(); };
   const next = node('button', state.step === lesson.pages.length - 1 ? 'Ολοκλήρωση ✓' : 'Συνέχεια →');
   const remaining = node('p', '', 'completion-hint');
   remaining.id = 'completion-hint'; next.setAttribute('aria-describedby', remaining.id);
   const updateNavigation = () => {
    const count = page.tasks.filter(task => !isComplete(task, state.tasks[task.id])).length;
    next.disabled = count > 0;
    remaining.textContent = count ? 'Ολοκλήρωσε τις δραστηριότητες αυτής της οθόνης για να συνεχίσεις. Μπορείς να ξαναδοκιμάσεις όσες φορές θέλεις.' : 'Ολοκλήρωσες αυτή την οθόνη. Μπορείς να συνεχίσεις!';
   };
   for (const task of page.tasks) {
    const taskState = state.tasks[task.id] ||= {};
    taskArea.append(renderTask(task, taskState, () => { save(); updateNavigation(); }));
   }
   next.onclick = () => { if (!pageComplete(page, state.tasks)) return; state.step++; save(); render(); };
   navigation.append(back, next);
   app.append(taskArea, remaining, navigation);
   app.append(node('p', storageAvailable ? 'Η πρόοδός σου διατηρείται σε αυτή την καρτέλα, ακόμη και με ανανέωση. Δεν αποστέλλεται σε κανέναν.' : 'Η αποθήκευση δεν είναι διαθέσιμη. Η πρόοδός σου θα διατηρηθεί όσο δεν ανανεώνεις τη σελίδα.', 'source'));
   updateNavigation(); focusHeading(heading);
  }
  function renderTask(task, data, changed) {
   const box = node('fieldset', undefined, 'task');
   box.id = task.id;
   box.append(node('legend', task.prompt));
   const feedback = node('p', '', 'feedback');
   feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-atomic', 'true');
   if (task.type === 'choice') {
    const choices = node('div', undefined, 'choices');
    const refresh = () => {
     [...choices.children].forEach((button, i) => button.setAttribute('aria-pressed', String(data.selected === i)));
     feedback.textContent = data.selected === undefined ? '' : isComplete(task, data) ? 'Σωστά! ' + task.explanation : 'Δοκίμασε ξανά. ' + task.hint;
     feedback.classList.toggle('correct', isComplete(task, data));
    };
    task.choices.forEach((text, i) => {
     const button = node('button', text, 'choice');
     button.type = 'button';
     button.onclick = () => { if (data.first === undefined) data.first = i; data.selected = i; refresh(); changed(); };
     choices.append(button);
    });
    box.append(choices, feedback); refresh();
   } else if (task.type === 'match') {
    data.values ||= task.rows.map(() => null);
    const rows = [];
    const refresh = () => {
     rows.forEach((row, i) => {
      row.feedback.textContent = !data.checked ? '' : data.values[i] === task.rows[i].answer ? 'Σωστά!' : 'Δοκίμασε ξανά. ' + task.rows[i].hint;
      row.select.setAttribute('aria-invalid', String(!!data.checked && data.values[i] !== task.rows[i].answer));
     });
     feedback.textContent = !data.checked ? '' : isComplete(task, data) ? 'Μπράβο! Όλες οι αντιστοιχίσεις είναι σωστές.' : 'Δες τις υποδείξεις. Άλλαξε τις επιλογές που χρειάζονται και πάτησε ξανά Έλεγχος.';
    };
    task.rows.forEach((row, i) => {
     const wrapper = node('div', undefined, 'match-row');
     const label = node('label', row.label); const select = node('select');
     select.id = task.id + '-' + i; label.htmlFor = select.id;
     const placeholder = node('option', 'Διάλεξε…'); placeholder.value = ''; select.append(placeholder);
     task.options.forEach((text, index) => { const option = node('option', text); option.value = String(index); select.append(option); });
     select.value = data.values[i] == null ? '' : String(data.values[i]);
     const rowFeedback = node('p', '', 'row-feedback'); rowFeedback.id = select.id + '-feedback';
     select.setAttribute('aria-describedby', rowFeedback.id);
     select.onchange = () => { data.values[i] = select.value === '' ? null : Number(select.value); data.checked = false; refresh(); changed(); };
     wrapper.append(label, select, rowFeedback); box.append(wrapper); rows.push({select, feedback:rowFeedback});
    });
    const check = node('button', 'Έλεγχος', 'secondary');
    check.onclick = () => { data.checked = true; refresh(); changed(); };
    box.append(check, feedback); refresh();
   } else if (task.type === 'sequence') {
    data.order ||= [...task.initialOrder];
    const list = node('ol', undefined, 'sequence');
    const refresh = () => {
     list.replaceChildren();
     data.order.forEach((item, index) => {
      const li = node('li'); li.append(node('span', task.items[item]));
      const controls = node('div', undefined, 'move-controls');
      for (const delta of [-1, 1]) {
       const button = node('button', delta < 0 ? '↑' : '↓', 'secondary');
       button.disabled = index + delta < 0 || index + delta >= data.order.length;
       button.setAttribute('aria-label', (delta < 0 ? 'Πάνω: ' : 'Κάτω: ') + task.items[item]);
       button.onclick = () => {
        const target = index + delta;
        [data.order[index], data.order[target]] = [data.order[target], data.order[index]];
        data.checked = false; refresh(); changed();
        const moved = list.children[target].querySelectorAll('button');
        const preferred = moved[delta < 0 ? 0 : 1];
        (preferred.disabled ? moved[delta < 0 ? 1 : 0] : preferred).focus();
       };
       controls.append(button);
      }
      li.append(controls); list.append(li);
     });
     const wrong = data.order.findIndex((value, i) => value !== i);
     feedback.textContent = !data.checked ? '' : wrong < 0 ? 'Σωστά! ' + task.explanation : 'Ξανακοίτα τη θέση ' + (wrong + 1) + '. Εκεί ταιριάζει: «' + task.items[wrong] + '»';
    };
    const check = node('button', 'Έλεγχος σειράς', 'secondary');
    check.onclick = () => { data.checked = true; refresh(); changed(); };
    box.append(list, check, feedback); refresh();
   } else if (task.type === 'reflect') {
    const note = node('p', 'Γράψε τη σκέψη σου και σύγκρινέ τη με ένα παράδειγμα. Δεν υπάρχει αυτόματη βαθμολόγηση του γραπτού σου.', 'instruction');
    const input = node('textarea'); input.rows = 4; input.maxLength = 2000;
    input.value = data.text || ''; input.id = task.id + '-writing';
    const label = node('label', 'Η δική μου σκέψη'); label.htmlFor = input.id;
    const check = node('button', 'Σύγκρινε με ένα παράδειγμα', 'secondary');
    const review = node('div', undefined, 'reflection-review');
    const model = node('p', task.model);
    review.append(node('h3', 'Ένα παράδειγμα απάντησης'), model, node('p', 'Δεν χρειάζεται να γράψεις το ίδιο. Έλεγξε τη δική σου απάντηση και σημείωσε όσα περιέχει. Αν κάτι λείπει, πρόσθεσέ το και σύγκρινε ξανά.', 'instruction'));
    data.criteria ||= task.criteria.map(() => false);
    const checks = [];
    task.criteria.forEach((text, i) => {
     const line = node('label', undefined, 'self-check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = data.criteria[i] === true;
     checkbox.onchange = () => { data.criteria[i] = checkbox.checked; refresh(); changed(); };
     checks.push(checkbox); line.append(checkbox, node('span', text)); review.append(line);
    });
    const refresh = () => {
     check.disabled = input.value.trim().length < task.minLength;
     review.hidden = !data.reviewed;
     feedback.textContent = isComplete(task, data) ? 'Ολοκλήρωσες τον αυτοέλεγχο. Κράτησε τη δική σου διατύπωση!' : data.reviewed ? 'Σύγκρινε τη σκέψη σου και ολοκλήρωσε τα δύο σημεία αυτοελέγχου.' : 'Γράψε τουλάχιστον ' + task.minLength + ' χαρακτήρες για να ανοίξει το παράδειγμα. Πάρε χρόνο να εξηγήσεις το γιατί.';
    };
    input.oninput = () => { data.text = input.value; data.reviewed = false; data.criteria = task.criteria.map(() => false); checks.forEach(c => c.checked = false); refresh(); changed(); };
    check.onclick = () => { data.reviewed = true; refresh(); changed(); };
    box.append(note, label, input, check, review, feedback); refresh();
   }
   return box;
  }
  function renderEnd() {
   const heading = node('h2', 'Μπράβο! Ολοκλήρωσες το μάθημα.');
   const exitTasks = lesson.pages.at(-1).tasks;
   const firstCorrect = exitTasks.filter(task => state.tasks[task.id]?.first === task.answer).length;
   app.append(heading, node('p', 'Ολοκλήρωσες τις 12 οθόνες και τον αυτοέλεγχο των απαντήσεών σου. Στο exit ticket απάντησες σωστά με την πρώτη προσπάθεια σε ' + firstCorrect + ' από ' + exitTasks.length + ' ερωτήσεις.'), node('p', 'Θυμήσου: οι κανόνες υπηρετούν το καλό του ανθρώπου. Η φροντίδα και η αγάπη μάς βοηθούν να καταλαβαίνουμε τον σκοπό τους.'));
   const reflections = node('details'); reflections.append(node('summary', 'Οι σκέψεις που έγραψα'));
   for (const page of lesson.pages) for (const task of page.tasks) if (task.type === 'reflect') reflections.append(node('h3', page.title), node('p', state.tasks[task.id]?.text || '', 'saved-writing'));
   app.append(reflections);
   const actions = node('div', undefined, 'actions');
   const back = node('button', '← Πίσω', 'secondary'); back.onclick = () => { state.step--; save(); render(); };
   const again = node('button', 'Νέα προσπάθεια', 'secondary');
   again.onclick = () => {
    const confirm = node('div', undefined, 'restart-confirm');
    confirm.append(node('p', 'Θέλεις νέα προσπάθεια; Οι απαντήσεις αυτής της καρτέλας θα καθαριστούν.'));
    const yes = node('button', 'Ναι, από την αρχή'); yes.onclick = () => { state = freshState(); save(); render(); };
    const no = node('button', 'Κρατώ τις απαντήσεις μου', 'secondary'); no.onclick = () => { confirm.remove(); again.disabled = false; again.focus(); };
    confirm.append(yes, no); app.append(confirm); again.disabled = true; yes.focus();
   };
   actions.append(back, again); app.append(actions, node('p', lesson.source, 'source')); focusHeading(heading);
  }
  function focusHeading(heading) { heading.tabIndex = -1; heading.focus(); heading.scrollIntoView({block:'start'}); }
  render();
 } catch (error) {
  message('Το μάθημα δεν μπόρεσε να φορτώσει.');
  const retry = node('button', 'Δοκίμασε ξανά'); retry.onclick = start; app.append(retry); console.error(error);
 }
}
start();
