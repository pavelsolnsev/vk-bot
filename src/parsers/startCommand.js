function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Сегодняшняя дата по календарю Москвы */
function moscowTodayYmd() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function addCalendarDays(y, m, d, delta) {
  const t = new Date(Date.UTC(y, m - 1, d + delta))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** День недели (0=вс … 6=сб) для календарной даты в Москве */
function moscowWeekdayJs(y, m, d) {
  return new Date(
    `${y}-${pad2(m)}-${pad2(d)}T12:00:00+03:00`,
  ).getUTCDay()
}

/**
 * Ближайшее в будущем событие: день недели wantJsDay (1=пн, 5=пт), время по Москве.
 */
function nextOccurrenceMoscow(wantJsDay, hour, minute) {
  const start = moscowTodayYmd()
  for (let i = 0; i < 14; i += 1) {
    const { y, m, d } = addCalendarDays(start.y, start.m, start.d, i)
    if (moscowWeekdayJs(y, m, d) !== wantJsDay) continue
    const candidate = new Date(
      `${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00+03:00`,
    )
    if (candidate.getTime() > Date.now()) {
      return {
        date: `${pad2(d)}.${pad2(m)}.${y}`,
        time: `${pad2(hour)}:${pad2(minute)}`,
      }
    }
  }
  return null
}

/**
 * Имена команд после `s tr …`: через запятую или через пробелы (одно слово = одна команда).
 * Нужно, чтобы под список турнира сделать кнопки и потом красиво разнести людей по блокам в тексте.
 */
export function parseTeamSlotNames(rest) {
  const raw = String(rest || '').trim()
  if (!raw) return undefined

  let parts = []
  if (raw.includes(',')) {
    parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  } else {
    parts = raw.split(/\s+/).filter(Boolean)
  }

  const seen = new Set()
  const out = []
  for (const p of parts) {
    // Сжимаем пробелы и режем очень длинные подписи, чтобы кнопка и payload не ломались.
    const cleaned = p.replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    // Во ВК inline-клавиатура — макс. 10 строк; «Выйти» занимает отдельный ряд, команд оставляем до 9.
    if (out.length >= 9) break
  }
  return out.length ? out : undefined
}

/** Поиск слота команды без учёта регистра и лишних пробелов. */
export function findTeamSlotLabel(teamSlots, rawLabel) {
  const slots = Array.isArray(teamSlots) ? teamSlots : []
  const want = String(rawLabel ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!want) return null
  return slots.find((s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === want) || null
}

/**
 * Явная дата/время + prof или tr (с сайта: s 15.04.2026 20:30 prof).
 * Для tr — опционально слоты команд после ключа: s … tr Красные, Синие
 */
export function parseDatedProfTrCommand(text) {
  const trimmed = text.trim()
  const m =
    /^(s|start)\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}:\d{2})\s+(tr|prof)\b(?:\s+(.*))?$/iu.exec(
      trimmed,
    )
  if (!m) return null

  const date = m[2]
  const timeRaw = m[3]
  const placeKey = String(m[4] ?? '').toLowerCase()
  const rest = m[5] != null ? String(m[5]) : ''

  const [dd, mm, yyyy] = date.split('.').map((v) => Number(v))
  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) return null
  if (yyyy < 2000 || yyyy > 2100) return null
  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null

  const [hh, min] = timeRaw.split(':').map((v) => Number(v))
  if (!Number.isInteger(hh) || !Number.isInteger(min)) return null
  if (hh < 0 || hh > 23 || min < 0 || min > 59) return null
  const time = `${pad2(hh)}:${pad2(min)}`

  if (placeKey === 'tr') {
    const teamSlots = parseTeamSlotNames(rest.trim())
    return { date, time, place: 'tr', teamSlots }
  }
  if (placeKey === 'prof') {
    return { date, time, place: 'prof' }
  }
  return null
}

/** Профилакторий: ближайший понедельник 20:30 (МСК). Турнир: ближайшая пятница 20:00 (МСК). */
export function parsePresetStartCommand(text) {
  const trimmed = text.trim()
  if (/^(s|start)\s+prof$/iu.test(trimmed)) {
    const slot = nextOccurrenceMoscow(1, 20, 30)
    if (!slot) return null
    return { ...slot, place: 'prof' }
  }
  // `s tr` как раньше, плюс опционально список команд: `s tr А Б` или `s tr Красные, Синие`
  if (/^(s|start)\s+tr\b/iu.test(trimmed)) {
    const slot = nextOccurrenceMoscow(5, 20, 0)
    if (!slot) return null
    const afterTr = trimmed.replace(/^(s|start)\s+tr\s*/iu, '').trim()
    const teamSlots = parseTeamSlotNames(afterTr)
    return { ...slot, place: 'tr', teamSlots }
  }
  return null
}

/** Тестовый матч: s test / start test — дата «сегодня» по локальному времени сервера, время и площадка фиксированы. */
export function parseTestStartCommand(text) {
  const trimmed = text.trim()
  if (!/^(s|start)\s+test$/iu.test(trimmed)) return null

  const d = new Date()
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = d.getFullYear()

  return {
    date: `${dd}.${mm}.${yyyy}`,
    time: '12:00',
    place: 'Тест',
  }
}

export function parseStartCommand(text) {
  const trimmed = text.trim()
  const match =
    /^(s|start)\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}:\d{2})\s+(.+)$/iu.exec(trimmed)
  if (!match) return null

  const [, , date, time, placeRaw] = match
  const place = placeRaw.trim()
  if (!place) return null

  const [dd, mm, yyyy] = date.split('.').map((v) => Number(v))
  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) return null
  if (yyyy < 2000 || yyyy > 2100) return null
  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null

  const [hh, min] = time.split(':').map((v) => Number(v))
  if (!Number.isInteger(hh) || !Number.isInteger(min)) return null
  if (hh < 0 || hh > 23) return null
  if (min < 0 || min > 59) return null

  return { date, time, place }
}
