// Локации и их блоки, по аналогии с telegram-bot/utils/sendPlayerList.js
export const eventListLocations = {
  kz: {
    name: 'Красное Знамя',
    address: 'Московская область, г. Раменское, ул. Воровского, д.4A (Красное Знамя)',
    link: 'https://yandex.ru/maps/-/CLuPMJ3L',
    route: 'https://yandex.ru/maps/?mode=routes&rtext=~55.574202,38.205299&rtt=auto',
    sum: 500,
    limit: 20,
    blocks: ['date', 'location', 'payment', 'instructions', 'players', 'queue', 'summary'],
  },

  prof: {
    name: 'Профилакторий',
    address: 'Московская область, г. Раменское, ул. Махова, д.18. (Профилакторий)',
    link: 'https://yandex.ru/maps/-/CHfBZ-mH',
    route: 'https://yandex.ru/maps/?mode=routes&rtext=~55.578414,38.219605&rtt=auto',
    sum: 500,
    limit: 20,
    blocks: ['date', 'location', 'payment', 'instructions', 'players', 'queue', 'summary'],
  },

  saturn: {
    name: 'Сатурн',
    address:
      'Московская область, г. Раменское, ул. Народное Имение, 6А (Стадион Сатурн - спорт зал)',
    link: 'https://yandex.ru/maps/-/CLBZ4H~9',
    route: 'https://yandex.ru/maps/?mode=routes&rtext=~55.578216,38.226238&rtt=auto',
    sum: 600,
    limit: 10,
    blocks: ['date', 'location', 'payment', 'instructions', 'players', 'queue', 'summary'],
  },

  tr: {
    name: 'Турнир',
    address: 'Московская область, г. Раменское, ул. Воровского, д.4A (Красное Знамя)',
    link: 'https://yandex.ru/maps/-/CLuPMJ3L',
    route: 'https://yandex.ru/maps/?mode=routes&rtext=~55.574202,38.205299&rtt=auto',
    limit: 20,
    extraInfo: [
      'Запись: только для участников турнира.',
      'Формат: в 3 круга каждый с каждым.',
      'Время: 2 часа.',
    ],
    blocks: ['date', 'tournamentTitle', 'location', 'extra', 'instructions', 'players', 'queue', 'summary'],
  },
}
