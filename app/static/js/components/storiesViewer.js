/**
 * ====================================================================
 * COMPONENT: TELEGRAM STORIES VIEWER (Native Telegram Experience)
 * ====================================================================
 */

import { state } from '../state.js';
import { formatTgTime, escapeQuotes } from '../utils.js';
import { renderEmoji, parseEmojis } from '../emoji.js';
import { VERIFIED_BADGE_SVG } from './postCard.js';

let activeStoryChannel = null;
let activeStoryIndex = 0;
let storyTimer = null;
let isPaused = false;

export function openStoryViewer(channelId) {
  const ch = state.channels.find(c => c.id === channelId);
  if (!ch) return;

  // Get posts from this channel with media as stories
  const channelPosts = state.posts.filter(p => p.channel_id === channelId && p.media_items && p.media_items.length > 0);
  const stories = channelPosts.length > 0 ? channelPosts : [
    {
      id: `story-${channelId}`,
      channel_id: channelId,
      channel: ch,
      date: new Date().toISOString(),
      text: ch.title || 'История канала',
      media_items: [{ type: 'photo', url: ch.avatar || '' }]
    }
  ];

  activeStoryChannel = {
    ...ch,
    stories: stories
  };
  activeStoryIndex = 0;

  const modal = document.getElementById('story-viewer-modal');
  if (modal) {
    modal.classList.remove('hidden');
    renderStoryView();
  }
}

export function closeStoryViewer() {
  if (storyTimer) clearInterval(storyTimer);
  const modal = document.getElementById('story-viewer-modal');
  if (modal) modal.classList.add('hidden');
  activeStoryChannel = null;
}

export function renderStoryView() {
  if (!activeStoryChannel || !activeStoryChannel.stories) return;
  const stories = activeStoryChannel.stories;
  const currentStory = stories[activeStoryIndex] || stories[0];
  const count = stories.length;

  const progressBarsContainer = document.getElementById('story-progress-bars');
  if (progressBarsContainer) {
    progressBarsContainer.innerHTML = stories.map((_, idx) => `
      <div class="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
        <div class="h-full bg-white transition-all ${idx < activeStoryIndex ? 'w-full' : (idx === activeStoryIndex ? 'w-0 story-progress-active' : 'w-0')}" id="story-prog-${idx}"></div>
      </div>
    `).join('');
  }

  // Header
  const avatarEl = document.getElementById('story-channel-avatar');
  const titleEl = document.getElementById('story-channel-title');
  const timeEl = document.getElementById('story-time');
  const badgeEl = document.getElementById('story-verified-badge');

  if (avatarEl) avatarEl.src = activeStoryChannel.avatar || '';
  if (titleEl) titleEl.innerHTML = parseEmojis(activeStoryChannel.title || 'Канал');
  if (timeEl) timeEl.innerText = formatTgTime(currentStory.date);
  if (badgeEl) badgeEl.innerHTML = activeStoryChannel.verified ? VERIFIED_BADGE_SVG : '';

  // Media
  const mediaContainer = document.getElementById('story-media-box');
  const captionEl = document.getElementById('story-caption');

  if (mediaContainer) {
    const item = currentStory.media_items && currentStory.media_items[0] ? currentStory.media_items[0] : null;
    if (item && item.type === 'video') {
      mediaContainer.innerHTML = `<video src="${item.url}" autoplay loop playsinline class="w-full h-full object-contain rounded-2xl"></video>`;
    } else if (item && item.url) {
      mediaContainer.innerHTML = `<img src="${item.url}" class="w-full h-full object-contain rounded-2xl" />`;
    } else {
      mediaContainer.innerHTML = `
        <div class="w-full h-full flex items-center justify-center p-6 text-center text-white bg-gradient-to-tr from-[#3390ec]/40 to-purple-600/40 rounded-2xl">
          <p class="text-base font-medium">${parseEmojis(currentStory.text || activeStoryChannel.title)}</p>
        </div>
      `;
    }
  }

  if (captionEl) {
    captionEl.innerHTML = currentStory.text ? parseEmojis(currentStory.text) : '';
  }

  // Start progress timer
  startStoryTimer();
}

function startStoryTimer() {
  if (storyTimer) clearInterval(storyTimer);
  let progress = 0;
  const duration = 5000; // 5 seconds per story
  const interval = 50;
  const activeProg = document.getElementById(`story-prog-${activeStoryIndex}`);

  storyTimer = setInterval(() => {
    if (isPaused) return;
    progress += interval;
    const percent = Math.min(100, (progress / duration) * 100);
    if (activeProg) activeProg.style.width = `${percent}%`;

    if (progress >= duration) {
      nextStory();
    }
  }, interval);
}

export function nextStory() {
  if (!activeStoryChannel || !activeStoryChannel.stories) return;
  if (activeStoryIndex < activeStoryChannel.stories.length - 1) {
    activeStoryIndex++;
    renderStoryView();
  } else {
    // Check if next channel with stories exists
    const currentIndex = state.channels.findIndex(c => c.id === activeStoryChannel.id);
    if (currentIndex !== -1 && currentIndex < state.channels.length - 1) {
      openStoryViewer(state.channels[currentIndex + 1].id);
    } else {
      closeStoryViewer();
    }
  }
}

export function prevStory() {
  if (!activeStoryChannel || !activeStoryChannel.stories) return;
  if (activeStoryIndex > 0) {
    activeStoryIndex--;
    renderStoryView();
  } else {
    const currentIndex = state.channels.findIndex(c => c.id === activeStoryChannel.id);
    if (currentIndex > 0) {
      openStoryViewer(state.channels[currentIndex - 1].id);
    }
  }
}

export function pauseStory(paused = true) {
  isPaused = paused;
}
