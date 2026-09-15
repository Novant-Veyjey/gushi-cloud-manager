const { db } = require('./db');

/**
 * AI 问答：优先调用 OpenAI 兼容接口，未配置或调用失败时降级为本地规则知识库。
 * 无论走哪条路径，回答里都会标注来源，不把规则库答复伪装成 AI 结论。
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = [
  '你是赣北地区食用菌种植技术助手，服务菇农和合作社，作物以香菇、平菇、木耳等为主。',
  '回答要求：',
  '1. 先给可能原因，按最可能到次可能排序；',
  '2. 再给可直接执行的处置步骤，包含温度、湿度、CO₂、通风、消毒、采收等具体数值范围；',
  '3. 涉及病虫害时给出隔离与安全用药建议，提醒遵守安全间隔期；',
  '4. 遇到食品安全、农药残留、政策补贴等不确定问题，明确说明需要咨询当地农技专家，不编造结论；',
  '5. 不虚构数据、不承诺产量；',
  '6. 用简体中文分点回答，控制在 350 字以内。'
].join('\n');

/** 离线可用的规则知识库：没有 AI 密钥时也能给出基础建议 */
const KNOWLEDGE = [
  {
    title: '温度偏高',
    keywords: ['温度高', '高温', '太热', '发烫', '闷', '烧菌'],
    advice: [
      '可能原因：通风不足、棚膜透光过强、菌棒堆码过密、外界气温骤升。',
      '处置：加大早晚通风（避开正午），加盖遮阳网或喷淋降温，把料温控制在 22–26℃；',
      '堆码适当疏散，发菌期单层摆放，避免菌棒自身发热叠加上升；',
      '若已出现菌丝停止生长或菌棒变软，及时隔离观察，防止烧菌扩散。'
    ]
  },
  {
    title: '温度偏低',
    keywords: ['温度低', '低温', '太冷', '冻'],
    advice: [
      '处置：夜间加盖草帘或保温膜，减少冷风直吹，出菇期尽量维持 12–18℃；',
      '出菇期温差可适当利用，但避免长时间低于 5℃，否则菇蕾易死亡、菌盖畸形。'
    ]
  },
  {
    title: '湿度不足',
    keywords: ['湿度低', '干燥', '干', '缺水', '喷水'],
    advice: [
      '处置：提高空气相对湿度到 85%–90%，采取少量多次喷雾，避免直接向菇体大量喷水；',
      '地面洒水或悬挂湿帘保湿，同时保持通风，防止高湿又闷棚引发杂菌。',
      '采摘前 4–6 小时停止喷水，可降低菇体含水量、延长保鲜期。'
    ]
  },
  {
    title: 'CO₂ 偏高 / 通风',
    keywords: ['co2', '二氧化碳', '通风', '缺氧', '闷棚', '菇柄长'],
    advice: [
      'CO₂ 偏高典型表现：菇柄细长、菌盖小而薄（长腿菇），说明通风不足。',
      '处置：加大通风次数与时长，保持 CO₂ 在 800 ppm 以下（出菇期建议 600 ppm 以内）；',
      '通风与保温、保湿需要平衡，建议在温度较高的时段换气，避免温差过大。'
    ]
  },
  {
    title: '杂菌污染（绿霉、木霉等）',
    keywords: ['绿霉', '木霉', '杂菌', '污染', '霉菌', '发绿', '黑斑', '酸臭'],
    advice: [
      '处置：立即将污染菌棒单独隔离并移出菇房，避免孢子扩散；',
      '局部轻微污染可挖除污染部位并撒石灰粉覆盖，严重污染整棒销毁，不得留用；',
      '检查灭菌是否彻底、接种是否无菌操作、环境湿度是否长期偏高；',
      '同一批次连续出现污染时，暂停该区域生产，对菇房做一次彻底消毒（如甲醛或过氧乙酸，按说明使用并充分通风）。'
    ]
  },
  {
    title: '虫害（菇蚊、菇蝇、螨类）',
    keywords: ['虫', '蚊', '蝇', '螨', '幼虫', '蛀'],
    advice: [
      '处置：悬挂黄板或诱虫灯诱杀成虫，菇房门窗加装防虫网；',
      '清理菇根、废料和腐烂菌棒，切断滋生源；',
      '虫害严重时按登记农药与推荐剂量使用，严格遵守安全间隔期，采菇前禁止用药，必要时咨询当地植保部门。'
    ]
  },
  {
    title: '菌棒不发菌 / 生长慢',
    keywords: ['不发菌', '菌丝', '长势慢', '不吃料', '稀疏', '发菌'],
    advice: [
      '排查：料温是否低于 20℃ 或高于 28℃、含水量是否合适（一般 60%–65%）、接种是否成活；',
      '处置：把环境调到菌丝最适 22–26℃，适当翻堆通气，及时挑出已污染的菌棒；',
      '接种后 7–10 天菌丝仍无明显扩展时，说明菌种活力或灭菌环节可能存在问题，建议补接或更换菌种。'
    ]
  },
  {
    title: '转色 / 催蕾 / 出菇管理',
    keywords: ['转色', '催蕾', '出菇', '菇蕾', '畸形', '不开伞', '采收'],
    advice: [
      '转色期保持 18–22℃、空气湿度 85% 左右并加强通风，见光散射光即可；',
      '催蕾可通过降温 8–10℃ 的温差刺激配合适度干湿交替；',
      '采收掌握在菌盖尚未完全展开、边缘略微内卷时进行，采后及时补水养菌，7–15 天可出下一潮菇。'
    ]
  }
];

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function aiConfigured() {
  return Boolean(text(process.env.AI_API_KEY) && text(process.env.AI_BASE_URL));
}

function modelName() {
  return text(process.env.AI_MODEL) || DEFAULT_MODEL;
}

function knowledgeAnswer(question) {
  const value = text(question).toLowerCase();
  const matched = KNOWLEDGE.filter((item) => item.keywords.some((keyword) => value.includes(keyword.toLowerCase())));
  if (!matched.length) {
    return {
      answer: [
        '【规则知识库】没有匹配到对应条目，暂时无法给出可靠建议。',
        '请补充以下信息后重试，或等待专家人工回复：',
        '1. 菌种与当前生长阶段（发菌/转色/催蕾/出菇）；',
        '2. 最近的温度、湿度、CO₂ 数值；',
        '3. 症状出现的部位、时间与变化速度，最好附照片。'
      ].join('\n'),
      source: 'rule',
      matched: []
    };
  }
  const answer = ['【规则知识库答复，非 AI 生成】', ...matched.map((item) => `· ${item.title}`), ...matched.flatMap((item) => item.advice.map((line) => `  - ${line}`))].join('\n');
  return { answer, source: 'rule', matched: matched.map((item) => item.title) };
}

/** 用账号自己的真实数据做上下文，让回答更贴合当前菇房情况 */
function buildContext(userId, baseId) {
  const parts = [];
  const base = baseId ? db.prepare('SELECT * FROM bases WHERE id = ? AND user_id = ?').get(Number(baseId), userId) : null;
  if (base) parts.push(`基地：${base.name}（${base.township || '未填乡镇'}）`);

  const scopeBase = base ? base.id : null;
  const batch = scopeBase
    ? db.prepare('SELECT * FROM batches WHERE base_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(scopeBase, userId)
    : db.prepare('SELECT * FROM batches WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
  if (batch) parts.push(`最近批次：${batch.code}，${batch.mushroom_type}${batch.variety ? '·' + batch.variety : ''}，阶段：${batch.stage}，菌棒 ${batch.quantity} 棒`);

  const reading = scopeBase
    ? db.prepare('SELECT * FROM readings WHERE base_id = ? AND user_id = ? ORDER BY recorded_at DESC LIMIT 1').get(scopeBase, userId)
    : db.prepare('SELECT * FROM readings WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1').get(userId);
  if (reading) {
    parts.push(
      `最近环境：温度 ${reading.temperature ?? '--'}℃、湿度 ${reading.humidity ?? '--'}%、CO₂ ${reading.co2 ?? '--'} ppm（${reading.device_name || '未命名设备'}，${reading.recorded_at}）`
    );
  }

  return { summary: parts.join('\n'), hasData: parts.length > 0 };
}

async function callAi(question, context) {
  const baseUrl = text(process.env.AI_BASE_URL).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${text(process.env.AI_API_KEY)}` },
    body: JSON.stringify({
      model: modelName(),
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: context.hasData ? `【本账号实时数据】\n${context.summary}\n\n【问题】\n${question}` : `【问题】\n${question}`
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI 接口返回 ${response.status}${detail ? `：${detail.slice(0, 120)}` : ''}`);
  }
  const payload = await response.json();
  const answer = text(payload?.choices?.[0]?.message?.content);
  if (!answer) throw new Error('AI 接口未返回有效内容');
  return answer;
}

/**
 * 回答问题：
 * - 有 AI 配置 → 调用 AI（回答来源 ai）
 * - 未配置或调用失败 → 规则知识库兜底（回答来源 rule），并在回答前注明原因
 * - save 为 true 时把问答记录写入 expert_questions，便于后续人工专家复核
 */
async function answerQuestion({ question, userId, baseId = null, category = '', save = true }) {
  const value = text(question);
  if (value.length < 4) {
    const error = new Error('问题描述太短，请至少输入 4 个字');
    error.status = 400;
    throw error;
  }
  if (value.length > 1000) {
    const error = new Error('问题描述请控制在 1000 字以内');
    error.status = 400;
    throw error;
  }

  const context = buildContext(userId, baseId);
  let result = null;
  let fallbackReason = '';

  if (aiConfigured()) {
    try {
      result = { answer: await callAi(value, context), source: 'ai', model: modelName() };
    } catch (error) {
      fallbackReason = error.message;
    }
  } else {
    fallbackReason = '后台未配置 AI_API_KEY / AI_BASE_URL';
  }

  if (!result) {
    const fallback = knowledgeAnswer(value);
    result = { answer: fallback.answer, source: 'rule', model: '', matched: fallback.matched || [] };
  }

  const record = {
    answer: result.answer,
    source: result.source,
    model: result.model,
    context_summary: context.summary,
    fallback_reason: fallbackReason,
    question_id: null
  };

  if (save) {
    const insert = db
      .prepare(
        `INSERT INTO expert_questions (base_id, title, content, category, answer, status, answered_at, user_id, answer_source, ai_model)
         VALUES (?, ?, ?, ?, ?, 'answered', ?, ?, ?, ?)`
      )
      .run(
        baseId ? Number(baseId) : null,
        value.slice(0, 60),
        value,
        text(category) || (result.source === 'ai' ? 'AI 问答' : '规则知识库'),
        result.answer,
        new Date().toISOString(),
        userId,
        result.source,
        result.model || ''
      );
    record.question_id = Number(insert.lastInsertRowid);
  }

  return record;
}

module.exports = { SYSTEM_PROMPT, KNOWLEDGE, aiConfigured, modelName, knowledgeAnswer, buildContext, answerQuestion };
