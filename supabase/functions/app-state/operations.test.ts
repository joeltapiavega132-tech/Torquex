import { apply, can } from './operations.ts'
import { emptyStore, type Product, type Store } from '../../../src/data.ts'

const product: Product = {
  id: 'p1', code: 'TX-00001', name: 'Filtro', category: 'Motor', brand: 'Ejemplo',
  model: 'X', vehicle: '', partType: 'Filtro', compatibility: '', stock: 5,
  minStock: null, cost: 20, price: 40, active: true,
}
const start = (): Store => ({ ...emptyStore(), products: [product] })
const proposal = (quantity: number): Store => ({
  ...start(),
  sales: [{
    id: 'cliente-controlado', number: 'V-99999', date: '2026-11-23', customer: 'Cliente de prueba',
    status: 'active', subtotal: 0.01, vatAmount: 0, total: 0.01,
    lines: [{ id: 'linea-falsa', productId: 'p1', productCode: 'FALSO', productName: 'FALSO', quantity,
      unitPrice: 0.01, unitCost: 0, vatRate: 0.15, subtotal: 0.01, vatAmount: 0, total: 0.01 }],
  }],
  audit: [{ id: 'a1', date: '2026-11-23', action: 'Venta registrada', detail: 'Venta' }],
})

Deno.test('la venta se recalcula con precio y costo del servidor', () => {
  const next = apply(start(), proposal(2))
  if (next.sales[0].lines[0].unitPrice !== 40 || next.sales[0].lines[0].unitCost !== 20 || next.products[0].stock !== 3) {
    throw new Error('La venta tomó importes del cliente o el stock quedó incorrecto.')
  }
})

Deno.test('una venta concurrente con stock ya consumido se rechaza', () => {
  const current = { ...start(), products: [{ ...product, stock: 1 }] }
  let rejected = false
  try { apply(current, proposal(2)) } catch { rejected = true }
  if (!rejected) throw new Error('Se permitió vender más que el stock disponible.')
})

Deno.test('los roles limitan acciones de escritura', () => {
  if (can('consulta', 'Venta registrada') || can('ventas', 'Producto editado') || can('inventario', 'Cobro registrado')) {
    throw new Error('Un rol recibió permisos de otro módulo.')
  }
  if (!can('ventas', 'Venta registrada') || !can('inventario', 'Entrada registrada') || !can('admin', 'Gasto registrado')) {
    throw new Error('Faltan permisos esperados.')
  }
})
