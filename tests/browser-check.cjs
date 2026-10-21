// Isolated browser tests mock only the remote HTTP response. Production has no fallback.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=require('../server.cjs');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const fixture=await fs.readFile(path.join(__dirname,'fixtures/public-feed.csv'),'utf8');
 const {parseCSV,lessonForClass}=await import('../assets/feed.js');
 const lesson=lessonForClass(parseCSV(fixture),'st');
 const browser=await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
 try{
  for(const device of [{name:'desktop',viewport:{width:1366,height:900}},{name:'touch-display',viewport:{width:1920,height:1080},hasTouch:true},{name:'narrow-touch',viewport:{width:390,height:844},hasTouch:true,isMobile:true}]){
   const {name,...settings}=device;const context=await browser.newContext(settings);const page=await context.newPage();
   let remoteBody=fixture, status=200, requests=0;const pageErrors=[];const localContent=[];
   page.on('pageerror',error=>pageErrors.push(error.message));
   page.on('request',request=>{if(/assignments\.json|lessons\//.test(request.url()))localContent.push(request.url());});
   await page.route('https://docs.google.com/**',async route=>{requests++;await route.fulfill({status,contentType:'text/csv',body:remoteBody,headers:{'access-control-allow-origin':'*','cache-control':'no-store'}});});
   // Every class URL stays usable and performs a fresh remote request.
   for(const grade of ['a','b','c','d','e']){await page.goto(base+'/classes/'+grade+'/');await page.getByText('Δεν υπάρχει ενεργό μάθημα για σήμερα',{exact:true}).waitFor();}
   await page.goto(base+'/classes/st/');await page.getByText('Οθόνη 1 από 12',{exact:true}).waitFor();
   assert.equal(requests,6);assert.equal(localContent.length,0);
   for(const [index,screen] of lesson.pages.entries()){
    await page.getByRole('heading',{name:screen.title,exact:true}).waitFor();
    assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true,name+' horizontal overflow at '+index);
    if(index===0){await page.getByRole('button',{name:screen.tasks[0].choices[1],exact:true}).click();assert.ok(await page.getByText(/Δοκίμασε ξανά/).isVisible());}
    for(const task of screen.tasks){
     const box=page.locator('#'+task.id);
     if(task.type==='choice')await box.getByRole('button',{name:task.choices[task.answer],exact:true}).click();
     else if(task.type==='match'){
      for(const [i,row]of task.rows.entries())await box.locator('select').nth(i).selectOption(String(row.answer));
      await box.getByRole('button',{name:'Έλεγχος',exact:true}).click();
     }else if(task.type==='sequence'){
      // initialOrder is a single rotation; move the last event to the top.
      const button=box.getByRole('button',{name:'Πάνω: '+task.items[0],exact:true});
      for(let n=1;n<task.items.length;n++)await button.click();
      await box.getByRole('button',{name:'Έλεγχος σειράς',exact:true}).click();
     }else if(task.type==='reflect'){
      await box.getByRole('textbox').fill('Η φροντίδα του ανθρώπου δίνει νόημα στους κανόνες και μας οδηγεί στην αγάπη.');
      await box.getByRole('button',{name:'Σύγκρινε με ένα παράδειγμα',exact:true}).click();
      for(const text of task.criteria)await box.getByLabel(text,{exact:true}).check();
     }
    }
    if(index===4){await page.reload();await page.getByText('Οθόνη 5 από 12',{exact:true}).waitFor();await page.getByRole('button',{name:'← Πίσω',exact:true}).click();await page.getByText('Οθόνη 4 από 12',{exact:true}).waitFor();await page.getByRole('button',{name:'Συνέχεια →',exact:true}).click();}
    const navigation=page.getByRole('button',{name:index===11?'Ολοκλήρωση ✓':'Συνέχεια →',exact:true});assert.ok(await navigation.isEnabled());await navigation.click();
   }
   await page.getByRole('heading',{name:'Μπράβο! Ολοκλήρωσες το μάθημα.',exact:true}).waitFor();
   await page.reload();await page.getByText('Ολοκλήρωσες τις 12 οθόνες του μαθήματος και τις δραστηριότητές σου.',{exact:true}).waitFor();
   assert.equal(await page.locator('a[href*="google"], a[href*="github"]').count(),0);
   // A changed sheet response appears immediately and old progress is discarded.
   remoteBody=fixture.replaceAll('Τι θα μάθω σήμερα;','Νέος τίτλος από το feed');
   await page.reload();await page.getByRole('heading',{name:'Νέος τίτλος από το feed',exact:true}).waitFor();
   status=404;await page.reload();await page.getByText('Το μάθημα δεν μπόρεσε να φορτωθεί. Δοκίμασε ξανά σε λίγο.',{exact:true}).waitFor();
   assert.equal(await page.locator('.lesson-title').count(),0);
   status=200;await page.getByRole('button',{name:'Δοκίμασε ξανά',exact:true}).click();await page.getByRole('heading',{name:'Νέος τίτλος από το feed',exact:true}).waitFor();
   assert.deepEqual(pageErrors,[]);assert.deepEqual(localContent,[]);
   console.log('PASS '+name+': all six routes, 12 screens, retries, refresh, changed feed, no local fallback, no overflow');
   await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
