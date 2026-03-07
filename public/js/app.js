const app = {
    state: {
        phone: '',
        phoneCodeHash: '',
        feedPosts: []
    },

    elements: {
        views: {
            auth: document.getElementById('auth-view'),
            main: document.getElementById('main-view'),
            thread: document.getElementById('thread-view')
        },
        auth: {
            steps: {
                1: document.getElementById('auth-step-1'),
                2: document.getElementById('auth-step-2'),
                3: document.getElementById('auth-step-3')
            },
            phoneInput: document.getElementById('phone-input'),
            codeInput: document.getElementById('code-input'),
            passwordInput: document.getElementById('password-input'),
            sendCodeBtn: document.getElementById('send-code-btn'),
            verifyCodeBtn: document.getElementById('verify-code-btn'),
            verifyPasswordBtn: document.getElementById('verify-password-btn'),
            error: document.getElementById('auth-error')
        },
        feedContainer: document.getElementById('feed-container'),
        threadPost: document.getElementById('thread-post'),
        commentsContainer: document.getElementById('comments-container'),
        logoutBtn: document.getElementById('logout-btn')
    },

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    },

    bindEvents() {
        this.elements.auth.sendCodeBtn.addEventListener('click', () => this.handleSendCode());
        this.elements.auth.verifyCodeBtn.addEventListener('click', () => this.handleVerifyCode());
        this.elements.auth.verifyPasswordBtn.addEventListener('click', () => this.handleVerifyPassword());
        this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());

        // Allow Enter key to trigger buttons
        this.elements.auth.phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendCode();
        });
        this.elements.auth.codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleVerifyCode();
        });
        this.elements.auth.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleVerifyPassword();
        });
    },

    showError(msg) {
        this.elements.auth.error.textContent = msg;
    },

    showView(viewName) {
        Object.values(this.elements.views).forEach(v => v.classList.remove('active'));
        Object.values(this.elements.views).forEach(v => v.classList.add('hidden'));

        this.elements.views[viewName].classList.remove('hidden');
        this.elements.views[viewName].classList.add('active');

        // Ensure scroll to top
        window.scrollTo(0, 0);
    },

    showAuthStep(step) {
        Object.values(this.elements.auth.steps).forEach(s => s.classList.remove('active'));
        Object.values(this.elements.auth.steps).forEach(s => s.classList.add('hidden'));
        this.elements.auth.steps[step].classList.remove('hidden');
        this.elements.auth.steps[step].classList.add('active');
        this.showError('');
    },

    async checkAuthStatus() {
        try {
            const isAuth = await api.checkAuth();
            if (isAuth) {
                this.showView('main');
                this.loadFeed();
            } else {
                this.showView('auth');
                this.showAuthStep(1);
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showView('auth');
        }
    },

    async handleSendCode() {
        this.state.phone = this.elements.auth.phoneInput.value.trim();
        if (!this.state.phone) return this.showError('Phone number required');

        this.elements.auth.sendCodeBtn.disabled = true;
        this.showError('');

        try {
            this.state.phoneCodeHash = await api.sendPhone(this.state.phone);
            this.showAuthStep(2);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.elements.auth.sendCodeBtn.disabled = false;
        }
    },

    async handleVerifyCode() {
        const code = this.elements.auth.codeInput.value.trim();
        if (!code) return this.showError('Code required');

        this.elements.auth.verifyCodeBtn.disabled = true;
        this.showError('');

        try {
            const res = await api.verifyCode(this.state.phone, code, this.state.phoneCodeHash);
            if (res.needsPassword) {
                this.showAuthStep(3);
            } else {
                this.showView('main');
                this.loadFeed();
            }
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.elements.auth.verifyCodeBtn.disabled = false;
        }
    },

    async handleVerifyPassword() {
        const password = this.elements.auth.passwordInput.value.trim();
        if (!password) return this.showError('Password required');

        this.elements.auth.verifyPasswordBtn.disabled = true;
        this.showError('');

        try {
            await api.verifyPassword(password);
            this.showView('main');
            this.loadFeed();
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.elements.auth.verifyPasswordBtn.disabled = false;
        }
    },

    async handleLogout() {
        try {
            await api.logout();
            this.showView('auth');
            this.showAuthStep(1);
        } catch (error) {
            console.error('Logout failed:', error);
        }
    },

    async loadFeed() {
        this.elements.feedContainer.innerHTML = '<div class="loading-spinner"></div>';
        try {
            this.state.feedPosts = await api.getFeed();
            this.elements.feedContainer.innerHTML = render.feed(this.state.feedPosts);
        } catch (error) {
            this.elements.feedContainer.innerHTML = `<div class="error-text">Failed to load feed: ${error.message}</div>`;
        }
    },

    showMainView() {
        this.showView('main');
    },

    openThread(channelId, msgId) {
        this.showView('thread');
        this.elements.threadPost.innerHTML = '<div class="loading-spinner"></div>';
        this.elements.commentsContainer.innerHTML = '<div class="loading-spinner"></div>';

        // Find main post from state
        const post = this.state.feedPosts.find(p => p.id == msgId && p.channel.id == channelId);
        if (post) {
            this.elements.threadPost.innerHTML = render.post(post, true); // true = isThread view
        } else {
            this.elements.threadPost.innerHTML = '<div class="error-text">Post not found</div>';
        }

        this.loadComments(channelId, msgId);
    },

    async loadComments(channelId, msgId) {
        try {
            const comments = await api.getComments(channelId, msgId);
            this.elements.commentsContainer.innerHTML = render.comments(comments);
        } catch (error) {
            this.elements.commentsContainer.innerHTML = `<div class="error-text">Failed to load comments: ${error.message}</div>`;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
