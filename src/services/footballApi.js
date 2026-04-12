// Сервис для связи с football-сайтом.
// Вызывается когда пользователь нажимает «Играть» или «Выйти» — регистрирует или убирает его из проекта.

export { initializeFootballSiteMode, isFootballSiteEnabled } from './footballApi/siteMode.js'
export { invalidateRatingsCacheForVkUserIds, fetchVkRatingsOnFootballSite } from './footballApi/ratings.js'
export {
  registerPlayerOnFootballSite,
  removePlayerFromFootballSite,
  registerVkListLinkOnFootballSite,
  unregisterVkListLinkOnFootballSite,
  createSyntheticPlayerOnFootballSite,
  fetchFootballSiteRosterSnapshot,
  ackVkListCloseRequest,
} from './footballApi/vkSiteRequests.js'
