# Contenido curado en el tono nuevo (2026-11)

Decisión del dueño (2026-11-24): reescribir el contenido de `src/data/*.json` en el tono de
`specs/site-audit-2026-11.md` §1 (voseo, frases cortas, sin jerga sin explicar), **sin cambiar hechos**
(números, precios, medidas, intervalos, URLs, significados). Mismas claves, tipos y esquema; solo cambia texto.

## Qué cambió por archivo

| Archivo | Cambios |
| --- | --- |
| `charging.json` | Todo en voseo y frases cortas. Notas de CLTC/NEDC/WLTP en palabras simples. «Bug» → «falla del software». SOC explicado («el porcentaje de batería»). «Linga» explicada («un cable»). V2L: título «usar la batería del auto como enchufe». «Solución de problemas» → «Si algo falla al cargar». |
| `mantenimiento.json` | `officialNote` y `warrantyNote` más cortas. Problemas conocidos y seguridad en voseo. ADAS explicado una vez («las ayudas al manejo»); «cluster» → «tablero». |
| `tech-faq.json` | Voseo y frases cortas. Regeneración explicada una vez. **Menos repetición**: «AVAS» y «Límites de carga AC/DC» en Tecnología quedan en una línea que manda a Mantenimiento/Carga; FAQ de corte automático, V2L, ADAS, óxido, intervalos, Android Auto, rueda, autonomía y viajes acortadas y con «Más en …» hacia la sección de la guía. Los datos clave de cada respuesta se mantienen. |
| `accessories.json` | Voseo. «Wallbox 32A» ya no repite los materiales: manda a Carga › «Carga en casa». |
| `parts.json` | Voseo. «Rin» → «llanta». Conversor DC-DC explicado una vez. Regeneración explicada en pastillas. |
| `routes.json` | Consejos generales, notas de paradas y tips en voseo y frases cortas. |
| `costs.json` | Solo las dos notas largas (SUCIVE, seguro). |

Sin cambios: `ficha-tecnica.json` (notas de fuente/garantía, conviene dejarlas literales), `licences.json`
(legal), `cityCoordinates.json` (datos). Prettier reformateó objetos de una línea a varias en algunos JSON (sin
cambio de contenido).

Tests: no hubo que cambiar ninguno (`serviceReminder.test.ts` y `siteSearch.test.ts` siguen encontrando sus
textos: «15.000 km o 1 año», «5.000 km», «corte automático», «android auto», «pastillas y discos de freno»).

## Hechos dudosos: resueltos (respuestas del dueño, 2026-11-24)

1. **Rueda de auxilio**: lo que tiene que coincidir es la rueda entera (llanta + cubierta). E2 trae llanta 17″, E2+ 18″,
   con cubiertas distintas y el mismo diámetro total. Una llanta 16″ sirve con cubierta más alta. Panam «rodado 17» no
   está mal; ahora se explica qué mirar (5x108 + medida de cubierta / diámetro total). `accessories.json`, `tech-faq.json`.
2. **Protector de rayos (wallbox 32A)**: «recomendado, no obligatorio», igual en Carga y Accesorios.
3. **ADAS**: solo la E2+, sin citar fuente. Nuevo ítem en Mantenimiento (seguridad): al cambiar el parabrisas de una
   E2+ hay que recalibrar la cámara delantera (pedírselo a la vidriería o al concesionario).
4. **Viajes estimados**: se sacaron (no son datos reales registrados):
   - Colonia: nota de parada «A 110 km/h con aire se llega con ~190 km de autonomía…» y tip «Con la E2+ se puede ir y
     volver sin cargar». Se agregó: «Los viajes reales a Colonia van a aparecer acá a medida que los dueños los
     registren» (la página ya enlaza a /viajes/nuevo).
   - Salto: tips «A 90 km/h se puede llegar de Trinidad directo a Salto…» y «Desde Atlántida, Trinidad ~200 km y Young
     ~330 km. Con la E2+, llegar a Young es justo».
   - Chuy: tip «Barra del Chuy a Parque del Plata: saliendo con 100%, se llega con ~20%…».
   - Brasil: «~14 kWh/100km» (queda el consejo general sin número); Pelotas: «con menos de 90% es arriesgado» →
     «Salí con la batería llena».
   - Costos: caso «Viaje Montevideo–Paysandú» (~$1.000, ~$2,60/km, estimado).
5. **Potencia DC**: el cargador puede dar hasta 120 kW, la Vigo carga como mucho ~60 kW (comunidad). Carga (UTE DC,
   EONE) y FAQ.
6. **Cargador incluido ~24–26 h**: se mantiene, marcado «cálculo aproximado, hasta que haya datos reales».
7. **Triple horario UTE**: valle 00–07 (más barato, resaltado), llano (resto del día fuera de punta), punta = 4 h
   seguidas que elige el cliente entre 17:00 y 00:00, empezando en hora en punto (17–21, 20–00). Se sacó
   «intermedio 07–18»; los valores de `costs.json` ($0,48 / ~$0,80 / ~$1,10 por km, $2,44/kWh) no cambiaron.

### Sigue pendiente

- Caso real «Uso intensivo diario» (3.000 km/mes, $1.420) en `costs.json`: se dejó; confirmar que es un dato real.
- Los ~$/km de llano (~$0,80) y punta (~$1,10) son aproximados; antes estaban atados a «07–18» y «18–22».
- Tips de ruta no numéricos (cargadores por ciudad, frontera, apps) se mantienen; las distancias de ruta (~500 km,
  etc.) son distancias de mapa, no estimaciones de autonomía.

## Decisiones del dueño 2026-11-24 (costos UTE)

1. Se sacó el caso «Uso intensivo diario» (3.000 km/mes, ~$1.420) de `costs.json`: era una estimación. `realCases` queda vacío.
2. Costo por km en casa recalculado con la tarifa residencial triple horario de UTE.
   - Fuente: https://ute.com.uy/clientes/soluciones-para-el-hogar/planes-hogar/plan-inteligente-hogares
     («Precio 2026», «Precios sin IVA»), leída el 2026-11-24. Coincide con el pliego vigente desde 01/01/2026:
     https://www.ute.com.uy/sites/default/files/docs/Pliego%20Tarifario%20Enero%202026.pdf
   - Sin IVA: valle $2,443/kWh, llano $5,172/kWh, punta $12,034/kWh. Con IVA (22%): $2,98 / $6,31 / $14,68.
   - Consumo: 15 kWh/100 km = punto medio del rango «Ruta con aire 14–16 kWh» de `charging.json` (el sitio no
     expone una mediana de comunidad estática; la mediana de Costos se calcula en vivo desde la base).
   - Fórmula: $/km = precio con IVA × 0,15 kWh/km; $/100 km = precio con IVA × 15.
     Valle 2,98 × 0,15 = $0,45/km ($45/100 km); llano 6,31 × 0,15 = $0,95/km ($95/100 km);
     punta 14,68 × 0,15 = $2,20/km ($220/100 km). Etiquetas: «estimación con precios de UTE de noviembre 2026».
   - Carga completa en valle: batería × $2,98 → E2 44,94 kWh ≈ $134, E2+ 51,87 kWh ≈ $155 (sin pérdidas de carga).
   - Carga (`charging.json`): valle $2,443 + IVA ya coincidía; se agregaron llano y punta con y sin IVA.
   - Ojo: la página de UTE dice punta «dentro de 17:00 a 23:00» en días hábiles (fines de semana y feriados sin punta);
     el dueño confirmó 17:00–00:00, que es lo que muestra el sitio. A revisar.
