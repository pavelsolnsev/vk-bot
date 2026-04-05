/** Поля users.get — только то, что показываем в ответе команды id */
const USER_FIELDS = "city,domain";

function formatCity(city) {
  if (!city || typeof city !== "object") return "—";
  if (city.title != null) {
    return city.id != null ? `${city.title} (id ${city.id})` : String(city.title);
  }
  return "—";
}

function formatShortLink(u) {
  const domain = u.domain != null && String(u.domain).trim() !== "" ? String(u.domain).trim() : null;
  if (domain) return `https://vk.com/${domain}`;
  return `https://vk.com/id${u.id}`;
}

/**
 * Команда «id» — краткие данные профиля из users.get.
 * @returns {Promise<boolean>}
 */
export async function tryShowMyVkAccount({ vk, context, senderId }) {
  if (typeof senderId !== "number" || senderId <= 0) {
    await context.send("Не удалось определить пользователя.");
    return true;
  }

  let users;
  try {
    users = await vk.api.users.get({
      user_ids: [senderId],
      fields: USER_FIELDS,
    });
  } catch (e) {
    try {
      users = await vk.api.users.get({ user_ids: [senderId] });
    } catch (e2) {
      await context.send(
        `Не удалось запросить профиль: ${e2?.message || e2}`,
      );
      return true;
    }
  }

  const u = users?.[0];
  if (!u) {
    await context.send("Пустой ответ users.get.");
    return true;
  }

  const lines = [
    `VK id: ${u.id}`,
    `Имя: ${u.first_name ?? "—"}`,
    `Фамилия: ${u.last_name ?? "—"}`,
    `Короткая ссылка: ${formatShortLink(u)}`,
    `Город: ${formatCity(u.city)}`,
  ];

  await context.send(lines.join("\n"));
  return true;
}
