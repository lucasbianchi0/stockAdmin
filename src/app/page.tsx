"use client"

import { useState } from "react"
import { ProductTable } from "@/components/product-table"
import { SearchBar } from "@/components/search-bar"

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <p className="text-muted-foreground">Gestiona tu inventario de productos</p>
      </div>
      <SearchBar onSearch={handleSearch} />
      <ProductTable searchQuery={searchQuery} />
    </main>
  )
}

