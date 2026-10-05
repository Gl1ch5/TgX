/**
 * ====================================================================
 * API LAYER — talks to Telegram directly from the browser (GramJS).
 * Keeps the response shapes of the former REST backend.
 * ====================================================================
 */

import { telegram } from './tg.js';

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

  requestCode(phone, forceSms = false) {
    return safe(() => telegram.requestPhoneCode(phone, forceSms));
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

  ensureAlive() {
    return telegram.ensureAlive().catch(() => false);
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
  cachedComments(channelId, msgId) {
    return telegram.cachedComments(channelId, msgId);
  },

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

  // Developer tools
  exportSession() {
    return telegram.exportSession();
  },

  importSession(value) {
    return telegram.importSession(value);
  },

  ping() {
    return telegram.ping();
  },

  connectionInfo() {
    return telegram.connectionInfo();
  },

  setVerbose(on) {
    telegram.setVerbose(on);
  },

  // Own profile
  updateProfile(fields) {
    return safe(async () => ({ status: 'success', user: await telegram.updateProfile(fields) }));
  },

  setProfilePhoto(file) {
    return safe(async () => ({ status: 'success', user: await telegram.setProfilePhoto(file) }));
  },

  getMyStories() {
    return telegram.getMyStories();
  },

  // Channel page
  getChannelFull(channelId) {
    return telegram.getChannelFull(channelId);
  },

  setChannelMuted(channelId, mute) {
    return safe(async () => ({ status: 'success', muted: await telegram.setChannelMuted(channelId, mute) }));
  },

  leaveChannel(channelId) {
    return safe(async () => {
      await telegram.leaveChannel(channelId);
      return { status: 'success' };
    });
  },

  getChannelMedia(channelId, offsetId) {
    return telegram.getChannelMedia(channelId, offsetId);
  },

  getChannelStories(channelId) {
    return telegram.getChannelStories(channelId);
  },

  // Stories
  getStories() {
    return telegram.getStories();
  },

  getStoriesById(key, ids) {
    return telegram.getStoriesById(key, ids);
  },

  likeStory(key, id, like) {
    return telegram.likeStory(key, id, like);
  },

  readStories(key, maxId) {
    return telegram.readStories(key, maxId).catch((e) => console.warn('[TeleX] read stories', e));
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
