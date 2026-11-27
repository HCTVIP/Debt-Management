// Dựng Postgres thật trong bộ nhớ (PGlite) với đúng các file SQL của dự án, để test hàm tiền mà không cần Supabase.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase')
export const MIGRATIONS = ['schema.sql', '002_shipments.sql', '003_cashflow.sql', '004_shipment_location.sql', '005_integrity.sql']

// PGlite không có extension pgcrypto, nhưng gen_random_uuid() đã có sẵn trong lõi Postgres
const load = (file) => fs.readFileSync(path.join(SQL_DIR, file), 'utf8').replace(/create extension[^;]*;/gi, '')

export async function newDb({ upTo = MIGRATIONS.length } = {}) {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  for (const f of MIGRATIONS.slice(0, upTo)) await db.exec(load(f))
  await grantServiceRole(db)
  return db
}

// Supabase cấp sẵn quyền cho service_role bằng default privileges; PGlite thì không, nên cấp tay để mô phỏng
export const grantServiceRole = (db) =>
  db.exec(`grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;`)

export const rerun = (db, file) => db.exec(load(file))

/** Chèn dữ liệu mẫu: 1 nhà cung cấp, 1 khách hàng, 1 hàng (tồn 10, giá vốn 5). */
export async function seed(db) {
  const one = async (sql) => (await db.query(sql)).rows[0].id
  const supplier = await one("insert into partners(name, type) values ('NCC A', 'supplier') returning id")
  const customer = await one("insert into partners(name, type) values ('Khách C', 'customer') returning id")
  const product = await one("insert into products(name, cost_price, sale_price, stock, min_stock) values ('Hàng P1', 5, 500, 10, 2) returning id")
  return { supplier, customer, product }
}

export const stockOf = async (db, id) => Number((await db.query('select stock from products where id = $1', [id])).rows[0].stock)
export const orderRow = async (db, id) => (await db.query('select id, code, type, total::float8 as total, paid::float8 as paid, debt::float8 as debt, order_date::text as order_date, note from order_summary where id = $1', [id])).rows[0]
