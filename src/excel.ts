import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const escapeXml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

function column(index: number) {
  let result = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  return result
}

function cell(value: string | number | null, row: number, col: number) {
  const address = `${column(col)}${row}`
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}"${row === 1 ? ' s="1"' : ''}><v>${value}</v></c>`
  return `<c r="${address}" t="inlineStr"${row === 1 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

export function createXlsxBytes(sheetName: string, headers: string[], rows: (string | number | null)[][]): Uint8Array {
  const matrix = [headers, ...rows]
  const rowXml = matrix.map((row, index) => `<row r="${index + 1}"${index === 0 ? ' ht="29" customHeight="1"' : ''}>${row.map((value, col) => cell(value, index + 1, col)).join('')}</row>`).join('')
  const widths = headers.map((header, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(40, Math.max(13, header.length + 5))}" customWidth="1"/>`).join('')
  const end = `${column(headers.length - 1)}${Math.max(matrix.length, 1)}`
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${widths}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${end}"/></worksheet>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF354348"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  }
  return new Uint8Array(zipSync(files, { level: 6 }))
}

export function downloadXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number | null)[][]) {
  const bytes = createXlsxBytes(sheetName, headers, rows)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readXlsx(file: File): Promise<string[][]> {
  if (file.size > 5_000_000) throw new Error('El archivo Excel supera 5 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let expanded = 0
  const files = unzipSync(bytes, { filter: entry => {
    if (entry.name !== 'xl/worksheets/sheet1.xml' && entry.name !== 'xl/sharedStrings.xml') return false
    expanded += entry.originalSize
    if (expanded > 20_000_000) throw new Error('El contenido Excel es demasiado grande para este prototipo.')
    return true
  } })
  const sheetBytes = files['xl/worksheets/sheet1.xml']
  if (!sheetBytes) throw new Error('El archivo Excel no contiene la primera hoja esperada.')
  const parser = new DOMParser()
  const parse = (xml: string) => {
    const doc = parser.parseFromString(xml, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo Excel tiene contenido XML inválido.')
    return doc
  }
  const shared = files['xl/sharedStrings.xml'] ? Array.from(parse(strFromU8(files['xl/sharedStrings.xml'])).getElementsByTagName('si')).map(item => Array.from(item.getElementsByTagName('t')).map(t => t.textContent ?? '').join('')) : []
  const sheet = parse(strFromU8(sheetBytes))
  const result: string[][] = []
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const values: string[] = []
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const address = c.getAttribute('r') ?? ''
      const letters = address.match(/^[A-Z]+/)?.[0]
      if (!letters) continue
      let col = 0
      for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64
      const raw = c.getElementsByTagName('v')[0]?.textContent ?? ''
      values[col - 1] = c.getAttribute('t') === 's' ? shared[Number(raw)] ?? '' : c.getAttribute('t') === 'inlineStr' ? Array.from(c.getElementsByTagName('t')).map(t => t.textContent ?? '').join('') : raw
    }
    if (values.some(Boolean)) result.push(Array.from({ length: values.length }, (_, i) => values[i] ?? ''))
  }
  return result
}
