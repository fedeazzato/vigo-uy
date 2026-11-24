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
