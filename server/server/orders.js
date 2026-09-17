/**
 * 订单服务：产销对接的完整交易链路（下单 → 支付 → 发货 → 收货）。
 *
 * 状态机：created（待付款）→ paid（待发货）→ shipped（待收货）→ received（已完成）
 * 说明：
 *   - 货到付款（offline）下单后直接进入「待发货」，收货时补记付款时间；
 *   - 在线支付（online，演示环境无真实支付通道）由买家点「立即支付」后进入「待发货」；
 *   - 发货前买卖双方都可取消，取消时把下单时预占的库存回补给供应信息。
 */
const { db } = require('./db');

const STATUS_LABEL = {
  created: '待付款',
  paid: '待发货',
  shipped: '待收货',
  received: '已完成',
  cancelled: '已取消'
};

const PAY_METHOD_LABEL = {
  online: '在线支付（演示）',
  offline: '货到付款'
};

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round(num(value, 0) * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 订单号：GS + 年月日时分秒 + 3 位随机，方便口头核对 */
function makeOrderNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `GS${stamp}${Math.floor(Math.random() * 900 + 100)}`;
}

/** 供应信息是否处于可供应期（与小程序端展示的「可供应」判定保持一致） */
function isOnSale(product) {
  if (!product) return false;
  if (product.status && product.status !== 'available') return false;
  const now = today();
  const start = text(product.available_date).slice(0, 10);
  const end = text(product.off_shelf_date).slice(0, 10);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

/** 补充订单的可读字段与「当前账号能做什么」，前端据此渲染按钮 */
function decorate(row, user) {
  const isBuyer = Number(row.buyer_id) === Number(user.id);
  const isSeller = Number(row.seller_id) === Number(user.id);
  const cancellable = row.status === 'created' || row.status === 'paid';
  return {
    ...row,
    status_label: STATUS_LABEL[row.status] || row.status,
    pay_method_label: PAY_METHOD_LABEL[row.pay_method] || row.pay_method,
    is_buyer: isBuyer,
    is_seller: isSeller,
    side: isBuyer ? 'buyer' : 'seller',
    actions: {
      pay: isBuyer && row.status === 'created',
      ship: isSeller && row.status === 'paid',
      receive: isBuyer && row.status === 'shipped',
      cancel: cancellable && (isBuyer || isSeller)
    }
  };
}

function findOrder(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id));
  if (!row) throw httpError(404, '订单不存在');
  return row;
}

function assertVisible(row, user) {
  if (user.role === 'admin') return;
  if (Number(row.buyer_id) === Number(user.id) || Number(row.seller_id) === Number(user.id)) return;
  throw httpError(403, '无权查看该订单');
}

function getOrder(user, id) {
  const row = findOrder(id);
  assertVisible(row, user);
  return decorate(row, user);
}

/** 我的订单：买卖双方都能看到自己参与的订单，平台管理员可看全部 */
function listOrders(user, query = {}) {
  const isAdmin = user.role === 'admin';
  const status = text(query.status);
  const rows = isAdmin
    ? db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 300').all()
    : db
        .prepare('SELECT * FROM orders WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC, id DESC LIMIT 300')
        .all(user.id, user.id);
  const list = rows.map((row) => decorate(row, user));
  return status ? list.filter((item) => item.status === status) : list;
}

/**
 * 下单：校验供应信息可售、数量不超库存，扣减库存并写入订单。
 * 库存扣减用条件更新（quantity >= 下单量），避免并发下超卖。
 */
function createOrder(user, payload = {}) {
  const productId = Number(payload.product_id || payload.productId);
  if (!productId) throw httpError(400, '请选择要采购的供应信息');

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) throw httpError(404, '供应信息不存在或已被删除');
  if (Number(product.user_id) === Number(user.id)) throw httpError(400, '不能采购自己发布的供应信息');
  if (!isOnSale(product)) throw httpError(400, '该供应信息当前不可供应（未上架或已下架）');

  const stock = num(product.quantity, 0);
  if (stock <= 0) throw httpError(400, '该供应信息已售罄');
  const quantity = round2(payload.quantity);
  if (!(quantity > 0)) throw httpError(400, '请填写正确的采购数量');
  if (quantity > stock) throw httpError(400, `库存不足，当前最多可采购 ${stock} ${text(product.unit, 'kg')}`);

  const contact = text(payload.contact);
  if (!contact) throw httpError(400, '请填写联系电话，方便供货方联系发货');
  const address = text(payload.address);
  if (!address) throw httpError(400, '请填写收货地址');

  const price = round2(product.price);
  const amount = round2(price * quantity);
  const payMethod = text(payload.pay_method, 'online') === 'offline' ? 'offline' : 'online';
  const seller = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(product.user_id);
  const batch = product.batch_id
    ? db
        .prepare('SELECT b.code AS code, s.name AS base_name FROM batches b LEFT JOIN bases s ON s.id = b.base_id WHERE b.id = ?')
        .get(product.batch_id)
    : null;
  const buyerName = text(user.display_name) || text(user.username);

  const run = db.transaction(() => {
    const updated = db
      .prepare('UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND quantity >= ?')
      .run(quantity, productId, quantity);
    if (!updated.changes) throw httpError(409, '库存不足，请刷新后重试');

    const info = db
      .prepare(`
        INSERT INTO orders (
          order_no, product_id, product_name, product_icon, unit, price, quantity, amount,
          batch_id, batch_code, base_name, seller_id, seller_name,
          buyer_id, buyer_name, buyer_contact, address, remark, status, pay_method
        ) VALUES (
          @order_no, @product_id, @product_name, @product_icon, @unit, @price, @quantity, @amount,
          @batch_id, @batch_code, @base_name, @seller_id, @seller_name,
          @buyer_id, @buyer_name, @buyer_contact, @address, @remark, @status, @pay_method
        )
      `)
      .run({
        order_no: makeOrderNo(),
        product_id: productId,
        product_name: text(product.name, '供应产品'),
        product_icon: text(product.icon),
        unit: text(product.unit, 'kg'),
        price,
        quantity,
        amount,
        batch_id: product.batch_id || null,
        batch_code: batch ? text(batch.code) : '',
        base_name: batch ? text(batch.base_name) : '',
        seller_id: product.user_id,
        seller_name: seller ? text(seller.display_name) || text(seller.username) : '',
        buyer_id: user.id,
        buyer_name: buyerName,
        buyer_contact: contact,
        address,
        remark: text(payload.remark),
        // 货到付款无需在线支付，下单后直接进入待发货
        status: payMethod === 'offline' ? 'paid' : 'created',
        pay_method: payMethod
      });
    return info.lastInsertRowid;
  });

  return getOrder(user, run());
}

/** 买家支付（演示环境直接置为已支付，无真实资金流转） */
function payOrder(user, id) {
  const row = findOrder(id);
  if (Number(row.buyer_id) !== Number(user.id)) throw httpError(403, '只有采购方可以支付该订单');
  if (row.status !== 'created') throw httpError(400, `订单当前为「${STATUS_LABEL[row.status] || row.status}」，无法支付`);
  db.prepare("UPDATE orders SET status = 'paid', pay_method = 'online', pay_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    nowIso(),
    row.id
  );
  return getOrder(user, row.id);
}

/** 卖家发货 */
function shipOrder(user, id) {
  const row = findOrder(id);
  if (Number(row.seller_id) !== Number(user.id)) throw httpError(403, '只有供货方可以发货');
  if (row.status !== 'paid') throw httpError(400, `订单当前为「${STATUS_LABEL[row.status] || row.status}」，无法发货`);
  db.prepare("UPDATE orders SET status = 'shipped', ship_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nowIso(), row.id);
  return getOrder(user, row.id);
}

/** 买家确认收货（货到付款在这一步补记付款时间） */
function receiveOrder(user, id) {
  const row = findOrder(id);
  if (Number(row.buyer_id) !== Number(user.id)) throw httpError(403, '只有采购方可以确认收货');
  if (row.status !== 'shipped') throw httpError(400, `订单当前为「${STATUS_LABEL[row.status] || row.status}」，无法确认收货`);
  const payTime = row.pay_method === 'offline' && !row.pay_time ? nowIso() : row.pay_time;
  db.prepare("UPDATE orders SET status = 'received', receive_time = ?, pay_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    nowIso(),
    payTime,
    row.id
  );
  return getOrder(user, row.id);
}

/** 取消订单：发货前买卖双方都可取消，取消时把预占库存回补 */
function cancelOrder(user, id, reason = '') {
  const row = findOrder(id);
  const isBuyer = Number(row.buyer_id) === Number(user.id);
  const isSeller = Number(row.seller_id) === Number(user.id);
  if (!isBuyer && !isSeller) throw httpError(403, '无权操作该订单');
  if (row.status !== 'created' && row.status !== 'paid') {
    throw httpError(400, `「${STATUS_LABEL[row.status] || row.status}」的订单无法取消`);
  }

  const cancelReason = text(reason);
  const remark = cancelReason
    ? text(row.remark)
      ? `${text(row.remark)} / 取消原因：${cancelReason}`
      : `取消原因：${cancelReason}`
    : text(row.remark);

  const run = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'cancelled', cancel_time = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      nowIso(),
      remark,
      row.id
    );
    // 回补下单时预占的库存，供应信息重新可售
    if (row.product_id) {
      db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(num(row.quantity, 0), row.product_id);
    }
  });
  run();
  return getOrder(user, row.id);
}

module.exports = {
  STATUS_LABEL,
  PAY_METHOD_LABEL,
  createOrder,
  listOrders,
  getOrder,
  payOrder,
  shipOrder,
  receiveOrder,
  cancelOrder
};
