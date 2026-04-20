// Сервис для связи с football-сайтом.
// Вызывается когда пользователь нажимает «Играть» или «Выйти» — регистрирует или убирает его из проекта.

export { initializeFootballSiteMode, isFootballSiteEnabled } from './footballApi/siteMode.js'
export {
  invalidateRatingsCacheForVkUserIds,
  fetchVkRatingsOnFootballSite,
  fetchVkPlayerProfileOnFootballSite,
} from './footballApi/ratings.js'
export {
  registerPlayerOnFootballSite,
  removePlayerFromFootballSite,
  registerVkListLinkOnFootballSite,
  unregisterVkListLinkOnFootballSite,
  createSyntheticPlayerOnFootballSite,
  fetchFootballSiteRosterSnapshot,
  ackVkListCloseRequest,
  ackVkStartRequest,
} from './footballApi/vkSiteRequests.js'
