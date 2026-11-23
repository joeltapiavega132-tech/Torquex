import test from 'node:test'
import assert from 'node:assert/strict'
import { csvEscape, emptyStore } from '../src/data.ts'
import { previewCatalog, productHeaders, productRows, salesRows } from '../src/files.ts'
import { registerSale } from '../src/domain.ts'
import { readBackup } from '../src/backup.ts'

const headers = 'codigo;nombre;categoria;marca;modelo;vehiculo;tipo_pieza;compatibilidad;stock;stock_minimo;costo;precio;estado'
const csvFile = (row) => new File([`\ufeff${headers}\r\n${row}`], 'inventario.csv', { type: 'text/csv' })

test('exportación de venta de varias piezas no duplica total, cobro ni saldo', () => {
  const products = [
    { id: 'p1', code: 'TX-00001', name: 'Filtro', category: '', brand: '', model: '', vehicle: '', partType: '', compatibility: '', stock: 2, minStock: null, cost: 5, price: 13.70, active: true },
    { id: 'p2', code: 'TX-00002', name: 'Correa', category: '', brand: '', model: '', vehicle: '', partType: '', compatibility: '', stock: 2, minStock: null, cost: 2, price: 10, active: true },
  ]
  const store = registerSale({ ...emptyStore(), products }, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 5, items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }] })
  const rows = salesRows(store)
  assert.equal(rows.length, 2)
  assert.equal(rows[0][14], store.sales[0].total)
  assert.deepEqual(rows[1].slice(14, 17), [null, null, null])
  assert.equal(rows[0][17], '')
})

test('compatibilidades estructuradas viajan en CSV sin perder marca, motor ni años', async () => {
  const vehicle = [{ id: 'v1', brand: 'Toyota', model: 'Hilux', engine: '2.8', yearFrom: 2018, yearTo: 2024, notes: '4x4' }]
  const source = { id: 'p1', code: 'TX-00001', name: 'Filtro', category: 'Motor', brand: 'Bosch', model: 'X', vehicle: '', partType: 'Motor', compatibility: '', compatibilities: vehicle, stock: 2, minStock: null, cost: 5, price: 9, active: true }
  const csv = `${productHeaders.map(csvEscape).join(';')}\n${productRows([source])[0].map(csvEscape).join(';')}`
  const preview = await previewCatalog(new File([csv], 'catalogo.csv'), [])
  assert.deepEqual(preview.products[0].compatibilities.map(({ id, ...rest }) => rest), vehicle.map(({ id, ...rest }) => rest))
})

test('vista previa CSV valida y asigna código sin modificar el inventario', async () => {
  const existing = [{ id: 'p1', code: 'TX-00007', name: 'Filtro', brand: 'Marca', model: 'A', stock: 2 }]
  const preview = await previewCatalog(csvFile(';Pastillas;Frenos;Marca;B;Camioneta;Freno;Modelo 2024;3;;12.50;20;activo'), existing)
  assert.equal(preview.products.length, 1)
  assert.equal(preview.products[0].code, 'TX-00008')
  assert.equal(preview.products[0].stock, 3)
  assert.equal(preview.products[0].minStock, null)
  assert.equal(existing.length, 1)
})

test('vista previa impide duplicados, números ambiguos y CSV mal cerrado', async () => {
  const existing = [{ id: 'p1', code: 'TX-00001', name: 'Filtro', brand: 'Marca', model: 'A' }]
  await assert.rejects(previewCatalog(csvFile(';Filtro;Motor;Marca;A;Auto;Filtro;;1;;2;3;activo'), existing), /ya existe/)
  await assert.rejects(previewCatalog(csvFile(';Pastillas;Frenos;Marca;B;Auto;Freno;;1;;12,50;20;activo'), []), /costo/)
  await assert.rejects(previewCatalog(new File([`${headers}\n"sin cierre`], 'mal.csv'), []), /comillas sin cerrar/)
})

test('restauración acepta respaldos coherentes y rechaza referencias rotas', async () => {
  const store = emptyStore()
  const file = new File([JSON.stringify({ app: 'torquex', formatVersion: 2, store })], 'respaldo.json')
  assert.deepEqual(await readBackup(file), store)
  const broken = { ...store, payments: [{ id: 'c1', saleId: 'inexistente', date: '2026-11-21', amount: 5, method: 'Efectivo' }] }
  await assert.rejects(readBackup(new File([JSON.stringify({ app: 'torquex', store: broken })], 'malo.json')), /cobros inválidos/)
  const saleStore = registerSale({ ...emptyStore(), products: [{ id: 'p1', code: 'TX-00001', name: 'Filtro', category: '', brand: '', model: '', vehicle: '', partType: '', compatibility: '', stock: 2, minStock: null, cost: 5, price: 10, active: true }] }, { date: '2026-11-21', customer: 'Cliente', vatRate: 0.15, paid: 0, items: [{ productId: 'p1', quantity: 1 }] })
  const corrupted = { ...saleStore, sales: [{ ...saleStore.sales[0], total: 99 }] }
  await assert.rejects(readBackup(new File([JSON.stringify({ app: 'torquex', store: corrupted })], 'malo.json')), /totales de venta inconsistentes/)
})
