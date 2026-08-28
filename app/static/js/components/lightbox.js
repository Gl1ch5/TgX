/**
 * ====================================================================
 * COMPONENT: FULLSCREEN LIGHTBOX GALLERY VIEWER
 * ====================================================================
 */

import { state } from '../state.js';

export function openLightboxSingle(src, postId) {
  const post = state.posts.find(p => p.id === postId);
  if (post && post.media_items && post.media_items.length > 0) {
    state.lightboxGallery = post.media_items.map(i => i.url);
    state.lightboxIndex = state.lightboxGallery.indexOf(src);
    if (state.lightboxIndex === -1) state.lightboxIndex = 0;
  } else {
    state.lightboxGallery = [src];
    state.lightboxIndex = 0;
  }
  updateLightboxView();
  document.getElementById('lightbox-modal').classList.remove('hidden');
}

export function openLightboxIndex(postId, idx) {
  const post = state.posts.find(p => p.id === postId);
  if (post && post.media_items) {
    state.lightboxGallery = post.media_items.map(i => i.url);
    state.lightboxIndex = idx;
    updateLightboxView();
    document.getElementById('lightbox-modal').classList.remove('hidden');
  }
}

export function updateLightboxView() {
  const curSrc = state.lightboxGallery[state.lightboxIndex] || '';
  document.getElementById('lightbox-img').src = curSrc;
  document.getElementById('lightbox-download-btn').href = curSrc;

  const count = state.lightboxGallery.length;
  const counter = document.getElementById('lightbox-counter');
  const prevBtn = document.getElementById('lightbox-prev-btn');
  const nextBtn = document.getElementById('lightbox-next-btn');

  if (count > 1) {
    counter.innerText = `${state.lightboxIndex + 1} / ${count}`;
    counter.classList.remove('hidden');
    prevBtn.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
  } else {
    counter.classList.add('hidden');
    prevBtn.classList.add('hidden');
    nextBtn.classList.add('hidden');
  }
}

export function prevLightboxImage(e) {
  if (e) e.stopPropagation();
  if (state.lightboxGallery.length <= 1) return;
  state.lightboxIndex = (state.lightboxIndex - 1 + state.lightboxGallery.length) % state.lightboxGallery.length;
  updateLightboxView();
}

export function nextLightboxImage(e) {
  if (e) e.stopPropagation();
  if (state.lightboxGallery.length <= 1) return;
  state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxGallery.length;
  updateLightboxView();
}

export function closeLightbox() {
  document.getElementById('lightbox-modal').classList.add('hidden');
}
