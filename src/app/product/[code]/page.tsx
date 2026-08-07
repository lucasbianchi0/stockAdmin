import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { ProductDetail } from "@/components/product-detail"
import { PageBody } from "@/components/ui/page-header"

interface ProductPageProps {
  params: Promise<{ code: string }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { code } = await params

  return (
    <main className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-background/80 px-5 py-3.5 backdrop-blur-xl sm:px-8">
        <nav className="flex items-center gap-1.5 text-[12.5px]">
          <Link
            href="/"
            className="font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Inventario
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
          <span className="max-w-[400px] truncate font-mono font-semibold text-ink">
            {code}
          </span>
        </nav>
      </header>

      <PageBody>
        <ProductDetail code={code} />
      </PageBody>
    </main>
  )
}
