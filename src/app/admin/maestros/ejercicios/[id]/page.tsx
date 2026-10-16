import { FichaEjercicioClient } from "@/components/admin/ficha-ejercicio-client"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { fechaLarga } from "@/lib/admin/ejercicios"
import { supabase } from "@/lib/supabase"

type Props = { params: Promise<{ id: string }> }

async function leer(id: string) {
  const { data } = await supabase
    .from("ejercicios_resumen")
    .select("nombre, inicio, fin, estado, en_curso")
    .eq("id", id)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: Props) {
  const e = await leer((await params).id)
  return { title: `Ejercicio ${e?.nombre ?? ""} · Accedra` }
}

/** La ficha de un ejercicio contable, desde Datos maestros. */
export default async function FichaEjercicioPage({ params }: Props) {
  const { id } = await params
  const e = await leer(id)
  const estado = e?.en_curso ? "En curso" : e?.estado === "cerrado" ? "Cerrado" : "Abierto"

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader
        title={e ? `Ejercicio ${e.nombre}` : "Ejercicio"}
        description={
          e ? `Del ${fechaLarga(e.inicio as string)} al ${fechaLarga(e.fin as string)} · ${estado}` : undefined
        }
        back={{ href: "/admin/maestros", label: "Datos maestros" }}
      />
      <PageBody>
        <FichaEjercicioClient id={id} />
      </PageBody>
    </main>
  )
}
