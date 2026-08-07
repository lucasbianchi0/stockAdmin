# Qué medimos

> Un solo set de métricas, idéntico en todos los reportes. Lo que cambia entre 2018 y 2027
> es cuáles están disponibles — las que no, se muestran vacías con el motivo.

---

## 1. La estructura: la cuenta se mide en tres niveles

Y los tres espejan exactamente cómo están armadas las campañas y el sitio:

```
CAMPAÑA  =  solución        →  Firma Biométrica
   └─ GRUPO  =  industria   →  Estudios jurídicos
        └─ LANDING          →  /soluciones/firma-biometrica/juridicos
```

Ese 1:1:1 es lo que hace que el reporte se arme solo. **Si los nombres de campaña y grupo no
respetan la convención, el desglose se rompe** — es el único requisito operativo del sistema.

| Nivel | Responde | Quién lo mira |
|---|---|---|
| **Cuenta** | ¿Vamos bien? | El dueño |
| **Solución** | ¿Dónde ponemos la plata? | Vos, mensual |
| **Industria** | ¿Qué vertical responde? | Vos, trimestral |

---

## 2. Nivel cuenta — la portada del dueño

Cuatro números, con su variación contra el período anterior. Nada más.

| Métrica | Disponible desde |
|---|---|
| **Inversión** | 2017 ✅ |
| **Consultas** | roto hoy ⚠️ |
| **Costo por consulta** | roto hoy ⚠️ |
| **Clientes nuevos** | nunca ❌ |

---

## 3. Nivel solución — dónde va el presupuesto

Cinco filas, una por solución. **Esta es la tabla que decide el presupuesto del mes.**

| Métrica | Por qué |
|---|---|
| **Inversión** y **% del total** | Cuánto le estamos apostando a cada una |
| **Consultas** | Cuántas trae |
| **Costo por consulta** | Cuánto cuesta cada una |
| **% del gasto sin resultado** | Cuánto se desperdicia ahí adentro |
| **Clientes y valor** | Lo que realmente importa (cuando se mida) |

### El histórico ya dice mucho

| Solución | Gasto | % | Conv. | Costo/conv |
|---|---:|---:|---:|---:|
| Firma Biométrica | $1.429.433 | 65% | 130 | $10.996 |
| Networking | $719.124 | 33% | 6 | $119.854 |
| Consultoría | $24.520 | 1% | 0 | — |
| Seguridad | $2.312 | 0,1% | 0 | — |
| Software & AI | $0 | 0% | 0 | nunca se promocionó |

**Tres conclusiones que sólo aparecen en este nivel:**

1. **Firma es el motor**: 65% del gasto, 94% de las conversiones.
2. **Networking cuesta 11× más por consulta** y se lleva un tercio del presupuesto.
3. **Seguridad y Software & AI nunca se probaron.** No sabemos si funcionan porque nunca se
   invirtió — y no saberlo también es un resultado.

### ⚠️ El costo por consulta NO se compara directo entre soluciones

Un contrato de firma biométrica y uno de cableado no valen lo mismo. Si comparás CPL a secas,
vas a defundir la solución cara-pero-rentable.

Por eso hace falta un parámetro más, aunque sea estimado: **valor promedio de contrato por
solución**. Con eso el número comparable es:

> **Costo por consulta ÷ valor promedio del contrato**

Es un dato que hay que pedirle a la empresa. Sin él, la tabla de arriba puede llevar a la
decisión equivocada.

### Mapeo del histórico

Las campañas viejas no usan los nombres de las soluciones. Para comparar hacia atrás:

| Campaña histórica | Solución |
|---|---|
| Firma Digital Biometrica | firma-biometrica |
| Cableado Estructurado · Soluciones Cisco · Hiperconvergencia | networking |
| Soluciones Palo Alto | seguridad |
| Sharepoint etc | consultoria |
| Display + Remarketing | transversal (no asignable) |

---

## 4. Nivel industria — qué vertical responde

Seis filas dentro de cada solución (bancos, seguros, jurídicos, laboratorios, logística,
retail). Es el nivel que dice **a quién le hablamos mejor**.

| Métrica | Por qué |
|---|---|
| **Inversión** y **clics** | Cuánto tráfico le mandamos |
| **Consultas** y **costo por consulta** | Si ese vertical responde |
| **Conversión de la landing** | Si la página hace su trabajo |

### La métrica que casi nadie tiene

**El sitio ya mide su propio embudo.** `sessions`, `events` y `leads` guardan la landing de
entrada, así que por cada una de las 30 páginas se puede reconstruir:

```
sesiones → vio contenido → consultó → calificó → ganó
```

Eso permite separar dos problemas que se ven igual en Google Ads pero se arreglan distinto:

| Síntoma | Diagnóstico | Qué se toca |
|---|---|---|
| Pocos clics, buena conversión | **Falta tráfico** | Presupuesto, pujas, keywords |
| Muchos clics, poca conversión | **La landing no cierra** | Copy, oferta, formulario |

Sin este corte, las dos se ven como "esta industria no funciona" y se apaga una campaña que
en realidad tenía un problema de página.

---

## 5. Detalle operativo (no va en la portada)

- **Top 10 de términos por gasto**, marcando los que no convirtieron
- **CTR** por solución — explica si el anuncio le habla a lo que la gente busca
- **Gasto por tipo de concordancia**
- **Anuncios rechazados o no aptos**
- **Qué hicimos este período** + qué esperábamos que pasara

---

## 6. Qué hay que definir para que esto funcione

| Qué | Quién | Por qué |
|---|---|---|
| **Convención de nombres**: campaña = solución, grupo = industria | Vos, al crear las campañas | Sin esto no hay desglose |
| **Valor promedio de contrato por solución** | La empresa | Sin esto el costo por consulta engaña |
| **Tag de conversión** | Desarrollo, ~1 día | Sin esto no hay Nivel 3 ni 4 |
| **Marcar leads: calificado / ganado + monto** | Comercial, 1 min c/u | Sin esto no hay clientes ni retorno |

---

## 7. Reglas de lectura

1. **Volumen mes a mes; calidad a 3 meses.** Con ~190 clics mensuales, la tasa de conversión
   de un mes solo es ruido. A nivel industria, todavía más: mirá trimestres.
2. **En pesos, máximo 3 meses.** Para períodos largos compará proporciones (% sin resultado,
   CTR, concentración), que no dependen de la moneda.
3. **Un período sin medición activa no tiene Nivel 3.** Se muestra vacío, no se estima.
