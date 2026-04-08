/**
 * Оценка «визуальной ширины» строки (для выравнивания колонок в VK / старый Telegram не моноширинный идеален).
 * Широкие символы (CJK и т.п.) ≈ 2, остальные ≈ 1.
 */
function isWideCodePoint(cp) {
  if (cp >= 0x1100 && cp <= 0x115f) return true
  if (cp >= 0x2e80 && cp <= 0xa4cf) return true
  if (cp >= 0xac00 && cp <= 0xd7af) return true
  if (cp >= 0xf900 && cp <= 0xfaff) return true
  if (cp >= 0xfe10 && cp <= 0xfe19) return true
  if (cp >= 0xfe30 && cp <= 0xfe6f) return true
  if (cp >= 0xff00 && cp <= 0xff60) return true
  if (cp >= 0xffe0 && cp <= 0xffe6) return true
  return false
}

export function displayTextWidth(str) {
  if (str == null || str === '') return 0
  let w = 0
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0)
    w += isWideCodePoint(cp) ? 2 : 1
  }
  return w
}

/** Убрать эмодзи из отображаемого имени (как раньше). */
export function stripEmojiFromName(nameStr) {
  // eslint-disable-next-line no-misleading-character-class
  const emojiRegex =
    /[\u{1F000}-\u{1FFFF}\u{1D400}-\u{1D7FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{FF00}-\u{FFEF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu
  return String(nameStr).replace(emojiRegex, '').trim()
}

/**
 * Обрезка по визуальной ширине; при обрезке добавляет «...» (ширина «...» учитывается).
 * @param {string} str
 * @param {number} maxWidth
 */
export function truncateToDisplayWidth(str, maxWidth) {
  const s = String(str ?? '')
  if (maxWidth <= 0) return ''
  if (displayTextWidth(s) <= maxWidth) return s

  const suffix = '...'
  const sufW = displayTextWidth(suffix)
  const budget = maxWidth - sufW
  if (budget <= 0) return suffix.slice(0, maxWidth)

  let out = ''
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    const cw = isWideCodePoint(cp) ? 2 : 1
    if (w + cw > budget) break
    out += ch
    w += cw
  }
  return out + suffix
}

/**
 * Дополнить справа до целевой визуальной ширины.
 * @param {string} padChar символ дополнения (например U+00A0 для VK после mention).
 */
export function padToDisplayWidth(str, targetWidth, padChar = ' ') {
  const s = String(str ?? '')
  const ch = padChar === '' ? ' ' : String(padChar)[0]
  const cw = displayTextWidth(ch)
  let w = displayTextWidth(s)
  if (w >= targetWidth) return s
  const need = targetWidth - w
  const n = cw > 0 ? Math.ceil(need / cw) : need
  return s + ch.repeat(n)
}

/** Фиксированная макс. ширина подписи игрока в списке (одинаковая обрезка для всех). */
export const LIST_NAME_MAX_DISPLAY_WIDTH = 14

/**
 * Сжимает имя для колонки (legacy по числу символов; для новых списков лучше truncateToDisplayWidth).
 */
export function formatPlayerName(name, maxLength = 12) {
  if (name == null || name === '') {
    return 'Unknown'.padEnd(maxLength, ' ')
  }

  const nameStr = String(name)
  const cleanName = stripEmojiFromName(nameStr)

  if (!cleanName) {
    return 'Unknown'.padEnd(maxLength, ' ')
  }

  const chars = Array.from(cleanName)
  if (chars.length <= maxLength) return cleanName.padEnd(maxLength, ' ')
  return chars.slice(0, maxLength - 3).join('') + '...'
}
