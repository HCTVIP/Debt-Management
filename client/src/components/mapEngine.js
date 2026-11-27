// Bản đồ trong ứng dụng: Google Maps JavaScript (khi có khoá trình duyệt) hoặc Leaflet + OpenStreetMap.
// Cả hai cùng một giao diện: { setMarker(lat, lng), panTo(lat, lng, zoom), destroy() }.

let googlePromise
const loadGoogle = (key) => {
  if (googlePromise) return googlePromise
  googlePromise = new Promise((resolve, reject) => {
    window.__gmReady = () => resolve(window.google.maps)
    // Google gọi hàm này khi khoá bị từ chối (sai khoá, chưa bật Maps JavaScript API, sai tên miền...)
    window.gm_authFailure = () => reject(new Error('Google từ chối khoá bản đồ'))
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=vi&region=VN&callback=__gmReady`
    s.async = true
    s.onerror = () => reject(new Error('Không tải được Google Maps'))
    document.head.append(s)
  })
  googlePromise.catch(() => (googlePromise = null))
  return googlePromise
}

async function googleMap(el, key, center, zoom, onClick) {
  const gm = await loadGoogle(key)
  const map = new gm.Map(el, { center, zoom, gestureHandling: 'greedy', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false })
  let marker = null
  map.addListener('click', (e) => onClick(e.latLng.lat(), e.latLng.lng()))
  return {
    engine: 'google',
    setMarker(lat, lng) {
      if (!marker) marker = new gm.Marker({ map, position: { lat, lng } })
      else marker.setPosition({ lat, lng })
    },
    panTo(lat, lng, z) {
      map.panTo({ lat, lng })
      if (z) map.setZoom(z)
    },
    destroy() {
      gm.event.clearInstanceListeners(map)
      el.innerHTML = ''
    }
  }
}

async function leafletMap(el, center, zoom, onClick) {
  const L = (await import('leaflet')).default
  await import('leaflet/dist/leaflet.css')
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  const icon = L.divIcon({ className: 'mpin', html: '<span>📍</span>', iconSize: [32, 32], iconAnchor: [16, 30] })
  let marker = null
  map.on('click', (e) => onClick(e.latlng.lat, e.latlng.lng))
  return {
    engine: 'osm',
    setMarker(lat, lng) {
      if (!marker) marker = L.marker([lat, lng], { icon }).addTo(map)
      else marker.setLatLng([lat, lng])
    },
    panTo(lat, lng, z) {
      map.setView([lat, lng], z || map.getZoom())
    },
    destroy() {
      map.remove()
    }
  }
}

/** Tạo bản đồ trong `el`. Có `browserKey` thì dùng Google, lỗi hoặc không có thì dùng OpenStreetMap. Trả về { map, note }. */
export async function createMap(el, { browserKey, center, zoom, onClick }) {
  if (browserKey) {
    try {
      return { map: await googleMap(el, browserKey, center, zoom, onClick), note: '' }
    } catch (e) {
      el.innerHTML = ''
      return { map: await leafletMap(el, center, zoom, onClick), note: e.message + '. Đang dùng bản đồ OpenStreetMap.' }
    }
  }
  return { map: await leafletMap(el, center, zoom, onClick), note: '' }
}
