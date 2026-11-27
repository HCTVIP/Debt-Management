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

export const IconHome = (p) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>
export const IconOrders = (p) => <Svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" fill="none" /></Svg>
export const IconTruck = (p) => (
  <Svg {...p}>
    <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" />
    <circle cx="7" cy="17.5" r="1.8" fill="var(--card, #fff)" />
    <circle cx="17" cy="17.5" r="1.8" fill="var(--card, #fff)" />
  </Svg>
)
export const IconWallet = (p) => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h13v3M3 7v10a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1-2-1z" /><path d="M16 13.5h2" fill="none" /></Svg>
export const IconBox = (p) => <Svg {...p}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" fill="none" /></Svg>
export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16.5 14.2c3 .2 5 2 5 5.3" fill="none" />
  </Svg>
)
export const IconLogout = (p) => <Svg size={20} {...p}><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9" fill="none" /></Svg>
