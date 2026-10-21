const app = document.querySelector('#app');
const grade = document.body.dataset.grade;
const labels = {a:'Α΄',b:'Β΄',c:'Γ΄',d:'Δ΄',e:'Ε΄',st:'Στ΄'};
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function message(text){app.replaceChildren(node('p',text));}
async function json(path){const response=await fetch(new URL(path,import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();}
async function start(){
 if(!labels[grade]){message('Δεν βρέθηκε η τάξη.');return;}
 document.title=labels[grade]+' Τάξη – Μάθημα Σήμερα | Student Player';
 try{
 const assignments=await json('../assignments.json');
 if(!Object.hasOwn(assignments,grade))throw new Error('Missing grade');
 const id=assignments[grade];
 if(id===null){message('Δεν υπάρχει ενεργό μάθημα για σήμερα');return;}
 if(typeof id!=='string'||!(/^[a-z0-9-]+$/).test(id))throw new Error('Invalid lesson');
 const lesson=await json('../lessons/'+id+'.json');
 if(typeof lesson.title!=='string'||!Array.isArray(lesson.pages)||!lesson.pages.length)throw new Error('Invalid content');
 for(const page of lesson.pages){if(typeof page.title!=='string'||typeof page.text!=='string'||(page.choices&&(!Array.isArray(page.choices)||!page.choices.every(c=>typeof c==='string')||!Number.isInteger(page.answer)||page.answer<0||page.answer>=page.choices.length)))throw new Error('Invalid page');}
 let step=-1;const answers=new Map();
 function render(){
 app.replaceChildren();
 if(step===-1){app.append(node('p','Το σημερινό σου μάθημα','eyebrow'),node('h2',lesson.title));const begin=node('button','Ξεκινάμε →');begin.onclick=()=>{step=0;render();};app.append(begin);}
 else if(step===lesson.pages.length){app.append(node('h2','Μπράβο! Ολοκλήρωσες το μάθημα.'),node('p','Συνέχισε με τη μικρή σου πράξη αγάπης σήμερα.'));const again=node('button','Από την αρχή');again.onclick=()=>{step=-1;answers.clear();render();};app.append(again);}
 else{
 const page=lesson.pages[step];const progress=node('progress');progress.max=lesson.pages.length;progress.value=step+1;progress.setAttribute('aria-label','Πρόοδος μαθήματος');
 app.append(node('p','Βήμα '+(step+1)+' από '+lesson.pages.length,'progress'),progress,node('h2',page.title),node('p',page.text));
 const feedback=node('p','','feedback');feedback.setAttribute('role','status');
 const actions=node('div',undefined,'actions');const back=node('button','← Πίσω','secondary');back.onclick=()=>{step--;render();};const next=node('button',step===lesson.pages.length-1?'Ολοκλήρωση ✓':'Συνέχεια →');next.disabled=!!page.choices&&answers.get(step)!==page.answer;next.onclick=()=>{step++;render();};
 if(page.choices){const choices=node('div',undefined,'choices');page.choices.forEach((text,i)=>{const button=node('button',text,'choice');button.setAttribute('aria-pressed',String(answers.get(step)===i));button.onclick=()=>{answers.set(step,i);for(const [j,b] of [...choices.children].entries())b.setAttribute('aria-pressed',String(i===j));feedback.textContent=i===page.answer?'Σωστά! '+page.explanation:'Δοκίμασε ξανά. Σκέψου ποια πράξη δείχνει αγάπη.';next.disabled=i!==page.answer;};choices.append(button);});app.append(choices);if(answers.get(step)===page.answer)feedback.textContent='Σωστά! '+page.explanation;app.append(feedback);}
 actions.append(back,next);app.append(actions);
 }
 if(lesson.source)app.append(node('p',lesson.source,'source'));
 const heading=app.querySelector('h2');heading.tabIndex=-1;heading.focus();
 }
 render();
 }catch(error){message('Το μάθημα δεν μπόρεσε να φορτώσει.');const retry=node('button','Δοκίμασε ξανά');retry.onclick=start;app.append(retry);console.error(error);}
}
start();
