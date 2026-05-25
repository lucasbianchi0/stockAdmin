export interface ProductAttribute {
  name: string
  value: string
}

export interface Product {
  code: string
  sku: string
  stock: number
  currency: string
  price: number
  iva: number
  ii: number
  // Full fields — only present when fetching individual product
  name?: string
  brand?: string
  subBrand?: string
  category?: string
  ean?: string
  upc?: string
  description?: string
  fullDescription?: string
  attributes?: ProductAttribute[]
  images?: string[]
}
