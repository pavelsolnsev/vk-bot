/**
 * Сжимает имя для колонки (как в telegram-репозитории): обрезка, паддинг.
 */
export function formatPlayerName(name, maxLength = 12) {
  if (name == null || name === '') {
    return 'Unknown'.padEnd(maxLength, ' ')
  }

  const nameStr = String(name)
  // eslint-disable-next-line no-misleading-character-class
  const emojiRegex =
    /[\u{1F000}-\u{1FFFF}\u{1D400}-\u{1D7FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{FF00}-\u{FFEF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu
  const cleanName = nameStr.replace(emojiRegex, '').trim()

  if (!cleanName) {
    return 'Unknown'.padEnd(maxLength, ' ')
  }

  const chars = Array.from(cleanName)
  if (chars.length <= maxLength) return cleanName.padEnd(maxLength, ' ')
  return chars.slice(0, maxLength - 3).join('') + '...'
}
