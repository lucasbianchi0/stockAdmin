/**
 * CSV para Excel argentino: separador punto y coma y BOM al principio.
 *
 * Sin el punto y coma, Excel en configuración regional castellana mete toda la
 * fila en una sola columna, porque acá la coma es el separador decimal. Sin el
 * BOM, los acentos y las eñes salen rotos. Los dos detalles son la diferencia
 * entre un archivo que se abre bien de una y uno que hay que importar a mano.
 */
export function descargarCsv(
  nombre: string,
  cabeceras: string[],
  filas: (string | number)[][]
) {
  const escapar = (v: string | number) => {
    const s = String(v ?? "")
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const contenido = [
    cabeceras.map(escapar).join(";"),
    ...filas.map((f) => f.map(escapar).join(";")),
  ].join("\r\n")

  const blob = new Blob([`﻿${contenido}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
