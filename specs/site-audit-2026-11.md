# Auditoría del sitio — claridad y facilidad de uso (2026-11)

Pedido del dueño (2026-11-24): la mayoría de los usuarios no son técnicos. Simplificar textos, sacar
información y conceptos duplicados, hacerlo divertido y fácil. Español de Uruguay (voseo, frases cortas).
**No se quita funcionalidad**: se simplifica la presentación. Lo que implique sacar o fusionar algo queda
como **propuesta** (sección 5) para que decida el dueño.

## 1. Guía de tono

- Voseo, cálido y corto: «Mirá», «Tocá», «Elegí». Una idea por frase; máximo 2 frases en un subtítulo.
- Hablá de lo que la persona quiere hacer, no de cómo funciona por dentro («Mandá un destino a Waze»,
  no «Se envía una orden al auto»).
- Sin jerga en la interfaz: nada de «Edge Function», «RLS», «E1/E3», nombres de spec, migraciones, IDs,
  códigos de estado. Si un término técnico es inevitable (kWh, VIN, modo de ingeniería), explicalo una
  sola vez en palabras simples, en el lugar donde aparece primero.
- Unidades con sentido: «kWh/100 km (cuánta energía gasta cada 100 km; menos es mejor)».
- Estados vacíos que animen: qué falta y el siguiente paso en un botón («Todavía no hay viajes. ¡Cargá el
  primero!»).
- Errores: qué pasó + qué hacer («No pudimos guardar. Revisá tu conexión y probá de nuevo»), nunca el
  mensaje crudo de la base.
- Emoji: uno por título de página o tarjeta (como ya hace el sitio); no en párrafos.
- Detalles técnicos o poco usados van dentro de «Más detalles» (`<details>`), cerrado por defecto.
- Accesibilidad: todo botón con texto o `aria-label`; foco visible; no depender solo del color.

## 2. Inventario (ruta → para quién → qué quiere hacer → problemas → severidad → arreglo)

Severidad: **A** = confunde o bloquea a un usuario no técnico; **M** = molesta o sobra; **B** = detalle.

| Ruta / pantalla | Para quién | Qué quiere hacer | Problemas | Sev. | Arreglo |
|---|---|---|---|---|---|
| `/` Inicio | Todos | Entender qué es el sitio y a dónde ir | Subtítulo genérico | B | Subtítulo que diga qué podés hacer |
| `/guia` Guía | Interesados y dueños | Encontrar info de referencia | Hub de 8+ páginas (carga, rutas, costos, mantenimiento, repuestos, accesorios, tecnología, FAQ, ficha) sin agrupar | M | Ver navegación propuesta |
| `/mi-vigo` Mi Vigo | Dueño con sesión | Ver su auto, mandarle cosas, configurar | **~15 tarjetas en una sola columna sin orden**: perfil, vehículo, dispositivos, estado, service, control remoto, destino, borradores, datos, diagnósticos, versiones, bóveda, mejoras, service/config, viajes top. Mezcla cuenta, auto en vivo, estadísticas y cosas técnicas. Subtítulo habla de «modelo y color» aunque la página es mucho más | **A** | Agrupar en secciones: «Tu auto ahora», «Control remoto», «Datos y estadísticas», «Configuración y service», «Tu cuenta»; versiones de pantalla y diagnósticos dentro de «Más detalles» |
| Mi Vigo › Estado del auto + Control remoto | Dueño | Saber batería/autonomía | Dos tarjetas con el «último dato» del auto (estado y conexión) — concepto duplicado | M | Quedan juntas en «Tu auto ahora»; propuesta de fusionar (5.2) |
| Mi Vigo › Dispositivos vinculados / `/mi-vigo/vincular` / Vehículo (invitar con código) | Dueño | Conectar el auto y sumar a la familia | Tres «vinculaciones» distintas (pantalla del auto, código de vehículo para familia, dispositivo) con palabras parecidas | **A** | Textos que diferencien: «Conectar la pantalla del auto» vs «Sumar a tu familia»; propuesta 5.3 |
| Mi Vigo › Datos del auto | Dueño | Ver km, batería, consumo | «kWh/100 km» sin explicar; texto de privacidad largo | M | Explicar la unidad una vez; texto más corto |
| Mi Vigo › Versiones de software de la pantalla | Curiosos / técnicos | Saber si hay versión nueva | Tabla técnica (compilada, vista por última vez) en el medio de la página | M | Mover a «Más detalles» |
| Mi Vigo › Diagnósticos | Dueño con problema + moderador | Ver lo enviado desde el auto | Técnico; solo aparece si hay | B | Mover a «Más detalles» |
| Mi Vigo › Service y configuración | Dueño antes/después del taller | Saber qué hacer al ir al service | Párrafo largo con nombres de botones del instalador | M | Texto corto + pasos |
| `/mi-vigo/preparar` | Dueño que quiere las mejoras | Instalar las apps de la comunidad | «Modo de ingeniería» sin explicar en el subtítulo | M | Subtítulo en palabras simples |
| `/mi-vigo/boveda` | Dueño | Guardar frase de la dashcam | Concepto difícil («cifrado», «PRF», passkey) | M | Tarjeta de Mi Vigo explica en simple; página sin cambios de flujo |
| `/mi-vigo/configuracion` | Dueño | Comparar config antes/después del service | Nombre técnico | B | Sin cambio (link desde la sección de service) |
| `/mi-vigo/borradores` | Dueño | Confirmar viajes/cargas que mandó el auto | «Check-in de carga» es anglicismo | B | «Carga registrada en el auto» en la tarjeta |
| `/mi-vigo/diagnosticos` | Dueño / moderador | Ver diagnósticos | Subtítulo largo | B | Acortar |
| `/mi-actividad` | Usuario con sesión | Ver sus viajes, services, repuestos, seguros | Nombre parecido a «Mi Vigo»; dos «casas» personales | **A** | Propuesta 5.1 (unificar en Mi Vigo con pestañas); por ahora links cruzados claros |
| `/carga`, `/rutas`, `/rutas/planificar` | Todos | Dónde cargar, planificar un viaje | Planificador usa «kWh/100 km» sin explicar | M | Explicar unidad |
| `/costos` | Interesados | Comparar con nafta | Subtítulo con «vs» | B | Reescribir |
| `/mantenimiento`, `/repuestos`, `/accesorios` | Dueños | Service y compras | Bien; tres páginas cercanas | B | Propuesta 5.4 agrupar bajo «Mantenimiento y compras» |
| `/tecnologia`, `/ficha-tecnica`, `/faq` | Interesados | Datos del auto | Ficha nombra «VIN y puertos de diagnóstico» sin explicar | B | Explicar VIN una vez (número de chasis) |
| `/novedades` | Dueño con mejoras | Qué trae cada versión | Subtítulo largo con ruta de menú | B | Acortar |
| `/comunidad` | Todos | Ver lo que comparten otros | OK | B | — |
| `/notificaciones` | Usuario con sesión | Ver avisos | Sin emoji en el título (inconsistente) | B | Agregar 🔔 |
| `/licencias` | Curiosos / legal | Licencias | Técnico por naturaleza | B | Subtítulo más corto |
| `/login` | Todos | Entrar | OK | — | — |
| Formularios `*/nuevo` | Usuario con sesión | Registrar viaje/service/repuesto/seguro | Formulario de viaje muy largo (ya con pasos) | M | Sin cambio ahora |
| `/moderacion` | Moderadores | Moderar | Puede ser técnico | B | Sin cambio |
| Navegación (barra inferior + lateral) | Todos | Ubicarse | «Mi Vigo» y «Mi actividad» compiten; Guía mezcla 10 destinos | **A** | Sección 3 |
| Disclaimers repetidos | Todos | — | «Nada se publica hasta que lo confirmes» / «solo lo ven los miembros del vehículo» repetido en 4 tarjetas de Mi Vigo | M | Decirlo una vez al inicio de «Tu auto ahora» |

## 3. Navegación propuesta (no implementada: necesita OK)

Barra inferior (móvil), 5 lugares:
1. **Inicio**
2. **Aprender** (hoy «Guía»): agrupado en *Cargar y viajar* (Carga, Rutas, Planificar), *Costos y
   mantenimiento* (Costos, Mantenimiento, Repuestos, Accesorios), *Conocé tu Vigo* (Ficha técnica,
   Tecnología, Preguntas frecuentes).
3. **＋ Registrar** (igual que hoy)
4. **Comunidad**
5. **Mi Vigo** — absorbe «Mi actividad» como pestaña «Mis registros» (propuesta 5.1).

## 4. Implementado en esta rama (bajo riesgo)

- Mi Vigo agrupado en secciones con títulos claros y lo técnico dentro de «Más detalles».
- Subtítulos de páginas reescritos (cortos, voseo, sin jerga).
- Explicación única de «kWh/100 km» y de «VIN».
- Tarjetas de Mi Vigo con textos más cortos; aviso de privacidad dicho una vez.
- Título de Notificaciones con emoji, consistente con el resto.

## 5. Propuestas (necesitan decisión del dueño)

1. **Unificar «Mi actividad» dentro de Mi Vigo** (pestaña «Mis registros») y sacar el ítem de la barra.
2. **Fusionar «Estado del auto» y la conexión de «Control remoto»** en una sola tarjeta «Tu auto ahora».
3. **Una sola palabra para conectar**: «Conectar la pantalla» (auto ↔ cuenta) y «Sumar a tu familia»
   (código del vehículo); evitar «vincular» para las dos.
4. **Agrupar Mantenimiento, Repuestos y Accesorios** en una página con pestañas.
5. **Renombrar «Guía» a «Aprender»** y mostrar los grupos de la sección 3.
6. **Mover «Versiones de software de la pantalla»** a Novedades (es información de toda la comunidad,
   no del auto propio).

## Plan de pruebas

- Actualizar tests que buscan textos viejos (`MyVigoPage.test.tsx` y tarjetas tocadas).
- `npm test`, `npm run type-check`, `npm run lint`, `npm run build` en verde.

## Criterios de aceptación

- Mi Vigo muestra secciones en este orden: Tu auto ahora, Control remoto, Datos y estadísticas,
  Configuración y service, Tu cuenta; diagnósticos y versiones en «Más detalles».
- Ningún texto visible menciona specs, migraciones, RLS o Edge Functions.
- Ninguna funcionalidad desaparece.

## 6. Segunda pasada (2026-11-24, rama `site-audit-2`)

Alcance: todas las páginas y componentes que no tocó la primera pasada. Solo textos, ayudas y estados
(vacío / error / carga); **sin cambios de navegación ni fusiones** (siguen pendientes en la sección 5).

### Cambios por página

| Página / componente | Cambios |
|---|---|
| `/guia` + `GuideLinks` (también barra lateral e Inicio) | Subtítulo «Todo lo que querés saber de tu Vigo, en un solo lugar»; descripciones de cada destino en voseo y orientadas a lo que querés hacer; «FAQ» → «Preguntas frecuentes»; Mi Vigo ya no dice «modelo y color»; Moderación «Revisar aportes y usuarios». |
| `/carga` › Estaciones de la comunidad | Intro corta (de dónde salen los precios + pedir que reporten); «Open Charge Map» explicado una vez en el mapa («un mapa mundial de cargadores»); validaciones con ejemplo («por ejemplo 60»); filtros sin resultado sugieren «Limpiar filtros». |
| Elegir cargador (modal) | Sin resultados: «Ninguna estación coincide. Probá con otra red o ciudad.» |
| Borradores de carga del auto (`CarChargeDrafts`) | Se saca el anglicismo «check-in»: «¿Cómo te fue?», «Publicar reporte», «Reporte publicado… ¡Gracias por avisar!». |
| `/rutas` | Párrafo final sin repetir «Mirá la comunidad»: explica «Oficial» y linkea a Comunidad. |
| `/rutas/planificar` | Título con emoji (🧭); subtítulo más simple; errores «Escribí de dónde salís y a dónde vas» y «el servicio de mapas no respondió». |
| `/costos` | «Aforo» explicado una vez («valor oficial del auto»); el texto de casos reales explica «Oficial» en una frase y no repite el link; estados vacíos de services/seguros que animan. |
| `/repuestos` | Intro (`parts.json`) más corta y en segunda persona. |
| `/comunidad` | Estado vacío «¡Sé quien comparta el primero!»; filtros sin resultado dicen qué hacer; aviso de comunidad no disponible sin «instalación». |
| Comentarios (`ContentReactions`) | Nuevo estado vacío «Todavía no hay comentarios. ¡Dejá el primero!»; confirmación de borrado avisa que no se puede deshacer. |
| `/mi-actividad` | Estados vacíos por sección con el botón a usar; «+ Nueva entrada» → «+ Nuevo service» / «+ Nuevo seguro»; «Descargar planilla (CSV)» → «⬇️ Descargar planilla»; llave de acceso explicada en una línea y botón «Entrar con tu huella o tu cara»; confirmaciones «¿Borrar…? No se puede deshacer.»; toast «Compra guardada ✓». |
| `/notificaciones` | Estado vacío con dos caminos claros (Carga y Comunidad). |
| `/login` | Llave de acceso explicada una vez (huella, cara o PIN; se crea desde Mi actividad); email vacío ahora avisa en vez de no hacer nada; verificación de seguridad dice dónde está. |
| Formularios (viaje, service, compra, seguro) | Validaciones dicen qué escribir y dan ejemplo («Escribí el kilometraje solo con números (por ejemplo 45000)»); links: «empieza con https://, copialo de la barra del navegador»; errores al abrir un registro dicen qué hacer; placeholder de notas «Lo que quieras contar (opcional)»; viaje: subtítulo más humano y paradas vacías con ayuda; seguro: «Deducible» explicado en una línea. |
| `/mi-vigo/preparar` | «ADB» explicado una vez; párrafo de Waze/Google más corto; aviso final más corto. |
| `/mi-vigo/preparar/archivos-google` | Aviso de la firma más corto y tranquilizador. |
| `/mi-vigo/boveda` | Se saca la explicación duplicada de dónde está la frase (queda en el estado, con voseo «escaneá»). |
| `/mi-vigo/borradores`, `/mi-vigo/diagnosticos`, `/mi-vigo/configuracion` | Estados vacíos con el paso siguiente; subtítulos cortos; «¿partes faltantes?» → «llegó incompleto, mandalo de nuevo»; archivo equivocado dice cuál elegir. |
| `/novedades` | Estado vacío: «Cuando salga una versión nueva, la vas a ver acá». |
| `/licencias` | Sin cambios de fondo (legal); «APK» → «app» en una intro. |
| `/moderacion` | Sin cambios (técnico pero claro). |
| 404 (nuevo `NotFoundPage`, ruta `*`) | Antes una ruta desconocida mostraba la página vacía; ahora explica y linkea a Inicio y Guía. |
| Error de página (`ErrorBoundary`) | «Uy, algo falló.» + qué hacer (recargar, avisar). |
| Errores genéricos (`lib/errors.ts`, bóveda, carRole, vehicleConfig, OCM) | Mensaje por defecto «Algo falló de nuestro lado. Revisá tu conexión y probá de nuevo.»; permiso y datos inválidos dicen qué hacer; «No disponible.» → «Esto no está disponible ahora. Probá más tarde.» |
| Sin conexión (`OfflineBanner`) | «Sin internet. La Guía anda igual; lo demás vuelve cuando te conectes.» |

Páginas revisadas sin cambios necesarios: Inicio, Mantenimiento, Accesorios, Tecnología, Ficha técnica,
Preguntas frecuentes (contenido en `src/data/*.json`, ya en tono), Vincular auto.

### Más propuestas (necesitan decisión del dueño)

7. **Reescribir el contenido curado** de `charging.json`, `maintenance.json`, `tech.json` y `faq.json`
   con la guía de tono (hoy está bien pero largo en partes); conviene hacerlo junto con
   `specs/CONTENT-MIGRATION.md`.
8. **Un glosario único** («¿Qué significa…?»: kWh, kWh/100 km, VIN, ADB, llave de acceso, Oficial) y
   linkear ahí en vez de explicar en cada página.
9. **Reemplazar `confirm()` del navegador** por un diálogo propio con botones «Borrar» / «Cancelar»
   (más claro en el celular y consistente con el estilo).
10. **Mover el aviso de llave de acceso** de Mi actividad a «Tu cuenta» en Mi Vigo (va con la propuesta 5.1).
11. **Planificador**: mostrar «🧭 Planificá tu viaje» como botón en Carga además de Rutas.

### Pruebas

- Tests actualizados a los textos nuevos: Login, Novedades, Bóveda, NewTripLog, NewInsuranceQuote,
  CarChargeDrafts, CommunityStations, StationPickerModal, StationsMap, ErrorBoundary, errors, carLink, ocmStations.
- Nuevo `NotFoundPage.test.tsx`.
- `npm test`, `npm run type-check`, `npm run lint`, `npm run build` en verde.

## 7. Decisiones del dueño (2026-11-24) — implementadas en la rama `site-structure`

Todas «SÍ». Propuestas 5.1–5.6 más 7 (versiones), 8–11 de la segunda pasada. **No** se tocó `src/data/*.json`
(propuesta 7 de contenido curado la hace otro trabajo en paralelo).

| # | Decisión | Implementación |
|---|---|---|
| 1 | «Mi actividad» pasa a Mi Vigo › «Mis registros» | `MyVigoLayout` con pestañas `PageTabs` «Mi auto» (`/mi-vigo`) / «Mis registros» (`/mi-vigo/registros`, requiere sesión). `/mi-actividad` redirige conservando el `state` del aviso «guardado» (`RedirectKeepState`). Formularios, login, notificaciones y moderación vuelven a `/mi-vigo/registros`. |
| 2 | Una sola tarjeta «Tu auto ahora» | `CarStatusCard` muestra batería, autonomía, cable, tiempo a carga completa, límite, **en línea / sin conexión** (`fetchCarLastSeen`) y último dato. «Control remoto» ya no es tarjeta ni sección propia: son solo los botones (ventanas, detener la carga, límite) y sus últimas órdenes **dentro** de «Tu auto ahora», sin título (`CarRemoteCard` sin `Card`, montado por `CarStatusCard`; sigue detrás de `VITE_CAR_REMOTE` y con `VENTILATE_ON_WEB = false`). «Enviar un destino al auto» queda como tarjeta aparte justo debajo (misma condición). Auditoría 2026-11-24: la primera versión dejaba «Control remoto» como tarjeta y sección propias; corregido. |
| 3 | Palabras: «Conectar la pantalla» y «Sumar a tu familia» | Sin «vincular» en textos visibles (rutas como `/mi-vigo/vincular` quedan: el QR del auto las usa). Mensaje del servidor «no está vinculado» se reescribe en `errors.ts`. **Pendiente fuera del sitio**: el botón del auto todavía dice «Vincular con WikiVigo» (repo vigo-hack); el sitio dice «tocá el botón de WikiVigo». |
| 4 | Códigos de familia de un solo uso | Migración `0082_family_invite_codes.sql` (**sin aplicar**): tabla `vehicle_invites` (hash SHA-256, vehículo, creador, vence, usado por/cuándo; RLS sin políticas ni permisos), `create_family_invite()` (solo creador o permiso de control, 10 por hora por persona, 8 letras, vence a las 24 h; **crear uno nuevo anula al instante los anteriores sin usar del vehículo**: solo sirve el último), `join_vehicle_by_code` acepta solo códigos válidos y los consume en la misma transacción (bloqueo de fila); el código fijo `vehicles.join_code` queda en NULL y ya no sirve. UI: ningún código visible por defecto; «Sumar a tu familia» crea uno nuevo cada vez, grande, con «Copiar» / «Compartir» y «Vence en 24 h, sirve para una persona. Si creás otro, este deja de servir.» |
| 5 | Mantenimiento + Repuestos + Accesorios | Página «🧰 Cuidar tu Vigo» (`/cuidar/…`) con tres pestañas; `/mantenimiento`, `/repuestos`, `/accesorios` redirigen. Búsqueda y notificaciones apuntan a las pestañas. |
| 6 | «Guía» → «Aprender» en tres grupos | `/aprender` (y `/guia` redirige) con *Cargar y viajar* (Carga, Rutas, Planificá tu viaje), *Costos y mantenimiento* (Costos, Cuidar tu Vigo), *Conocé tu Vigo* (Ficha técnica, Tecnología, Preguntas frecuentes, Glosario). Barra inferior: Inicio, Aprender, ＋ Registrar, Comunidad, Mi Vigo. Barra lateral: Inicio, Aprender, Comunidad, Mi Vigo y los tres grupos. |
| 7 | Versiones de software a Novedades | `FirmwareCard` (tabla) en `/novedades`; Mi Vigo muestra una línea «Tu pantalla: versión X — ¿hay una más nueva?» (`OwnFirmwareLine`). |
| 8 | Glosario | `/aprender/glosario` (`src/lib/glossary.ts`, 17 palabras); `GlossaryLink` en Carga/Costos (Oficial, Aforo), Rutas, Preparar (ADB), Login (llave de acceso), datos del auto (kWh/100 km). |
| 9 | Diálogo propio en vez de `confirm()` | `confirmDialog()` (`src/lib/confirmDialog.tsx` + `ConfirmDialog`): `alertdialog`, foco atrapado, Esc cancela, foco inicial en «Cancelar», botón con el verbo («Borrar», «Quitar», «Descartar»…). Los 30 usos reemplazados. |
| 10 | Llave de acceso a «Tu cuenta» | `PasskeyCard` en Mi Vigo › Tu cuenta; se quitó de Mis registros. |
| 11 | Planificador desde Carga | Aviso «🧭 Planificá tu viaje» arriba de `/carga`. |

### Chequeos SQL después de aplicar 0082 (como dueño en el SQL Editor / con dos cuentas de prueba)

1. `select join_code from vehicles where join_code is not null;` → 0 filas.
2. Cuenta A (creador): `select * from create_family_invite();` → un código de 8 letras y `expires_at` ≈ ahora + 24 h; en
   `vehicle_invites` solo aparece `code_hash` (64 hex), nunca el código.
3. Cuenta B: `select join_vehicle_by_code('<código>');` → id del vehículo de A; B queda con `car_role = 'view'`;
   la fila tiene `used_at`/`used_by`.
4. Cuenta C con el mismo código → `null` (ya usado) y una fila en `join_code_attempts`.
5. Un código con `expires_at` vencido (`update vehicle_invites set expires_at = now() - interval '1 minute'` como
   service role) → `null`.
6. Miembro con `car_role = 'view'` llamando a `create_family_invite()` → error «Solo quien creó el vehículo…».
7. Crear un código, crear otro: el primero da `null` al usarlo y el segundo funciona. 11 llamadas seguidas → error «Creaste muchos códigos seguidos…».
8. Como `authenticated`: `select * from vehicle_invites;` → error de permiso (sin grants).
9. Después: `npm run gen:types` (el tipo `join_code` ya figura como `string | null` y la RPC está agregada a mano).
