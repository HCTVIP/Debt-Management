// Bộ biểu tượng dạng đường nét; khi `active` thì tô đặc nhẹ và nét đậm hơn (giống thanh tab của Facebook)
const Svg = ({ active, children, size = 26 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    fillOpacity={active ? 0.16 : 0}
    stroke="currentColor"
    strokeWidth={active ? 2.3 : 1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const IconLogout = (p) => <Svg size={20} {...p}><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9" fill="none" /></Svg>
