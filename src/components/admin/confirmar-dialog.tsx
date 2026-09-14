/*
 * El diálogo se mudó a `@/components/ui/confirmar-dialog` (commit 2a47c6c), pero
 * los módulos de administración que lo importan todavía apuntan acá en git, y el
 * build de producción fallaba con "Module not found". Este reexport lo sostiene
 * hasta que esos imports se actualicen; después se puede borrar.
 */
export { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
