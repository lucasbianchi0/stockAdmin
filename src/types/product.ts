export interface ProductAttribute {
  name: string;
  value: string;
}

export interface ProductImage {
  url: string;
  alt?: string;
}

export interface Product {
  id: string;
  name?: string;
  brand?: string;
  subBrand?: string;
  category?: string;
  code?: string;
  sku?: string;
  ean?: string;
  upc?: string;
  description?: string;
  fullDescription?: string;
  attributes?: ProductAttribute[];
  // images?: ProductImage[]
  images?: string;
  stock: number;
  currency?: string;
  price?: number;
  iva?: number;
  importTax?: number;
}
