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
  setPlayerTeamOnFootballSite,
  registerVkListLinkOnFootballSite,
  unregisterVkListLinkOnFootballSite,
  clearTournamentDataOnFootballSite,
  createSyntheticPlayerOnFootballSite,
  fetchFootballSiteRosterSnapshot,
  setPlayerPaidOnFootballSite,
  ackVkListCloseRequest,
  ackVkStartRequest,
} from './footballApi/vkSiteRequests.js'
