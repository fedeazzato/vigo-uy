// Glosario (owner decision 2026-11-24, proposal 8): one short, plain definition per "palabra rara". Pages link here with
// <GlossaryLink term="…"> instead of re-explaining (keeping at most a 3-5 word hint inline). Code, not src/data JSON: the
// curated JSON files are being rewritten by another worker.

export interface GlossaryTerm {
  id: string
  word: string
  definition: string
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'adb',
    word: 'ADB',
    definition:
      'Una puerta por cable para hablarle a la pantalla del auto desde una computadora. La usa el instalador de las mejoras; se apaga sola al reiniciar la pantalla.',
  },
  {
    id: 'aforo',
    word: 'Aforo',
    definition: 'El valor oficial del auto que fija la intendencia. Con él se calcula la patente.',
  },
  {
    id: 'autonomia',
    word: 'Autonomía',
    definition: 'Cuántos kilómetros podés hacer con la batería que te queda. Baja con frío, velocidad alta o aire prendido.',
  },
  {
    id: 'boveda',
    word: 'Bóveda',
    definition:
      'Un lugar de WikiVigo para guardar secretos (como la frase de la dashcam) que solo se abre con tu huella o tu cara. Ni nosotros podemos leerlo.',
  },
  {
    id: 'carga-rapida',
    word: 'Carga lenta y carga rápida (AC y DC)',
    definition:
      'La lenta (AC) es la de casa o la de muchos cargadores de calle: varias horas. La rápida (DC) es la de ruta: en menos de una hora pasás de poca batería a 80 %.',
  },
  {
    id: 'ccs2',
    word: 'CCS2 y Tipo 2',
    definition: 'Los dos enchufes del Vigo. Tipo 2 es para carga lenta (AC); CCS2 es el más grande, para carga rápida (DC).',
  },
  {
    id: 'deducible',
    word: 'Deducible',
    definition: 'La parte de un arreglo que pagás vos cuando usás el seguro. El seguro paga el resto.',
  },
  {
    id: 'kw',
    word: 'kW',
    definition: 'La potencia: qué tan rápido entra la energía. Un cargador de 60 kW carga más rápido que uno de 7 kW.',
  },
  {
    id: 'kwh',
    word: 'kWh',
    definition: 'La unidad de energía: lo que entra en la batería. La del E2 guarda unos 45 kWh y la del E2+ unos 52 kWh.',
  },
  {
    id: 'kwh-100',
    word: 'kWh/100 km',
    definition: 'Cuánta energía gasta el auto cada 100 km. Es el «consumo»: cuanto más bajo, mejor.',
  },
  {
    id: 'llave-de-acceso',
    word: 'Llave de acceso (passkey)',
    definition:
      'Entrar con tu huella, tu cara o el PIN del teléfono, sin esperar el código por email. Se crea en Mi Vigo › Tu cuenta.',
  },
  {
    id: 'oficial',
    word: '«Oficial» y «Comunidad»',
    definition:
      '«Oficial» es un dato que revisó el grupo o un moderador. «Comunidad» es un dato que cargó otro dueño, sin revisar.',
  },
  {
    id: 'open-charge-map',
    word: 'Open Charge Map',
    definition: 'Un mapa mundial y abierto de cargadores. Lo mostramos junto a las estaciones que reporta la comunidad.',
  },
  {
    id: 'pantalla',
    word: 'Pantalla del auto',
    definition:
      'La pantalla grande del tablero (en inglés «head unit»). Las mejoras de la comunidad se instalan ahí; se conecta a tu cuenta desde Mi Vigo.',
  },
  {
    id: 'soc',
    word: 'Batería en % (SOC)',
    definition: 'Cuánto le queda a la batería, de 0 a 100 %. Para cuidarla, en el día a día conviene cargar hasta 80 o 90 %.',
  },
  {
    id: 'v2l',
    word: 'V2L',
    definition: 'Usar la batería del auto como enchufe: con un adaptador podés conectar una pava, una herramienta o luces.',
  },
  {
    id: 'vin',
    word: 'VIN',
    definition: 'El número de chasis: 17 letras y números que identifican tu auto. Está en la libreta y en el parabrisas.',
  },
]

export function glossaryPath(id: string): string {
  return `/aprender/glosario?t=${encodeURIComponent(id)}`
}
