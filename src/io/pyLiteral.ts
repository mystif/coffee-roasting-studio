// Minimal parser for Python literals as written by Artisan into .alog files
// (dict/list/tuple/str/int/float/True/False/None). Never evaluates code.

export type PyValue = null | boolean | number | string | PyValue[] | { [k: string]: PyValue }

export function parsePyLiteral(src: string): PyValue {
  let i = 0

  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const fail = (msg: string): never => {
    throw new Error(`${msg} (pozice ${i})`)
  }

  function value(): PyValue {
    ws()
    const c = src[i]
    if (c === '{') return dict()
    if (c === '[') return seq(']')
    if (c === '(') return seq(')')
    if (c === "'" || c === '"') return str()
    if ((c === 'u' || c === 'b') && (src[i + 1] === "'" || src[i + 1] === '"')) {
      i++
      return str()
    }
    if (src.startsWith('True', i)) return (i += 4), true
    if (src.startsWith('False', i)) return (i += 5), false
    if (src.startsWith('None', i)) return (i += 4), null
    if (src.startsWith('nan', i)) return (i += 3), null
    if (src.startsWith('inf', i)) return (i += 3), null
    if (src.startsWith('-inf', i)) return (i += 4), null
    return num()
  }

  function dict(): PyValue {
    i++
    const o: { [k: string]: PyValue } = {}
    for (;;) {
      ws()
      if (src[i] === '}') return i++, o
      const k = value()
      ws()
      if (src[i] !== ':') fail('Očekávána dvojtečka')
      i++
      o[String(k)] = value()
      ws()
      if (src[i] === ',') i++
      else if (src[i] !== '}') fail('Očekávána čárka nebo }')
    }
  }

  function seq(close: string): PyValue {
    i++
    const a: PyValue[] = []
    for (;;) {
      ws()
      if (src[i] === close) return i++, a
      a.push(value())
      ws()
      if (src[i] === ',') i++
      else if (src[i] !== close) fail(`Očekávána čárka nebo ${close}`)
    }
  }

  function str(): string {
    const q = src[i++]
    let s = ''
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        const e = src[++i]
        i++
        if (e === 'n') s += '\n'
        else if (e === 't') s += '\t'
        else if (e === 'r') s += '\r'
        else if (e === 'x') (s += String.fromCharCode(parseInt(src.substr(i, 2), 16))), (i += 2)
        else if (e === 'u') (s += String.fromCharCode(parseInt(src.substr(i, 4), 16))), (i += 4)
        else if (e === 'U') (s += String.fromCodePoint(parseInt(src.substr(i, 8), 16))), (i += 8)
        else s += e
      } else s += src[i++]
    }
    if (src[i] !== q) fail('Neukončený řetězec')
    i++
    return s
  }

  function num(): number {
    const m = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i, i + 40))
    if (!m) fail('Neočekávaný znak')
    i += m![0].length
    return Number(m![0])
  }

  const v = value()
  ws()
  if (i < src.length) fail('Nadbytečná data za koncem')
  return v
}
