import { downloadCsv, nextCode, parseCsv, round, uid, type Product, type Sale, type Store } from './data.ts'
import { downloadXlsx, readXlsx } from './excel.ts'
import { activeExpenses, activePurchases, netPaid, netSale, returnedQuantity, saleBalance } from './domain.ts'

export const productHeaders = ['codigo', 'nombre', 'categoria', 'marca', 'modelo', 'vehiculo', 'tipo_pieza', 'compatibilidad', 'stock', 'stock_minimo', 'costo', 'precio', 'estado', 'compatibilidades_detalle']
export const salesHeaders = ['numero', 'fecha', 'estado', 'cliente', 'codigo_producto', 'producto', 'cantidad', 'devuelto', 'precio_unitario', 'costo_unitario', 'tasa_iva', 'subtotal_original', 'iva_original', 'total_original', 'total_neto_venta', 'cobrado_neto', 'saldo', 'registrado_por']
export function productRows(products: Product[]): (string | number | null)[][] {
  return products.map(p => [p.code, p.name, p.category, p.brand, p.model, p.vehicle, p.partType, p.compatibility, p.stock, p.minStock, p.cost, p.price, p.active ? 'activo' : 'archivado', JSON.stringify(p.compatibilities ?? [])])
}
export function salesRows(store: Store): (string | number | null)[][] {
  return store.sales.flatMap((sale: Sale) => sale.lines.map((line, index) => [sale.number, sale.date, sale.status === 'cancelled' ? 'anulada' : 'activa', sale.customer, line.productCode, line.productName, line.quantity, returnedQuantity(store, line.id), line.unitPrice, line.unitCost, line.vatRate * 100, line.subtotal, line.vatAmount, line.total, index === 0 ? netSale(store, sale).total : null, index === 0 ? netPaid(store, sale.id) : null, index === 0 ? saleBalance(store, sale) : null, sale.createdByName ?? '']))
}
export function exportCatalog(store: Store, format: 'csv' | 'xlsx') {
  const rows = productRows(store.products)
  if (format === 'csv') downloadCsv('torquex-inventario.csv', productHeaders, rows)
  else downloadXlsx('torquex-inventario.xlsx', 'Inventario', productHeaders, rows)
}
export function exportSales(store: Store, format: 'csv' | 'xlsx') {
  const rows = salesRows(store)
  if (format === 'csv') downloadCsv('torquex-ventas.csv', salesHeaders, rows)
  else downloadXlsx('torquex-ventas.xlsx', 'Ventas', salesHeaders, rows)
}
export function exportExpenses(store: Store, format: 'csv' | 'xlsx') {
  const headers = ['fecha', 'categoria', 'descripcion', 'monto', 'estado', 'correcciones', 'registrado_por']
  const rows = store.expenses.map(original => { const current = activeExpenses(store).find(e => e.id === original.id); return [current?.date ?? original.date, current?.category ?? original.category, current?.description ?? original.description, current?.amount ?? 0, current ? 'vigente' : 'anulado', store.expenseRevisions.filter(r => r.expenseId === original.id).length, original.createdByName ?? ''] })
  if (format === 'csv') downloadCsv('torquex-gastos.csv', headers, rows)
  else downloadXlsx('torquex-gastos.xlsx', 'Gastos', headers, rows)
}
export function exportPurchases(store: Store, format: 'csv' | 'xlsx') {
  const headers = ['fecha', 'proveedor', 'codigo_producto', 'producto', 'cantidad', 'costo_unitario', 'total', 'estado', 'correcciones', 'registrado_por']
  const rows = store.purchases.map(original => { const current = activePurchases(store).find(p => p.id === original.id); const p = current ?? original; return [p.date, p.supplier, p.productCode, p.productName, current?.quantity ?? 0, p.unitCost, current?.total ?? 0, current ? 'vigente' : 'anulado', store.purchaseRevisions.filter(r => r.purchaseId === original.id).length, original.createdByName ?? ''] })
  if (format === 'csv') downloadCsv('torquex-entradas.csv', headers, rows)
  else downloadXlsx('torquex-entradas.xlsx', 'Entradas', headers, rows)
}

function strictNumber(text: string, field: string, row: number, integer = false) {
  if (text.trim() === '' || !/^\d+(?:\.\d{1,2})?$/.test(text.trim())) throw new Error(`Fila ${row}: ${field} debe ser un número positivo con punto decimal.`)
  const value = Number(text)
  if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) throw new Error(`Fila ${row}: ${field} es inválido.`)
  return value
}
const identity = (name: string, brand: string, model: string) => [name, brand, model].map(s => s.trim().toLocaleLowerCase('es')).join('|')

export async function previewCatalog(file: File, existing: Product[]) {
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Selecciona un archivo CSV o Excel .xlsx.')
  if (file.size > 5_000_000) throw new Error('El archivo supera 5 MB. Divide el inventario en varios archivos.')
  const matrix = file.name.toLowerCase().endsWith('.xlsx') ? await readXlsx(file) : parseCsv((await file.text()).replace(/^\ufeff/, ''))
  if (matrix.length < 2) throw new Error('El archivo no contiene productos.')
  if (matrix.length > 2001) throw new Error('Importa como máximo 2.000 productos por archivo.')
  const headers = matrix[0].map(s => s.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) throw new Error('El archivo tiene encabezados duplicados.')
  const required = productHeaders.filter(name => name !== 'codigo' && name !== 'estado' && name !== 'compatibilidades_detalle')
  if (!required.every(name => headers.includes(name))) throw new Error('Faltan columnas. Exporta el inventario para usar su formato como plantilla.')
  const existingNames = new Set(existing.map(p => identity(p.name, p.brand, p.model)))
  let last = Number(nextCode(existing).match(/\d+$/)?.[0] ?? 1) - 1
  const products = matrix.slice(1).map((row, i): Product => {
    const rowNumber = i + 2
    const get = (name: string) => (row[headers.indexOf(name)] ?? '').trim()
    const name = get('nombre'), brand = get('marca'), model = get('modelo')
    if (!name) throw new Error(`Fila ${rowNumber}: el nombre de la pieza es obligatorio.`)
    const key = identity(name, brand, model)
    if (existingNames.has(key)) throw new Error(`Fila ${rowNumber}: ${name} (${brand} ${model}) ya existe o aparece dos veces.`)
    existingNames.add(key)
    const stock = strictNumber(get('stock'), 'stock', rowNumber, true)
    const minStock = get('stock_minimo') === '' ? null : strictNumber(get('stock_minimo'), 'stock mínimo', rowNumber, true)
    const cost = strictNumber(get('costo'), 'costo', rowNumber), price = strictNumber(get('precio'), 'precio', rowNumber)
    const code = `TX-${String(++last).padStart(5, '0')}`
    let compatibilities: Product['compatibilities'] = []
    if (get('compatibilidades_detalle')) {
      try { compatibilities = JSON.parse(get('compatibilidades_detalle')) }
      catch { throw new Error(`Fila ${rowNumber}: compatibilidades_detalle debe contener JSON válido.`) }
      if (!Array.isArray(compatibilities)) throw new Error(`Fila ${rowNumber}: compatibilidades_detalle debe ser una lista.`)
      compatibilities = compatibilities.map(c => ({ id: uid(), brand: String(c.brand ?? ''), model: String(c.model ?? ''), engine: String(c.engine ?? ''), yearFrom: c.yearFrom === null ? null : Number(c.yearFrom), yearTo: c.yearTo === null ? null : Number(c.yearTo), notes: String(c.notes ?? '') }))
    }
    return { id: uid(), code, name, category: get('categoria'), brand, model, vehicle: get('vehiculo'), partType: get('tipo_pieza'), compatibility: get('compatibilidad'), compatibilities, stock, minStock, cost: round(cost), price: round(price), active: true }
  })
  return { filename: file.name, products }
}
