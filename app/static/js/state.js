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
  feedType: 'all',
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
};
