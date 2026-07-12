function escapeCsvValue(value: string | number | null | undefined): string {
  let str = value == null ? '' : String(value)
  // Formula-injection guard: a cell starting with =, +, -, @, tab or CR runs
  // as a formula in Excel/Sheets, so prefix a quote to force literal text.
  // Only for values that were strings — a numeric -500 must stay -500.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) str = `'${str}`
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
