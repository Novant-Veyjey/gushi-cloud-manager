const { app, db } = require('./app');
const { hashPassword } = require('./auth');

async function request(base, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(base + path, { method: options.method || 'GET', headers, body: options.body });
  let json = null;
  try {
    json = await response.json();
  } catch (error) {
    json = null;
  }
  if (options.expectStatus) {
    if (response.status !== options.expectStatus) {
      throw new Error(`${path}: 期望状态 ${options.expectStatus}，实际 ${response.status} ${json?.message || ''}`);
    }
    return json;
  }
  if (!response.ok) throw new Error(`${path}: ${response.status} ${json?.message || ''}`);
  return json.data;
}

function decodeJwt(token) {
  const part = String(token).split('.')[1];
  const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8'));
}

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const createdUsers = [];
  const tables = ['alerts', 'trace_events', 'readings', 'products', 'demands', 'tasks', 'expert_questions', 'batches', 'bases', 'partners', 'devices', 'ingest_logs', 'sessions'];

  async function registerUser(role, tag) {
    const result = await request(base, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `${tag}_${suffix}`, password: 'test123456', display_name: tag, role })
    });
    createdUsers.push(result.user);
    return result;
  }

  try {
    // 1. 公开接口
    const health = await request(base, '/api/health');
    if (health.status !== 'ok') throw new Error('health check failed');
    const roleInfo = await request(base, '/api/auth/roles');
    if (!roleInfo.permissions || !roleInfo.permissions.buyer) throw new Error('权限矩阵未返回');

    // 2. 未登录一律 401
    await request(base, '/api/bases', { expectStatus: 401 });
    await request(base, '/api/dashboard', { expectStatus: 401 });

    // 3. 注册两个账号
    const alice = await registerUser('farmer', 'alice');
    const bob = await registerUser('base', 'bob');
    if (!alice.token || !bob.token) throw new Error('注册未返回 token');

    // 4. JWT 结构校验
    const payload = decodeJwt(alice.token);
    if (!payload.sub || !payload.jti || !payload.exp || payload.role !== 'farmer') throw new Error('JWT 载荷不正确');
    if (alice.token.split('.').length !== 3) throw new Error('JWT 格式不正确');
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT 已过期');

    // 5. 不允许自助注册平台管理员
    const sneaky = await registerUser('admin', 'sneaky');
    if (sneaky.user.role !== 'farmer') throw new Error('自助注册不应获得平台管理员角色');

    // 6. 重复注册 409、密码错误 401
    await request(base, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `alice_${suffix}`, password: 'test123456' }),
      expectStatus: 409
    });
    await request(base, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: `alice_${suffix}`, password: 'wrong-password' }),
      expectStatus: 401
    });

    // 7. 登录 + me（带权限矩阵）
    const login = await request(base, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: `alice_${suffix}`, password: 'test123456' })
    });
    const me = await request(base, '/api/auth/me', { token: login.token });
    if (me.username !== `alice_${suffix}` || !me.permissions) throw new Error('auth/me 返回不正确');

    // 8. 微信一键登录：未配置 AppID 时必须明确提示，不能静默失败
    if (!process.env.WX_APPID) {
      const wechat = await request(base, '/api/auth/wechat', {
        method: 'POST',
        body: JSON.stringify({ code: 'fake-code' }),
        expectStatus: 501
      });
      if (!/AppID/.test(wechat.message)) throw new Error('微信登录未配置时的提示不明确');
    }

    // 9. alice 录入真实数据
    const createdBase = await request(base, '/api/bases', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ name: '自动化测试基地', township: '测试乡镇', status: 'active' })
    });
    const createdBatch = await request(base, '/api/batches', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({
        code: `TEST-${suffix}`,
        base_id: createdBase.id,
        mushroom_type: '香菇',
        quantity: 100,
        stage: '接种期',
        start_date: '2026-09-15',
        status: 'active'
      })
    });
    await request(base, '/api/readings', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({
        base_id: createdBase.id,
        device_name: '测试网关',
        temperature: 30,
        humidity: 70,
        co2: 900,
        light: 300,
        recorded_at: new Date().toISOString()
      })
    });
    await request(base, '/api/trace-events', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({
        batch_id: createdBatch.id,
        event_type: '入库',
        title: '测试入库',
        description: '自动化测试',
        event_date: '2026-09-15'
      })
    });

    const dashboard = await request(base, '/api/dashboard', { token: alice.token });
    if (dashboard.bases < 1 || dashboard.batches < 1 || dashboard.openAlerts < 1) {
      throw new Error('dashboard 汇总失败或预警未自动生成');
    }

    // 10. 账号隔离
    const bobDashboard = await request(base, '/api/dashboard', { token: bob.token });
    if (bobDashboard.bases !== 0 || bobDashboard.batches !== 0 || bobDashboard.openAlerts !== 0) {
      throw new Error('账号隔离失败：bob 看到了 alice 的数据');
    }
    await request(base, `/api/bases/${createdBase.id}`, { method: 'DELETE', token: bob.token, expectStatus: 404 });

    // 11. RBAC：采购商不能建基地，但可以发采购需求
    const carol = await registerUser('buyer', 'carol');
    await request(base, '/api/bases', {
      method: 'POST',
      token: carol.token,
      body: JSON.stringify({ name: '采购商不该建的基地' }),
      expectStatus: 403
    });
    await request(base, '/api/bases', { token: carol.token });
    await request(base, '/api/demands', {
      method: 'POST',
      token: carol.token,
      body: JSON.stringify({ buyer_name: '采购商', product_name: '鲜香菇', quantity: 10, unit: 'kg' })
    });
    await request(base, '/api/products', {
      method: 'POST',
      token: carol.token,
      body: JSON.stringify({ name: '不该发布的供应' }),
      expectStatus: 403
    });

    // 12. RBAC：专家不能发布供应，但可以回复问题
    const erin = await registerUser('expert', 'erin');
    await request(base, '/api/products', {
      method: 'POST',
      token: erin.token,
      body: JSON.stringify({ name: '专家不该发布的供应' }),
      expectStatus: 403
    });
    const question = await request(base, '/api/questions', {
      method: 'POST',
      token: erin.token,
      body: JSON.stringify({ title: '测试问题', content: '测试内容' })
    });
    await request(base, `/api/questions/${question.id}`, {
      method: 'PUT',
      token: erin.token,
      body: JSON.stringify({ answer: '专家回复内容', status: 'answered' })
    });

    // 13. RBAC：政府/服务机构只读
    const dave = await registerUser('government', 'dave');
    await request(base, '/api/readings', {
      method: 'POST',
      token: dave.token,
      body: JSON.stringify({ recorded_at: new Date().toISOString(), device_name: 'x' }),
      expectStatus: 403
    });
    await request(base, '/api/dashboard', { token: dave.token });

    // 14. 平台管理员接口：普通账号 403，管理员可用
    await request(base, '/api/admin/users', { token: alice.token, expectStatus: 403 });
    const { hash, salt } = hashPassword('admin123456');
    const adminName = `admin_${suffix}`;
    const adminId = db
      .prepare('INSERT INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)')
      .run(adminName, '平台管理员', 'admin', hash, salt).lastInsertRowid;
    createdUsers.push({ id: adminId });
    const adminLogin = await request(base, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: adminName, password: 'admin123456' })
    });
    const users = await request(base, '/api/admin/users', { token: adminLogin.token });
    if (!users.some((item) => item.username === `alice_${suffix}`)) throw new Error('管理员看不到账号列表');
    await request(base, `/api/admin/users/${bob.user.id}/role`, {
      method: 'PUT',
      token: adminLogin.token,
      body: JSON.stringify({ role: 'expert' })
    });

    // 15. 持久化 + 密码加密
    const stored = db.prepare('SELECT * FROM bases WHERE id = ? AND user_id = ?').get(createdBase.id, alice.user.id);
    if (!stored) throw new Error('持久化失败：数据库中未找到记录');
    const storedUser = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(alice.user.id);
    if (!storedUser.password_hash || storedUser.password_hash.includes('test123456')) throw new Error('密码未加密存储');

    // 16. 公开溯源 + AI 建议
    const trace = await request(base, `/api/trace/${encodeURIComponent(createdBatch.code)}`);
    if (!trace.events.length) throw new Error('溯源事件缺失');
    const ai = await request(base, '/api/ai/suggest-priority', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ title: '紧急处理菌棚报警', due_date: '2026-09-15' })
    });
    if (ai.priority !== 'high') throw new Error('规则引擎优先级判断失败');

    // 17. 硬件设备接入：创建设备 → 上报 → 自动预警 → 在线状态
    const device = await request(base, '/api/devices', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ name: '1 号棚温湿度网关', base_id: createdBase.id, model: 'ESP32-S3' })
    });
    if (!device.code || !device.secret) throw new Error('创建设备未返回编号与密钥');

    const deviceHeaders = { 'X-Device-Code': device.code, 'X-Device-Secret': device.secret };
    await request(base, '/api/ingest/readings', {
      method: 'POST',
      headers: { 'X-Device-Code': device.code, 'X-Device-Secret': 'wrong-secret' },
      body: JSON.stringify({ temperature: 24 }),
      expectStatus: 401
    });
    const ingest = await request(base, '/api/ingest/readings', {
      method: 'POST',
      headers: deviceHeaders,
      body: JSON.stringify({ temperature: 29.5, humidity: 72, co2: 950, light: 260 })
    });
    if (ingest.reading.source !== 'device') throw new Error('硬件上报的数据来源未标记为 device');
    if (ingest.alerts.length < 3) throw new Error('硬件上报未按阈值自动生成 3 条预警');
    await request(base, '/api/ingest/heartbeat', { method: 'POST', headers: deviceHeaders, body: '{}' });
    const deviceConfig = await request(base, '/api/ingest/config', { headers: deviceHeaders });
    if (deviceConfig.thresholds.temp_max !== 26) throw new Error('设备阈值配置返回不正确');
    const dashboard2 = await request(base, '/api/dashboard', { token: alice.token });
    if (dashboard2.devices < 1 || dashboard2.devicesOnline < 1 || dashboard2.deviceReadings < 1) {
      throw new Error('dashboard 未统计设备数量/在线状态/设备上报数据');
    }
    await request(base, '/api/devices', {
      method: 'POST',
      token: carol.token,
      body: JSON.stringify({ name: '采购商不该创建的设备' }),
      expectStatus: 403
    });

    // 18. AI 问答：写入问答记录，未配置时降级为规则知识库
    const aiStatus = await request(base, '/api/ai/status', { token: alice.token });
    const ask = await request(base, '/api/ai/ask', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ question: '菌棒表面发绿霉，温度 28 度湿度 92，应该怎么处理？', base_id: createdBase.id })
    });
    if (!ask.answer || ask.answer.length < 20) throw new Error('AI 问答未返回有效回答');
    if (aiStatus.configured && ask.source !== 'ai') throw new Error('已配置 AI 但回答来源不是 ai');
    const savedQuestions = await request(base, '/api/questions', { token: alice.token });
    if (!savedQuestions.some((item) => item.id === ask.question_id && item.answer_source === ask.source)) {
      throw new Error('AI 问答未写入问答记录');
    }

    const { answerQuestion } = require('./ai');
    const backupKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    const ruleResult = await answerQuestion({ question: '菌棒表面发绿霉怎么办', userId: alice.user.id, save: false });
    if (ruleResult.source !== 'rule' || !/规则知识库/.test(ruleResult.answer)) throw new Error('规则知识库降级失败');
    process.env.AI_API_KEY = backupKey;

    // 19. 退出登录后 JWT 立即失效（会话被撤销）
    await request(base, '/api/auth/logout', { method: 'POST', token: login.token });
    await request(base, '/api/auth/me', { token: login.token, expectStatus: 401 });

    console.log(
      `API tests passed：JWT 登录、RBAC、账号隔离、管理员接口、微信登录降级、` +
        `硬件自动上报与阈值预警、AI 问答（当前来源 ${ask.source}，模型 ${aiStatus.model}）、持久化与公开溯源均通过`
    );
  } finally {
    for (const user of createdUsers) {
      const uid = user.id;
      for (const table of tables) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(uid);
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    }
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
