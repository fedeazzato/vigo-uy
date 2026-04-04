import { useUserPrefs, MODELS, COLORS, COLOR_HEX, COLOR_DARK_TEXT, COLOR_BORDER } from '../context/UserPrefsContext'
import type { Model } from '../types'
import { PageHeader, Card, CardTitle } from '../components/UI'
import { CarPreview } from '../components/CarPreview'
import styles from './MyVigoPage.module.css'

const MODEL_INFO: Record<Model, { battery: string; extra: string }> = {
  'E2':  { battery: '44,94 kWh', extra: 'Autonomía estándar' },
  'E2+': { battery: '51,87 kWh', extra: 'Mayor autonomía · Pack ADAS' },
}

export default function MyVigoPage() {
  const { model, color, setModel, setColor, clear } = useUserPrefs()

  return (
    <div>
      <PageHeader
        title="🚗 Mi Vigo"
        subtitle="Configurá tu modelo y color para personalizar la información."
      />

      {(model || color) && (
        <div className={styles.currentSelection}>
          {color && (
            <span
              className={styles.colorDot}
              style={{
                background: COLOR_HEX[color],
                border: COLOR_BORDER[color] ? `1.5px solid ${COLOR_BORDER[color]}` : undefined,
              }}
            />
          )}
          <span>
            {model && color
              ? <>Tu Vigo es <strong>{model} {color}</strong></>
              : model
              ? <>Modelo seleccionado: <strong>{model}</strong></>
              : <>Color seleccionado: <strong>{color}</strong></>
            }
          </span>
          <button className={styles.clearBtn} onClick={clear}>Limpiar</button>
        </div>
      )}

      <Card>
        <CardTitle icon="⚙️">Modelo</CardTitle>
        <div className={styles.modelGrid}>
          {MODELS.map((m) => (
            <button
              key={m}
              className={`${styles.modelCard} ${model === m ? styles.selected : ''}`}
              onClick={() => setModel(m)}
            >
              <div className={styles.modelName}>{m}</div>
              <div className={styles.modelBattery}>{MODEL_INFO[m].battery}</div>
              <div className={styles.modelExtra}>{MODEL_INFO[m].extra}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CarPreview color={color} />
        <CardTitle icon="🎨">Color</CardTitle>
        <div className={styles.colorGrid}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.swatchBtn} ${color === c ? styles.selected : ''}`}
              onClick={() => setColor(c)}
            >
              <span
                className={styles.swatch}
                style={{
                  background: COLOR_HEX[c],
                  borderColor: COLOR_BORDER[c] ?? 'transparent',
                  color: COLOR_DARK_TEXT[c] ? '#1a1a18' : '#fff',
                }}
              />
              <span className={styles.colorLabel}>{c}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
