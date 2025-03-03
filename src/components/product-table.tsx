"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import type { Product } from "@/types/product"
import { Switch } from "@/components/ui/switch"

interface ProductTableProps {
  searchQuery: string
}

export function ProductTable({ searchQuery }: ProductTableProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStock, setFilterStock] = useState(true) 
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  const apiKey = process.env.NEXT_PUBLIC_API_KEY

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(`${apiUrl}`, {
          method: 'GET',
          headers: {
            'x-apikey': `${apiKey}`,
            'Content-Type': 'application/json',
          },
        })
        if (!response.ok) {
          throw new Error("Failed to fetch products")
        }
        const data = await response.json()
        setProducts(data.products)
      } catch (err) {
        setError("Error loading products. Please try again later.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  const filteredProducts = products
    .filter(
      (product) =>
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.name?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((product) => (filterStock ? product.stock > 0 : true)) 

  if (loading) {
    return <div className="flex justify-center p-6">Cargando productos...</div>
  }

  if (error) {
    return <div className="text-red-500 p-6">{error}</div>
  }

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Lista de productos</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm">Mostrar solo con stock</span>
          <Switch checked={filterStock} onCheckedChange={setFilterStock} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead>Precio</TableHead>
            <TableHead>IVA</TableHead>
            <TableHead>II</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <TableRow key={product.code}>
                <TableCell>{product.sku || "-"}</TableCell>
                <TableCell>{product.code || "-"}</TableCell>
                <TableCell>{product.stock || 0}</TableCell>
                <TableCell>{product.currency || "-"}</TableCell>
                <TableCell>{product.price?.toLocaleString() || "-"}</TableCell>
                <TableCell>{product.iva?.toLocaleString() || "-"}</TableCell>
                <TableCell>{product.importTax?.toLocaleString() || "-"}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/product/${product.code}`}>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">Ver detalles</span>
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center">
                {searchQuery || filterStock
                  ? "No se encontraron productos con los filtros aplicados"
                  : "No se encontraron productos"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
