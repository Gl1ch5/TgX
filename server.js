require("dotenv").config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { getClient, initClient, sendCode, login, loginWithPassword, logout } = require('./backend/telegramAuth');
const { getFeed } = require('./backend/telegramFeed');
const { getComments } = require('./backend/telegramComments');

const app = express();
const port = 8081;

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory


// Configure sessions
app.use(session({
    secret: 'telegram-x-clone-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

// Device Auto-Detection Middleware
app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    req.isMobile = /mobile|android|iphone|ipad|phone/i.test(ua);
    next();
});

// Main Route - serve the unified index.html
// Serve static files based on device
app.use((req, res, next) => {
    const folder = req.isMobile ? 'mobile' : 'pc';
    express.static(path.join(__dirname, 'public', folder))(req, res, next);
});

// Fallback index.html route explicitly checking req.isMobile again
app.get('/', (req, res) => {
    const folder = req.isMobile ? 'mobile' : 'pc';
    res.sendFile(path.join(__dirname, 'public', folder, 'index.html'));
});

// Authentication Routes
app.get('/api/auth/status', async (req, res) => {
    try {
        const client = await initClient();
        const isAuth = await client.isUserAuthorized();
        res.json({ authenticated: isAuth });
    } catch (error) {
        console.error('Auth status check failed:', error);
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/sendCode', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    try {
        const result = await sendCode(phone);
        const phoneCodeHash = result.phoneCodeHash;
        req.session.phone = phone; // Store phone in session
        res.json({ success: true, phoneCodeHash });
    } catch (error) {
        console.error('Send code failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/verifyCode', async (req, res) => {
    const { phone, code, phoneCodeHash } = req.body;
    if (!phone || !code || !phoneCodeHash) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const result = await login(phone, phoneCodeHash, code);
        res.json({ success: true, needsPassword: false });
    } catch (error) {
        if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
            res.json({ success: true, needsPassword: true });
        } else {
            console.error('Verify code failed:', error);
            res.status(500).json({ error: error.message });
        }
    }
});

app.post('/api/auth/verifyPassword', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });

    try {
        await loginWithPassword(password);
        res.json({ success: true });
    } catch (error) {
        console.error('Password verification failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        await logout();
        req.session.destroy();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Feed Route
app.get('/api/feed', async (req, res) => {
    try {
        const posts = await getFeed();
        res.json({ success: true, posts });
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Comments Route
app.get('/api/comments', async (req, res) => {
    const { channelId, msgId } = req.query;
    if (!channelId || !msgId) return res.status(400).json({ error: 'channelId and msgId required' });
    try {
        const comments = await getComments(channelId, parseInt(msgId, 10));
        res.json({ success: true, comments });
    } catch (error) {
        console.error('Comments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Telegram client server listening at http://localhost:${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    const client = getClient();
    if (client) await client.disconnect();
    process.exit(0);
});
