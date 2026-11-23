import { addAudit, nextCode, round, today, uid, type Expense, type Product, type Store } from '../../../src/data.ts'
import { adjustStock, cancelSale, registerImport, registerPayment, registerRefund, registerReturn, registerSale, registerStockCount, reviseExpense, revisePurchase, validDate, type SaleDraft } from '../../../src/domain.ts'

const fail = (message: string): never => { throw new Error(message) }
const first = <T extends { id: string }>(next: T[], old: T[]) => next.find(item => !old.some(prior => prior.id === item.id)) ?? fail('Movimiento no encontrado.')
function validateProduct(p: Product) {
  for (const value of [p.name, p.category, p.brand, p.model, p.vehicle, p.partType, p.compatibility]) {
    if (typeof value !== 'string' || value.length > 300) fail('El producto contiene texto inválido.')
  }
  if (!p.name.trim() || !Number.isSafeInteger(p.stock) || p.stock < 0 ||
    p.minStock !== null && (!Number.isSafeInteger(p.minStock) || p.minStock < 0) ||
    !Number.isFinite(p.cost) || p.cost < 0 || round(p.cost) !== p.cost ||
    !Number.isFinite(p.price) || p.price < 0 || round(p.price) !== p.price) fail('Producto inválido.')
  if (p.compatibilities !== undefined && (!Array.isArray(p.compatibilities) || p.compatibilities.length > 100 ||
    p.compatibilities.some(c => typeof c.brand !== 'string' || typeof c.model !== 'string' ||
      c.yearFrom !== null && (!Number.isSafeInteger(c.yearFrom) || c.yearFrom < 1900) ||
      c.yearTo !== null && (!Number.isSafeInteger(c.yearTo) || c.yearTo < (c.yearFrom ?? 1900))))) fail('Compatibilidad inválida.')
}
export const can = (role: string, action: string) => role === 'admin' ||
  role === 'ventas' && ['Venta registrada', 'Cobro registrado', 'Reembolso registrado', 'Devolución registrada', 'Venta anulada'].includes(action) ||
  role === 'inventario' && ['Producto creado', 'Producto editado', 'Producto archivado', 'Stock ajustado', 'Entrada registrada', 'Entrada corregida', 'Entrada anulada', 'Conteo registrado', 'Catálogo importado'].includes(action)

export function apply(current: Store, proposed: Store): Store {
  const action = proposed.audit?.[0]?.action
  switch (action) {
    case 'Venta registrada': {
      const sale = first(proposed.sales, current.sales)
      const paid = proposed.payments.find(item => item.saleId === sale.id)?.amount ?? 0
      const draft: SaleDraft = { date: sale.date, customer: sale.customer, vatRate: sale.lines[0]?.vatRate ?? 0, paid, items: sale.lines.map(line => ({ productId: line.productId, quantity: line.quantity })) }
      return registerSale(current, draft)
    }
    case 'Cobro registrado': { const p = first(proposed.payments, current.payments); return registerPayment(current, p.saleId, p.amount, p.method, p.date) }
    case 'Reembolso registrado': { const p = first(proposed.refunds, current.refunds); return registerRefund(current, p.saleId, p.amount, p.method, p.date, p.reason) }
    case 'Devolución registrada': { const p = first(proposed.returns, current.returns); return registerReturn(current, p.saleId, p.lineId, p.quantity, p.date, p.reason) }
    case 'Venta anulada': { const p = proposed.sales.find(item => item.status === 'cancelled' && current.sales.some(old => old.id === item.id && old.status !== 'cancelled')) ?? fail('Venta no encontrada.'); return cancelSale(current, p.id, p.cancelledAt ?? today(), p.cancelReason ?? '') }
    case 'Entrada registrada': { const p = first(proposed.purchases, current.purchases); return registerImport(current, p.productId, p.quantity, p.unitCost, p.supplier, p.date) }
    case 'Entrada corregida':
    case 'Entrada anulada': { const p = first(proposed.purchaseRevisions, current.purchaseRevisions); const old = current.purchases.find(x => x.id === p.purchaseId) ?? fail('Entrada no encontrada.'); return revisePurchase(current, p.purchaseId, p.after ? { ...p.after, createdBy: old.createdBy, createdByName: old.createdByName } : null, p.reason) }
    case 'Gasto registrado': {
      const p = first(proposed.expenses, current.expenses)
      if (!validDate(p.date) || !p.category.trim() || !p.description.trim() || !Number.isFinite(p.amount) || p.amount <= 0 || round(p.amount) !== p.amount) fail('Gasto inválido.')
      const expense: Expense = { id: uid(), date: p.date, category: p.category.trim(), description: p.description.trim(), amount: p.amount }
      return addAudit({ ...current, expenses: [expense, ...current.expenses] }, 'Gasto registrado', `${expense.category}: ${expense.description}`)
    }
    case 'Gasto corregido':
    case 'Gasto anulado': { const p = first(proposed.expenseRevisions, current.expenseRevisions); const old = current.expenses.find(x => x.id === p.expenseId) ?? fail('Gasto no encontrado.'); return reviseExpense(current, p.expenseId, p.after ? { ...p.after, createdBy: old.createdBy, createdByName: old.createdByName } : null, p.reason) }
    case 'Stock ajustado': { const p = first(proposed.stockMovements, current.stockMovements); return adjustStock(current, p.productId, p.balanceAfter, p.reason, p.date) }
    case 'Conteo registrado': { const p = first(proposed.stockCounts, current.stockCounts); return registerStockCount(current, p.lines.map(line => ({ productId: line.productId, counted: line.counted })), p.reason, p.date) }
    case 'Producto creado':
    case 'Producto editado': {
      const candidate = action === 'Producto creado'
        ? first(proposed.products, current.products)
        : proposed.products.find(item => current.products.some(old => old.id === item.id && JSON.stringify(old) !== JSON.stringify(item))) ?? fail('Producto no encontrado.')
      const old = current.products.find(item => item.id === candidate.id)
      if (action === 'Producto editado' && !old || action === 'Producto creado' && old) fail('Cambio de producto inválido.')
      validateProduct(candidate)
      if (old && candidate.stock !== old.stock) fail('El stock debe cambiar mediante un movimiento.')
      const item: Product = { ...candidate, id: old?.id ?? uid(), code: old?.code ?? nextCode(current.products), stock: old?.stock ?? candidate.stock, active: old?.active ?? true }
      if (old) Object.assign(item, { createdBy: (old as Product & { createdBy?: string }).createdBy, createdByName: (old as Product & { createdByName?: string }).createdByName })
      const products = old ? current.products.map(p => p.id === old.id ? item : p) : [...current.products, item]
      const stockMovements = !old && item.stock > 0 ? [{ id: uid(), date: today(), productId: item.id, productCode: item.code, delta: item.stock, balanceAfter: item.stock, reason: 'Stock inicial', source: 'initial' as const }, ...current.stockMovements] : current.stockMovements
      return addAudit({ ...current, products, stockMovements }, action, item.code)
    }
    case 'Producto archivado': {
      const p = proposed.products.find(item => !item.active && current.products.some(old => old.id === item.id && old.active)) ?? fail('Producto no encontrado.')
      return addAudit({ ...current, products: current.products.map(item => item.id === p.id ? { ...item, active: false } : item) }, action, p.code)
    }
    case 'Catálogo importado': {
      const added = proposed.products.filter(p => !current.products.some(old => old.id === p.id))
      if (!added.length || added.length > 2000) fail('El catálogo debe contener entre 1 y 2000 productos.')
      let state = current
      for (const p of added) {
        validateProduct(p)
        const item = { ...p, id: uid(), code: nextCode(state.products) }
        const movement = item.stock > 0 ? [{ id: uid(), date: today(), productId: item.id, productCode: item.code, delta: item.stock, balanceAfter: item.stock, reason: 'Importación de catálogo', source: 'initial' as const }] : []
        state = { ...state, products: [...state.products, item], stockMovements: [...movement, ...state.stockMovements] }
      }
      return addAudit(state, action, `${added.length} productos`)
    }
    default: return fail('Operación no permitida en esta edición.')
  }
}
