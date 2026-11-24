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

## Hechos dudosos (marcados, no cambiados)

1. **Medida de llanta de la rueda de auxilio**: `accessories.json` dice Panam «rodado 17» mientras que la
   compatible es «rodado 16»; ¿el de Panam es de verdad 17?
2. **Wallbox 32A y protector de rayos**: `charging.json` lo lista como parte de la instalación; el texto viejo de
   `accessories.json` decía «opcional». Ahora Accesorios manda a Carga, así que queda la versión de Carga.
   Confirmar si es opcional.
3. **Fuente de «ADAS solo en E2+»**: Mantenimiento dice «ficha técnica del importador»; la FAQ decía «página
   oficial del modelo». La FAQ ya no nombra la fuente.
4. **Autonomía/«E2+» en Colonia**: el tip dice que ida y vuelta sin cargar es viable con la E2+ (~185 km cada
   tramo); no dice nada de la E2.
5. **Potencia DC**: «hasta 60 kW» es dato de la comunidad, pero EONE dice que «algunos cargadores llegan a 120
   kW» (potencia del cargador, no del auto). Puede confundir.
6. **Cargador incluido**: carga en ~24–26 h a 2 kW (FAQ). Con 44,94/51,87 kWh a 2 kW da ~22–26 h; coherente,
   pero no hay fuente.
7. **Cuota triple horario en `costs.json`**: «Casa — horario intermedio (07–18 hs)» no aparece en `charging.json`
   (que habla de 23–00 a ~$5,17/kWh). No se tocó.
