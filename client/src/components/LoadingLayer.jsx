import { useLoading } from '../api'

/**
 * Báo đang tải cho mọi API:
 * - Thanh chạy ở mép trên màn hình khi có bất kỳ API nào đang chạy.
 * - Lớp chặn + vòng quay khi đang lưu / xoá / đăng nhập (tránh bấm hai lần).
 * Cả hai chỉ hiện sau ~0,15 giây để không nhấp nháy với API nhanh.
 */
export default function LoadingLayer() {
  const { get, mut } = useLoading()
  return (
    <>
      {get + mut > 0 && (
        <div className="topbar" role="progressbar" aria-label="Đang tải">
          <i />
        </div>
      )}
      {mut > 0 && (
        <div className="blocker" role="alert" aria-busy="true">
          <div className="blockbox">
            <span className="spin busy" />
            <span>Đang xử lý...</span>
          </div>
        </div>
      )}
    </>
  )
}
