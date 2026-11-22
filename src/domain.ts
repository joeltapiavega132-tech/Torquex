import { addAudit, fromCents, nextSaleNumber, round, toCents, today, uid, vatCents, type Expense, type Product, type Purchase, type Refund, type Sale, type SaleLine, type SaleReturn, type StockMovement, type Store } from './data.ts'

const fail = (message: string): never => { throw new Error(message) }
function required<T>(value: T | undefined, message: string): T { if (value === undefined) throw new Error(message); return value }
const isWhole = (value: number) => Number.isSafeInteger(value) && value > 0
const isMoney = (value: number) => Number.isFinite(value) && value >= 0 && Math.abs(value - round(value)) < 0.000001
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10))
}
function needDate(date: string) { if (!validDate(date)) fail('Selecciona una fecha válida.') }
function movement(product: Product, delta: number, balanceAfter: number, date: string, reason: string, source: StockMovement['source']): StockMovement {
  return { id: uid(), date, productId: product.id, productCode: product.code, delta, balanceAfter, reason, source }
}

export function returnedQuantity(store: Store, lineId: string) { return store.returns.filter(item => item.lineId === lineId).reduce((sum, item) => sum + item.quantity, 0) }
export function netSale(store: Store, sale: Sale) {
  const returns = store.returns.filter(item => item.saleId === sale.id)
  return {
    subtotal: fromCents(toCents(sale.subtotal) - returns.reduce((sum, item) => sum + toCents(item.subtotal), 0)),
    vatAmount: fromCents(toCents(sale.vatAmount) - returns.reduce((sum, item) => sum + toCents(item.vatAmount), 0)),
    total: fromCents(toCents(sale.total) - returns.reduce((sum, item) => sum + toCents(item.total), 0)),
  }
}
export function netPaid(store: Store, saleId: string) {
  return fromCents(store.payments.filter(item => item.saleId === saleId).reduce((sum, item) => sum + toCents(item.amount), 0) - store.refunds.filter(item => item.saleId === saleId).reduce((sum, item) => sum + toCents(item.amount), 0))
}
export function saleBalance(store: Store, sale: Sale) { return fromCents(toCents(netSale(store, sale).total) - toCents(netPaid(store, sale.id))) }

export type SaleDraft = { date: string; customer: string; vatRate: number; paid: number; items: { productId: string; quantity: number }[] }
export function registerSale(store: Store, draft: SaleDraft): Store {
  needDate(draft.date)
  if (!draft.customer.trim()) fail('Ingresa el nombre del cliente.')
  if (!Number.isFinite(draft.vatRate) || draft.vatRate < 0 || draft.vatRate > 1 || Math.abs(draft.vatRate * 10000 - Math.round(draft.vatRate * 10000)) > 0.000001) fail('La tasa de IVA debe estar entre 0% y 100%, con máximo dos decimales porcentuales.')
  if (!draft.items.length) fail('Agrega al menos una pieza a la venta.')
  const seen = new Set<string>()
  const lines: SaleLine[] = draft.items.map(item => {
    if (seen.has(item.productId)) fail('Cada producto debe aparecer una sola vez en la venta.')
    seen.add(item.productId)
    const product = required(store.products.find(p => p.id === item.productId && p.active), 'Una pieza ya no está disponible en el inventario.')
    if (!isWhole(item.quantity) || item.quantity > product.stock) fail(`${product.name}: cantidad inválida o stock insuficiente (disponible: ${product.stock}).`)
    const subtotalCents = toCents(product.price) * item.quantity
    const subtotal = fromCents(subtotalCents), vatAmount = fromCents(vatCents(subtotalCents, draft.vatRate))
    return { id: uid(), productId: product.id, productCode: product.code, productName: product.name, quantity: item.quantity, unitPrice: product.price, unitCost: product.cost, vatRate: draft.vatRate, subtotal, vatAmount, total: fromCents(subtotalCents + toCents(vatAmount)) }
  })
  const subtotal = fromCents(lines.reduce((sum, item) => sum + toCents(item.subtotal), 0))
  const vatAmount = fromCents(lines.reduce((sum, item) => sum + toCents(item.vatAmount), 0))
  const total = fromCents(toCents(subtotal) + toCents(vatAmount))
  if (!isMoney(draft.paid) || draft.paid > total) fail('El cobro inicial debe estar entre cero y el total de la venta.')
  const sale: Sale = { id: uid(), number: nextSaleNumber(store.sales), date: draft.date, customer: draft.customer.trim(), lines, subtotal, vatAmount, total, status: 'active' }
  const products = store.products.map(p => {
    const line = lines.find(item => item.productId === p.id)
    return line ? { ...p, stock: p.stock - line.quantity } : p
  })
  const stockMovements = lines.map(line => {
    const original = store.products.find(p => p.id === line.productId)!
    return movement(original, -line.quantity, original.stock - line.quantity, draft.date, `Venta ${sale.number}`, 'sale')
  })
  const payments = draft.paid > 0 ? [{ id: uid(), saleId: sale.id, date: draft.date, amount: round(draft.paid), method: 'Cobro inicial' }, ...store.payments] : store.payments
  return addAudit({ ...store, products, sales: [sale, ...store.sales], payments, stockMovements: [...stockMovements, ...store.stockMovements] }, 'Venta registrada', `${sale.number}: ${sale.customer}, ${lines.length} piezas, total ${total.toFixed(2)}`)
}

export function registerPayment(store: Store, saleId: string, amount: number, method: string, date: string): Store {
  needDate(date)
  const sale = required(store.sales.find(s => s.id === saleId), 'La venta ya no existe.')
  if (date < sale.date) fail('La fecha del cobro no puede ser anterior a la venta.')
  const balance = saleBalance(store, sale)
  if (!isMoney(amount) || amount <= 0 || amount > balance) fail(`El cobro debe ser mayor que cero y no superar el pendiente (${balance.toFixed(2)}).`)
  if (!method.trim()) fail('Selecciona el método de cobro.')
  return addAudit({ ...store, payments: [{ id: uid(), saleId, date, amount: round(amount), method: method.trim() }, ...store.payments] }, 'Cobro registrado', `${sale.number}: ${amount.toFixed(2)} por ${method}`)
}

export function registerRefund(store: Store, saleId: string, amount: number, method: string, date: string, reason: string): Store {
  needDate(date)
  const sale = required(store.sales.find(s => s.id === saleId), 'La venta ya no existe.')
  if (date < sale.date) fail('La fecha del reembolso no puede ser anterior a la venta.')
  const latestReduction = [sale.cancelledAt ?? '', ...store.returns.filter(item => item.saleId === saleId).map(item => item.date)].sort().at(-1) ?? ''
  if (date < latestReduction) fail('El reembolso no puede fecharse antes de la devolución o anulación que generó el saldo.')
  const due = Math.max(0, -saleBalance(store, sale))
  if (!isMoney(amount) || amount <= 0 || amount > due) fail(`El reembolso no puede superar lo adeudado al cliente (${due.toFixed(2)}).`)
  if (!method.trim() || !reason.trim()) fail('Indica método y motivo del reembolso.')
  const refund: Refund = { id: uid(), saleId, date, amount: round(amount), method: method.trim(), reason: reason.trim() }
  return addAudit({ ...store, refunds: [refund, ...store.refunds] }, 'Reembolso registrado', `${sale.number}: ${amount.toFixed(2)} por ${method}; ${reason.trim()}`)
}

function makeReturn(store: Store, sale: Sale, line: SaleLine, quantity: number, date: string, reason: string): SaleReturn {
  const prior = store.returns.filter(item => item.lineId === line.id)
  const remainingQuantity = line.quantity - prior.reduce((sum, item) => sum + item.quantity, 0)
  const remainingSubtotal = fromCents(toCents(line.subtotal) - prior.reduce((sum, item) => sum + toCents(item.subtotal), 0))
  const remainingVat = fromCents(toCents(line.vatAmount) - prior.reduce((sum, item) => sum + toCents(item.vatAmount), 0))
  const subtotal = quantity === remainingQuantity ? remainingSubtotal : fromCents(toCents(line.unitPrice) * quantity)
  const vatAmount = quantity === remainingQuantity ? remainingVat : Math.min(remainingVat, fromCents(vatCents(toCents(subtotal), line.vatRate)))
  return { id: uid(), saleId: sale.id, lineId: line.id, date, quantity, reason, productId: line.productId, productCode: line.productCode, productName: line.productName, unitPrice: line.unitPrice, unitCost: line.unitCost, vatRate: line.vatRate, subtotal, vatAmount, total: fromCents(toCents(subtotal) + toCents(vatAmount)) }
}
export function registerReturn(store: Store, saleId: string, lineId: string, quantity: number, date: string, reason: string): Store {
  needDate(date)
  if (!reason.trim()) fail('Escribe el motivo de la devolución.')
  const sale = required(store.sales.find(s => s.id === saleId && s.status !== 'cancelled'), 'Esta venta no admite devoluciones.')
  if (date < sale.date) fail('La devolución no puede tener fecha anterior a la venta.')
  const lastReturn = store.returns.filter(item => item.lineId === lineId).map(item => item.date).sort().at(-1)
  if (lastReturn && date < lastReturn) fail('La nueva devolución no puede fecharse antes de una devolución ya registrada de esta pieza.')
  const line = required(sale.lines.find(item => item.id === lineId), 'La pieza no pertenece a la venta.')
  const remaining = line.quantity - returnedQuantity(store, line.id)
  if (!isWhole(quantity) || quantity > remaining) fail(`Solo quedan ${remaining} unidades para devolver.`)
  const product = required(store.products.find(p => p.id === line.productId), 'No se encuentra el producto para restaurar el stock.')
  const item = makeReturn(store, sale, line, quantity, date, reason.trim())
  const products = store.products.map(p => p.id === product.id ? { ...p, stock: p.stock + quantity } : p)
  const stock = movement(product, quantity, product.stock + quantity, date, `Devolución ${sale.number}: ${reason.trim()}`, 'return')
  return addAudit({ ...store, products, returns: [item, ...store.returns], stockMovements: [stock, ...store.stockMovements] }, 'Devolución registrada', `${sale.number}: ${quantity} × ${line.productCode}; ${reason.trim()}`)
}

export function cancelSale(store: Store, saleId: string, date: string, reason: string): Store {
  needDate(date)
  if (!reason.trim()) fail('Escribe el motivo de la anulación.')
  const sale = required(store.sales.find(s => s.id === saleId && s.status !== 'cancelled'), 'La venta ya está anulada o no existe.')
  if (date < sale.date) fail('La anulación no puede tener fecha anterior a la venta.')
  if (store.returns.some(item => item.saleId === saleId && item.date > date)) fail('La anulación no puede fecharse antes de una devolución ya registrada.')
  const remaining = sale.lines.map(line => ({ line, quantity: line.quantity - returnedQuantity(store, line.id) })).filter(item => item.quantity > 0)
  const returns = remaining.map(({ line, quantity }) => makeReturn(store, sale, line, quantity, date, `Anulación: ${reason.trim()}`))
  const products = store.products.map(p => {
    const delta = remaining.filter(item => item.line.productId === p.id).reduce((sum, item) => sum + item.quantity, 0)
    return delta ? { ...p, stock: p.stock + delta } : p
  })
  const stockMovements = remaining.map(({ line, quantity }) => {
    const original = store.products.find(p => p.id === line.productId)!
    return movement(original, quantity, original.stock + quantity, date, `Anulación ${sale.number}: ${reason.trim()}`, 'cancel')
  })
  const sales = store.sales.map(s => s.id === sale.id ? { ...s, status: 'cancelled' as const, cancelledAt: date, cancelReason: reason.trim() } : s)
  return addAudit({ ...store, products, sales, returns: [...returns, ...store.returns], stockMovements: [...stockMovements, ...store.stockMovements] }, 'Venta anulada', `${sale.number}: ${reason.trim()}`)
}

export function registerImport(store: Store, productId: string, quantity: number, unitCost: number, supplier: string, date: string): Store {
  needDate(date)
  const product = required(store.products.find(p => p.id === productId && p.active), 'Selecciona un producto activo.')
  if (!isWhole(quantity)) fail('La cantidad debe ser un entero mayor que cero.')
  if (!isMoney(unitCost)) fail('El costo unitario debe ser un monto válido de dos decimales.')
  if (!supplier.trim()) fail('Ingresa el proveedor.')
  const purchase: Purchase = { id: uid(), date, supplier: supplier.trim(), productId, productCode: product.code, productName: product.name, quantity, unitCost: round(unitCost), total: fromCents(quantity * toCents(unitCost)) }
  const products = store.products.map(p => p.id === productId ? { ...p, stock: p.stock + quantity, cost: round(unitCost) } : p)
  const stock = movement(product, quantity, product.stock + quantity, date, `Entrada de ${supplier.trim()}`, 'import')
  return addAudit({ ...store, products, purchases: [purchase, ...store.purchases], stockMovements: [stock, ...store.stockMovements] }, 'Importación registrada', `${product.code}: +${quantity}, costo ${unitCost.toFixed(2)}, proveedor ${supplier.trim()}`)
}

export function adjustStock(store: Store, productId: string, newStock: number, reason: string, date: string): Store {
  needDate(date)
  const product = required(store.products.find(p => p.id === productId && p.active), 'Selecciona un producto activo.')
  if (!Number.isSafeInteger(newStock) || newStock < 0 || newStock === product.stock) fail('El nuevo stock debe ser un entero distinto del actual.')
  if (!reason.trim()) fail('Escribe el motivo del ajuste.')
  const delta = newStock - product.stock
  const products = store.products.map(p => p.id === productId ? { ...p, stock: newStock } : p)
  const stock = movement(product, delta, newStock, date, reason.trim(), 'adjust')
  return addAudit({ ...store, products, stockMovements: [stock, ...store.stockMovements] }, 'Ajuste de stock', `${product.code}: ${product.stock} → ${newStock}; ${reason.trim()}`)
}

export function effectiveExpense(store: Store, original: Expense): Expense | null {
  const revision = store.expenseRevisions.find(item => item.expenseId === original.id)
  return revision ? revision.after : original
}
export function effectivePurchase(store: Store, original: Purchase): Purchase | null {
  const revision = store.purchaseRevisions.find(item => item.purchaseId === original.id)
  return revision ? revision.after : original
}
export function activeExpenses(store: Store) { return store.expenses.map(item => effectiveExpense(store, item)).filter((item): item is Expense => item !== null) }
export function activePurchases(store: Store) { return store.purchases.map(item => effectivePurchase(store, item)).filter((item): item is Purchase => item !== null) }
export function reviseExpense(store: Store, id: string, after: Expense | null, reason: string): Store {
  const original = required(store.expenses.find(item => item.id === id), 'Gasto no encontrado.')
  const before = required(effectiveExpense(store, original) ?? undefined, 'Este gasto ya fue anulado.')
  if (!reason.trim()) fail('Escribe el motivo de la corrección o anulación.')
  if (after) {
    needDate(after.date)
    if (after.id !== id || !after.category.trim() || !after.description.trim() || !isMoney(after.amount) || after.amount <= 0) fail('Revisa los datos del gasto.')
  }
  const revision = { id: uid(), expenseId: id, recordedAt: new Date().toISOString(), reason: reason.trim(), action: after ? 'correct' as const : 'void' as const, before, after }
  return addAudit({ ...store, expenseRevisions: [revision, ...store.expenseRevisions] }, after ? 'Gasto corregido' : 'Gasto anulado', `${before.description}: ${reason.trim()}`)
}
export function revisePurchase(store: Store, id: string, after: Purchase | null, reason: string): Store {
  const original = required(store.purchases.find(item => item.id === id), 'Entrada no encontrada.')
  const before = required(effectivePurchase(store, original) ?? undefined, 'Esta entrada ya fue anulada.')
  const product = required(store.products.find(item => item.id === original.productId), 'Producto no encontrado.')
  if (!reason.trim()) fail('Escribe el motivo de la corrección o anulación.')
  if (after) {
    needDate(after.date)
    if (after.id !== id || after.productId !== original.productId || !after.supplier.trim() || !isWhole(after.quantity) || !isMoney(after.unitCost) || toCents(after.total) !== after.quantity * toCents(after.unitCost)) fail('Revisa los datos de la entrada.')
  }
  const delta = (after?.quantity ?? 0) - before.quantity
  if (product.stock + delta < 0) fail('No hay stock suficiente para reducir esta entrada. Revisa las ventas o haz un conteo antes de continuar.')
  const revision = { id: uid(), purchaseId: id, recordedAt: new Date().toISOString(), reason: reason.trim(), action: after ? 'correct' as const : 'void' as const, before, after }
  const products = store.products.map(item => item.id === product.id ? { ...item, stock: item.stock + delta, cost: after && item.cost === before.unitCost ? after.unitCost : item.cost } : item)
  const stockMovements = delta === 0 ? store.stockMovements : [movement(product, delta, product.stock + delta, today(), `Corrección de entrada ${id}: ${reason.trim()}`, 'import'), ...store.stockMovements]
  return addAudit({ ...store, products, stockMovements, purchaseRevisions: [revision, ...store.purchaseRevisions] }, after ? 'Entrada corregida' : 'Entrada anulada', `${product.code}: ${before.quantity} → ${after?.quantity ?? 0}; ${reason.trim()}`)
}
export function registerStockCount(store: Store, entries: { productId: string; counted: number }[], reason: string, date: string): Store {
  needDate(date)
  if (!reason.trim() || entries.length === 0 || new Set(entries.map(e => e.productId)).size !== entries.length) fail('Indica un motivo y al menos un producto sin duplicados.')
  const lines = entries.map(entry => {
    const product = required(store.products.find(item => item.id === entry.productId && item.active), 'Producto del conteo no encontrado.')
    if (!Number.isSafeInteger(entry.counted) || entry.counted < 0) fail(`Cantidad inválida para ${product.code}.`)
    return { productId: product.id, productCode: product.code, expected: product.stock, counted: entry.counted }
  })
  const changes = lines.filter(line => line.expected !== line.counted)
  const products = store.products.map(product => { const line = lines.find(item => item.productId === product.id); return line ? { ...product, stock: line.counted } : product })
  const stockMovements = changes.map(line => movement(required(store.products.find(p => p.id === line.productId), 'Producto no encontrado.'), line.counted - line.expected, line.counted, date, `Conteo: ${reason.trim()}`, 'count'))
  return addAudit({ ...store, products, stockCounts: [{ id: uid(), date, reason: reason.trim(), lines }, ...store.stockCounts], stockMovements: [...stockMovements, ...store.stockMovements] }, 'Conteo de inventario', `${lines.length} productos; ${changes.length} diferencias; ${reason.trim()}`)
}
export function receivablesAging(store: Store, asOf: string) {
  needDate(asOf)
  const buckets = { days0to30: 0, days31to60: 0, days61to90: 0, daysOver90: 0 }
  for (const sale of store.sales) {
    const balance = Math.max(0, saleBalance(store, sale))
    if (!balance || sale.date > asOf) continue
    const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${sale.date}T00:00:00Z`)) / 86400000)
    const key = days <= 30 ? 'days0to30' : days <= 60 ? 'days31to60' : days <= 90 ? 'days61to90' : 'daysOver90'
    buckets[key] = round(buckets[key] + balance)
  }
  return buckets
}
export function stockValuation(store: Store) { return fromCents(store.products.reduce((sum, p) => sum + p.stock * toCents(p.cost), 0)) }
export function periodReport(store: Store, start: string, end = '') {
  const within = (date: string) => date >= start && (!end || date <= end)
  const sales = store.sales.filter(item => within(item.date))
  const returns = store.returns.filter(item => within(item.date))
  const saleSubtotal = sales.reduce((sum, item) => sum + toCents(item.subtotal), 0)
  const returnSubtotal = returns.reduce((sum, item) => sum + toCents(item.subtotal), 0)
  const saleVat = sales.reduce((sum, item) => sum + toCents(item.vatAmount), 0)
  const returnVat = returns.reduce((sum, item) => sum + toCents(item.vatAmount), 0)
  const saleCost = sales.flatMap(item => item.lines).reduce((sum, line) => sum + toCents(line.unitCost) * line.quantity, 0)
  const returnCost = returns.reduce((sum, item) => sum + toCents(item.unitCost) * item.quantity, 0)
  const expenses = activeExpenses(store).filter(item => within(item.date)).reduce((sum, item) => sum + toCents(item.amount), 0)
  const collected = store.payments.filter(item => within(item.date)).reduce((sum, item) => sum + toCents(item.amount), 0) - store.refunds.filter(item => within(item.date)).reduce((sum, item) => sum + toCents(item.amount), 0)
  const subtotalCents = saleSubtotal - returnSubtotal, vatCentsTotal = saleVat - returnVat, cogsCents = saleCost - returnCost
  return { subtotal: fromCents(subtotalCents), vat: fromCents(vatCentsTotal), cogs: fromCents(cogsCents), expenses: fromCents(expenses), grossProfit: fromCents(subtotalCents - cogsCents), operatingResult: fromCents(subtotalCents - cogsCents - expenses), collected: fromCents(collected), salesCount: sales.length, returnsCount: returns.length }
}

export function productProfitability(store: Store, start: string, end = '') {
  const within = (date: string) => date >= start && (!end || date <= end)
  const rows = new Map<string, { code: string; name: string; units: number; revenue: number; profit: number }>()
  const add = (code: string, name: string, units: number, revenue: number, profit: number) => {
    const row = rows.get(code) ?? { code, name, units: 0, revenue: 0, profit: 0 }
    row.units += units; row.revenue = fromCents(toCents(row.revenue) + toCents(revenue)); row.profit = fromCents(toCents(row.profit) + toCents(profit))
    rows.set(code, row)
  }
  for (const sale of store.sales.filter(item => within(item.date))) for (const line of sale.lines) add(line.productCode, line.productName, line.quantity, line.subtotal, fromCents(toCents(line.subtotal) - toCents(line.unitCost) * line.quantity))
  for (const item of store.returns.filter(item => within(item.date))) add(item.productCode, item.productName, -item.quantity, -item.subtotal, fromCents(toCents(item.unitCost) * item.quantity - toCents(item.subtotal)))
  return Array.from(rows.values())
}
