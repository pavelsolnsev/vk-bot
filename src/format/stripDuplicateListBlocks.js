/**
 * В телеге/VK между блоками часто бывает несколько пустых строк (\n\n\n).
 * Старый патерн \n\n(?=🕒 ) не срабатывал: после двух \n шёл третий \n, затем 🕒.
 * Режем по любой серии переводов строк перед второй (и далее) шапкой 🕒, оставляем последний блок.
 */
export function stripDuplicateListBlocks(text) {
  if (typeof text !== 'string' || !text.includes('🕒')) return text
  const parts = text.split(/\r?\n+(?=🕒)/u)
  if (parts.length <= 1) return text
  const last = parts[parts.length - 1].trimStart()
  return last.length > 0 ? last : text
}
