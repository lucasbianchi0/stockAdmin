"use client"

import { useEffect, useState } from "react"

/**
 * Para que algo que aparece con animación también se vaya con una.
 *
 * Un panel o un menú que se desmonta en el mismo render en que se cierra
 * desaparece de golpe: la entrada se anima y la salida no, y eso se nota más
 * que no animar nada. Esto lo deja montado `ms` milisegundos más con
 * `saliendo = true`, el tiempo de la animación de salida.
 *
 *   const { montado, saliendo } = usePresencia(abierto)
 *   if (!montado) return null
 *   <div className={saliendo ? "animate-out fade-out-0" : "animate-in fade-in-0"} />
 */
export function usePresencia(abierto: boolean, ms = 160) {
  const [montado, setMontado] = useState(abierto)
  const [saliendo, setSaliendo] = useState(false)

  // Ajuste durante el render (no en un efecto) para que abrir sea inmediato.
  if (abierto && (!montado || saliendo)) {
    setMontado(true)
    setSaliendo(false)
  }
  if (!abierto && montado && !saliendo) setSaliendo(true)

  useEffect(() => {
    if (!saliendo) return
    const t = setTimeout(() => {
      setMontado(false)
      setSaliendo(false)
    }, ms)
    return () => clearTimeout(t)
  }, [saliendo, ms])

  return { montado, saliendo }
}

/** Un valor que solo se vuelve `true` si lo sigue siendo después de `ms`.
 *  Para no mostrar un "cargando" que dura un parpadeo. */
export function useRetardado(valor: boolean, ms = 250) {
  const [retardado, setRetardado] = useState(false)
  useEffect(() => {
    if (!valor) {
      setRetardado(false)
      return
    }
    const t = setTimeout(() => setRetardado(true), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return valor && retardado
}
