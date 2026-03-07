const api = {
    async sendPhone(phone) {
        const response = await fetch('/api/auth/sendCode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.phoneCodeHash;
    },

    async verifyCode(phone, code, phoneCodeHash) {
        const response = await fetch('/api/auth/verifyCode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code, phoneCodeHash })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data;
    },

    async verifyPassword(password) {
        const response = await fetch('/api/auth/verifyPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data;
    },

    async checkAuth() {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        return data;
    },

    async logout() {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        return response.ok;
    },

    async getFeed() {
        const response = await fetch('/api/feed');
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.posts;
    },

    async getComments(channelId, msgId) {
        const response = await fetch(`/api/comments?channelId=${channelId}&msgId=${msgId}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.comments;
    }
};
