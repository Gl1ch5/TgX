// Main Application Logic & Router

const appState = {
    currentView: 'login', // 'login', 'feed', 'post-detail', 'profile'
    activePostId: null,
    activeProfileId: null,
    isAuthenticated: false,
    phoneData: {}, // Store phoneCodeHash during login flow
    isDesktop: window.innerWidth > 768
};

// Listen to resize to update layout (simple implementation, reload is better for structural changes)
window.addEventListener('resize', () => {
    const newIsDesktop = window.innerWidth > 768;
    if (newIsDesktop !== appState.isDesktop) {
        appState.isDesktop = newIsDesktop;
        window.location.reload(); // Reload to fetch correct templates
    }
});

class Router {
    constructor() {
        this.mainContent = document.getElementById('app');
        this.views = {};
        this.init();
    }

    async init() {
        appState.isAuthenticated = document.cookie.includes('authenticated=true');

        // Load specific CSS
        const head = document.head;
        const cssFolder = appState.isDesktop ? 'desktop' : 'mobile';

        const loadCSS = (href) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            head.appendChild(link);
        };

        if (appState.isDesktop) {
            loadCSS('/css/desktop/feed.css');
            // Desktop login uses mobile login styles for simplicity right now
            loadCSS('/css/mobile/login.css');
        } else {
            loadCSS('/css/mobile/main.css');
            loadCSS('/css/mobile/feed.css');
            loadCSS('/css/mobile/post-detail.css');
            loadCSS('/css/mobile/profile.css');
            loadCSS('/css/mobile/login.css');
        }

        // Load HTML templates into the DOM
        await this.loadView('login', '/html/mobile/login.html'); // Shared login

        if (appState.isDesktop) {
            await this.loadView('feed', '/html/desktop/feed.html');
        } else {
            await this.loadView('feed', '/html/mobile/feed.html');
            await this.loadView('post-detail', '/html/mobile/post-detail.html');
            await this.loadView('profile', '/html/mobile/profile.html');
        }

        this.setupEventListeners();

        if (appState.isAuthenticated) {
            this.navigate('feed');
        } else {
            this.navigate('login');
        }
    }

    async loadView(id, url) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            const viewElement = tempDiv.firstElementChild;
            if (viewElement) {
                this.mainContent.appendChild(viewElement);
                this.views[id] = viewElement;

                viewElement.classList.add('hidden');
                viewElement.style.display = 'none';
                if (!viewElement.id) viewElement.id = `${id}-view`;
            }
        } catch (error) {
            console.error(`Failed to load view ${id}:`, error);
        }
    }

    navigate(viewId, param = null) {
        if (!appState.isAuthenticated && viewId !== 'login') {
            viewId = 'login';
        }

        Object.values(this.views).forEach(view => {
            if (view) {
                view.classList.add('hidden');
                view.style.display = 'none';
            }
        });

        if (this.views[viewId]) {
            this.views[viewId].classList.remove('hidden');
            this.views[viewId].style.display = '';

            // Only scroll to top if on mobile
            if (!appState.isDesktop) {
                window.scrollTo(0, 0);
            }

            appState.currentView = viewId;

            if (viewId === 'login') {
                this.bindLoginEvents();
            } else if (viewId === 'feed') {
                if (window.RenderManager) window.RenderManager.renderFeed();
            } else if (viewId === 'post-detail' && param) {
                appState.activePostId = param;
                if (window.RenderManager) window.RenderManager.renderPostDetail(param);
            } else if (viewId === 'profile' && param) {
                appState.activeProfileId = param;
                if (window.RenderManager) window.RenderManager.renderProfile(param);
            }
        }
    }

    bindLoginEvents() {
        const sendCodeBtn = document.getElementById('sendCodeBtn');
        const loginBtn = document.getElementById('loginBtn');
        const passwordBtn = document.getElementById('passwordBtn');

        if (sendCodeBtn && !sendCodeBtn.dataset.bound) {
            sendCodeBtn.dataset.bound = true;
            sendCodeBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const phoneNumber = document.getElementById('phoneNumber').value.trim();
                const errorDiv = document.getElementById('phoneError');
                errorDiv.style.display = 'none';

                if (!phoneNumber) {
                    errorDiv.innerText = "Please enter a valid phone number.";
                    errorDiv.style.display = 'block';
                    return;
                }

                sendCodeBtn.disabled = true;
                sendCodeBtn.innerText = "Sending...";

                try {
                    const res = await fetch('/api/auth/sendCode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phoneNumber })
                    });

                    const data = await res.json();

                    if (data.success) {
                        appState.phoneData.phoneNumber = phoneNumber;
                        appState.phoneData.phoneCodeHash = data.phoneCodeHash;
                        document.getElementById('step1').style.display = 'none';
                        document.getElementById('step2').style.display = 'block';
                    } else {
                        throw new Error(data.error || "Failed to send code");
                    }
                } catch (err) {
                    errorDiv.innerText = err.message;
                    errorDiv.style.display = 'block';
                    sendCodeBtn.disabled = false;
                    sendCodeBtn.innerText = "Send Code";
                }
            });
        }

        if (loginBtn && !loginBtn.dataset.bound) {
            loginBtn.dataset.bound = true;
            loginBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const phoneCode = document.getElementById('authCode').value.trim();
                const errorDiv = document.getElementById('codeError');
                errorDiv.style.display = 'none';

                if (!phoneCode) {
                    errorDiv.innerText = "Please enter the verification code.";
                    errorDiv.style.display = 'block';
                    return;
                }

                loginBtn.disabled = true;
                loginBtn.innerText = "Logging in...";

                try {
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phoneNumber: appState.phoneData.phoneNumber,
                            phoneCodeHash: appState.phoneData.phoneCodeHash,
                            phoneCode: phoneCode
                        })
                    });

                    const data = await res.json();

                    if (data.success) {
                        appState.isAuthenticated = true;
                        this.navigate('feed');
                    } else if (data.requiresPassword) {
                        document.getElementById('step2').style.display = 'none';
                        document.getElementById('step3').style.display = 'block';
                        loginBtn.innerText = "Log In";
                    } else {
                        throw new Error(data.error || "Failed to log in");
                    }
                } catch (err) {
                    errorDiv.innerText = err.message;
                    errorDiv.style.display = 'block';
                    loginBtn.disabled = false;
                    loginBtn.innerText = "Log In";
                }
            });
        }

        if (passwordBtn && !passwordBtn.dataset.bound) {
            passwordBtn.dataset.bound = true;
            passwordBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const password = document.getElementById('cloudPassword').value;
                const errorDiv = document.getElementById('passwordError');
                errorDiv.style.display = 'none';

                if (!password) {
                    errorDiv.innerText = "Please enter your cloud password.";
                    errorDiv.style.display = 'block';
                    return;
                }

                passwordBtn.disabled = true;
                passwordBtn.innerText = "Submitting...";

                try {
                    const res = await fetch('/api/auth/password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });

                    const data = await res.json();

                    if (data.success) {
                        appState.isAuthenticated = true;
                        this.navigate('feed');
                    } else {
                        throw new Error(data.error || "Failed to log in with password");
                    }
                } catch (err) {
                    errorDiv.innerText = err.message;
                    errorDiv.style.display = 'block';
                    passwordBtn.disabled = false;
                    passwordBtn.innerText = "Submit Password";
                }
            });
        }
    }

    setupEventListeners() {
        if (!appState.isDesktop) {
            // Mobile Specific Listeners
            document.addEventListener('click', (e) => {
                const backBtn = e.target.closest('#post-back-btn') || e.target.closest('#profile-back-btn');
                if (backBtn) {
                    this.navigate('feed');
                }

                const postCard = e.target.closest('.post[data-post-id]');
                if (postCard && !e.target.closest('.reaction-pill') && !e.target.closest('.avatar')) {
                    const postId = postCard.getAttribute('data-post-id');
                    this.navigate('post-detail', postId);
                }

                const avatar = e.target.closest('.avatar[data-channel-id]');
                if (avatar) {
                    e.stopPropagation();
                    const channelId = avatar.getAttribute('data-channel-id');
                    this.navigate('profile', channelId);
                }
            });
        } else {
            // Desktop Specific Listeners
            document.addEventListener('click', (e) => {
                // Click on left sidebar channel
                const chatItem = e.target.closest('.chat-item');
                if (chatItem) {
                    // Update active state
                    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
                    chatItem.classList.add('active');

                    const channelId = chatItem.getAttribute('data-channel-id');
                    if (window.RenderManager) {
                        window.RenderManager.renderDesktopChat(channelId);
                    }
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.AppRouter = new Router();
});