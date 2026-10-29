"use client";

import { useLayoutEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Los controles del calendario, con el lenguaje del resto de la app.
 *
 * Dos formas de elegir y nunca una tercera: lo que es uno solo (qué es, cada
 * cuánto, el estado) es un control segmentado igual a `TabsList`; lo que puede
 * ser varios (días, personas) es una pastilla que al elegirse se llena y lleva
 * el tilde. Con los dos dibujados igual —borde y celeste pálido— no se sabía
 * qué estaba elegido.
 */

/** Uno de varios: canal hundido y la opción activa en blanco, elevada. */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  disabled,
  className,
  ancho,
}: {
  opciones: { valor: T; rotulo: React.ReactNode }[];
  valor: T;
  onCambio: (v: T) => void;
  disabled?: boolean;
  className?: string;
  /** Las opciones se reparten todo el ancho. */
  ancho?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-[3px]",
        ancho ? "flex w-full" : "inline-flex",
        className,
      )}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={disabled}
            onClick={() => onCambio(o.valor)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[12.5px] transition-[background-color,color,box-shadow] duration-150 disabled:opacity-60",
              ancho && "flex-1",
              activo
                ? "bg-surface font-semibold text-ink shadow-e1"
                : "font-medium text-ink-muted hover:text-ink-secondary",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** Uno de muchos que se suman: se llena y lleva tilde al elegirse. */
export function Pastilla({
  activo,
  onClick,
  disabled,
  children,
  title,
}: {
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors disabled:opacity-60",
        activo
          ? "border-brand-600 bg-brand-600 text-white shadow-e1"
          : "border-line-strong bg-surface text-ink-secondary hover:border-n-400 hover:text-ink",
      )}
    >
      {activo && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
      {children}
    </button>
  );
}

/** El `<select>` de los formularios de Administración, con su flecha. */
export function Desplegable<T extends string>({
  id,
  valor,
  onCambio,
  opciones,
  disabled,
}: {
  id?: string;
  valor: T;
  onCambio: (v: T) => void;
  opciones: { valor: T; rotulo: string }[];
  disabled?: boolean;
}) {
  // La flecha es un ícono encima y no un fondo: `appearance-none` saca la del
  // sistema y sin ninguna el campo no parece desplegable.
  return (
    <div className="relative">
      <select
        id={id}
        value={valor}
        disabled={disabled}
        onChange={(e) => onCambio(e.target.value as T)}
        className={cn(
          "flex h-9 w-full appearance-none rounded-lg border border-line-strong bg-surface py-0 pl-3 pr-8 text-[13px] text-ink",
          "shadow-[inset_0_1px_2px_0_oklch(0.215_0.032_257/0.04)] transition-[border-color,box-shadow] duration-150",
          "hover:border-n-400",
          "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.14)]",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        )}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

/**
 * Un texto que crece con lo que se escribe.
 *
 * La descripción de un agente es un párrafo —qué lee, qué compara, dónde deja
 * lo que hizo— y en una caja de tres renglones con barra de scroll no se puede
 * releer lo que uno acaba de escribir.
 */
export function TextoLargo({
  id,
  valor,
  onCambio,
  placeholder,
  maxLength,
  disabled,
}: {
  id?: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [valor]);

  return (
    <textarea
      ref={ref}
      id={id}
      value={valor}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      rows={4}
      onChange={(e) => onCambio(e.target.value)}
      className={cn(
        "block min-h-[112px] w-full resize-none rounded-xl border border-transparent bg-surface-subtle px-3.5 py-3 text-[13.5px] leading-relaxed text-ink",
        "transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-faint",
        "hover:border-line focus-visible:border-brand-400 focus-visible:bg-surface focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.14)]",
        "disabled:opacity-60",
      )}
    />
  );
}

/** Rótulo de campo, como en la ticketera. */
export function Rotulo({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted"
    >
      {children}
    </label>
  );
}

/** Un bloque del formulario: "Cuándo", "Cómo corre". */
export function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-e1">
      <h3 className="mb-3.5 text-[13px] font-semibold tracking-[-0.01em] text-ink">
        {titulo}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
