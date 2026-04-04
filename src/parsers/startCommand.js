/** Тестовый матч: s test / start test — дата «сегодня» по локальному времени сервера, время и площадка фиксированы. */
export function parseTestStartCommand(text) {
  const trimmed = text.trim()
  if (!/^(s|start)\s+test$/iu.test(trimmed)) return null

  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
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
