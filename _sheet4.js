/* 临时脚本：滑到底后验证按钮可见 */
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const CHROME = 'D:\\GoogleChrome\\Application\\chrome.exe';
const PORT = 9290;
const url = process.argv[2] || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'gushi-sheet4')}`,
  '--window-size=360,640', 'about:blank'
], { stdio: 'ignore' });
const guard = setTimeout(() => { console.log('超时退出'); try { chrome.kill(); } catch (e) {} process.exit(1); }, 90000);

(async () => {
  let targets = [];
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(300);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  const send = (m, p) => { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return id; };
  const call = (m, p) => new Promise(r => { const id = send(m, p); pending.set(id, (msg) => r(msg.result)); });
  const evaluate = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true }); return r && r.result ? r.result.value : undefined; };
  const shot = (n) => call('Page.captureScreenshot', { format: 'png' }).then(r => r && r.data && fs.writeFileSync(n, Buffer.from(r.data, 'base64')));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  ws.addEventListener('open', () => { send('Runtime.enable'); send('Page.enable'); send('Page.navigate', { url }); });
  await sleep(13000);

  await evaluate(`(function(){var l=document.querySelectorAll('input');
    var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(l[0],'demo'); l[0].dispatchEvent(new Event('input',{bubbles:true}));
    s.call(l[1],'demo123456'); l[1].dispatchEvent(new Event('input',{bubbles:true})); return 'ok';})()`);
  await sleep(400);
  await evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('.btn')).filter(function(x){return (x.innerText||'').indexOf('登录')>=0;})[0]; if(b)b.click(); return 'ok';})()`);
  await sleep(7000);
  await evaluate("(function(){var b=document.querySelector('.brand-add'); if(b)b.click(); return 'ok';})()");
  await sleep(2000);
  await evaluate(`(function(){var l=[].slice.call(document.querySelectorAll('.sheet-menu-item')).filter(function(x){return (x.innerText||'').indexOf('批次')>=0;})[0]; if(l)l.click(); return 'ok';})()`);
  await sleep(2500);

  // 滚到底
  await evaluate("(function(){var b=document.querySelector('.sheet-body'); b.scrollTop=b.scrollHeight; return 'ok';})()");
  await sleep(800);
  const r = await evaluate(`(function(){
    var acts = document.querySelectorAll('.sheet-actions');
    var last = acts[acts.length - 1].getBoundingClientRect();
    var save = [].slice.call(document.querySelectorAll('.sheet-actions .btn')).filter(function(b){ return b.innerText.indexOf('保存') >= 0; })[0];
    return JSON.stringify({
      视口: window.innerHeight,
      按钮底: Math.round(last.bottom),
      按钮完整可见: last.bottom <= window.innerHeight,
      保存按钮文字: save ? save.innerText : '(未找到)'
    });
  })()`);
  console.log('滚到底后:', r);
  await shot('sheet_scrolled.png');

  clearTimeout(guard);
  ws.close();
  try { chrome.kill(); } catch (e) {}
})().catch(e => { console.log('脚本出错：' + e.message); clearTimeout(guard); try { chrome.kill(); } catch (err) {} });
