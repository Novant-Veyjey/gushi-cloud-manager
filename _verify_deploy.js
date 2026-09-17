/* 临时脚本：验证公网部署（页面 / 接口 / 交易功能产物） */
const BASE = process.argv[2];

async function api(url, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); } catch (e) { json = { message: raw.slice(0, 100) }; }
  return { status: res.status, ok: res.ok, json };
}

(async () => {
  console.log('=== 基础检查 ===');
  const home = await fetch(BASE);
  const html = await home.text();
  console.log(`  首页: HTTP ${home.status}`);
  const cssPath = (html.match(/\/css\/app\.[a-z0-9]+\.css/) || [])[0];
  const jsPaths = [...html.matchAll(/\/js\/[a-z0-9]+\.[a-z0-9]+\.js/g)].map((m) => m[0]);
  console.log(`  资源: css=${cssPath || '未找到'} js=${jsPaths.length} 个`);

  const health = await api('/api/health');
  console.log(`  健康: ${health.json.data ? health.json.data.status + ' AI=' + health.json.data.ai_configured : '失败'}`);

  console.log('=== 交易功能是否已部署 ===');
  let hasBuy = false;
  let hasOrder = false;
  for (const p of jsPaths) {
    const txt = await (await fetch(BASE + p)).text();
    if (txt.includes('立即采购')) hasBuy = true;
    if (txt.includes('确认收货') || txt.includes('订单号')) hasOrder = true;
  }
  console.log(`  前端含「立即采购」入口: ${hasBuy}`);
  console.log(`  前端含订单界面文案: ${hasOrder}`);

  console.log('=== 订单接口与权限 ===');
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'demo', password: 'demo123456' } });
  if (!login.ok) { console.log('  demo 登录失败: ' + login.json.message); return; }
  const token = login.json.data.token;
  const role = login.json.data.user.role;
  console.log(`  demo 登录成功（${role}）`);

  const list = await api('/api/orders', { token });
  console.log(`  GET /api/orders: HTTP ${list.status}，${Array.isArray(list.json.data) ? list.json.data.length + ' 条订单' : list.json.message}`);

  const noAuth = await api('/api/orders');
  console.log(`  未登录访问: HTTP ${noAuth.status}（应为 401）`);

  const shared = await api('/api/products/shared', { token });
  const items = shared.json.data || [];
  console.log(`  可采购货源: ${items.length} 条${items.length ? '（' + items.slice(0, 2).map((i) => `${i.name} ${i.quantity}${i.unit} ¥${i.price}`).join('；') + '）' : ''}`);

  // 下单 → 支付 → 取消，验证公网后端交易链路真实可用（测试后取消并回补库存）
  if (items.length) {
    const target = items[0];
    const before = Number(target.quantity);
    const create = await api('/api/orders', {
      method: 'POST', token,
      body: { product_id: target.id, quantity: 1, contact: '13800000000', address: '部署验证用地址（稍后取消）', pay_method: 'online' }
    });
    if (!create.ok) {
      console.log(`  下单失败: ${create.json.message}`);
    } else {
      const order = create.json.data;
      console.log(`  下单成功: ${order.order_no} ¥${order.amount} 状态=${order.status_label}`);
      const pay = await api(`/api/orders/${order.id}/pay`, { method: 'POST', token });
      console.log(`  支付: ${pay.ok ? '成功 → ' + pay.json.data.status_label : pay.json.message}`);
      const cancel = await api(`/api/orders/${order.id}/cancel`, { method: 'POST', token, body: { reason: '部署验证后取消' } });
      console.log(`  取消: ${cancel.ok ? '成功 → ' + cancel.json.data.status_label : cancel.json.message}`);
      const after = await api('/api/products/shared', { token });
      const same = (after.json.data || []).find((i) => i.id === target.id);
      console.log(`  库存回补: ${before} → ${same ? same.quantity : '?'} ${same && Number(same.quantity) === before ? '（已还原）' : '（异常）'}`);
      const finalList = await api('/api/orders', { token });
      const left = (finalList.json.data || []).filter((o) => o.status !== 'cancelled');
      console.log(`  未完成订单: ${left.length} 条（验证数据已取消，不残留）`);
    }
  }
})().catch((e) => console.error('验证异常:', e.message));
