/**
 * Trigger a browser download of generated content (client-side only).
 * Shared by the Report Center export and the Time Tracking export.
 */
export function downloadFile(content: string | Uint8Array, filename: string, mimeType: string): void {
  // Binary (Uint8Array) for .xlsx/.docx, text for the other formats.
  const blob = new Blob([content as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
