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
