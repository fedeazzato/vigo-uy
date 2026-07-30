import { KeyboardEvent, useId, useState } from 'react'
import { matchCities, normalizeCityCasing } from '../lib/cities'
import formStyles from '../styles/formControls.module.css'
import styles from './CityCombobox.module.css'

interface CityComboboxProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}

// Touch-friendly replacement for the native <input list=...> + <datalist>
// pattern (specs/city-combobox.md): datalist suggestions render
// inconsistently on mobile, often invisible. Free text is always accepted —
// the dropdown only ever suggests UY_CITIES matches, never restricts input.
export default function CityCombobox({ id, value, onChange, placeholder, required }: CityComboboxProps) {
  const listboxId = useId()
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const matches = matchCities(value)
  const showDropdown = focused && !dismissed && matches.length > 0

  function select(city: string) {
    onChange(city)
    setDismissed(true)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDismissed(false)
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (showDropdown && activeIndex >= 0 && matches[activeIndex]) {
        e.preventDefault()
        select(matches[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setDismissed(true)
      setActiveIndex(-1)
    }
  }

  return (
    <div className={styles.wrapper}>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        required={required}
        className={formStyles.input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setDismissed(false)
          setActiveIndex(-1)
        }}
        onFocus={() => {
          setFocused(true)
          setDismissed(false)
        }}
        onBlur={() => {
          setFocused(false)
          setActiveIndex(-1)
          onChange(normalizeCityCasing(value))
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <ul id={listboxId} role="listbox" className={styles.dropdown}>
          {matches.map((city, i) => (
            <li
              key={city}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? `${styles.option} ${styles.optionActive}` : styles.option}
              onMouseDown={(e) => {
                e.preventDefault()
                select(city)
              }}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
