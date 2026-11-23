import test from 'node:test'
import assert from 'node:assert/strict'
import { demoStore, emptyStore, loadStore, normalizeStore, saveStore, vatCents } from '../src/data.ts'
import { activeExpenses, activePurchases, cancelSale, netSale, periodReport, productProfitability, receivablesAging, registerImport, registerPayment, registerRefund, registerReturn, registerSale, registerStockCount, reviseExpense, revisePurchase, saleBalance, stockValuation, validDate } from '../src/domain.ts'

const product = (id, stock, price, cost) => ({ id, code: `TX-0000${id}`, name: `Pieza ${id}`, category: 'Prueba', brand: 'Marca', model: id, vehicle: 'Auto', partType: 'Motor', compatibility: '', stock, minStock: null, price, cost, active: true })
const storeWithProducts = () => ({ ...emptyStore(), products: [product('1', 5, 10, 6), product('2', 3, 20, 12)] })

test('inicio limpio borra los datos anteriores una sola vez y conserva la nueva prueba', () => {
  const oldStorage = globalThis.localStorage, values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  try {
    values.set('torquex-prototype-v1', JSON.stringify(demoStore()))
    assert.deepEqual(loadStore(), emptyStore())
    saveStore(storeWithProducts())
    assert.equal(loadStore().products.length, 2)
  } finally { if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage }
})

test('recorrido del manual produce exactamente los importes esperados', () => {
  const products = [product('1', 10, 15, 8), product('2', 5, 35, 20)]
  let store = registerImport({ ...emptyStore(), products }, '1', 4, 9, 'Proveedor de prueba', '2026-11-22')
  store = { ...store, expenses: [{ id: 'e1', date: '2026-11-22', category: 'Operación', description: 'Embalaje de prueba', amount: 5 }] }
  store = registerSale(store, { date: '2026-11-22', customer: 'Cliente ficticio A', vatRate: 0.15, paid: 30, items: [{ productId: '1', quantity: 2 }, { productId: '2', quantity: 1 }] })
  const report = periodReport(store, '2026-11-22', '2026-11-22')
  assert.deepEqual([report.subtotal, report.vat, report.cogs, report.grossProfit, report.expenses, report.operatingResult, report.collected], [65, 9.75, 38, 27, 5, 22, 30])
  assert.equal(store.sales[0].total, 74.75)
  assert.equal(saleBalance(store, store.sales[0]), 44.75)
  assert.deepEqual(store.products.map(p => p.stock), [12, 4])
  assert.equal(stockValuation(store), 188)
})

test('panel de demostración reconcilia ventas, IVA, costo, cobros y resultado', () => {
  const store = demoStore(), report = periodReport(store, '')
  assert.deepEqual([report.subtotal, report.vat, report.cogs, report.expenses, report.grossProfit, report.operatingResult, report.collected], [232.60, 34.89, 138, 109.50, 94.60, -14.90, 206.29])
  assert.equal(store.sales.reduce((sum, sale) => sum + saleBalance(store, sale), 0), 61.20)
  assert.equal(stockValuation(store), 1864)
})

test('IVA se redondea al centavo exacto en importes terminados en medio centavo', () => {
  for (const rateUnits of [0, 500, 1500, 1555, 10000]) {
    for (let subtotalCents = 1; subtotalCents <= 100000; subtotalCents += 7) {
      const expected = Number((BigInt(subtotalCents) * BigInt(rateUnits) + 5000n) / 10000n)
      assert.equal(vatCents(subtotalCents, rateUnits / 10000), expected)
    }
  }
  const before = { ...emptyStore(), products: [product('1', 2, 13.70, 8)] }
  const after = registerSale(before, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 1 }] })
  assert.equal(after.sales[0].vatAmount, 2.06)
  assert.equal(after.sales[0].total, 15.76)
})

test('devoluciones y reembolsos respetan secuencia de fechas sin alterar importes históricos', () => {
  let store = registerSale({ ...emptyStore(), products: [product('1', 3, 13.70, 8)] }, { date: '2026-11-01', customer: 'Cliente', vatRate: 0.15, paid: 47.27, items: [{ productId: '1', quantity: 3 }] })
  const sale = store.sales[0], line = sale.lines[0]
  assert.equal(sale.total, 47.27)
  store = registerReturn(store, sale.id, line.id, 1, '2026-11-10', 'Primera devolución')
  assert.throws(() => registerReturn(store, sale.id, line.id, 1, '2026-11-09', 'Fuera de orden'), /antes de una devolución/)
  assert.throws(() => cancelSale(store, sale.id, '2026-11-09', 'Fuera de orden'), /antes de una devolución/)
  assert.throws(() => registerRefund(store, sale.id, 1, 'Efectivo', '2026-11-09', 'Fuera de orden'), /antes de la devolución/)
  store = registerReturn(store, sale.id, line.id, 2, '2026-11-11', 'Resto')
  assert.equal(netSale(store, sale).total, 0)
  assert.equal(store.returns.reduce((sum, item) => sum + Math.round(item.total * 100), 0), 4727)
})

test('matriz de ventas y devoluciones reconcilia subtotal, IVA, total, costo y stock', () => {
  for (const priceCents of [1, 3, 5, 13, 1370, 1450, 10075]) for (const quantity of [1, 2, 3, 7]) for (const rateUnits of [0, 500, 1500, 1555]) {
    const initial = { ...emptyStore(), products: [product('1', quantity, priceCents / 100, 0.01)] }
    let store = registerSale(initial, { date: '2026-11-01', customer: 'Cliente', vatRate: rateUnits / 10000, paid: 0, items: [{ productId: '1', quantity }] })
    const sale = store.sales[0], line = sale.lines[0]
    const expectedVat = Number((BigInt(priceCents * quantity) * BigInt(rateUnits) + 5000n) / 10000n)
    assert.equal(Math.round(sale.subtotal * 100), priceCents * quantity)
    assert.equal(Math.round(sale.vatAmount * 100), expectedVat)
    assert.equal(Math.round(sale.total * 100), priceCents * quantity + expectedVat)
    if (quantity > 1) store = registerReturn(store, sale.id, line.id, 1, '2026-11-02', 'Parte')
    store = registerReturn(store, sale.id, line.id, quantity > 1 ? quantity - 1 : 1, '2026-11-03', 'Resto')
    assert.equal(netSale(store, sale).total, 0)
    assert.equal(store.products[0].stock, quantity)
    assert.equal(periodReport(store, '2026-11-01').operatingResult, 0)
  }
})

test('correcciones de gastos e importaciones conservan originales y ajustan reportes y stock', () => {
  const before = { ...storeWithProducts(), expenses: [{ id: 'e1', date: '2026-11-20', category: 'Flete', description: 'Original', amount: 10 }], purchases: [{ id: 'i1', date: '2026-11-20', supplier: 'Proveedor', productId: '1', productCode: 'TX-00001', productName: 'Pieza 1', quantity: 3, unitCost: 6, total: 18 }] }
  let store = reviseExpense(before, 'e1', { ...before.expenses[0], amount: 12 }, 'Factura corregida')
  assert.equal(before.expenses[0].amount, 10)
  assert.equal(activeExpenses(store)[0].amount, 12)
  assert.equal(periodReport(store, '2026-11-01').expenses, 12)
  store = reviseExpense(store, 'e1', null, 'Duplicado')
  assert.equal(activeExpenses(store).length, 0)
  assert.equal(store.expenseRevisions.length, 2)
  store = revisePurchase(store, 'i1', { ...before.purchases[0], quantity: 2, unitCost: 7, total: 14 }, 'Factura corregida')
  assert.equal(store.products[0].stock, 4)
  assert.equal(activePurchases(store)[0].total, 14)
  assert.equal(before.purchases[0].quantity, 3)
  store = revisePurchase(store, 'i1', null, 'Entrada duplicada')
  assert.equal(store.products[0].stock, 2)
  assert.equal(activePurchases(store).length, 0)
  assert.equal(store.purchaseRevisions.length, 2)
  assert.throws(() => revisePurchase(store, 'i1', null, 'Otra vez'), /ya fue anulada/)
})

test('conteo guiado conserva el antes y registra solo las diferencias', () => {
  const before = storeWithProducts()
  const after = registerStockCount(before, [{ productId: '1', counted: 4 }, { productId: '2', counted: 3 }], 'Conteo mensual', '2026-11-21')
  assert.deepEqual(after.products.map(p => p.stock), [4, 3])
  assert.equal(after.stockCounts[0].lines.length, 2)
  assert.equal(after.stockMovements.length, 1)
  assert.equal(before.products[0].stock, 5)
  assert.throws(() => registerStockCount(before, [{ productId: '1', counted: -1 }], 'Conteo', '2026-11-21'), /inválida/)
})

test('rango cerrado, antigüedad de cobros y valoración usan importes correctos', () => {
  let store = registerSale(storeWithProducts(), { date: '2026-10-01', customer: 'Cliente', vatRate: 0, paid: 0, items: [{ productId: '1', quantity: 1 }] })
  store = registerSale(store, { date: '2026-11-21', customer: 'Cliente', vatRate: 0, paid: 0, items: [{ productId: '2', quantity: 1 }] })
  assert.equal(periodReport(store, '2026-11-01', '2026-11-30').subtotal, 20)
  assert.equal(productProfitability(store, '2026-11-01', '2026-11-30').length, 1)
  assert.deepEqual(receivablesAging(store, '2026-11-21'), { days0to30: 20, days31to60: 10, days61to90: 0, daysOver90: 0 })
  assert.equal(stockValuation(store), 4 * 6 + 2 * 12)
})

test('una venta con varias piezas conserva importes y descuenta cada stock una sola vez', () => {
  const before = storeWithProducts()
  const after = registerSale(before, { date: '2026-11-21', customer: 'Cliente de prueba', vatRate: 0.15, paid: 10, items: [{ productId: '1', quantity: 2 }, { productId: '2', quantity: 1 }] })
  assert.deepEqual(after.products.map(p => p.stock), [3, 2])
  assert.equal(after.sales[0].lines.length, 2)
  assert.equal(after.sales[0].subtotal, 40)
  assert.equal(after.sales[0].vatAmount, 6)
  assert.equal(after.sales[0].total, 46)
  assert.equal(saleBalance(after, after.sales[0]), 36)
  assert.equal(after.stockMovements.length, 2)
  assert.equal(before.products[0].stock, 5)
})

test('devolución, anulación y reembolso mantienen el historial y restauran existencias', () => {
  let store = registerSale(storeWithProducts(), { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 46, items: [{ productId: '1', quantity: 2 }, { productId: '2', quantity: 1 }] })
  const saleId = store.sales[0].id, firstLine = store.sales[0].lines[0].id
  store = registerReturn(store, saleId, firstLine, 1, '2026-11-22', 'Pieza defectuosa')
  assert.equal(store.products[0].stock, 4)
  assert.equal(netSale(store, store.sales[0]).total, 34.5)
  assert.equal(saleBalance(store, store.sales[0]), -11.5)
  store = registerRefund(store, saleId, 11.5, 'Transferencia', '2026-11-22', 'Reembolso por devolución')
  assert.equal(saleBalance(store, store.sales[0]), 0)
  store = cancelSale(store, saleId, '2026-11-23', 'Pedido cancelado')
  assert.deepEqual(store.products.map(p => p.stock), [5, 3])
  assert.equal(store.sales.length, 1)
  assert.equal(store.sales[0].status, 'cancelled')
  assert.equal(netSale(store, store.sales[0]).total, 0)
  assert.equal(saleBalance(store, store.sales[0]), -34.5)
  store = registerRefund(store, saleId, 34.5, 'Transferencia', '2026-11-23', 'Reembolso final')
  assert.equal(saleBalance(store, store.sales[0]), 0)
  assert.equal(store.refunds.length, 2)
  assert.equal(store.returns.length, 3)
})

test('el último retorno asigna el IVA restante y deja la venta exactamente en cero', () => {
  const before = { ...emptyStore(), products: [product('1', 3, 0.03, 0)] }
  let store = registerSale(before, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 3 }] })
  const sale = store.sales[0]
  assert.equal(sale.vatAmount, 0.01)
  store = registerReturn(store, sale.id, sale.lines[0].id, 1, '2026-11-22', 'Prueba 1')
  store = registerReturn(store, sale.id, sale.lines[0].id, 1, '2026-11-22', 'Prueba 2')
  store = registerReturn(store, sale.id, sale.lines[0].id, 1, '2026-11-22', 'Prueba 3')
  assert.equal(netSale(store, sale).total, 0)
  assert.equal(store.products[0].stock, 3)
})

test('validaciones impiden duplicados, sobreventa, cobro excesivo y fechas inválidas', () => {
  const before = storeWithProducts()
  assert.equal(validDate('2026-02-29'), false)
  assert.throws(() => registerSale(before, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 6 }] }), /stock insuficiente/)
  assert.throws(() => registerSale(before, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 1 }, { productId: '1', quantity: 1 }] }), /una sola vez/)
  const store = registerSale(before, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 1 }] })
  assert.throws(() => registerPayment(store, store.sales[0].id, 20, 'Efectivo', '2026-11-21'), /no superar/)
  assert.throws(() => registerReturn(store, store.sales[0].id, store.sales[0].lines[0].id, 2, '2026-11-22', 'Error'), /Solo quedan/)
})

test('reporte contabiliza la devolución en su fecha, sin alterar el período de la venta', () => {
  let store = registerSale(storeWithProducts(), { date: '2026-10-01', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: '1', quantity: 1 }] })
  store = registerReturn(store, store.sales[0].id, store.sales[0].lines[0].id, 1, '2026-11-21', 'Devuelto')
  const october = periodReport(store, '2026-10-01')
  const november = periodReport(store, '2026-11-01')
  assert.equal(october.subtotal, 0)
  assert.equal(november.subtotal, -10)
  assert.equal(november.vat, -1.5)
  assert.equal(productProfitability(store, '2026-11-01')[0].profit, -4)
})

test('datos de la versión anterior se migran sin perder precio, costo ni cobro', () => {
  const old = { products: [product('1', 1, 99, 88)], sales: [{ id: 'old-sale', number: 'V-00001', date: '2026-11-21', customer: 'Antiguo', productId: '1', productCode: 'TX-00001', productName: 'Pieza 1', quantity: 1, unitPrice: 10, unitCost: 6, subtotal: 10, vatRate: 0.15, vatAmount: 1.5, total: 11.5, paid: 5 }] }
  const store = normalizeStore(old)
  assert.equal(store.sales[0].lines[0].unitPrice, 10)
  assert.equal(store.sales[0].lines[0].unitCost, 6)
  assert.equal(store.payments[0].amount, 5)
  assert.equal(saleBalance(store, store.sales[0]), 6.5)
})
