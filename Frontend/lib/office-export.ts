// ============================================================================
// Office export — real .xlsx / .docx files (Office Open XML), no dependencies
// ============================================================================
// .xlsx and .docx are ZIP packages of XML parts. Earlier exports wrote plain
// XML / HTML text with an .xlsx / .docx extension, which Excel rejects ("file
// format or extension is not valid") and Word shows as garbage. This module
// builds genuine packages: a minimal ZIP writer (STORE, CRC-32) plus the
// minimum required OOXML parts for a workbook and a document.
//
// Pure TypeScript (no DOM, no '@/' imports) so it can run in the browser and
// under `node --test`.
// ============================================================================

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type CellValue = string | number | boolean | null | undefined

// ─── XML helpers ────────────────────────────────────────────────────────────

/** Escape text for XML and drop characters XML 1.0 forbids (would corrupt the file). */
export function xmlText(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── ZIP (STORE) ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Build a ZIP archive (no compression) from path → UTF-8 text entries. */
export function createZip(files: { path: string; content: string }[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()

  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = enc.encode(file.path)
    const data = enc.encode(file.content)
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flags: UTF-8 names
    lv.setUint16(8, 0, true) // method: STORE
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true) // compressed size
    lv.setUint32(22, data.length, true) // uncompressed size
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(name, 30)
    local.set(data, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk number
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let pos = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

// ─── XLSX ───────────────────────────────────────────────────────────────────

export interface XlsxSheet {
  name: string
  rows: CellValue[][]
  /** Zero-based row indexes rendered bold (e.g. titles / header rows). */
  boldRows?: number[]
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], unique. */
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet').slice(0, 31)
  let candidate = base
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 31 - String(i).length - 1)} ${i}`
  used.add(candidate.toLowerCase())
  return candidate
}

function sheetXml(sheet: XlsxSheet): string {
  const bold = new Set(sheet.boldRows ?? [])
  const widest = sheet.rows.reduce((n, r) => Math.max(n, r.length), 0)
  const widths = Array.from({ length: widest }, (_, c) =>
    Math.min(60, Math.max(10, ...sheet.rows.map((r) => String(r[c] ?? '').length + 2))),
  )
  const cols = widest > 0
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const rows = sheet.rows.map((row, r) => {
    const style = bold.has(r) ? ' s="1"' : ''
    const cells = row.map((value, c) => {
      const ref = `${columnName(c)}${r + 1}`
      if (value === null || value === undefined || value === '') return ''
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`
      if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${cols}<sheetData>${rows}</sheetData></worksheet>`
  )
}

/** Build a valid .xlsx workbook. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }]
  const used = new Set<string>()
  const names = list.map((s) => safeSheetName(s.name, used))

  const files = [
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    {
      path: 'xl/styles.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    ...list.map((s, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s) })),
  ]
  return createZip(files)
}

// ─── DOCX ───────────────────────────────────────────────────────────────────

export interface DocxReport {
  title: string
  subtitle?: string
  summary?: [string, CellValue][]
  columns: string[]
  rows: CellValue[][]
  footer?: string
}

function run(text: CellValue, props = ''): string {
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`
}

function paragraph(text: CellValue, opts: { props?: string; pPr?: string } = {}): string {
  return `<w:p>${opts.pPr ? `<w:pPr>${opts.pPr}</w:pPr>` : ''}${run(text, opts.props)}</w:p>`
}

const BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"'

function table(header: string[], rows: CellValue[][], contentWidth: number): string {
  const count = Math.max(header.length, 1)
  const colWidth = Math.floor(contentWidth / count)
  const cell = (value: CellValue, isHeader: boolean) =>
    '<w:tc><w:tcPr>' +
    `<w:tcW w:w="${colWidth}" w:type="dxa"/>` +
    (isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '') +
    '</w:tcPr>' +
    paragraph(value, { props: `${isHeader ? '<w:b/>' : ''}<w:sz w:val="18"/>`, pPr: '<w:spacing w:before="40" w:after="40"/>' }) +
    '</w:tc>'
  return (
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders><w:top ${BORDER}/><w:left ${BORDER}/><w:bottom ${BORDER}/><w:right ${BORDER}/><w:insideH ${BORDER}/><w:insideV ${BORDER}/></w:tblBorders>` +
    '<w:tblLayout w:type="autofit"/></w:tblPr>' +
    `<w:tblGrid>${Array.from({ length: count }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map((h) => cell(h, true)).join('')}</w:tr>` +
    rows.map((r) => `<w:tr>${header.map((_, i) => cell(r[i], false)).join('')}</w:tr>`).join('') +
    '</w:tbl>'
  )
}

/** Build a valid .docx document: title, subtitle, summary table, data table, footer. */
export function buildDocx(report: DocxReport): Uint8Array {
  // A4; switch to landscape for wide tables so columns stay readable.
  const landscape = report.columns.length > 6
  const [pageW, pageH] = landscape ? [16838, 11906] : [11906, 16838]
  const margin = 1080 // 0.75"
  const contentWidth = pageW - margin * 2

  let body = paragraph(report.title, { props: '<w:b/><w:sz w:val="36"/><w:color w:val="1E293B"/>', pPr: '<w:spacing w:after="120"/>' })
  if (report.subtitle) body += paragraph(report.subtitle, { props: '<w:sz w:val="20"/><w:color w:val="64748B"/>', pPr: '<w:spacing w:after="240"/>' })
  if (report.summary && report.summary.length > 0) {
    body += paragraph('Summary', { props: '<w:b/><w:sz w:val="26"/>', pPr: '<w:spacing w:before="120" w:after="120"/>' })
    body += table(report.summary.map(([k]) => k), [report.summary.map(([, v]) => v)], contentWidth)
    body += paragraph('')
  }
  body += paragraph('Data', { props: '<w:b/><w:sz w:val="26"/>', pPr: '<w:spacing w:before="120" w:after="120"/>' })
  body += table(report.columns, report.rows, contentWidth)
  if (report.footer) body += paragraph(report.footer, { props: '<w:sz w:val="16"/><w:color w:val="94A3B8"/>', pPr: '<w:jc w:val="center"/><w:spacing w:before="360"/>' })

  const sectPr =
    `<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`

  const files = [
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'word/document.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}${sectPr}</w:body></w:document>`,
    },
  ]
  return createZip(files)
}
