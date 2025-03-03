"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import type { Product } from "@/types/product"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ProductDetail({ code }: { code: string }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  const apiKey = process.env.NEXT_PUBLIC_API_KEY


  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await fetch(`${apiUrl}/${code}`, {
          method: 'GET',
          headers: {
            'x-apikey': `${apiKey}`, 
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch product details")
        }
        const data = await response.json()
        console.log(data)
        setProduct(data)
      } catch (err) {
        setError("Error loading product details. Please try again later.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [code])

  if (loading) {
    return <div className="flex justify-center p-6">Cargando detalles del producto...</div>
  }

  if (error) {
    return <div className="text-red-500 p-6">{error}</div>
  }

  if (!product) {
    return <div className="p-6">No se encontró el producto</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{product.name || "Producto sin nombre"}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              {/* <CardTitle>Imágenes</CardTitle> */}
              <CardTitle>Imagen</CardTitle>
            </CardHeader>
            <CardContent>
              {/* si son varias */}

              {/* {product.images && product.images.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {product.images.map((image, index) => (
                    <div key={index} className="relative aspect-square">
                      <Image
                        src={image || "/placeholder.svg"}
                        alt={`${product.name} - imagen ${index + 1}`}
                        fill
                        className="object-cover rounded-md"
                      />
                    </div>
                  ))}
                </div>
              )  */}

              {/* si es solo 1 */}

              {product.images && product.images.length > 0 ? (
                <div className="relative aspect-square">
                  <Image
                    src={product.images[0] || "/placeholder.svg"}
                    alt={`${product.name} - imagen ${product.images[0]}`}
                    fill
                    className="object-cover rounded-md"
                  />
                </div>
              ) 
              : (
                <div className="relative aspect-square">
                  <Image src="/placeholder.svg" alt="Imagen no disponible" fill className="object-cover rounded-md" />
                </div>
              )}
            </CardContent>

          </Card>
        </div>

        <div className="md:col-span-2">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Detalles</TabsTrigger>
              <TabsTrigger value="pricing">Precios</TabsTrigger>
              <TabsTrigger value="attributes">Atributos</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Información Básica</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Nombre</dt>
                      <dd>{product.name || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Marca</dt>
                      <dd>{product.brand || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Submarca</dt>
                      <dd>{product.subBrand || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Categoría</dt>
                      <dd>{product.category || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Código</dt>
                      <dd>{product.code || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">SKU</dt>
                      <dd>{product.sku || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">EAN</dt>
                      <dd>{product.ean || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">UPC</dt>
                      <dd>{product.upc || "-"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Descripción</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{product.description || "Sin descripción"}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Descripción Completa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div dangerouslySetInnerHTML={{ __html: product.fullDescription || "Sin descripción completa" }} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card>
                <CardHeader>
                  <CardTitle>Información de Precios</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Stock</dt>
                      <dd>{product.stock || 0}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Moneda</dt>
                      <dd>{product.currency || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Precio</dt>
                      <dd>{product.price?.toLocaleString() || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">IVA</dt>
                      <dd>{product.iva?.toLocaleString() || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Impuesto de Importación (II)</dt>
                      <dd>{product.importTax?.toLocaleString() || "-"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attributes">
              <Card>
                <CardHeader>
                  <CardTitle>Atributos</CardTitle>
                </CardHeader>
                <CardContent>
                  {product.attributes && product.attributes.length > 0 ? (
                    <ul className="space-y-2">
                      {product.attributes.map((attr, index) => (
                        <li key={index} className="flex justify-between">
                          <span className="font-medium">{attr.name}:</span>
                          <span>{attr.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No hay atributos disponibles</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

