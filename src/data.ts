export type Product = {
  id: string; code: string; name: string; category: string; brand: string; model: string
  vehicle: string; partType: string; compatibility: string; stock: number
  minStock: number | null; cost: number; price: number; active: boolean
  compatibilities?: VehicleCompatibility[]
}
export type VehicleCompatibility = { id: string; brand: string; model: string; engine: string; yearFrom: number | null; yearTo: number | null; notes: string }

export type SaleLine = {
  id: string; productId: string; productCode: string; productName: string; quantity: number
  unitPrice: number; unitCost: number; vatRate: number; subtotal: number; vatAmount: number; total: number
}
export type Sale = {
  id: string; number: string; date: string; customer: string; lines: SaleLine[]
  subtotal: number; vatAmount: number; total: number; status: 'active' | 'cancelled'
  cancelledAt?: string; cancelReason?: string
  createdBy?: string; createdByName?: string
}
export type Payment = { id: string; saleId: string; date: string; amount: number; method: string }
export type Refund = { id: string; saleId: string; date: string; amount: number; method: string; reason: string }
export type SaleReturn = {
  id: string; saleId: string; lineId: string; date: string; quantity: number; reason: string
  productId: string; productCode: string; productName: string; unitPrice: number; unitCost: number
  vatRate: number; subtotal: number; vatAmount: number; total: number
}
export type Expense = { id: string; date: string; category: string; description: string; amount: number; createdBy?: string; createdByName?: string }
export type Purchase = {
  id: string; date: string; supplier: string; productId: string; productCode: string
  productName: string; quantity: number; unitCost: number; total: number
  createdBy?: string; createdByName?: string
}
export type ExpenseRevision = { id: string; expenseId: string; recordedAt: string; reason: string; action: 'correct' | 'void'; before: Expense; after: Expense | null }
export type PurchaseRevision = { id: string; purchaseId: string; recordedAt: string; reason: string; action: 'correct' | 'void'; before: Purchase; after: Purchase | null }
export type StockCount = { id: string; date: string; reason: string; lines: { productId: string; productCode: string; expected: number; counted: number }[] }
export type StockMovement = {
  id: string; date: string; productId: string; productCode: string; delta: number
  balanceAfter: number; reason: string; source: 'sale' | 'return' | 'cancel' | 'import' | 'adjust' | 'initial' | 'count'
}
export type Audit = { id: string; date: string; action: string; detail: string; actorId?: string; actorName?: string }
export type Store = {
  products: Product[]; sales: Sale[]; payments: Payment[]; refunds: Refund[]; returns: SaleReturn[]
  expenses: Expense[]; purchases: Purchase[]; expenseRevisions: ExpenseRevision[]; purchaseRevisions: PurchaseRevision[]; stockCounts: StockCount[]; stockMovements: StockMovement[]; audit: Audit[]
}

const KEY = 'torquex-prototype-v1' // Keep the key to preserve data from earlier versions.
const CLEAN_START_KEY = 'torquex-clean-start-v1.5'
export const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const today = () => localDate(new Date())
export const uid = () => crypto.randomUUID()
export const money = (n: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)
export const numeric = (n: number) => new Intl.NumberFormat('es-EC').format(n)
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export function toCents(amount: number) {
  const cents = Math.round(amount * 100)
  if (!Number.isSafeInteger(cents)) throw new Error('El importe supera el límite de cálculo seguro.')
  return cents
}
export function fromCents(amount: number) {
  if (!Number.isSafeInteger(amount)) throw new Error('El importe supera el límite de cálculo seguro.')
  return amount / 100
}
export function vatCents(subtotalCents: number, rate: number) {
  if (!Number.isSafeInteger(subtotalCents)) throw new Error('El subtotal supera el límite de cálculo seguro.')
  const rateUnits = Math.round(rate * 10000)
  if (!Number.isSafeInteger(rateUnits) || rateUnits < 0 || rateUnits > 10000) throw new Error('La tasa de IVA no es válida.')
  const cents = Number((BigInt(subtotalCents) * BigInt(rateUnits) + 5000n) / 10000n)
  if (!Number.isSafeInteger(cents)) throw new Error('El IVA supera el límite de cálculo seguro.')
  return cents
}
export const emptyStore = (): Store => ({ products: [], sales: [], payments: [], refunds: [], returns: [], expenses: [], purchases: [], expenseRevisions: [], purchaseRevisions: [], stockCounts: [], stockMovements: [], audit: [] })

type LegacySale = Omit<Sale, 'lines' | 'status'> & {
  lines?: SaleLine[]; status?: 'active' | 'cancelled'; productId?: string; productCode?: string
  productName?: string; quantity?: number; unitPrice?: number; unitCost?: number
  vatRate?: number; paid?: number
}

export function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== 'object') throw new Error('El respaldo no contiene datos de Torquex.')
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.products) || !Array.isArray(raw.sales)) throw new Error('Faltan productos o ventas en el respaldo.')
  const oldSales = raw.sales as LegacySale[]
  const sales: Sale[] = oldSales.map(s => {
    const lines = Array.isArray(s.lines) ? s.lines : [{
      id: uid(), productId: s.productId ?? '', productCode: s.productCode ?? '', productName: s.productName ?? '',
      quantity: s.quantity ?? 0, unitPrice: s.unitPrice ?? 0, unitCost: s.unitCost ?? 0, vatRate: s.vatRate ?? 0,
      subtotal: s.subtotal, vatAmount: s.vatAmount, total: s.total,
    }]
    return { id: s.id, number: s.number, date: s.date, customer: s.customer, lines, subtotal: s.subtotal, vatAmount: s.vatAmount, total: s.total, status: s.status ?? 'active', cancelledAt: s.cancelledAt, cancelReason: s.cancelReason }
  })
  const migratedPayments = oldSales.filter(s => Number(s.paid) > 0).map(s => ({ id: uid(), saleId: s.id, date: s.date, amount: Number(s.paid), method: 'Registro anterior' }))
  const list = <T>(key: string): T[] => Array.isArray(raw[key]) ? raw[key] as T[] : []
  return {
    products: (raw.products as Product[]).map(p => ({ ...p, compatibilities: Array.isArray(p.compatibilities) ? p.compatibilities : [] })), sales,
    payments: [...list<Payment>('payments'), ...migratedPayments],
    refunds: list<Refund>('refunds'), returns: list<SaleReturn>('returns'),
    expenses: list<Expense>('expenses'), purchases: list<Purchase>('purchases'), expenseRevisions: list<ExpenseRevision>('expenseRevisions'), purchaseRevisions: list<PurchaseRevision>('purchaseRevisions'), stockCounts: list<StockCount>('stockCounts'),
    stockMovements: list<StockMovement>('stockMovements'), audit: list<Audit>('audit'),
  }
}

export function loadStore(): Store {
  try {
    const clean = applyCleanStart()
    if (clean) return clean
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeStore(JSON.parse(raw)) : emptyStore()
  } catch {
    return emptyStore()
  }
}
export function applyCleanStart(): Store | null {
  if (localStorage.getItem(CLEAN_START_KEY) === 'done') return null
  const clean = emptyStore()
  localStorage.setItem(KEY, JSON.stringify(clean))
  localStorage.setItem(CLEAN_START_KEY, 'done')
  return clean
}
export function saveStore(store: Store) { localStorage.setItem(KEY, JSON.stringify(store)) }
export function nextCode(products: Product[]) {
  const last = Math.max(0, ...products.map(p => Number(p.code.match(/^TX-(\d+)$/)?.[1] ?? 0)))
  return `TX-${String(last + 1).padStart(5, '0')}`
}
export function nextSaleNumber(sales: Sale[]) {
  const last = Math.max(0, ...sales.map(s => Number(s.number.match(/^V-(\d+)$/)?.[1] ?? 0)))
  return `V-${String(last + 1).padStart(5, '0')}`
}
export function addAudit(store: Store, action: string, detail: string): Store {
  return { ...store, audit: [{ id: uid(), date: new Date().toISOString(), action, detail }, ...store.audit].slice(0, 1000) }
}

function daysAgo(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return localDate(d) }
export function demoStore(): Store {
  const products: Product[] = [
    { id: 'p1', code: 'TX-00001', name: 'Filtro de aceite', category: 'Filtros', brand: 'Bosch', model: 'P 3314', vehicle: 'Toyota Hilux', partType: 'Motor', compatibility: 'Hilux 2.4 / 2.8, 2016–2024', compatibilities: [{ id: 'v1', brand: 'Toyota', model: 'Hilux', engine: '2.4 / 2.8', yearFrom: 2016, yearTo: 2024, notes: 'Ejemplo' }], stock: 24, minStock: 8, cost: 8.5, price: 14.9, active: true },
    { id: 'p2', code: 'TX-00002', name: 'Pastillas de freno delanteras', category: 'Frenos', brand: 'Brembo', model: 'P 83 153', vehicle: 'Chevrolet D-Max', partType: 'Frenos', compatibility: 'D-Max 3.0, 2015–2023', stock: 6, minStock: 10, cost: 26, price: 44, active: true },
    { id: 'p3', code: 'TX-00003', name: 'Amortiguador delantero', category: 'Suspensión', brand: 'KYB', model: 'Excel-G', vehicle: 'Kia Sportage', partType: 'Suspensión', compatibility: 'Sportage 2017–2022', stock: 12, minStock: 5, cost: 52, price: 85, active: true },
    { id: 'p4', code: 'TX-00004', name: 'Batería 12V 65Ah', category: 'Eléctrico', brand: 'Bosch', model: 'S4', vehicle: 'Multimarca', partType: 'Baterías', compatibility: 'Verificar bornes y dimensiones', stock: 3, minStock: 4, cost: 78, price: 118, active: true },
    { id: 'p5', code: 'TX-00005', name: 'Correa de distribución', category: 'Motor', brand: 'Gates', model: 'PowerGrip', vehicle: 'Hyundai Tucson', partType: 'Distribución', compatibility: 'Tucson 2.0, 2016–2021', stock: 19, minStock: null, cost: 34, price: 59, active: true },
  ]
  const makeSale = (id: string, number: string, date: string, customer: string, product: Product, quantity: number): Sale => {
    const subtotalCents = toCents(product.price) * quantity, vatRate = 0.15, subtotal = fromCents(subtotalCents), vatAmount = fromCents(vatCents(subtotalCents, vatRate))
    const line: SaleLine = { id: `l-${id}`, productId: product.id, productCode: product.code, productName: product.name, quantity, unitPrice: product.price, unitCost: product.cost, vatRate, subtotal, vatAmount, total: round(subtotal + vatAmount) }
    return { id, number, date, customer, lines: [line], subtotal, vatAmount, total: line.total, status: 'active' }
  }
  return {
    products,
    sales: [makeSale('s1', 'V-00001', daysAgo(2), 'Cliente de ejemplo A', products[0], 4), makeSale('s2', 'V-00002', daysAgo(5), 'Cliente de ejemplo B', products[1], 2), makeSale('s3', 'V-00003', daysAgo(12), 'Cliente de ejemplo C', products[2], 1)],
    payments: [
      { id: 'c1', saleId: 's1', date: daysAgo(2), amount: 68.54, method: 'Transferencia' },
      { id: 'c2', saleId: 's2', date: daysAgo(4), amount: 40, method: 'Efectivo' },
      { id: 'c3', saleId: 's3', date: daysAgo(12), amount: 97.75, method: 'Transferencia' },
    ],
    refunds: [], returns: [],
    expenses: [
      { id: 'e1', date: daysAgo(3), category: 'Logística', description: 'Flete de ejemplo', amount: 85 },
      { id: 'e2', date: daysAgo(9), category: 'Operación', description: 'Embalaje de ejemplo', amount: 24.5 },
    ],
    purchases: [{ id: 'i1', date: daysAgo(6), supplier: 'Proveedor de ejemplo', productId: 'p1', productCode: 'TX-00001', productName: 'Filtro de aceite', quantity: 20, unitCost: 8.5, total: 170 }],
    expenseRevisions: [], purchaseRevisions: [], stockCounts: [], stockMovements: [],
    audit: [{ id: 'a1', date: new Date().toISOString(), action: 'Demo iniciada', detail: 'Datos ficticios para explorar el prototipo' }],
  }
}

export function csvEscape(value: unknown) {
  const raw = String(value ?? ''), safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const content = '\ufeff' + [headers, ...rows].map(row => row.map(csvEscape).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0]
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
    } else if (char === delimiter && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field); if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += char
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar.')
  row.push(field); if (row.some(Boolean)) rows.push(row)
  return rows
}
