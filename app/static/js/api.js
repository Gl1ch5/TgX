/**
 * ====================================================================
 * API LAYER — talks to Telegram directly from the browser (GramJS).
 * Keeps the response shapes of the former REST backend.
 * ====================================================================
 */

import { telegram } from './telegram.js';

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('[TeleX]', e);
    return telegram.authError(e);
  }
}

export const api = {
  // Auth
  async getAuthStatus() {
    const isAuth = await telegram.isAuthorized();
    const user = isAuth ? (await telegram.getMe().catch(() => null)) || telegram.cachedMe() : null;
    return { is_authorized: isAuth, user };
  },

  startQR(onQR) {
    return safe(() => telegram.startQrLogin(onQR));
  },

  cancelQR() {
    telegram.cancelQrLogin();
  },

  requestCode(phone) {
    return safe(() => telegram.requestPhoneCode(phone));
  },

  signInCode(code) {
    return safe(() => telegram.signInWithCode(code));
  },

  signInPassword(password) {
    return safe(() => telegram.signInWithPassword(password));
  },

  clearCache() {
    return telegram.clearCaches();
  },

  logout() {
    return safe(() => telegram.logout());
  },

  warmUp() {
    telegram.warmUp();
  },

  cachedUser() {
    return telegram.hasSession() ? telegram.cachedMe() : null;
  },

  // Channels & Feed
  async getChannels(refresh = false) {
    return { channels: await telegram.getChannels(refresh) };
  },

  getFeed(params = {}) {
    return telegram.getFeed(params);
  },

  // Comments
  getComments(channelId, msgId, opts = {}) {
    return telegram.getComments(channelId, msgId, opts);
  },

  sendComment(channelId, msgId, text, replyToId = null) {
    return safe(() => telegram.sendComment(channelId, msgId, text, replyToId));
  },

  // Profile & sessions
  getFullMe() {
    return telegram.getFullMe();
  },

  getSessions() {
    return telegram.getAuthorizations();
  },

  terminateSession(hash) {
    return safe(() => telegram.resetAuthorization(hash));
  },

  // Reactions & Actions
  sendReaction(channelId, msgId, emoji, customId = null) {
    return safe(() => telegram.sendReaction(channelId, msgId, emoji, customId));
  },

  getCustomEmoji(ids) {
    return telegram.getCustomEmoji(ids);
  },

  markSeen(channelId, msgId) {
    telegram.markSeen(channelId, msgId);
  },

  startLive(handlers) {
    return telegram.startLive(handlers).catch((e) => console.warn('[TeleX] live', e));
  },

  onReadChange(fn) {
    telegram.onReadChange = fn;
  },

  forwardToSaved(channelId, msgId) {
    return safe(() => telegram.forwardToSaved(channelId, msgId));
  },

  async toggleFavorite(postId, post = null) {
    return { post_id: postId, is_favorite: telegram.toggleFavorite(postId, post) };
  },
};
