require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const tgAuth = require('./backend/telegramAuth');
const tgFeed = require('./backend/telegramFeed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram Auth Endpoints
app.post('/api/auth/sendCode', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

        const result = await tgAuth.sendCode(phoneNumber);
        res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Error sending code' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phoneNumber, phoneCodeHash, phoneCode } = req.body;
        if (!phoneNumber || !phoneCodeHash || !phoneCode) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await tgAuth.login(phoneNumber, phoneCodeHash, phoneCode);

        if (result && result.requiresPassword) {
            return res.json({ success: false, requiresPassword: true });
        }

        res.cookie('authenticated', 'true', { maxAge: 900000, httpOnly: false }); // Optional client-side flag
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Error logging in' });
    }
});

app.post('/api/auth/password', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        await tgAuth.loginWithPassword(password);
        res.cookie('authenticated', 'true', { maxAge: 900000, httpOnly: false });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Error with password' });
    }
});

app.get('/api/feed', async (req, res) => {
    try {
        const isConnected = await tgAuth.isConnected();
        if (!isConnected) {
            return res.status(401).json({ error: 'Not authenticated', posts: [] });
        }

        const posts = await tgFeed.getFeed();
        res.json({ posts });
    } catch (e) {
        console.error("Feed error:", e);
        // Fallback to empty array if disconnected
        res.status(500).json({ error: 'Failed to fetch feed', posts: [] });
    }
});

// Serve frontend for all other routes (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    // Optional: Pre-initialize client if session exists
    try {
        await tgAuth.initClient();
        console.log("Telegram client initialized.");
    } catch(e) {
        console.log("Not logged in to Telegram yet. Waiting for auth.");
    }
});