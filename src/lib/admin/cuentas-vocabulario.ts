/**
 * El vocabulario del plan de cuentas, sin nada de React.
 *
 * Vive aparte de `plan-cuentas.ts` por una razón de empaquetado, no de diseño:
 * ese archivo exporta `usePlanCuentas`, y con eso queda marcado como código de
 * cliente. Cualquier route handler que quisiera nada más que la lista de rubros
 * terminaba arrastrando hooks de React al servidor y rompiendo el build.
 *
 * `plan-cuentas.ts` reexporta todo esto, así que las pantallas siguen
 * importando de un solo lugar y nadie tiene que saber que esta división existe.
 */

export const TIPOS_CUENTA = ["activo", "pasivo", "patrimonio", "ingreso", "egreso"] as const
export type TipoCuenta = (typeof TIPOS_CUENTA)[number]

/** Los rubros como los nombra el contador en su plan (ACT, PAS, PAT, GAN, PER). */
export const TIPO_CUENTA_LABEL: Record<TipoCuenta, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio: "Patrimonio neto",
  ingreso: "Ganancias",
  egreso: "Pérdidas",
}
