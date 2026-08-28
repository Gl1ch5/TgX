/**
 * ====================================================================
 * API CLIENT LAYER (Fast Requests & Caching)
 * ====================================================================
 */

export const api = {
  // Auth
  async getAuthStatus() {
    const res = await fetch('/api/auth/status');
    return await res.json();
  },

  async startQR() {
    const res = await fetch('/api/auth/qr/start', { method: 'POST' });
    return await res.json();
  },

  async checkQR() {
    const res = await fetch('/api/auth/qr/check');
    return await res.json();
  },

  async requestCode(phone) {
    const res = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    return await res.json();
  },

  async signInCode(code, password = null) {
    const res = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password }),
    });
    return await res.json();
  },

  async signInPassword(password) {
    const res = await fetch('/api/auth/sign-in-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return await res.json();
  },

  async logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return await res.json();
  },

  // Channels & Feed
  async getChannels(refresh = false) {
    const res = await fetch(`/api/channels?limit=60${refresh ? '&refresh=true' : ''}`);
    return await res.json();
  },

  async getFeed({ feedType = 'all', channelId = null, searchQuery = '', offsetDate = null, limit = 40, refresh = false } = {}) {
    let url = `/api/feed?feed_type=${feedType}&limit=${limit}`;
    if (channelId) url += `&channel_id=${channelId}`;
    if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
    if (offsetDate) url += `&offset_date=${offsetDate}`;
    if (refresh) url += `&refresh=true`;

    const res = await fetch(url);
    return await res.json();
  },

  // Comments
  async getComments(channelId, msgId, refresh = false) {
    const res = await fetch(`/api/post/comments?channel_id=${channelId}&msg_id=${msgId}${refresh ? '&refresh=true' : ''}`);
    return await res.json();
  },

  async sendComment(channelId, msgId, text) {
    const res = await fetch('/api/post/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, msg_id: msgId, text }),
    });
    return await res.json();
  },

  // Reactions & Actions
  async sendReaction(channelId, msgId, emoji) {
    const res = await fetch('/api/post/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, msg_id: msgId, emoji }),
    });
    return await res.json();
  },

  async forwardToSaved(channelId, msgId) {
    const res = await fetch('/api/post/forward-saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, msg_id: msgId }),
    });
    return await res.json();
  },

  async toggleFavorite(postId) {
    const res = await fetch('/api/post/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    });
    return await res.json();
  },
};
