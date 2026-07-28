import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PurchaseThumbnail from './PurchaseThumbnail'

describe('PurchaseThumbnail', () => {
  it('renders nothing when src is null', () => {
    const { container } = render(<PurchaseThumbnail src={null} alt="Producto" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an image when src is provided', () => {
    render(<PurchaseThumbnail src="https://example.com/img.jpg" alt="Producto" />)
    expect(screen.getByRole('img', { name: 'Producto' })).toBeTruthy()
  })

  it('wraps the image in a link to the publication when a link is provided', () => {
    render(<PurchaseThumbnail src="https://example.com/img.jpg" alt="Producto" link="https://example.com/post" />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://example.com/post')
    expect(screen.getByRole('img', { name: 'Producto' })).toBeTruthy()
  })

  it('hides the image after it fails to load, instead of a broken-image icon', () => {
    render(<PurchaseThumbnail src="https://example.com/broken.jpg" alt="Producto" />)
    const img = screen.getByRole('img', { name: 'Producto' })
    fireEvent.error(img)
    expect(screen.queryByRole('img', { name: 'Producto' })).toBeNull()
  })
})
