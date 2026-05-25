import { ProductDetail } from "@/components/product-detail"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface ProductPageProps {
  params: Promise<{ code: string }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { code } = await params
  return (
    <main className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 px-6 pt-4 pb-3.5 bg-background/95 backdrop-blur-sm border-b">
        <nav className="flex items-center gap-1.5 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
            Inventario
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-foreground font-semibold truncate max-w-[400px]">{code}</span>
        </nav>
      </div>
      <div className="px-6 py-5">
        <ProductDetail code={code} />
      </div>
    </main>
  )
}
