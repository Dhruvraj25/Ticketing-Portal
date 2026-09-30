// Report exports — real .xlsx / .docx files (Office Open XML ZIP packages).
//
// Regression: Excel/Word exports used to be plain XML / HTML text saved with an
// .xlsx / .docx extension ("file format or extension is not valid" in Excel,
// garbled content in Word). These tests unpack the generated archives and
// check the required OOXML parts. (Also verified manually by opening the
// generated files in Microsoft Excel and Word with repair disabled.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDocx, buildXlsx, createZip, xmlText, DOCX_MIME, XLSX_MIME } from '../lib/office-export.ts'

/** Minimal reader for our STORE zips: returns path → text, verifying structure. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end-of-central-directory record present')
  const count = view.getUint16(eocd + 10, true)
  let cd = view.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const files = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(cd, true), 0x02014b50, 'central directory entry')
    const size = view.getUint32(cd + 20, true)
    const nameLen = view.getUint16(cd + 28, true)
    const localOffset = view.getUint32(cd + 42, true)
    const name = dec.decode(bytes.subarray(cd + 46, cd + 46 + nameLen))
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `local header for ${name}`)
    const localNameLen = view.getUint16(localOffset + 26, true)
    const start = localOffset + 30 + localNameLen
    files.set(name, dec.decode(bytes.subarray(start, start + size)))
    cd += 46 + nameLen
  }
  return files
}

test('files are ZIP packages (start with PK), never plain XML/HTML text', () => {
  const xlsx = buildXlsx([{ name: 'Report', rows: [['a']] }])
  const docx = buildDocx({ title: 't', columns: ['a'], rows: [['b']] })
  for (const bytes of [xlsx, docx]) {
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK')
  }
})

test('zip CRC-32 is correct (Office rejects archives with bad checksums)', () => {
  const bytes = createZip([{ path: 'a.txt', content: 'The quick brown fox jumps over the lazy dog' }])
  // Known CRC-32 of that sentence.
  assert.equal(new DataView(bytes.buffer).getUint32(14, true), 0x414fa339)
})

test('xlsx contains the required OOXML parts, typed cells and escaped text', () => {
  const files = unzip(buildXlsx([
    { name: 'Report', rows: [['Title'], [], ['Ticket', 'Hours'], ['A <b>&"x"', 8.5], ['Café 日本語', null]], boldRows: [0, 2] },
    { name: 'Bad:Name/*[1]?', rows: [['x']] },
  ]))
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(files.has(part), `missing ${part}`)
  }
  assert.match(files.get('[Content_Types].xml')!, /spreadsheetml\.sheet\.main\+xml/)
  const sheet = files.get('xl/worksheets/sheet1.xml')!
  assert.match(sheet, /<c r="B4"><v>8\.5<\/v><\/c>/, 'numbers are numeric cells')
  assert.match(sheet, /A &lt;b&gt;&amp;&quot;x&quot;/, 'text is XML-escaped')
  assert.match(sheet, /Café 日本語/)
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr">/, 'bold rows use the bold style')
  assert.doesNotMatch(files.get('xl/workbook.xml')!, /[:/*?[\]]1\]|Bad:Name/, 'sheet names are sanitized')
})

test('docx contains the required OOXML parts with title, summary, data table and footer', () => {
  const files = unzip(buildDocx({
    title: 'Ticket Report',
    subtitle: 'Generated: now',
    summary: [['Total', 3]],
    columns: ['Ticket', 'Title'],
    rows: [['T-1', 'A <b> & "q"'], ['T-2', null]],
    footer: 'Footer',
  }))
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) assert.ok(files.has(part), `missing ${part}`)
  assert.match(files.get('[Content_Types].xml')!, /wordprocessingml\.document\.main\+xml/)
  const doc = files.get('word/document.xml')!
  assert.match(doc, /Ticket Report/)
  assert.equal((doc.match(/<w:tbl>/g) || []).length, 2, 'summary + data tables')
  assert.match(doc, /A &lt;b&gt; &amp; &quot;q&quot;/)
  assert.doesNotMatch(doc, /<html|<table|<style/i, 'no HTML inside the Word document')
})

test('control characters that are illegal in XML are stripped (would corrupt the file)', () => {
  assert.equal(xmlText('a\u0001b\u0008c\td\ne'), 'abc\td\ne')
})

test('Report Center export uses the real generators with correct MIME types and binary blobs', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'components', 'dashboard', 'report-center', 'report-export.tsx'), 'utf8')
  assert.match(src, /downloadFile\(xlsx, `\$\{filename\}\.xlsx`, XLSX_MIME\)/)
  assert.match(src, /downloadFile\(docx, `\$\{filename\}\.docx`, DOCX_MIME\)/)
  assert.doesNotMatch(src, /mso-application|urn:schemas-microsoft-com:office:spreadsheet/, 'no legacy XML-2003 text saved as .xlsx')
  // The binary-capable download helper is shared (lib/download-file.ts).
  assert.match(src, /import \{ downloadFile \} from '@\/lib\/download-file'/)
  const helper = readFileSync(join(import.meta.dirname, '..', 'lib', 'download-file.ts'), 'utf8')
  assert.match(helper, /content: string \| Uint8Array/)
  assert.match(helper, /new Blob\(\[content as BlobPart\], \{ type: mimeType \}\)/)
  assert.equal(XLSX_MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(DOCX_MIME, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
})
