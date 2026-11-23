import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { createXlsxBytes, readXlsx } from '../src/excel.ts'
import { previewCatalog, productHeaders } from '../src/files.ts'

globalThis.DOMParser = DOMParser

test('Excel generado se puede volver a leer, con acentos y compatibilidades multilínea', async () => {
  const headers = ['nombre', 'compatibilidad', 'stock', 'costo']
  const rows = [['Filtro de aceite', 'Hilux 2020\nFortuner 2021', 3, 8.5]]
  const bytes = createXlsxBytes('Inventario', headers, rows)
  const matrix = await readXlsx(new File([Buffer.from(bytes)], 'inventario.xlsx'))
  assert.deepEqual(matrix, [headers, ['Filtro de aceite', 'Hilux 2020\nFortuner 2021', '3', '8.5']])
})

test('la plantilla Excel pasa por la vista previa de importación', async () => {
  const row = ['', 'Pastilla de prueba', 'Frenos', 'Marca prueba', 'R1', 'Auto prueba', 'Freno', 'Auto 2020', 3, '', 12.5, 20, 'activo']
  const bytes = createXlsxBytes('Inventario', productHeaders, [row])
  const preview = await previewCatalog(new File([Buffer.from(bytes)], 'plantilla.xlsx'), [])
  assert.equal(preview.products.length, 1)
  assert.equal(preview.products[0].name, 'Pastilla de prueba')
  assert.equal(preview.products[0].stock, 3)
  assert.equal(preview.products[0].cost, 12.5)
})
