import { normalizeStore, toCents, today, type Store } from './data.ts'
import { validDate } from './domain.ts'

export function downloadBackup(store: Store) {
  const content = JSON.stringify({ app: 'torquex', formatVersion: 2, exportedAt: new Date().toISOString(), store }, null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `torquex-respaldo-${today()}.json`
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readBackup(file: File): Promise<Store> {
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Selecciona un respaldo .json de Torquex.')
  if (file.size > 10_000_000) throw new Error('El respaldo supera 10 MB.')
  const document = JSON.parse(await file.text()) as { app?: string; store?: unknown }
  if (document.app !== 'torquex') throw new Error('El archivo no es un respaldo de Torquex.')
  const store = normalizeStore(document.store)
  const validAmount = (value: number) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  const productIds = new Set<string>()
  for (const p of store.products) {
    if (typeof p.id !== 'string' || productIds.has(p.id) || typeof p.code !== 'string' || typeof p.name !== 'string' || !Number.isSafeInteger(p.stock) || p.stock < 0 || !validAmount(p.cost) || !validAmount(p.price) || p.minStock !== null && (!Number.isSafeInteger(p.minStock) || p.minStock < 0)) throw new Error('El respaldo contiene productos inválidos.')
    productIds.add(p.id)
    if (!Array.isArray(p.compatibilities) || p.compatibilities.some(c => typeof c.id !== 'string' || typeof c.brand !== 'string' || typeof c.model !== 'string' || typeof c.engine !== 'string' || typeof c.notes !== 'string' || c.yearFrom !== null && (!Number.isSafeInteger(c.yearFrom) || c.yearFrom < 1900) || c.yearTo !== null && (!Number.isSafeInteger(c.yearTo) || c.yearTo < (c.yearFrom ?? 1900)))) throw new Error('El respaldo contiene compatibilidades inválidas.')
  }
  const saleIds = new Set<string>(), lineIds = new Set<string>(), lineOwners = new Map<string, { saleId: string; quantity: number; productId: string }>()
  for (const sale of store.sales) {
    if (typeof sale.id !== 'string' || saleIds.has(sale.id) || !validDate(sale.date) || !Array.isArray(sale.lines) || !sale.lines.length || !validAmount(sale.subtotal) || !validAmount(sale.vatAmount) || !validAmount(sale.total) || !['active', 'cancelled'].includes(sale.status)) throw new Error('El respaldo contiene ventas inválidas.')
    saleIds.add(sale.id)
    for (const line of sale.lines) {
      if (typeof line.id !== 'string' || lineIds.has(line.id) || !productIds.has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !validAmount(line.unitPrice) || !validAmount(line.unitCost) || !validAmount(line.subtotal) || !validAmount(line.vatAmount) || !validAmount(line.total) || toCents(line.subtotal) !== toCents(line.unitPrice) * line.quantity || toCents(line.total) !== toCents(line.subtotal) + toCents(line.vatAmount)) throw new Error('El respaldo contiene piezas de venta inválidas.')
      lineIds.add(line.id)
      lineOwners.set(line.id, { saleId: sale.id, quantity: line.quantity, productId: line.productId })
    }
    if (toCents(sale.subtotal) !== sale.lines.reduce((sum, line) => sum + toCents(line.subtotal), 0) || toCents(sale.vatAmount) !== sale.lines.reduce((sum, line) => sum + toCents(line.vatAmount), 0) || toCents(sale.total) !== toCents(sale.subtotal) + toCents(sale.vatAmount)) throw new Error('El respaldo contiene totales de venta inconsistentes.')
  }
  for (const payment of store.payments) if (!saleIds.has(payment.saleId) || !validAmount(payment.amount) || payment.amount <= 0) throw new Error('El respaldo contiene cobros inválidos.')
  for (const refund of store.refunds) if (!saleIds.has(refund.saleId) || !validAmount(refund.amount) || refund.amount <= 0) throw new Error('El respaldo contiene reembolsos inválidos.')
  const returned = new Map<string, number>()
  for (const item of store.returns) {
    const owner = lineOwners.get(item.lineId)
    if (!owner || owner.saleId !== item.saleId || owner.productId !== item.productId || !validDate(item.date) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !validAmount(item.subtotal) || !validAmount(item.vatAmount) || !validAmount(item.total) || toCents(item.total) !== toCents(item.subtotal) + toCents(item.vatAmount)) throw new Error('El respaldo contiene devoluciones inválidas.')
    returned.set(item.lineId, (returned.get(item.lineId) ?? 0) + item.quantity)
    if (returned.get(item.lineId)! > owner.quantity) throw new Error('El respaldo devuelve más piezas que las vendidas.')
  }
  for (const purchase of store.purchases) if (!productIds.has(purchase.productId) || !Number.isSafeInteger(purchase.quantity) || purchase.quantity < 1 || !validAmount(purchase.unitCost) || !validAmount(purchase.total) || toCents(purchase.total) !== toCents(purchase.unitCost) * purchase.quantity) throw new Error('El respaldo contiene importaciones inválidas.')
  for (const expense of store.expenses) if (!validAmount(expense.amount) || expense.amount <= 0) throw new Error('El respaldo contiene gastos inválidos.')
  const purchaseIds = new Set(store.purchases.map(p => p.id)), expenseIds = new Set(store.expenses.map(e => e.id))
  for (const revision of store.purchaseRevisions) if (!purchaseIds.has(revision.purchaseId) || !['correct', 'void'].includes(revision.action) || revision.after !== null && (!Number.isSafeInteger(revision.after.quantity) || revision.after.quantity < 1 || !validAmount(revision.after.unitCost) || !validAmount(revision.after.total) || toCents(revision.after.total) !== toCents(revision.after.unitCost) * revision.after.quantity)) throw new Error('El respaldo contiene correcciones de entradas inválidas.')
  for (const revision of store.expenseRevisions) if (!expenseIds.has(revision.expenseId) || !['correct', 'void'].includes(revision.action) || revision.after !== null && (!validAmount(revision.after.amount) || revision.after.amount <= 0)) throw new Error('El respaldo contiene correcciones de gastos inválidas.')
  for (const count of store.stockCounts) if (!validDate(count.date) || !Array.isArray(count.lines) || count.lines.some(line => !productIds.has(line.productId) || !Number.isSafeInteger(line.expected) || line.expected < 0 || !Number.isSafeInteger(line.counted) || line.counted < 0)) throw new Error('El respaldo contiene conteos inválidos.')
  for (const movement of store.stockMovements) if (!productIds.has(movement.productId) || !Number.isSafeInteger(movement.delta) || movement.delta === 0 || !Number.isSafeInteger(movement.balanceAfter) || movement.balanceAfter < 0) throw new Error('El respaldo contiene movimientos de stock inválidos.')
  return store
}
