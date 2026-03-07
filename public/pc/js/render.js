const render = {
    // Escape HTML to prevent XSS
    escapeHtml(text) {
        if (!text) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    },

    // Convert Telegram markdown entities to HTML
    formatText(text, entities) {
        if (!text) return '';
        let html = this.escapeHtml(text);
        // Simple entity replacement (linkification is basic here for UI)
        html = html.replace(/\n/g, '<br>');
        return html;
    },

    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' +
               date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    },

    formatCount(count) {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return count.toString();
    },

    // Get Avatar HTML (Image or Placeholder)
    getAvatarHtml(channel) {
        if (channel.avatarUrl) {
            return `<img src="${this.escapeHtml(channel.avatarUrl)}" alt="${this.escapeHtml(channel.channelName)}">`;
        }
        const initial = channel.channelName ? channel.channelName.charAt(0).toUpperCase() : '?';
        const bgColors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
        const color = bgColors[(channel.id || 0) % bgColors.length];
        return `<div class="avatar-placeholder" style="background-color: ${color};">${this.escapeHtml(initial)}</div>`;
    },

    // Get Media HTML
    getMediaHtml(media) {
        if (!media) return '';
        if (media.type === 'photo' && media.url) {
            return `
            <div class="post-media">
                <img src="${this.escapeHtml(media.url)}" alt="Post media">
            </div>`;
        }
        return '';
    },

    // Get Reactions HTML (Telegram UI styling)
    getReactionsHtml(reactions) {
        if (!reactions || !reactions.results || reactions.results.length === 0) return '';
        let html = '<div class="tg-reactions">';
        for (const reaction of reactions.results) {
            let emoji = reaction.reaction;
            if (typeof emoji !== 'string') {
                if (emoji.emoticon) emoji = emoji.emoticon;
                else emoji = '👍'; // fallback
            }
            html += `
            <div class="tg-reaction">
                <span class="tg-reaction-emoji">${this.escapeHtml(emoji)}</span>
                <span class="tg-reaction-count">${this.formatCount(reaction.count)}</span>
            </div>`;
        }
        html += '</div>';
        return html;
    },

    // Render a single post item (X Grid structure, Telegram UI details)
    post(post, isThread = false) {
        const avatar = this.getAvatarHtml(post);
        const media = post.media ? `<div class="post-media"><img src="${this.escapeHtml(post.media)}" alt="Media"></div>` : "";
        let reactions = '';
        if (post.reactions && post.reactions.length > 0) {
            reactions = '<div class="tg-reactions">';
            for (const r of post.reactions) {
                reactions += `<div class="tg-reaction"><span class="tg-reaction-emoji">${this.escapeHtml(r.emoji)}</span><span class="tg-reaction-count">${this.formatCount(r.count)}</span></div>`;
            }
            reactions += '</div>';
        }
        const text = this.formatText(post.text, post.entities);

        // Use generic icons for X actions
        const commentIcon = `<svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></svg>`;
        const repostIcon = `<svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></svg>`;
        const likeIcon = `<svg viewBox="0 0 24 24"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>`;
        const viewIcon = `<svg viewBox="0 0 24 24"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path></svg>`;

        const onclickAttr = !isThread ? `onclick="app.openThread('${post.channelId}', '${post.id}')"` : '';

        return `
        <article class="post" ${onclickAttr} data-id="${post.id}">
            <div class="post-avatar">${avatar}</div>
            <div class="post-content-area">
                <div class="post-header">
                    <span class="post-author">${this.escapeHtml(post.channelName)}</span>
                    <span class="post-meta">· ${this.formatDate(post.date)}</span>
                </div>
                <div class="post-text">${text}</div>
                ${media}
                ${reactions}
                <div class="post-actions">
                    <button class="action-btn comment">
                        ${commentIcon}
                        <span>${this.formatCount(post.metrics?.comments || 0)}</span>
                    </button>
                    <button class="action-btn repost">
                        ${repostIcon}
                        <span>${this.formatCount(post.metrics?.reposts || 0)}</span>
                    </button>
                    <button class="action-btn like">
                        ${likeIcon}
                        <span></span>
                    </button>
                    <button class="action-btn view">
                        ${viewIcon}
                        <span>${this.formatCount(post.metrics?.views || 0)}</span>
                    </button>
                </div>
            </div>
        </article>
        `;
    },

    feed(posts) {
        if (!posts || posts.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: var(--x-text-secondary);">No posts found. Make sure you are subscribed to channels.</div>';
        }
        return posts.map(p => this.post(p)).join('');
    },

    comment(comment) {
        const avatar = this.getAvatarHtml({channelName: comment.author.title, avatarUrl: null});
        const text = this.formatText(comment.text, comment.entities);
        return `
        <article class="post" data-id="${comment.id}">
            <div class="post-avatar">${avatar}</div>
            <div class="post-content-area">
                <div class="post-header">
                    <span class="post-author">${this.escapeHtml(comment.author.title)}</span>
                    <span class="post-meta">· ${this.formatDate(comment.date)}</span>
                </div>
                <div class="post-text">${text}</div>
            </div>
        </article>
        `;
    },

    comments(comments) {
        if (!comments || comments.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: var(--x-text-secondary);">No comments yet.</div>';
        }
        return comments.map(c => this.comment(c)).join('');
    }
};
