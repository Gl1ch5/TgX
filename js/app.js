// Main Application Logic & Router

const appState = {
    currentView: 'feed', // 'feed', 'post-detail', 'profile'
    activePostId: null,
    activeProfileId: null
};

// Simple router to fetch and inject HTML views, and toggle visibility
class Router {
    constructor() {
        this.mainContent = document.getElementById('main-content');
        this.views = {};
        this.init();
    }

    async init() {
        // Load HTML templates into the DOM
        await this.loadView('feed', 'html/feed.html');
        await this.loadView('post-detail', 'html/post-detail.html');
        await this.loadView('profile', 'html/profile.html');

        // Setup global event listeners
        this.setupEventListeners();

        // Initial render
        this.navigate('feed');
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
            this.mainContent.appendChild(viewElement);

            this.views[id] = viewElement;

            // If it's hidden by default, ensure it has the hidden class
            if (id !== 'feed') {
                viewElement.classList.add('hidden');
            }
        } catch (error) {
            console.error(`Failed to load view ${id}:`, error);
        }
    }

    navigate(viewId, param = null) {
        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) view.classList.add('hidden');
        });

        // Show target view
        if (this.views[viewId]) {
            this.views[viewId].classList.remove('hidden');
            window.scrollTo(0, 0);

            appState.currentView = viewId;

            // Trigger specific renders based on view
            if (viewId === 'feed') {
                window.RenderManager.renderFeed();
            } else if (viewId === 'post-detail' && param) {
                appState.activePostId = param;
                window.RenderManager.renderPostDetail(param);
            } else if (viewId === 'profile' && param) {
                appState.activeProfileId = param;
                window.RenderManager.renderProfile(param);
            }
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