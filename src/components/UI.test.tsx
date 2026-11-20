import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Segmented, Switch, Badge } from './UI'

describe('Switch', () => {
  it('is a native checkbox exposed as a switch, named by its label', () => {
    render(
      <Switch checked={false} onChange={() => {}}>
        Compartir con la comunidad
      </Switch>
    )
    const sw = screen.getByRole<HTMLInputElement>('switch', { name: 'Compartir con la comunidad' })
    expect(sw.type).toBe('checkbox') // Space toggles it natively
    expect(sw.checked).toBe(false)
  })

  it('reports the checked state and toggles through onChange', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Switch checked={false} onChange={onChange}>
        Granizo
      </Switch>
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)

    rerender(
      <Switch checked onChange={onChange}>
        Granizo
      </Switch>
    )
    expect(screen.getByRole('switch', { checked: true })).toBeTruthy()
    fireEvent.click(screen.getByText('Granizo')) // the whole row is the target
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('does not change when disabled', () => {
    const onChange = vi.fn()
    render(
      <Switch checked={false} onChange={onChange} disabled hint="Solo con sesión iniciada">
        Compartir
      </Switch>
    )
    const sw = screen.getByRole<HTMLInputElement>('switch')
    expect(sw.disabled).toBe(true)
    fireEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Solo con sesión iniciada')).toBeTruthy()
  })
})

const MODELS = [
  { value: 'E2', label: 'E2' },
  { value: 'E2+', label: 'E2+' },
  { value: 'E3', label: 'E3' },
] as const
type ModelValue = (typeof MODELS)[number]['value']

function Harness({ initial = null }: { initial?: ModelValue | null }) {
  const [value, setValue] = useState<ModelValue | null>(initial)
  return <Segmented label="Modelo" options={MODELS} value={value} onChange={setValue} />
}

describe('Segmented', () => {
  it('is a labelled radio group with the checked option marked', () => {
    render(<Harness initial="E2+" />)
    expect(screen.getByRole('radiogroup', { name: 'Modelo' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'E2+' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'E2' }).getAttribute('aria-checked')).toBe('false')
  })

  it('has a single tab stop: the checked option, or the first one when none is', () => {
    const { unmount } = render(<Harness initial="E2+" />)
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1])
    unmount()

    render(<Harness />)
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('selects on click', () => {
    const onChange = vi.fn()
    render(<Segmented label="Vista" options={MODELS} value="E2" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'E3' }))
    expect(onChange).toHaveBeenCalledWith('E3')
  })

  it('moves and selects with the arrow keys, wrapping, plus Home/End', () => {
    render(<Harness initial="E2" />)
    const radio = (name: string) => screen.getByRole('radio', { name })

    fireEvent.keyDown(radio('E2'), { key: 'ArrowRight' })
    expect(radio('E2+').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radio('E2+'))

    fireEvent.keyDown(radio('E2+'), { key: 'ArrowDown' })
    fireEvent.keyDown(radio('E3'), { key: 'ArrowRight' })
    expect(radio('E2').getAttribute('aria-checked')).toBe('true') // wrapped

    fireEvent.keyDown(radio('E2'), { key: 'ArrowLeft' })
    expect(radio('E3').getAttribute('aria-checked')).toBe('true') // wrapped back

    fireEvent.keyDown(radio('E3'), { key: 'Home' })
    expect(radio('E2').getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(radio('E2'), { key: 'End' })
    expect(radio('E3').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radio('E3'))
  })

  it('ignores other keys', () => {
    const onChange = vi.fn()
    render(<Segmented label="Vista" options={MODELS} value="E2" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'E2' }), { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Badge', () => {
  it('keeps curated and community badges on different styles', () => {
    render(
      <>
        <Badge color="blue">Oficial</Badge>
        <Badge color="community">Comunidad</Badge>
      </>
    )
    expect(screen.getByText('Oficial').className).not.toBe(screen.getByText('Comunidad').className)
  })
})
