/* 临时脚本：公网端到端验证本次三处改动 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CHROME = 'D:\\GoogleChrome\\Application\\chrome.exe';
const PORT = 9370;
const url = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'gushi-live2b')}`,
  '--window-size=414,896', 'about:blank'
], { stdio: 'ignore' });
const guard = setTimeout(() => { console.log('!! 超时'); try { chrome.kill(); } catch (e) { /* ignore */ } process.exit(1); }, 160000);

(async () => {
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch (e) { /* wait */ }
    await sleep(300);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  const send = (m, p) => { const id = ++seq; ws.send(JSON.stringify({ id, method: m, params: p })); return id; };
  const call = (m, p) => new Promise(r => { const id = send(m, p); pending.set(id, (msg) => r(msg.result)); });
  const evaluate = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : undefined;
  };
  let errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text || '');
    }
  });
  ws.addEventListener('open', () => { send('Runtime.enable'); send('Page.enable'); send('Page.navigate', { url }); });
  await sleep(15000);

  const tb = `(function(){var el=document.querySelector('.taro-tabbar__tabbar');if(!el)return '无TabBar';return getComputedStyle(el).display;})()`;

  await evaluate(`(function(){var l=document.querySelectorAll('input');
    var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(l[0],'demo'); l[0].dispatchEvent(new Event('input',{bubbles:true}));
    s.call(l[1],'demo123456'); l[1].dispatchEvent(new Event('input',{bubbles:true})); return 'ok';})()`);
  await sleep(500);
  await evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('.btn')).filter(function(x){return (x.innerText||'').indexOf('登录')>=0;})[0]; if(b)b.click(); return 'ok';})()`);
  await sleep(9000);
  console.log('首页 TabBar:', await evaluate(tb));

  // 打开表单
  await evaluate("(function(){document.querySelector('.brand-add').click();return 'ok';})()");
  await sleep(2200);
  await evaluate(`(function(){var l=[].slice.call(document.querySelectorAll('.sheet-menu-item')).filter(function(x){return (x.innerText||'').indexOf('批次')>=0;})[0];if(l)l.click();return 'ok';})()`);
  await sleep(2800);
  console.log('表单打开时 TabBar（应 none）:', await evaluate(tb));
  console.log(await evaluate(`(function(){
    var act=document.querySelector('.sheet-actions'); if(!act) return '  未找到按钮区';
    var btns=[].slice.call(act.querySelectorAll('.btn'));
    var r=btns.map(function(b){var x=b.getBoundingClientRect();return {t:b.innerText.trim(),y:Math.round(x.top),bottom:Math.round(x.bottom)};});
    return '  按钮: '+JSON.stringify(r)+' 并排='+(r.length===2&&Math.abs(r[0].y-r[1].y)<3)+' 完整可见='+(r.length?Math.max(r[0].bottom,r[1].bottom)<=window.innerHeight:'-');
  })()`));

  // 取消关闭 → TabBar 恢复
  await evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('.sheet-actions .btn')).filter(function(x){return (x.innerText||'').trim()==='取消';})[0];if(b)b.click();return 'ok';})()`);
  await sleep(2500);
  console.log('点取消后 TabBar（应 block）:', await evaluate(tb));

  // 专家页返回箭头
  await evaluate("location.hash='#/pages/expert/index'; 'ok'");
  await sleep(5000);
  console.log('专家页返回入口:', await evaluate("(function(){var b=document.querySelector('.back-bar');return b?('存在，位置 left='+Math.round(b.getBoundingClientRect().left)+' top='+Math.round(b.getBoundingClientRect().top)):'未找到';})()"));
  console.log('JS 异常:', errors.length ? String(errors[0]).slice(0, 90) : '无');

  clearTimeout(guard);
  ws.close();
  try { chrome.kill(); } catch (e) { /* ignore */ }
})().catch(e => { console.log('脚本出错: ' + e.message); clearTimeout(guard); try { chrome.kill(); } catch (err) { /* ignore */ } });
