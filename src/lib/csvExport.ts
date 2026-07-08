function escapeCsvValue(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (/["\n,]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csvContent: string) {
  // BOM so Excel recognizes UTF-8 (otherwise accented characters get mangled)
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
