// Lỗi từ Supabase / Postgres: thông báo do hàm SQL chủ động `raise exception` (SQLSTATE P0001) là câu hỏi người dùng đọc được;
// còn lại (lỗi hệ thống, tên bảng, cú pháp...) chỉ ghi log phía server, trả câu chung cho client.
export const dbError = (error) => Object.assign(new Error(error.message || 'Lỗi cơ sở dữ liệu'), { code: error.code, db: true })

export const MIGRATION_HINT = 'Chưa cập nhật cơ sở dữ liệu: chạy supabase/005_integrity.sql trong Supabase SQL Editor'

/** { status, body, log } cho một lỗi bất kỳ. */
export const describeError = (e) => {
  if (!e?.db) return { status: e?.status || 400, body: { error: e?.message || 'Lỗi' }, log: false }
  if (e.code === 'P0001') return { status: 400, body: { error: e.message }, log: false }
  if (e.code === 'PGRST116') return { status: 404, body: { error: 'Không tìm thấy' }, log: false }
  if (e.code === 'PGRST202' || e.code === '42883') return { status: 500, body: { error: MIGRATION_HINT }, log: true }
  return { status: 500, body: { error: 'Lỗi hệ thống, vui lòng thử lại' }, log: true }
}
