/**
 * ====================================================================
 * GLOBAL APPLICATION STATE & CONSTANTS
 * ====================================================================
 */

import { EMOJI_PICKER_LIST } from './emoji.js';
export { EMOJI_PICKER_LIST };

export const state = {
  isAuth: false,
  user: null,
  channels: [],
  posts: [],
  // the feed tab you were on last time (All / Media / Popular / Favorites)
  feedType: (() => { try { const v = localStorage.getItem('tx.feedTab'); return ['all', 'media', 'popular', 'favorites'].includes(v) ? v : 'all'; } catch { return 'all'; } })(),
  activeChannelId: null,
  searchQuery: '',
  qrCheckInterval: null,
  isLoadingFeed: false,
  hasMore: true,
  nextOffset: null,
  activeReactionPostId: null,
  lightboxGallery: [],
  lightboxIndex: 0,
  openCommentsMap: {},
  cachedComments: {},
  stories: [],
};
