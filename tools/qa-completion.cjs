// Hosted-browser regression. Development server required for diagnostic API.
const fs = require('node:fs');
fs.mkdirSync('/tmp/suture-qa', {recursive:true});
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:720,height:480}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__SUTURE__?.loaded,{timeout:50000});
 // Technical geometry/state regression: use the development API to position a tool,
 // then operate through real held pointer input. This is not a novice-player test.
 await page.evaluate(()=>{const e=window.__SUTURE__;e.setQuality('balanced');e.location='surgery';e.start();});
 await page.mouse.move(400,200);
 const waitTicks=async(n)=>{const t=await page.evaluate(()=>window.__SUTURE__.state.elapsed);await page.waitForFunction(t=>window.__SUTURE__.state.elapsed>t+.12,t,{timeout:20000});};
 async function aim(x,y){await page.evaluate(()=>{const e=window.__SUTURE__;e.target.z=1.0});await waitTicks();await page.evaluate(({x,y})=>{const e=window.__SUTURE__;e.target.set(x,y,1)},{x,y});await waitTicks();await page.evaluate(({x,y})=>{const e=window.__SUTURE__;e.target.z=e.surface(x,y)+.14},{x,y});await waitTicks();}
 for(let i=0;i<4;i++){
  const p=await page.evaluate(i=>window.__SUTURE__.state.pockets[i],i);await aim(p.x,p.y);
  await page.mouse.down();
  try{await page.waitForFunction(i=>{const s=window.__SUTURE__.state;return s.pockets[i].remaining<.002||s.status==='failed'},i,{timeout:45000});}finally{await page.mouse.up();}
  const state=await page.evaluate(()=>({status:window.__SUTURE__.state.status,injury:window.__SUTURE__.state.injury,feedback:window.__SUTURE__.state.feedback,pockets:window.__SUTURE__.state.pockets.map(x=>x.remaining)}));console.log('POCKET',i,JSON.stringify(state));
  if(state.status==='failed')throw Error('Geometry integration failed during controlled approach');
  if(i===0)await page.screenshot({path:'/tmp/suture-qa/partial-aspiration.png'});
 }
 await page.keyboard.press('2');await aim(0,-.6);await page.mouse.down();
 try{await page.waitForFunction(()=>window.__SUTURE__.state.clarity>.9||window.__SUTURE__.state.status==='failed',{timeout:45000})}finally{await page.mouse.up();}
 await page.waitForFunction(()=>window.__SUTURE__.state.status==='success'||window.__SUTURE__.state.status==='failed',{timeout:45000});
 await page.screenshot({path:'/tmp/suture-qa/result.png'});
 console.log('RESULT',await page.evaluate(()=>({status:window.__SUTURE__.state.status,injury:window.__SUTURE__.state.injury,events:window.__SUTURE__.state.events})),errors);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
