const fs = require('fs');
const os = require('os');
const path = require('path');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gushi-api-test-'));
process.env.DB_PATH = path.join(testDir, 'gushi.sqlite');
process.env.GUSHI_SKIP_ENV_FILE = '1';

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

  /**
   * 注册账号用于 RBAC 校验。
   * 自助注册可自选 farmer / base / buyer（见 auth.js REGISTRATION_ROLE_VALUES）；
   * expert / government / admin 不可自选，会回落为 farmer。
   * 测试需要 expert / government 时，注册后直接改库，效果等同管理员后台分配。
   */
  const SELF_REGISTER_ROLE_VALUES = ['farmer', 'base', 'buyer'];
  const ASSIGN_AFTER_REGISTER = ['expert', 'government'];

  async function registerUser(role, tag) {
    const result = await request(base, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `${tag}_${suffix}`, password: 'test123456', display_name: tag, role })
    });
    result.registered_role = result.user.role;
    createdUsers.push(result.user);
    if (role && ASSIGN_AFTER_REGISTER.includes(role) && role !== result.user.role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, result.user.id);
      result.user.role = role;
    }
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

    // 3. 注册两个账号：farmer / base 均可在自助注册时直接选择
    const alice = await registerUser('farmer', 'alice');
    const bob = await registerUser('base', 'bob');
    if (!alice.token || !bob.token) throw new Error('注册未返回 token');
    if (alice.registered_role !== 'farmer' || bob.registered_role !== 'base') {
      throw new Error('自助注册应能直接选择菇农 / 基地管理员身份');
    }
    const carol0 = await request(base, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `buyerpick_${suffix}`, password: 'test123456', role: 'buyer' })
    });
    createdUsers.push(carol0.user);
    if (carol0.user.role !== 'buyer') throw new Error('自助注册应能直接选择采购商身份');
    if (JSON.stringify(roleInfo.self_register || []) !== JSON.stringify(SELF_REGISTER_ROLE_VALUES)) {
      throw new Error('roles 接口公布的可自助注册身份不正确');
    }

    // 4. JWT 结构校验
    const payload = decodeJwt(alice.token);
    if (!payload.sub || !payload.jti || !payload.exp || payload.role !== 'farmer') throw new Error('JWT 载荷不正确');
    if (alice.token.split('.').length !== 3) throw new Error('JWT 格式不正确');
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT 已过期');

    // 5. 专家 / 平台管理员不可自助注册，一律回落为菇农
    const sneaky = await registerUser('admin', 'sneaky');
    if (sneaky.user.role !== 'farmer' || sneaky.registered_role !== 'farmer') {
      throw new Error('自助注册不应获得平台管理员角色');
    }

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

    // 10.1 关联资源归属校验：批次 / 溯源事件只能关联自己账号的基地 / 批次
    const bobBase = await request(base, '/api/bases', {
      method: 'POST',
      token: bob.token,
      body: JSON.stringify({ name: 'bob 的基地', township: '隔壁乡镇', status: 'active' })
    });
    await request(base, '/api/batches', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ code: `CROSS-${suffix}`, base_id: bobBase.id, mushroom_type: '平菇', quantity: 10, status: 'active' }),
      expectStatus: 400
    });
    await request(base, '/api/batches', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ code: `GHOST-${suffix}`, base_id: 99999999, mushroom_type: '平菇', quantity: 10, status: 'active' }),
      expectStatus: 400
    });
    await request(base, '/api/trace-events', {
      method: 'POST',
      token: bob.token,
      body: JSON.stringify({ batch_id: createdBatch.id, event_type: '串门', title: '不该挂上的事件', event_date: '2026-09-15' }),
      expectStatus: 400
    });

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
    // 采购商对生产/监测数据为「只能看」：设备列表可读，创建已在第 17 步验证为 403
    const carolDevices = await request(base, '/api/devices', { token: carol.token });
    if (!Array.isArray(carolDevices)) throw new Error('采购商应能只读查看设备列表');
    // 采购需求互通：bob 能看到 carol 发布的收购需求，carol 自己的不出现在共享区
    const sharedForBob = await request(base, '/api/demands/shared', { token: bob.token });
    if (!sharedForBob.some((item) => item.product_name === '鲜香菇' && item.owner_username === `carol_${suffix}`)) {
      throw new Error('采购需求共享区未返回其他账号的开放需求');
    }
    const sharedForCarol = await request(base, '/api/demands/shared', { token: carol.token });
    if (sharedForCarol.some((item) => item.user_id === carol.user.id)) throw new Error('共享区不应包含自己发布的需求');

    // 12. RBAC：专家不能发布供应，但可以回复问题
    const erin = await registerUser('expert', 'erin');
    if (erin.registered_role !== 'farmer') throw new Error('专家身份不应能通过自助注册直接获得');
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
    // 提问时夹带专家回复字段必须被服务端剥除，普通菇农不能冒充专家作答
    const forged = await request(base, '/api/questions', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({
        title: '越权回复测试',
        content: '这是一条普通提问，提交时故意夹带 answer 等专家字段',
        answer: '我是假专家，这是冒充回复',
        status: 'answered',
        answered_at: new Date().toISOString(),
        answer_source: 'expert',
        ai_model: 'fake-model'
      })
    });
    // 系统会对每条提问自动回答（AI 或规则库），因此 answer/status 由服务端生成是正常的；
    // 关键是提交时夹带的伪造回复内容、expert 来源、假模型名一个都不能被采纳
    if (
      forged.answer === '我是假专家，这是冒充回复' ||
      forged.answer_source === 'expert' ||
      forged.ai_model === 'fake-model'
    ) {
      throw new Error('提问夹带的专家回复字段未被剥除，存在冒充专家风险');
    }
    // 非专家即使绕过界面直接 PUT，也不能替专家回复
    await request(base, `/api/questions/${forged.id}`, {
      method: 'PUT',
      token: alice.token,
      body: JSON.stringify({ answer: '强行替专家回复', status: 'answered' }),
      expectStatus: 403
    });

    // 13. RBAC：政府/服务机构只读
    const dave = await registerUser('government', 'dave');
    if (dave.registered_role !== 'farmer') throw new Error('政府/服务机构身份不应能通过自助注册直接获得');
    await request(base, '/api/readings', {
      method: 'POST',
      token: dave.token,
      body: JSON.stringify({ recorded_at: new Date().toISOString(), device_name: 'x' }),
      expectStatus: 403
    });
    await request(base, '/api/dashboard', { token: dave.token });
    // 政府机构有 ai:r 但 questions 只读：不能借 /api/ai/ask 绕过问答只读限制
    await request(base, '/api/ai/ask', {
      method: 'POST',
      token: dave.token,
      body: JSON.stringify({ question: '政府账号不该能提交提问，这是越权尝试' }),
      expectStatus: 403
    });
    // ai/ask 关联的基地必须属于当前账号
    await request(base, '/api/ai/ask', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ question: '关联了别人基地的提问应该被拒绝', base_id: bobBase.id }),
      expectStatus: 400
    });

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
    // 公开溯源不得泄露 user_id 等账号侧内部字段
    if ('user_id' in trace.batch || trace.events.some((item) => 'user_id' in item)) {
      throw new Error('公开溯源结果泄露了 user_id 等内部字段');
    }
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
    // 第 9 步手动录入的异常数据已产生未处理预警，先全部处理掉，
    // 既验证预警处理链路，也避免同类型 open 预警去重影响后续计数
    const openAlerts = await request(base, '/api/alerts?limit=200', { token: alice.token });
    for (const item of openAlerts.filter((alert) => alert.status === 'open')) {
      await request(base, `/api/alerts/${item.id}/ack`, { method: 'POST', token: alice.token, body: '{}' });
    }
    const ingestPayload = JSON.stringify({ temperature: 29.5, humidity: 72, co2: 950, light: 260 });
    const ingest = await request(base, '/api/ingest/readings', {
      method: 'POST',
      headers: deviceHeaders,
      body: ingestPayload
    });
    if (ingest.reading.source !== 'device') throw new Error('硬件上报的数据来源未标记为 device');
    if (ingest.alerts.length < 3) throw new Error('硬件上报未按阈值自动生成 3 条预警');
    // 设备连续上报相同异常：同类型 open 预警去重，不重复刷屏
    const ingestAgain = await request(base, '/api/ingest/readings', {
      method: 'POST',
      headers: deviceHeaders,
      body: ingestPayload
    });
    if (ingestAgain.alerts.length !== 0) throw new Error('未处理的同类型预警应去重，不应重复生成');
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
      body: JSON.stringify({
        title: '绿霉处置咨询',
        question: '菌棒表面发绿霉，温度 28 度湿度 92，应该怎么处理？',
        category: '病害诊断',
        base_id: createdBase.id
      })
    });
    if (!ask.answer || ask.answer.length < 20) throw new Error('AI 问答未返回有效回答');
    if (aiStatus.configured && ask.source !== 'ai') throw new Error('已配置 AI 但回答来源不是 ai');
    const savedQuestions = await request(base, '/api/questions', { token: alice.token });
    const savedAsk = savedQuestions.find((item) => item.id === ask.question_id);
    if (!savedAsk || savedAsk.answer_source !== ask.source) {
      throw new Error('AI 问答未写入问答记录');
    }
    if (savedAsk.title !== '绿霉处置咨询') throw new Error('AI 问答未透传问题标题');

    const { answerQuestion } = require('./ai');
    const backupKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    const ruleResult = await answerQuestion({ question: '菌棒表面发绿霉怎么办', userId: alice.user.id, save: false });
    if (ruleResult.source !== 'rule' || !/规则知识库/.test(ruleResult.answer)) throw new Error('规则知识库降级失败');
    process.env.AI_API_KEY = backupKey;

    // 19. 退出登录后 JWT 立即失效（会话被撤销）
    await request(base, '/api/auth/logout', { method: 'POST', token: login.token });
    await request(base, '/api/auth/me', { token: login.token, expectStatus: 401 });

    // 20. 登录失败保护：连续 5 次密码错误后账号临时锁定，锁定期间正确密码也无法登录
    const locked = await request(base, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `locked_${suffix}`, password: 'test123456', role: 'farmer' })
    });
    createdUsers.push(locked.user);
    for (let i = 0; i < 5; i += 1) {
      await request(base, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: `locked_${suffix}`, password: 'wrong-pass' }),
        expectStatus: 401
      });
    }
    await request(base, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: `locked_${suffix}`, password: 'test123456' }),
      expectStatus: 429
    });

    console.log(
      `API tests passed：JWT 登录、RBAC、账号隔离、管理员接口、` +
        `硬件自动上报与阈值预警、AI 问答（当前来源 ${ask.source}，模型 ${aiStatus.model}）、持久化与公开溯源均通过`
    );
  } finally {
    for (const user of createdUsers) {
      const uid = user.id;
      for (const table of tables) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(uid);
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    }
    server.close();
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
