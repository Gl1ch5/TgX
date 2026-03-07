// Main Application Logic & Router

const appState = {
    currentView: 'login', // 'login', 'feed', 'post-detail', 'profile'
    activePostId: null,
    activeProfileId: null,
    isAuthenticated: false,
    phoneData: {} // Store phoneCodeHash during login flow
};

// Simple router to fetch and inject HTML views, and toggle visibility
class Router {
    constructor() {
        this.mainContent = document.getElementById('app');
        if (!this.mainContent) {
            // For older setup compatibility
            this.mainContent = document.body;
        }
        this.views = {};
        this.init();
    }

    async init() {
        // Check auth status from cookie
        appState.isAuthenticated = document.cookie.includes('authenticated=true');

        // Load HTML templates into the DOM
        await this.loadView('login', '/html/login.html');
        await this.loadView('feed', '/html/feed.html');
        await this.loadView('post-detail', '/html/post-detail.html');
        await this.loadView('profile', '/html/profile.html');

        // Setup global event listeners
        this.setupEventListeners();

        // Initial render
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

            // Create a wrapper div to parse and append the content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Get the main view container from the fetched HTML
            const viewElement = tempDiv.firstElementChild;
            if (viewElement) {
                this.mainContent.appendChild(viewElement);
                this.views[id] = viewElement;

                // Ensure it has the hidden class initially
                viewElement.classList.add('hidden');
                // Optional ID assignment for CSS matching if not there
                if (!viewElement.id) viewElement.id = `${id}-view`;
            } else {
                console.error(`No root element found in template ${url}`);
            }
        } catch (error) {
            console.error(`Failed to load view ${id}:`, error);
        }
    }

    navigate(viewId, param = null) {
        // Enforce Auth
        if (!appState.isAuthenticated && viewId !== 'login') {
            viewId = 'login';
        }

        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) {
                view.classList.add('hidden');
                view.style.display = 'none'; // Ensure it's hidden if classes differ
            }
        });

        // Show target view
        if (this.views[viewId]) {
            this.views[viewId].classList.remove('hidden');
            this.views[viewId].style.display = ''; // Reset display block
            window.scrollTo(0, 0);

            appState.currentView = viewId;

            // Trigger specific renders based on view
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
    }

    setupEventListeners() {
        // Back buttons
        document.addEventListener('click', (e) => {
            const backBtn = e.target.closest('#post-back-btn') || e.target.closest('#profile-back-btn');
            if (backBtn) {
                this.navigate('feed');
            }

            // Click on a post in feed -> go to detail
            const postCard = e.target.closest('.post[data-post-id]');
            // Don't navigate if clicking a reaction or profile avatar
            if (postCard && !e.target.closest('.reaction-pill') && !e.target.closest('.avatar')) {
                const postId = postCard.getAttribute('data-post-id');
                this.navigate('post-detail', postId);
            }

            // Click on an avatar -> go to profile
            const avatar = e.target.closest('.avatar[data-channel-id]');
            if (avatar) {
                e.stopPropagation(); // prevent post click
                const channelId = avatar.getAttribute('data-channel-id');
                this.navigate('profile', channelId);
            }
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.AppRouter = new Router();
});