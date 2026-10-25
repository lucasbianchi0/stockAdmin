import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `contenedorClassName` va en la caja que scrollea. Con un alto máximo ahí, la
 * tabla scrollea adentro y un `<thead>` o `<tfoot>` sticky queda pegado arriba
 * o abajo de la caja: es la forma de tener títulos y totales siempre a la vista
 * en una tabla ancha, que además deja la barra horizontal al alcance.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { contenedorClassName?: string }
>(({ className, contenedorClassName, ...props }, ref) => (
  <div className={cn("relative w-full overflow-auto", contenedorClassName)}>
    <table
      ref={ref}
      className={cn("w-full caption-bottom border-separate border-spacing-0 text-[13px]", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

/**
 * El header se pinta celda por celda (`[&_th]`) y no sobre el `<tr>`: con
 * `border-separate` un fondo puesto en la fila deja ver el spacing entre celdas.
 * Los rótulos van en versalita gris — jerarquía sin robarle peso a los datos.
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "[&_th]:border-b [&_th]:border-line [&_th]:bg-surface-subtle",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child_td]:border-b-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "bg-surface-subtle font-medium [&_td]:border-t [&_td]:border-line",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors duration-150 hover:bg-brand-50/60 data-[state=selected]:bg-brand-50",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-3 text-left align-middle text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "border-b border-line-soft px-3 py-2.5 align-middle",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-[13px] text-ink-muted", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
