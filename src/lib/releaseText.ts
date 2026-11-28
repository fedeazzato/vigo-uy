// The little Markdown that release notes use (vigo-hack updater/notes/r<N>.md, shown on GitHub and in "Novedades"):
// "##" headings, "-" lists nested by indentation, wrapped lines, **bold**, `code` and [links](url) shown as their text.

export interface ListItem {
  text: string
  items: ListItem[]
}

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: ListItem[] }

export function parseReleaseText(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  // the open list: its top items, and the chain of open items with the indentation each started at
  let list: ListItem[] | null = null
  let open: { indent: number; item: ListItem }[] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const close = () => {
    list = null
    open = []
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flush()
      close()
    } else if (heading) {
      flush()
      close()
      blocks.push({ kind: 'heading', text: heading[1].trim() })
    } else if (bullet) {
      flush()
      const indent = bullet[1].length
      const item: ListItem = { text: bullet[2].trim(), items: [] }
      while (open.length && open[open.length - 1].indent >= indent) open.pop()
      if (open.length) open[open.length - 1].item.items.push(item)
      else {
        if (!list) {
          list = []
          blocks.push({ kind: 'list', items: list })
        }
        list.push(item)
      }
      open.push({ indent, item })
    } else if (open.length && /^\s/.test(line)) {
      open[open.length - 1].item.text += ` ${line.trim()}` // a wrapped list line
    } else {
      close()
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}

export interface Span {
  kind: 'text' | 'bold' | 'code'
  text: string
}

export function parseSpans(text: string): Span[] {
  const plain = text.replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')
  return plain
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part): Span => {
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**'))
        return { kind: 'bold', text: part.slice(2, -2) }
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`'))
        return { kind: 'code', text: part.slice(1, -1) }
      return { kind: 'text', text: part }
    })
}
