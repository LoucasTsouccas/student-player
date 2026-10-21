// Public CSV is the only runtime content source. No credential or private Sheet API.
import {validateLesson, validOrder} from './lesson-model.js';
export const FEED_URL = 'https://docs.google.com/spreadsheets/d/1K5p8weVhnbY6ygdl2rmreslnfeNsHB_vw0X0E_FhuoY/export?format=csv&gid=236172835';
export const LOAD_ERROR = 'Το μάθημα δεν μπόρεσε να φορτωθεί. Δοκίμασε ξανά σε λίγο.';
export const SCREEN_TYPES = ['intro','info','story','sequence','mcq','interpretation','before_after','compare','matching','application','exit'];
const COLUMNS = ['record_type','class_key','lesson_id','step_no','type','title','prompt','content','choices_json','correct_answer','feedback'];

// RFC 4180-style fields: quoted commas, escaped quotes, CRLF and multiline text.
export function parseCSV(text) {
 if (typeof text !== 'string' || text.length > 5000000) throw new Error('Invalid CSV size');
 text = text.replace(/^\uFEFF/, '');
 const rows = []; let row = [], field = '', quoted = false, closed = false;
 const endField = () => { row.push(field); field = ''; closed = false; };
 const endRow = () => { endField(); if (row.some(cell => cell.trim() !== '')) rows.push(row); row = []; };
 for (let i = 0; i < text.length; i++) {
  const char = text[i];
  if (quoted) {
   if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
   else field += char;
  } else if (char === ',') endField();
  else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
  else if (char === '"' && field === '' && !closed) quoted = true;
  else { if (closed || char === '"') throw new Error('Malformed CSV quotes'); field += char; }
 }
 if (quoted) throw new Error('Unterminated CSV field');
 if (field || row.length || closed) endRow();
 if (!rows.length) throw new Error('Empty CSV');
 const headers = rows.shift().map(h => h.trim());
 if (new Set(headers).size !== headers.length || COLUMNS.some(column => !headers.includes(column))) throw new Error('Invalid CSV headers');
 return rows.map(cells => {
  if (cells.length > headers.length) throw new Error('Too many CSV cells');
  return Object.fromEntries(headers.map((name, i) => [name, (cells[i] || '').trim()]));
 });
}

function choicesFor(row) {
 const choices = JSON.parse(row.choices_json || '[]');
 if (!Array.isArray(choices)) throw new Error('choices_json must be an array');
 if (!choices.every(c => typeof c === 'string' || (c && typeof c === 'object' && !Array.isArray(c)))) throw new Error('Invalid choices');
 return choices;
}
function strings(choices) {
 if (!choices.every(c => typeof c === 'string' && c.trim())) throw new Error('Expected text choices');
 return choices;
}
function indexAnswer(raw, choices) {
 if (/^\d+$/.test(raw)) { const answer = Number(raw); if (answer < choices.length) return answer; }
 const index = choices.indexOf(raw);
 if (index >= 0) return index;
 throw new Error('Invalid correct_answer');
}
function numbered(text) {
 const matches = [...text.matchAll(/(?:^|\s)(\d+)[.)]\s+([\s\S]*?)(?=\s+\d+[.)]\s+|$)/g)];
 return matches.map(match => ({number:Number(match[1]), text:match[2].trim()}));
}
function answerList(raw) {
 const values = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',').map(v => Number(v.trim()));
 if (!Array.isArray(values) || !values.every(Number.isInteger)) throw new Error('Invalid answer list');
 return values;
}
function reflection(id, prompt, feedback) {
 return {id, type:'reflect', prompt, minLength:15, model:feedback || 'Ξαναδιάβασε το κείμενο και σύγκρινε τη σκέψη σου με όσα περιγράφει. Δεν υπάρχει αυτόματη βαθμολόγηση της γραπτής απάντησης.', criteria:['Έγραψα δική μου απάντηση που εξηγεί τη σκέψη μου.','Ξαναδιάβασα το κείμενο και έλεγξα αν χρειάζεται συμπλήρωση.'], modelTitle:'Σκέψου και έλεγξε'};
}
function matchingTask(id, prompt, pairs, feedback, rawAnswer = '') {
 if (pairs.length < 2 || !pairs.every(p => p.left && p.right)) throw new Error('Invalid matching pairs');
 const options = [...new Set(pairs.map(p => p.right))].reverse();
 const overrides = rawAnswer ? answerList(rawAnswer) : null;
 if (overrides && (overrides.length !== pairs.length || overrides.some(i => i < 0 || i >= options.length))) throw new Error('Invalid matching answer');
 return {id, type:'match', prompt, options, rows:pairs.map((pair, i) => ({label:pair.left, answer:overrides ? overrides[i] : options.indexOf(pair.right), hint:'Ξαναδιάβασε το κείμενο και σύγκρινε τις διαθέσιμες επιλογές.'})), explanation:feedback};
}
function adaptScreen(row) {
 if (!SCREEN_TYPES.includes(row.type)) throw new Error('Unsupported screen type');
 const step = Number(row.step_no);
 if (!/^\d+$/.test(row.step_no) || !Number.isSafeInteger(step) || step < 1 || !row.title) throw new Error('Invalid screen');
 const page = {title:row.title, text:row.content, screenType:row.type, stepNo:step, tasks:[]};
 if (row.minutes) { page.minutes = Number(row.minutes); if (!Number.isFinite(page.minutes) || page.minutes <= 0) throw new Error('Invalid minutes'); }
 const id = 'screen-' + step;
 const choices = choicesFor(row);
 const prompt = row.prompt || row.title;
 if (row.type === 'sequence') {
  const events = choices.length ? strings(choices).map((text, i) => ({number:i + 1, text})) : numbered(row.content);
  if (events.length < 2 || new Set(events.map(e => e.number)).size !== events.length) throw new Error('Missing sequence events');
  let order = row.correct_answer ? answerList(row.correct_answer).map(n => events.findIndex(e => e.number === n)) : events.map((_, i) => i);
  if (!validOrder(order, events.length)) throw new Error('Invalid correct sequence');
  const items = order.map(i => events[i].text);
  page.text = ''; // Avoid displaying the numbered solution above the activity.
  page.tasks.push({id, type:'sequence', prompt, items, initialOrder:items.map((_, i) => (i + 1) % items.length), explanation:row.feedback || 'Έβαλες τα γεγονότα στη σωστή σειρά.'});
 } else if (row.type === 'matching') {
  const pairs = choices.map(choice => {
   if (typeof choice === 'object') return {left:choice.left, right:choice.right};
   const split = choice.search(/=|→/);
   return split < 0 ? {} : {left:choice.slice(0, split).trim(), right:choice.slice(split + 1).trim()};
  });
  page.text = ''; page.tasks.push(matchingTask(id, prompt, pairs, row.feedback, row.correct_answer));
 } else if (row.type === 'compare' && choices.length && !row.correct_answer) {
  const pairs = strings(choices).map(text => { const split = text.indexOf(':'); return {left:text.slice(split + 1).trim(), right:split < 0 ? '' : text.slice(0, split).trim()}; });
  if (pairs.every(pair => pair.right)) page.tasks.push(matchingTask(id, prompt, pairs, row.feedback));
  else { page.tiles = choices; page.tasks.push(reflection(id, prompt, row.feedback)); }
 } else if (row.type === 'before_after' && !choices.length && !row.correct_answer) {
  const parts = /ΠΡΙΝ\s*:\s*([\s\S]+?)\s*ΜΕΤΑ\s*:\s*([\s\S]+)/iu.exec(row.content);
  if (parts) {
   page.text = ''; const pairs = [];
   for (const [index, label] of ['ΠΡΙΝ','ΜΕΤΑ'].entries()) for (const text of parts[index + 1].split(/,|\s+και\s+/).map(s => s.trim().replace(/[.]$/, '')).filter(Boolean)) pairs.push({left:text, right:label});
   page.tasks.push(matchingTask(id, prompt, pairs, row.feedback));
  } else page.tasks.push(reflection(id, prompt, row.feedback));
 } else if (row.type === 'exit' && !choices.length && !row.correct_answer) {
  const questions = numbered(row.content);
  if (questions.length) { page.text = ''; page.tasks = questions.map((question, i) => reflection(id + '-q' + (i + 1), question.text, row.feedback)); }
  else page.tasks.push(reflection(id, prompt, row.feedback));
 } else if (choices.length && row.correct_answer !== '') {
  const texts = strings(choices);
  page.tasks.push({id, type:'choice', prompt, choices:texts, answer:indexAnswer(row.correct_answer, texts), explanation:row.feedback || 'Η απάντησή σου είναι σωστή.', hint:'Ξαναδιάβασε το κείμενο και δοκίμασε μια άλλη επιλογή.'});
 } else if (row.type === 'info' || row.type === 'story') {
  page.prompt = row.prompt; page.tiles = strings(choices); page.note = row.feedback;
 } else if (choices.length) {
  page.tasks.push({id, type:'opinion', prompt, choices:strings(choices), explanation:row.feedback || 'Κράτησε τη σκέψη σου και συνέχισε την εξερεύνηση.'});
 } else page.tasks.push(reflection(id, prompt, row.feedback));
 return page;
}
function revision(value) {
 // Content fingerprint invalidates saved answers after an edit to this lesson.
 let hash = 14695981039346656037n;
 for (const char of JSON.stringify(value)) { hash ^= BigInt(char.codePointAt(0)); hash = BigInt.asUintN(64, hash * 1099511628211n); }
 return 'csv-' + hash.toString(16);
}
export function lessonForClass(rows, grade) {
 if (!['a','b','c','d','e','st'].includes(grade)) throw new Error('Unknown grade');
 const assignments = rows.filter(row => row.record_type === 'assignment' && row.class_key.toLowerCase() === grade);
 if (assignments.length > 1) throw new Error('Ambiguous assignment');
 if (!assignments.length || !assignments[0].lesson_id) return null;
 const id = assignments[0].lesson_id;
 const lessons = rows.filter(row => row.record_type === 'lesson' && row.lesson_id === id);
 if (lessons.length !== 1 || !lessons[0].title) throw new Error('Missing or duplicate lesson');
 const source = lessons[0];
 const screens = rows.filter(row => row.record_type === 'screen' && row.lesson_id === id).map(adaptScreen).sort((a,b) => a.stepNo - b.stepNo);
 if (!screens.length || new Set(screens.map(s => s.stepNo)).size !== screens.length) throw new Error('Missing or duplicate screens');
 const lesson = {id, title:source.title, description:source.content, source:'', pages:screens};
 if (source.duration) lesson.duration = source.duration;
 lesson.version = revision(lesson);
 return validateLesson(lesson);
}
let fetchSerial = 0;
export async function fetchLesson(grade, {fetchImpl = globalThis.fetch, url = FEED_URL, timeoutMs = 20000} = {}) {
 const requestURL = new URL(url);
 requestURL.searchParams.set('_sp', Date.now() + '-' + (++fetchSerial));
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
  const response = await fetchImpl(requestURL.href, {cache:'no-store', credentials:'omit', redirect:'follow', referrerPolicy:'no-referrer', signal:controller.signal});
  if (!response.ok) throw new Error('Feed HTTP ' + response.status);
  const type = response.headers?.get('content-type') || '';
  if (/text\/html/i.test(type)) throw new Error('Expected CSV, received HTML');
  return lessonForClass(parseCSV(await response.text()), grade);
 } finally { clearTimeout(timer); }
}
