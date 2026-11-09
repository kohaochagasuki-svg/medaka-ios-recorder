import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const server = spawn('python3', ['-m','http.server','8765','--bind','127.0.0.1'], { stdio: 'ignore' });
let browser;
const url = 'http://127.0.0.1:8765';
const errors = [];
async function waitUntil(page, fn) {
  const until=Date.now()+30000;
  while(Date.now()<until) { if(await page.evaluate(fn)) return; await new Promise(r=>setTimeout(r,30)); }
  throw new Error('条件待機がタイムアウト');
}
async function records(page) { return page.evaluate(async () => (await import('/storage.js')).listRecordings()); }
async function ready(page) {
  await page.goto(url); await page.locator('#prepare').waitFor({ state:'visible' });
  await waitUntil(page, () => !document.querySelector('#prepare').disabled);
  await page.click('#prepare');
  await waitUntil(page, () => document.querySelector('#status').textContent === '準備完了');
}
try {
  for(let n=0;n<40;n++) { try { if((await fetch(url)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions:['camera'], viewport:{width:375,height:667} });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const outgoing=[]; page.on('request', r=>{if(!r.url().startsWith(url) && !r.url().startsWith('blob:')) outgoing.push(r.url());});
  if (!process.env.MOCK_ONLY) {
  await ready(page);
  assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
  await mkdir('test-results', {recursive:true});
  await page.screenshot({path:'test-results/iphone-layout.png',fullPage:true});
  await page.click('#test');
  assert.match(await page.locator('#nextLabel').innerText(), /テスト/);
  console.log('実録画：1分の予約待機を開始');
  await page.waitForFunction(() => document.querySelector('#status').textContent === '● 録画中', null, {timeout:65000});
  assert.equal((await records(page)).length,1);
  console.log('実録画：予約開始を確認、30秒の自動停止を待機');
  await page.waitForFunction(() => document.querySelector('#history').textContent.includes('予定時刻で自動停止'), null, {timeout:35000});
  let saved = (await records(page))[0];
  assert.equal(saved.status,'complete'); assert.ok(saved.bytes > 0); assert.ok(saved.chunks >= 1);
  await page.getByRole('button',{name:'再生・書き出しを準備'}).click();
  const savedVideo=page.locator('.record video');
  await savedVideo.evaluate(v=>new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(Error('保存動画を再生できません'));v.load();}));
  assert.ok(await savedVideo.evaluate(v => v.videoWidth > 0));
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('link',{name:'動画を書き出す（ダウンロード）'}).click();
  const download=await downloadPromise; await download.saveAs('test-results/'+download.suggestedFilename());
  console.log(`PASS 実カメラAPI・1分待機・30秒録画・自動停止・IndexedDB・再生・ダウンロード (${saved.bytes} bytes)`);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.record strong'));
  assert.equal((await records(page))[0].bytes,saved.bytes);
  const tab = await context.newPage(); await tab.goto(url);
  await tab.waitForFunction(()=>document.querySelector('#message').textContent.includes('別のタブ'));
  assert.ok(await tab.locator('#prepare').isDisabled()); await tab.close();
  console.log('PASS 再読込後の動画保持・複数タブ排他');
  await ready(page);
  await page.clock.install({time:new Date('2026-11-09T08:59:58+09:00')});
  await page.click('#arm'); await page.clock.runFor(2500);
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='● 録画中');
  assert.equal((await records(page)).length,2);
  await page.clock.runFor(1000); assert.equal((await records(page)).length,2);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#history').textContent.includes('画面が非表示になったため中断'));
  assert.equal((await records(page)).filter(r=>['interrupted','failed'].includes(r.status) && r.reason?.includes('非表示')).length,1);
  assert.ok(await page.locator('#disarm').isDisabled());
  console.log('PASS 日本時間9時の自動開始・重複防止・非表示時の録画中断と予約解除');
  await context.close();
  const denied = await browser.newContext();
  const noCamera=await denied.newPage();
  await noCamera.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('test denied','NotAllowedError');};});
  await noCamera.goto(url); await noCamera.waitForFunction(()=>!document.querySelector('#prepare').disabled); await noCamera.click('#prepare');
  await noCamera.waitForFunction(()=>document.querySelector('#message').textContent.includes('NotAllowedError'));
  assert.ok(await noCamera.locator('#arm').isDisabled()); await denied.close();
  console.log('PASS カメラ拒否時のエラーと予約禁止');
  } else { await context.close(); }
  // Deterministic fault/duration tests. These blobs are mocks, not playable media.
  const mockContext=await browser.newContext({permissions:['camera']});
  await mockContext.addInitScript(()=>{
    class FakeRecorder {
      static isTypeSupported(){return true;}
      constructor(){this.state='inactive';this.mimeType='video/mp4';}
      start(){this.state='recording';this.timer=setInterval(()=>this.ondataavailable?.({data:new Blob(['mock-data'],{type:this.mimeType})}),5000);}
      stop(){this.state='inactive';clearInterval(this.timer);this.ondataavailable?.({data:new Blob(['end'],{type:this.mimeType})});setTimeout(()=>this.onstop?.(),0);}
    }
    window.MediaRecorder=FakeRecorder;
  });
  const mock=await mockContext.newPage(); mock.on('pageerror', e => errors.push(e.message));
  await mock.clock.install({time:new Date('2026-11-09T16:59:57+09:00')});
  await mock.clock.pauseAt(new Date('2026-11-09T16:59:58+09:00'));
  await ready(mock);
  await mock.click('#arm'); await mock.clock.runFor(2500);
  await waitUntil(mock, ()=>document.querySelector('#status').textContent==='● 録画中');
  await mock.clock.runFor(1800000);
  await mock.clock.runFor(1000);
  await waitUntil(mock, ()=>document.querySelector('#history').textContent.includes('予定時刻で自動停止'));
  const full=(await records(mock))[0]; assert.equal(full.status,'complete'); assert.ok(full.chunks>=359);
  console.log('PASS 模擬時計・模擬録画：17時開始・30分自動停止・断片保存');
  // Start again at next morning and inject IndexedDB write failure.
  await mock.clock.setSystemTime(new Date('2026-11-10T08:59:58+09:00'));
  await mock.click('#disarm'); await mock.click('#arm'); await mock.clock.runFor(2500);
  await waitUntil(mock, ()=>document.querySelector('#status').textContent==='● 録画中');
  await mock.evaluate(()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(...args){if(this.name==='chunks')throw new DOMException('test disk full','QuotaExceededError');return put.apply(this,args);}; });
  await mock.clock.runFor(6000);
  await waitUntil(mock, ()=>document.querySelector('#history').textContent.includes('QuotaExceededError'));
  await mock.clock.runFor(1000);
  await waitUntil(mock, ()=>document.querySelector('#status').textContent!=='保存処理中');
  assert.ok((await records(mock)).some(r=>r.status==='failed'));
  assert.ok(await mock.locator('#disarm').isDisabled());
  console.log('PASS 模擬容量不足：失敗履歴・自動停止・予約解除');
  // Recover an unfinished entry after a hard page termination.
  await mockContext.close();
  const recovery=await browser.newContext(); const recovered=await recovery.newPage(); await recovered.goto(url);
  await recovered.waitForFunction(()=>!document.querySelector('#prepare').disabled);
  await recovered.evaluate(async()=>{const s=await import('/storage.js');await s.putRecording({id:'crash',started:Date.now(),status:'recording',bytes:0,chunks:0,mime:'video/mp4',kind:'テスト'});});
  await recovered.reload(); await recovered.waitForFunction(()=>document.querySelector('#history').textContent.includes('前回の録画終了を確認できません'));
  assert.equal((await records(recovered))[0].status,'interrupted');
  await recovery.close();
  assert.deepEqual(errors,[]); assert.deepEqual(outgoing,[]);
  console.log('PASS 異常終了の復旧・未処理JSエラーなし・アプリからの外部リクエストなし');
} finally { await browser?.close(); server.kill(); }
