// Hosted-browser regression. Development server required for diagnostic API.
const fs = require('node:fs');
fs.mkdirSync('/tmp/suture-qa', {recursive:true});
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1672,height:941}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__SUTURE__?.loaded,null,{timeout:50000});
 await page.screenshot({path:'/tmp/suture-qa/final-room.png'});
 await page.setViewportSize({width:960,height:600});
 await page.getByRole('button',{name:'Enter operating room',exact:true}).click();await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.__SUTURE__.state.status==='paused');console.log('ROOM_ESCAPE_PASS');
 await page.getByRole('button',{name:'Return to the field',exact:true}).click();
 await page.keyboard.down('w');try{await page.waitForFunction(()=>window.__SUTURE__.room.nearTray,null,{timeout:30000})}finally{await page.keyboard.up('w')}
 await page.keyboard.press('3');await page.waitForTimeout(150);await page.keyboard.press('e');
 await page.waitForFunction(()=>window.__SUTURE__.heldTool==='bipolar');console.log('PICK_SELECTED_TOOL_PASS');
 await page.keyboard.press('1');await page.keyboard.press('e');
 await page.keyboard.down('w');try{await page.waitForFunction(()=>window.__SUTURE__.room.prompt==='Enter surgical view',null,{timeout:35000})}finally{await page.keyboard.up('w')}
 await page.keyboard.press('e');await page.waitForFunction(()=>window.__SUTURE__.location==='surgery');
 await page.evaluate(()=>{const e=window.__SUTURE__;e.target.set(-.9,.3,-.4);e.pause();});
 assert.equal(await page.evaluate(()=>window.__SUTURE__.target.equals(window.__SUTURE__.tip)),true);
 await page.getByRole('button',{name:'Return to the field',exact:true}).click();
 await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.__SUTURE__.state.injury),0);console.log('PENDING_MOVEMENT_DISCARDED_PASS');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>window.__SUTURE__.state.status==='paused');
 console.log('BLUR_PAUSE_PASS');
 await page.getByRole('button',{name:'Return to the field',exact:true}).click();
 await page.setViewportSize({width:1672,height:941});await page.waitForTimeout(1000);await page.screenshot({path:'/tmp/suture-qa/final-surgery.png'});
 await page.setViewportSize({width:720,height:480});
 await page.evaluate(()=>{const e=window.__SUTURE__;e.setQuality('balanced');e.target.set(-1.1,-.2,.8);});
 const t=await page.evaluate(()=>window.__SUTURE__.state.elapsed);await page.waitForFunction(t=>window.__SUTURE__.state.elapsed>t+.2,t);
 await page.evaluate(()=>{const e=window.__SUTURE__;e.target.z=e.surface(-1.1,-.2)-.12;});
 await page.waitForFunction(()=>window.__SUTURE__.state.status==='failed',null,{timeout:30000});
 await page.screenshot({path:'/tmp/suture-qa/failure.png'});
 console.log('FAILURE',await page.evaluate(()=>({status:window.__SUTURE__.state.status,events:window.__SUTURE__.state.events.filter(x=>x.type==='failure')})));
 await page.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>window.__SUTURE__.state.status==='running');
 assert.equal(await page.evaluate(()=>window.__SUTURE__.state.injury),0);console.log('RETRY_PASS');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.__SUTURE__.state.status==='paused');
 assert.equal(await page.locator('.small-screen').isVisible(),true);assert.equal(await page.evaluate(()=>document.body.scrollWidth<=390),true);
 await page.screenshot({path:'/tmp/suture-qa/mobile.png'});console.log('PORTRAIT_SAFE_PAUSE_PASS');
 console.log('ERRORS',JSON.stringify(errors));assert.equal(errors.length,0);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
