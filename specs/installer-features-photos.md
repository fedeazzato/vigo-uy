# Screenshots for «Qué agrega el instalador a tu Vigo»

Capture list for `#/mi-vigo/preparar/que-agrega` (`src/data/installerFeatures.json`, field `photo`). One screenshot per card, taken on
the car with `adb shell screencap -p /sdcard/x.png` + `adb pull` into `diag_out` (vigo-hack), never published raw.

**Always blur before publishing:** the PDSN / VIN / any serial number, the owner's name or e-mail (Mi Vigo › Mi cuenta, the Google
account), phone contacts and numbers, addresses, map positions and saved places (Waze, Cargadores distances that reveal home), Wi-Fi
names, the plate, the WikiVigo pairing code / QR. Day theme unless noted; Spanish overlays installed.

| # | Card (id) | Screen | State to capture | Blur |
|---|---|---|---|---|
| 1 | Modo invitado (`modo-invitado`) | Mi Vigo › Modo invitado + one app in guest mode | The card with «Activar» (or the confirmation pop-up), and e.g. Energía or the Gallery showing the «Modo invitado» placeholder instead of the data | Anything personal around the placeholder; never the PIN being typed |
| 2 | Dashcam (`dashcam`) | Home screen + Dashcam app | Tile in its recording colour; the app searching by date | Map positions in the search; never the recovery words |
| 3 | Dónde está tu auto (`ubicacion`) | Mi Vigo › Privacidad › Ubicación del auto | The pill on «Apagado» or «Última ubicación» | Never a map with a real place |
| 4 | Copiloto: le hablás en español (`copiloto`) | Any app with Copiloto's floating panel open | Answering after «prendé el aire» (reply text visible) | Anything personal behind the panel |
| 5 | Waze (`waze`) | Waze full screen | A route on the map, guidance visible | Origin/destination, home/work, account avatar |
| 6 | Android Auto sin cable (`android-auto`) | Android Auto projected on the car screen | The Android Auto launcher with the phone's apps (maps, music, messages), connected without cable | Phone name, contacts, messages, map position |
| 7 | Centro de Energía inteligente (`energia`) | Energía app: the new trips/charges tab + Cargadores cercanos | Some trips and charges; the chargers list sorted by distance | Trip places, personal dates; take the chargers list away from home |
| 8 | Radio mejorada (`radio`) | Stock Radio | Frequency keypad open (from + in favourites edit) and the volume slider | — |
| 9 | Tus fotos, en el auto y de fondo (`fotos`) | Home screen + Gallery | An own picture as wallpaper; the Gallery «En el auto» tab | Use a neutral landscape, not a family photo |
| 10 | YouTube y Chrome (`youtube-chrome`) | YouTube, car in P | A video playing (or the YouTube home) | Account avatar, watch history |
| 11 | Spotify (`spotify`) | Spotify app | The app's home | Account name, named playlists |
| 12 | Todo en buen español (`espanol`) | A stock Settings page | Spanish texts (optional before/after pair) | Serial numbers if «Acerca del IVI» is used |
| 13 | Mi Vigo (`mi-vigo`) | Mi Vigo | Rail with the tabs; Privacidad with the switches OFF (the default) | Account name/e-mail, pairing code, QR |
| 14 | Actualizaciones remotas (`actualizaciones`) | Bell + Mi Vigo › Versiones | An update notice in the bell; «Actualización lista» + «Instalar ahora» (a fake STAGED is fine) | Other notices' content |
| 15 | Avisos que no se pierden (`campana`) | Bell panel open | One notice from an app (e.g. charge finished) | Places, names in other notices |

Dropped 2026-11-26 (owner feedback, cards removed or merged): Botón de voz del volante, Voz en español, Servicios de Google Play,
Avisos de software de Google, Pantalla de inicio ordenada, Enviar diagnóstico, the separate Cargadores cercanos and Tus fotos de fondo shots.

Also pending for «Preparar mi Vigo» (`specs/prepare-my-vigo.md` D5): «Acerca del IVI» (BLUR the PDSN), the software-version line with
the password box, the engineering menu with «adb开启».
