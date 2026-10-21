const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lesson=JSON.parse(fs.readFileSync(path.join(__dirname,'../lessons/therapeia-sygkyptousas.json'),'utf8'));
const model=import('../assets/lesson-model.js');
test('12 screens provide 38 minutes and all requested activity types',async()=>{
 const {validateLesson}=await model; validateLesson(lesson);
 assert.equal(lesson.pages.length,12);assert.equal(lesson.pages.reduce((n,p)=>n+p.minutes,0),38);
 assert.equal(lesson.pages[4].tasks.length,3);assert.equal(lesson.pages.at(-1).tasks.length,4);
 assert.deepEqual(lesson.pages[4].tasks.map(t=>t.answer),[1,2,0]);
 for(const type of ['choice','reflect','match','sequence'])assert.ok(lesson.pages.some(p=>p.tasks.some(t=>t.type===type)));
});
test('invalid content fails validation before rendering',async()=>{
 const {validateLesson}=await model;
 for(const change of [l=>l.pages[0].tasks[0].type='unknown',l=>l.pages[4].tasks[0].answer=99,l=>l.pages[3].tasks[0].initialOrder=[0,0],l=>l.pages[1].tasks[0].rows[0].answer=-1,l=>l.pages[0].tasks[0].id='context']){
  const copy=structuredClone(lesson);change(copy);assert.throws(()=>validateLesson(copy));
 }
});
test('choice grading and page gates respond to changed answers',async()=>{
 const {isComplete,pageComplete}=await model;const page=lesson.pages[4];const state={};
 for(const t of page.tasks)state[t.id]={selected:t.answer};assert.ok(pageComplete(page,state));
 state[page.tasks[0].id].selected=0;assert.equal(pageComplete(page,state),false);
 assert.equal(isComplete(page.tasks[0],{}),false);
});
test('matching and sequencing require a checked, correct submission',async()=>{
 const {isComplete}=await model;const match=lesson.pages[1].tasks[0];const values=match.rows.map(r=>r.answer);
 assert.equal(isComplete(match,{values}),false);assert.ok(isComplete(match,{values,checked:true}));
 assert.equal(isComplete(match,{values:[0,0,0],checked:true}),false);
 const sequence=lesson.pages[3].tasks[0];const order=sequence.items.map((_,i)=>i);
 assert.equal(isComplete(sequence,{order}),false);assert.ok(isComplete(sequence,{order,checked:true}));
 assert.equal(isComplete(sequence,{order:[0,1],checked:true}),false);
 assert.equal(isComplete(sequence,{order:sequence.initialOrder,checked:true}),false);
});
test('reflection needs writing, comparison and all self-review criteria',async()=>{
 const {isComplete}=await model;const task=lesson.pages[0].tasks[0];const text='Μια επαρκώς αναπτυγμένη σκέψη για τον σκοπό του κανόνα.';
 assert.equal(isComplete(task,{text}),false);assert.equal(isComplete(task,{text,reviewed:true,criteria:[true,false]}),false);
 assert.ok(isComplete(task,{text,reviewed:true,criteria:[true,true]}));
 assert.equal(isComplete(task,{text:' ',reviewed:true,criteria:[true,true]}),false);
});
test('restore handles malformed/stale saves and prevents skipping work',async()=>{
 const {restoreState,freshState}=await model;
 for(const raw of ['bad','null',JSON.stringify({version:1}),JSON.stringify({version:2,title:lesson.title,tasks:[]})])assert.deepEqual(restoreState(raw,lesson),freshState());
 const saved={version:2,title:lesson.title,step:12,tasks:{}};
 assert.equal(restoreState(JSON.stringify(saved),lesson).step,0);
 const task=lesson.pages[0].tasks[0];saved.tasks[task.id]={text:'Θα ζητήσω βοήθεια για να προστατευτεί ο άνθρωπος.',reviewed:true,criteria:[true,true]};
 assert.equal(restoreState(JSON.stringify(saved),lesson).step,1);
 const sequence=lesson.pages[3].tasks[0];saved.tasks[sequence.id]={order:[5,5,5,5,5,5],checked:true};
 assert.deepEqual(restoreState(JSON.stringify(saved),lesson).tasks[sequence.id].order,sequence.initialOrder);
});
test('a completed lesson restores completion and first-attempt results',async()=>{
 const {restoreState}=await model;const tasks={};
 for(const page of lesson.pages)for(const t of page.tasks){
  if(t.type==='choice')tasks[t.id]={selected:t.answer,first:t.answer};
  if(t.type==='match')tasks[t.id]={values:t.rows.map(r=>r.answer),checked:true};
  if(t.type==='sequence')tasks[t.id]={order:t.items.map((_,i)=>i),checked:true};
  if(t.type==='reflect')tasks[t.id]={text:'Μια αναπτυγμένη απάντηση με σκέψεις για τη φροντίδα.',reviewed:true,criteria:t.criteria.map(()=>true)};
 }
 const restored=restoreState(JSON.stringify({version:2,title:lesson.title,step:12,tasks}),lesson);
 assert.equal(restored.step,12);assert.equal(restored.tasks['exit-1'].first,0);
});
