import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { newDb, orderRow, rerun, seed, stockOf } from '../testkit/db.mjs'

const create = (db, p) => db.query('select create_order($1::jsonb) as id', [JSON.stringify(p)]).then((r) => r.rows[0].id)
const item = (product_id, qty, price) => ({ product_id, qty, price })

describe('migration 005', () => {
  it('chạy được trên schema cũ và chạy lại không lỗi', async () => {
    const db = await newDb()
    await rerun(db, '005_integrity.sql')
    await rerun(db, '005_integrity.sql')
  })

  it('ngày mặc định theo giờ Việt Nam', async () => {
    const db = await newDb()
    const { rows } = await db.query("select vn_today()::text as a, (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as b")
    assert.equal(rows[0].a, rows[0].b)
    const def = await db.query("select column_default from information_schema.columns where table_name = 'payments' and column_name = 'paid_at'")
    assert.match(def.rows[0].column_default, /vn_today/)
  })

  it('mã đơn không trùng dù tạo liên tiếp trong cùng giây', async () => {
    const db = await newDb()
    const { rows } = await db.query("select next_order_code('out') as c from generate_series(1, 200)")
    assert.equal(new Set(rows.map((r) => r.c)).size, 200)
    assert.match(rows[0].c, /^BH\d{12}$/)
  })
})

describe('create_order', () => {
  it('tạo đơn, ghi tồn kho và thanh toán đầu', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 300, items: [item(s.product, 2, 500)] })
    const o = await orderRow(db, id)
    assert.equal(o.total, 1000)
    assert.equal(o.paid, 300)
    assert.equal(o.debt, 700)
    assert.match(o.code, /^BH/)
    assert.equal(await stockOf(db, s.product), 8)
  })

  it('đơn nhập cộng tồn kho', async () => {
    const db = await newDb()
    const s = await seed(db)
    await create(db, { type: 'in', partner_id: s.supplier, items: [item(s.product, 4, 100)] })
    assert.equal(await stockOf(db, s.product), 14)
  })

  it('chặn đối tác sai loại và type thiếu', async () => {
    const db = await newDb()
    const s = await seed(db)
    await assert.rejects(create(db, { type: 'out', partner_id: s.supplier, items: [item(s.product, 1, 1)] }), /không đúng loại/)
    await assert.rejects(create(db, { type: 'in', partner_id: s.customer, items: [item(s.product, 1, 1)] }), /không đúng loại/)
    await assert.rejects(create(db, { partner_id: s.customer, items: [item(s.product, 1, 1)] }), /type không hợp lệ/)
    assert.equal(await stockOf(db, s.product), 10)
  })

  it('chặn trả vượt tổng đơn và đơn rỗng', async () => {
    const db = await newDb()
    const s = await seed(db)
    await assert.rejects(create(db, { type: 'out', partner_id: s.customer, paid: 2000, items: [item(s.product, 1, 500)] }), /vượt tổng đơn/)
    await assert.rejects(create(db, { type: 'out', partner_id: s.customer, items: [] }), /ít nhất 1 mặt hàng/)
  })
})

describe('add_payment / update_payment', () => {
  it('không cho vượt công nợ còn lại', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 400, items: [item(s.product, 2, 500)] })
    await db.query('select add_payment($1, 500, null, null)', [id])
    assert.equal((await orderRow(db, id)).debt, 100)
    await assert.rejects(db.query('select add_payment($1, 101, null, null)', [id]), /vượt công nợ còn lại/)
    await db.query('select add_payment($1, 100, null, $2)', [id, 'trả nốt'])
    assert.equal((await orderRow(db, id)).debt, 0)
    await assert.rejects(db.query('select add_payment($1, 0, null, null)', [id]), /Số tiền không hợp lệ/)
  })

  it('sửa thanh toán kiểm theo tổng các khoản khác', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 400, items: [item(s.product, 2, 500)] })
    const { rows } = await db.query('select add_payment($1, 100, $2::date, null) as id', [id, '2026-11-12'])
    const pid = rows[0].id
    await db.query('select update_payment($1, 600, null, $2)', [pid, 'sửa'])
    assert.equal((await orderRow(db, id)).debt, 0)
    await assert.rejects(db.query('select update_payment($1, 601, null, null)', [pid]), /vượt tổng đơn/)
    const p = (await db.query('select paid_at::text as d, note from payments where id = $1', [pid])).rows[0]
    assert.equal(p.d, '2026-11-12', 'không truyền ngày thì giữ ngày cũ')
    assert.equal(p.note, 'sửa')
  })
})

describe('update_order', () => {
  it('điều chỉnh tồn kho theo chênh lệch và giữ phần chênh ngoài mặt hàng', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 400, items: [item(s.product, 2, 500)] })
    await db.query('update orders set total = total + 50 where id = $1', [id]) // 50 = VC ngoài nhập từ Excel
    assert.equal(await stockOf(db, s.product), 8)
    await db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.customer, note: 'sửa', items: [item(s.product, 3, 500)] })])
    assert.equal(await stockOf(db, s.product), 7)
    const o = await orderRow(db, id)
    assert.equal(o.total, 1550)
    assert.equal(o.note, 'sửa')
    const n = (await db.query('select count(*)::int as n from order_items where order_id = $1', [id])).rows[0].n
    assert.equal(n, 1)
  })

  it('từ chối tổng nhỏ hơn đã thanh toán và không đổi gì', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 400, items: [item(s.product, 2, 500)] })
    await assert.rejects(
      db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.customer, items: [item(s.product, 1, 100)] })]),
      /nhỏ hơn số tiền đã thanh toán/
    )
    assert.equal(await stockOf(db, s.product), 8)
    assert.equal((await orderRow(db, id)).total, 1000)
  })

  it('đơn không có mặt hàng thì sửa trực tiếp tổng tiền', async () => {
    const db = await newDb()
    const s = await seed(db)
    const { rows } = await db.query(
      "insert into orders(code, type, partner_id, total, note) values ('NO1', 'out', $1, 500, 'Nợ đầu kỳ') returning id", [s.customer])
    const id = rows[0].id
    await db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.customer, total: 700 })])
    assert.equal((await orderRow(db, id)).total, 700)
    await db.query('select add_payment($1, 300, null, null)', [id])
    await assert.rejects(db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.customer, total: 200 })]), /nhỏ hơn số tiền đã thanh toán/)
  })

  it('chặn đổi sang đối tác sai loại', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, items: [item(s.product, 1, 500)] })
    await assert.rejects(
      db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.supplier, items: [item(s.product, 1, 500)] })]),
      /không đúng loại/
    )
  })
})

describe('delete_order và audit_log', () => {
  it('hoàn tồn kho và ghi lại đơn cùng các thanh toán bị xoá', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 400, items: [item(s.product, 2, 500)] })
    assert.equal(await stockOf(db, s.product), 8)
    await db.query('select delete_order($1)', [id])
    assert.equal(await stockOf(db, s.product), 10)
    const log = (await db.query("select table_name, action, old_data->>'amount' as amount from audit_log order by id")).rows
    assert.deepEqual(log.map((r) => `${r.table_name}:${r.action}`).sort(), ['orders:delete', 'payments:delete'])
    assert.equal(log.find((r) => r.table_name === 'payments').amount, '400.00')
    await assert.rejects(db.query('select delete_order($1)', [id]), /Không tìm thấy đơn/)
  })

  it('ghi lại lần sửa đơn và sửa thanh toán', async () => {
    const db = await newDb()
    const s = await seed(db)
    const id = await create(db, { type: 'out', partner_id: s.customer, paid: 100, items: [item(s.product, 2, 500)] })
    await db.query('select update_order($1, $2::jsonb)', [id, JSON.stringify({ partner_id: s.customer, items: [item(s.product, 3, 500)] })])
    const { rows } = await db.query("select count(*)::int as n from audit_log where table_name = 'orders' and action = 'update'")
    assert.equal(rows[0].n, 1)
  })

  it('anon / authenticated không đọc được audit_log và gọi hàm', async () => {
    const db = await newDb()
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from audit_log'), /permission denied/)
    await assert.rejects(db.query("select delete_order('00000000-0000-0000-0000-000000000000')"), /permission denied/)
    await db.exec('reset role')
    await db.exec('set role service_role')
    await db.query('select dashboard_data(null, null)')
    await db.query("select next_order_code('out')")
    await db.exec('reset role')
  })
})

describe('dashboard_data và debts_by_partner', () => {
  const build = async () => {
    const db = await newDb()
    const s = await seed(db)
    const o1 = await create(db, { type: 'out', partner_id: s.customer, order_date: '2026-11-10', items: [item(s.product, 2, 500)] })
    await db.query('select add_payment($1, 400, $2::date, null)', [o1, '2026-11-12'])
    await create(db, { type: 'out', partner_id: s.customer, order_date: '2026-11-20', items: [item(s.product, 1, 300)] })
    const i1 = await create(db, { type: 'in', partner_id: s.supplier, order_date: '2026-11-05', paid: 100, items: [item(s.product, 4, 100)] })
    await db.query("update payments set paid_at = '2026-11-05' where order_id = $1", [i1])
    await db.query("insert into cashflow(kind, entry_date, amount, category) values ('in', '2026-11-15', 50, 'Khác'), ('out', '2026-11-16', 70, 'Xăng')")
    return { db, s }
  }
  const dash = async (db, from, to) => (await db.query('select dashboard_data($1::date, $2::date) as d', [from, to])).rows[0].d

  it('tổng hợp theo ngày trong kỳ ngắn', async () => {
    const { db } = await build()
    const d = await dash(db, '2026-11-01', '2026-12-01')
    assert.equal(d.payable, 300)
    assert.equal(d.receivable, 900)
    assert.equal(d.purchased, 400)
    assert.equal(d.sold, 1300)
    assert.equal(d.collected, 400)
    assert.equal(d.paid_out, 100)
    assert.equal(d.other_in, 50)
    assert.equal(d.spent, 70)
    assert.equal(d.customers, 1)
    assert.equal(d.stock_value, 55)
    assert.equal(d.group, 'day')
    assert.deepEqual(d.series.map((x) => [x.key, x.sold, x.collected, x.spent]), [
      ['2026-11-10', 1000, 0, 0],
      ['2026-11-12', 0, 400, 0],
      ['2026-11-16', 0, 0, 70],
      ['2026-11-20', 300, 0, 0]
    ])
    assert.deepEqual(d.top_customers, [{ name: 'Khách C', value: 1300, debt: 900 }])
    assert.deepEqual(d.top_products, [{ name: 'Hàng P1', value: 1300 }])
    assert.deepEqual(d.low_stock, [])
  })

  it('gom theo tháng khi kỳ dài hơn 45 ngày, và lọc kỳ hoạt động', async () => {
    const { db } = await build()
    const year = await dash(db, '2026-01-01', '2027-01-01')
    assert.equal(year.group, 'month')
    assert.deepEqual(year.series.map((x) => x.key), ['2026-11'])
    assert.equal(year.series[0].sold, 1300)
    const early = await dash(db, '2026-11-01', '2026-11-11')
    assert.equal(early.sold, 1000)
    assert.equal(early.purchased, 400)
    const none = await dash(db, '2025-01-01', '2025-02-01')
    assert.equal(none.sold, 0)
    assert.deepEqual(none.series, [])
  })

  it('không lọc kỳ: lấy theo khoảng dữ liệu thật; hàng sắp hết được liệt kê', async () => {
    const { db, s } = await build()
    const all = await dash(db, null, null)
    assert.equal(all.group, 'day')
    assert.equal(all.sold, 1300)
    await db.query('update products set stock = 1 where id = $1', [s.product])
    assert.equal((await dash(db, null, null)).low_stock.length, 1)
  })

  it('công nợ theo đối tác, nhiều nợ nhất trước', async () => {
    const { db } = await build()
    const { rows } = await db.query('select partner_name, type, debt::float8 as debt, orders::int as orders from debts_by_partner(null, null)')
    assert.deepEqual(rows, [
      { partner_name: 'Khách C', type: 'out', debt: 900, orders: 2 },
      { partner_name: 'NCC A', type: 'in', debt: 300, orders: 1 }
    ])
    const early = await db.query("select partner_name from debts_by_partner('2026-11-01', '2026-11-11')")
    assert.deepEqual(early.rows.map((r) => r.partner_name).sort(), ['Khách C', 'NCC A'])
  })
})
