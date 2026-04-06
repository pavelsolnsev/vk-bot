/**
 * Единый вывод ошибок/предупреждений в консоль (PM2 / journal) для отладки на проде.
 * @param {string} scope — короткий тег, например footballApi/join
 * @param {unknown} err
 * @param {Record<string, unknown>} [meta]
 */
export function logError(scope, err, meta) {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  const prefix = `[vk-bot:${scope}]`
  if (meta && Object.keys(meta).length > 0) {
    console.error(prefix, message, meta)
  } else {
    console.error(prefix, message)
  }
  if (stack) console.error(prefix, stack)
}

/**
 * @param {string} scope
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export function logWarn(scope, message, meta) {
  const prefix = `[vk-bot:${scope}]`
  if (meta && Object.keys(meta).length > 0) {
    console.warn(prefix, message, meta)
  } else {
    console.warn(prefix, message)
  }
}

/**
 * Логирует не-2xx ответ HTTP и первые байты тела.
 * @param {string} scope
 * @param {Response} response
 * @param {string} label
 */
export async function logHttpNotOk(scope, response, label) {
  let body = ''
  try {
    body = (await response.text()).slice(0, 500)
  } catch (e) {
    logWarn(scope, `${label} не удалось прочитать тело ответа`, { status: response.status, err: String(e) })
    return
  }
  logWarn(scope, `${label} HTTP ${response.status}`, { body: body || '(пусто)' })
}
