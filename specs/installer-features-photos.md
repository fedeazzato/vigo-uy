# Screenshots for «Qué agrega el instalador a tu Vigo»

Capture list for `#/mi-vigo/preparar/que-agrega` (`src/data/installerFeatures.json`, field `photo`). One screenshot per card, taken on
the car with `adb shell screencap -p /sdcard/x.png` + `adb pull` into `diag_out` (vigo-hack), never published raw.

**Always blur before publishing:** the PDSN / VIN / any serial number, the owner's name or e-mail (Mi Vigo › Mi cuenta, the Google
account), phone contacts and numbers, addresses, map positions and saved places (Waze, Cargadores distances that reveal home), Wi-Fi
names, the plate, the WikiVigo pairing code / QR. Day theme unless noted; Spanish overlays installed.

| # | Card (id) | Screen | State to capture | Blur |
|---|---|---|---|---|
| 1 | Copiloto (`copiloto`) | Any app with Copiloto's floating panel open | Listening after «prendé el aire» | Anything personal behind the panel |
| 2 | Botón de voz del volante (`tecla-volante`) | Copiloto › Ajustes | «Tecla del volante» row, «Micrófono» chosen | — |
| 3 | Voz en español (`voz-espanol`) | Stock Settings page that shows the text-to-speech voice [verificar which] | «Voz en español» selected | — |
| 4 | Cargadores cercanos (`cargadores`) | Cargadores cercanos list | List sorted by distance | Distances/location if they reveal home: take it away from home |
| 5 | Carga, dentro de Energía (`carga`) | Centro de Energía, a Carga tab (Viajes) | Some trips and charges | Trip places, personal dates |
| 6 | Waze (`waze`) | Waze full screen | A route on the map, guidance visible | Origin/destination, home/work, account avatar |
| 7 | Servicios de Google Play (`google-play`) | Mi Vigo › Versiones | «Software de Google» section | — |
| 8 | YouTube y Chrome (`youtube-chrome`) | Home screen | YouTube and Chrome icons | Wallpaper if it is a personal photo |
| 9 | Avisos de software de Google (`avisos-google`) | Bell (notification panel) | An «Actualización de Google» notice | Other notices' content |
| 10 | Spotify (`spotify`) | Spotify app | The app's home | Account name, named playlists |
| 11 | Mi Vigo (`mi-vigo`) | Mi Vigo | Rail with the 8 tabs, «Mi cuenta» selected | Account name/e-mail, pairing code, QR |
| 12 | Tus fotos de fondo (`fondo`) | Home screen | An own picture as wallpaper (plus optionally Mi Vigo › Fondo with the 4 «Lugar» tiles) | Use a neutral landscape, not a family photo |
| 13 | Apps de fábrica en español (`espanol`) | A stock Settings page | Spanish texts (optional before/after pair) | Serial numbers if «Acerca del IVI» is used |
| 14 | Pantalla de inicio ordenada (`iconos`) | Home screen | Waze, Copiloto, Mi Vigo and Dashcam tiles | Wallpaper if personal |
| 15 | Vos decidís qué se comparte (`compartir`) | Mi Vigo › Privacidad | Switches OFF (the default) | — |
| 16 | Avisos en la campana (`campana`) | Bell panel open | One notice from an app | Places, names in other notices |
| 17 | Dónde está tu auto (`ubicacion`) | Mi Vigo › Privacidad › Ubicación del auto | The pill on «Apagado» or «Última ubicación» | Never a map with a real place |
| 18 | Actualizaciones automáticas (`actualizaciones`) | Mi Vigo › Versiones | «Actualización lista» + «Instalar ahora» (a fake STAGED is fine) | — |
| 19 | Enviar diagnóstico (`diagnostico`) | Mi Vigo › Ayuda | «¿Algo no funciona?» card | Note text if typed |
| 20 | Android Auto (`android-auto`, testing) | Home screen card | Android Auto connected | Phone name, contacts, map position |
| 21 | Radio mejorada (`radio`) | Stock Radio | Frequency keypad open (from + in favourites edit) and the volume slider | — |
| 22 | Fotos «En el auto» (`galeria`) | Stock Gallery | «En el auto» tab with pictures, and the «¿En qué lugar?» dialog | The picture if personal |
| 23 | Dashcam (`dashcam`) | Home screen + Dashcam app | Tile in its recording colour; the app searching by date | Map positions in the search; never the recovery words |

Also pending for «Preparar mi Vigo» (`specs/prepare-my-vigo.md` D5): «Acerca del IVI» (BLUR the PDSN), the software-version line with
the password box, the engineering menu with «adb开启».
