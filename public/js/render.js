// SVG Library mimicking Telegram Icons
const tgIcons = {
    verified: `<svg class="verified-icon" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.3 14.7L6 12l1.4-1.4 3.3 3.3L16.6 8 18 9.4l-7.3 7.3z"/></svg>`,
    like: `<svg class="reaction-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M2 10.5a5.5 5.5 0 0110.6-2.2l.4 1.1.4-1.1A5.5 5.5 0 0122 10.5c0 5-6 10-10 11.5-4-1.5-10-6.5-10-11.5z"/></svg>`,
    fire: `<svg class="reaction-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-4 4-4 9s2 5 2 5 2-1 2-1 2 4 4 2 2-3 2-6-4-6-4-9-4-0-4-0z"/></svg>`,
    mindblown: `<svg class="reaction-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="M12 16c-2 0-3.5-1-4-2h8c-.5 1-2 2-4 2z"/></svg>`,
    heart: `<svg class="reaction-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    comment: `<svg class="icon-stroke" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    repost: `<svg class="icon-stroke" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
    bookmark: `<svg class="icon-stroke" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    share: `<svg class="icon-stroke" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/></svg>`
};

// Helper function to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class RenderManager {
    constructor() {
        this.data = window.mockData || { posts: [], channels: [], comments: {} };
    }

    async renderFeed() {
        const container = document.getElementById('feed-container');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding: 20px;">Loading feed...</div>';

        try {
            const response = await fetch('/api/feed');
            if (!response.ok) {
                if (response.status === 401) {
                    if (window.AppRouter) window.AppRouter.navigate('login');
                    return;
                }
                throw new Error('Failed to load feed');
            }

            const data = await response.json();

            // Format incoming API data to match frontend structure
            if (data && data.posts && data.posts.length > 0) {
                this.data.posts = data.posts.map(p => ({
                    id: p.id,
                    channelId: p.channelId,
                    text: p.text,
                    timestamp: p.dateStr ? p.dateStr.split(', ')[1] : 'Now',
                    date: p.dateStr ? p.dateStr.split(', ')[0] : 'Today',
                    views: p.metrics.views >= 1000 ? (p.metrics.views / 1000).toFixed(1) + 'K' : p.metrics.views,
                    reactions: [
                        { type: 'like', count: p.metrics.likes, active: false },
                        { type: 'fire', count: p.metrics.fire, active: false }
                    ].filter(r => r.count > 0),
                    commentsCount: p.metrics.comments || 0,
                    sharesCount: p.metrics.reposts || 0,
                    media: p.media
                }));

                const uniqueChannels = {};
                data.posts.forEach(p => {
                    if (!uniqueChannels[p.channelId]) {
                        uniqueChannels[p.channelId] = {
                            id: p.channelId,
                            name: p.channelName,
                            username: p.author ? p.author.replace('@', '') : 'channel',
                            avatar: p.avatarUrl,
                            description: `Official channel of ${p.channelName}`,
                            subscribers: 'N/A'
                        };
                    }
                });
                this.data.channels = Object.values(uniqueChannels);
            }

            container.innerHTML = ''; // Clear existing

            if (!this.data.posts || this.data.posts.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-secondary);">No channels or posts found.</div>';
                return;
            }

            this.data.posts.forEach(post => {
                const channel = this.data.channels.find(c => c.id === post.channelId);
                const postEl = this.createPostCard(post, channel);
                container.appendChild(postEl);
            });

        } catch (error) {
            console.error('Feed load error:', error);
            // Fallback to mock data on error for prototype demonstration
            container.innerHTML = '';
            if (window.mockData && window.mockData.posts) {
                this.data = window.mockData;
                this.data.posts.forEach(post => {
                    const channel = this.data.channels.find(c => c.id === post.channelId);
                    const postEl = this.createPostCard(post, channel);
                    container.appendChild(postEl);
                });
            } else {
                container.innerHTML = '<div style="text-align:center; padding: 20px; color: #f4212e;">Error loading feed.</div>';
            }
        }
    }

    createPostCard(post, channel) {
        const el = document.createElement('div');
        el.className = 'post';
        el.setAttribute('data-post-id', post.id);

        let reactionsHTML = '';
        if (post.reactions && post.reactions.length > 0) {
            reactionsHTML = post.reactions.map(r => `
                <div class="reaction-pill ${r.active ? 'active' : ''}" data-reaction-type="${r.type}">
                    ${tgIcons[r.type] || tgIcons.like} <span>${r.count}</span>
                </div>
            `).join('');
        }

        let mediaHTML = '';
        if (post.media) {
            mediaHTML = `<img src="${post.media}" style="width:100%; border-radius:12px; margin-top:12px;" alt="Post media">`;
        }

        const safeChannelName = escapeHTML(channel?.name || 'Unknown Channel');
        const safePostText = escapeHTML(post.text);

        el.innerHTML = `
            <img src="${channel?.avatar || '/assets/reactions/default-avatar.svg'}" alt="${safeChannelName}" class="avatar" data-channel-id="${channel?.id}">
            <div class="post-content-wrap">
                <div class="post-header">
                    <div class="post-meta">
                        <span class="channel-name">${safeChannelName} ${tgIcons.verified}</span>
                        <span class="post-time">· ${post.timestamp}</span>
                    </div>
                </div>
                <div class="post-text">${safePostText}</div>
                ${mediaHTML}
                <div class="post-footer">
                    ${reactionsHTML}
                </div>
                <div class="action-bar">
                    <button class="action-btn">
                        ${tgIcons.comment} ${post.commentsCount || ''}
                    </button>
                    <button class="action-btn">
                        ${tgIcons.repost} ${post.sharesCount || ''}
                    </button>
                    <button class="action-btn">
                        <!-- Views eye -->
                        <svg class="icon-stroke" viewBox="0 0 24 24" style="stroke-width:1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        ${post.views || ''}
                    </button>
                    <button class="action-btn">
                        ${tgIcons.share}
                    </button>
                </div>
            </div>
        `;

        // Add reaction toggle listener (preventing bubbling to navigate)
        const pills = el.querySelectorAll('.reaction-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                pill.classList.toggle('active');
                // Normally we'd update state here
            });
        });

        return el;
    }

    renderPostDetail(postId) {
        // Handle id types
        const post = this.data.posts.find(p => p.id.toString() === postId.toString());
        if (!post) return;

        const channel = this.data.channels.find(c => c.id === post.channelId);
        if (!channel) return;

        const container = document.getElementById('post-detail-container');
        if (container) {
            container.innerHTML = '';

            let mediaHTML = '';
            if (post.media) {
                mediaHTML = `<img src="${post.media}" style="width:100%; border-radius:12px; margin-top:12px;" alt="Post media">`;
            }

            const safeChannelName = escapeHTML(channel.name);
            const safeUsername = escapeHTML(channel.username);
            const safePostText = escapeHTML(post.text);

            const postHtml = `
                <div style="padding: 16px;">
                    <div style="display:flex; gap:12px; margin-bottom:12px;">
                        <img src="${channel.avatar}" alt="" class="avatar" data-channel-id="${channel.id}">
                        <div>
                            <div class="channel-name">${safeChannelName} ${tgIcons.verified}</div>
                            <div class="post-time">@${safeUsername}</div>
                        </div>
                    </div>
                    <div class="post-text" style="font-size:16px;">${safePostText}</div>
                    ${mediaHTML}
                    <div class="post-time" style="margin-top:12px;">${post.timestamp} · ${post.date} · <strong>${post.views || '1M'}</strong> Просмотры</div>
                </div>
            `;
            container.innerHTML = postHtml;
        }

        // Fill stats
        const likesCountEl = document.getElementById('stats-likes');
        if (likesCountEl && post.reactions) {
            likesCountEl.innerText = post.reactions.reduce((sum, r) => sum + r.count, 0).toLocaleString();
        }

        // Fill actions
        const actionContainer = document.getElementById('detail-actions');
        if (actionContainer) {
            actionContainer.innerHTML = `
                <button class="action-btn">${tgIcons.comment}</button>
                <button class="action-btn">${tgIcons.repost}</button>
                <button class="action-btn">${tgIcons.heart}</button>
                <button class="action-btn">${tgIcons.bookmark}</button>
                <button class="action-btn">${tgIcons.share}</button>
            `;
        }

        // Render Comments mimicking Telegram replies
        this.renderComments(postId);
    }

    renderComments(postId) {
        const commentsList = this.data.comments[postId] || [];
        const container = document.getElementById('comments-container');
        if (!container) return;

        container.innerHTML = '';

        if (commentsList.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">Нет ответов</div>';
            return;
        }

        commentsList.forEach(comment => {
            const commentEl = document.createElement('div');
            commentEl.className = 'comment';

            const safeCommentName = escapeHTML(comment.name);
            const safeCommentUser = escapeHTML(comment.username);
            const safeCommentText = escapeHTML(comment.text);
            const replyToUser = escapeHTML(this.data.channels.find(c => c.id === this.data.posts.find(p=>p.id.toString()===postId.toString())?.channelId)?.username || 'user');

            // Replicating the screenshot's nested comment look
            commentEl.innerHTML = `
                <div class="comment-thread-line"></div>
                <img src="${comment.avatar}" alt="${safeCommentName}" class="avatar">
                <div style="flex-grow:1; min-width:0;">
                    <div class="comment-header">
                        <span class="comment-name">${safeCommentName} ${comment.verified ? tgIcons.verified : ''}</span>
                        <span class="comment-username">@${safeCommentUser} · ${comment.timestamp}</span>
                    </div>
                    <div class="reply-context">
                        В ответ <a href="#">@${replyToUser}</a>
                    </div>
                    <div class="comment-text">${safeCommentText}</div>
                    <div class="comment-actions">
                        <button class="action-btn">${tgIcons.comment} ${comment.repliesCount || ''}</button>
                        <button class="action-btn">${tgIcons.repost} ${comment.sharesCount || ''}</button>
                        <button class="action-btn">${tgIcons.like} ${comment.reactions ? comment.reactions[0]?.count : ''}</button>
                        <button class="action-btn">
                            <svg class="icon-stroke" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ${comment.views || ''}
                        </button>
                        <button class="action-btn">${tgIcons.share}</button>
                    </div>
                </div>
            `;
            container.appendChild(commentEl);
        });
    }

    renderProfile(channelId) {
        const channel = this.data.channels.find(c => c.id.toString() === channelId.toString());
        if (!channel) return;

        const nameEl = document.getElementById('profile-name');
        if (nameEl) nameEl.innerHTML = `${escapeHTML(channel.name)} ${tgIcons.verified}`;

        const usernameEl = document.getElementById('profile-username');
        if (usernameEl) usernameEl.innerText = `@${escapeHTML(channel.username)}`;

        const bioEl = document.getElementById('profile-bio');
        if (bioEl) bioEl.innerText = escapeHTML(channel.description);

        const subsEl = document.getElementById('profile-subscribers');
        if (subsEl) subsEl.innerText = escapeHTML(channel.subscribers);

        const avatar = document.getElementById('profile-avatar');
        if (avatar) avatar.src = channel.avatar;

        // Render feed for profile
        const profileFeed = document.getElementById('profile-feed');
        if (profileFeed) {
            profileFeed.innerHTML = '';
            const channelPosts = this.data.posts.filter(p => p.channelId.toString() === channelId.toString());
            channelPosts.forEach(post => {
                const postEl = this.createPostCard(post, channel);
                profileFeed.appendChild(postEl);
            });
            if (channelPosts.length === 0) {
                 profileFeed.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">Здесь пока ничего нет.</div>';
            }
        }
    }
}

// Global instance
window.RenderManager = new RenderManager();