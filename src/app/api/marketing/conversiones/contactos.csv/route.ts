import { ruta } from "@/lib/admin/ruta"
import { respuestaProgramada } from "@/lib/marketing/conversiones-programadas"

/**
 * La misma cola de `Contacto directo` que `../programada`, con la forma que
 * pide el Administrador de datos de Google Ads: URL terminada en `.csv` y
 * encabezados en la primera fila. Ver `lib/marketing/conversiones-programadas.ts`.
 */
export const GET = ruta("conversiones programadas (csv)", (req) => respuestaProgramada(req, { parametros: false }))
