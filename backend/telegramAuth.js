const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const apiId = 1234567; // Replace with your actual API_ID
const apiHash = '0123456789abcdef0123456789abcdef'; // Replace with your actual API_HASH

// Session management
const sessionFile = 'session.txt';
let stringSession = new StringSession('');
if (fs.existsSync(sessionFile)) {
    stringSession = new StringSession(fs.readFileSync(sessionFile, 'utf8'));
}

let client = null;

// Store pending authentication details
const authStore = {}; // { phoneCodeHash: string, phoneNumber: string }

async function initClient() {
    if (!client) {
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
            deviceModel: "Desktop",
            systemVersion: "Windows 10",
            appVersion: "4.15.0",
            langCode: "ru",
            systemLangCode: "ru"
        });
        await client.connect();
    }
    return client;
}

async function sendCode(phoneNumber) {
    const c = await initClient();
    try {
        const result = await c.sendCode({
            apiId: apiId,
            apiHash: apiHash
        }, phoneNumber);

        // Store hash required for sign in
        return { phoneCodeHash: result.phoneCodeHash };
    } catch (e) {
        console.error("Error sending code:", e);
        throw e;
    }
}

async function login(phoneNumber, phoneCodeHash, phoneCode) {
    const c = await initClient();
    try {
        await c.invoke(new (require('telegram').Api).auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode
        }));

        // Save session after successful login
        const sessionString = c.session.save();
        fs.writeFileSync(sessionFile, sessionString);
        stringSession = new StringSession(sessionString);

        return { success: true };
    } catch (e) {
        if (e.message.includes('SESSION_PASSWORD_NEEDED')) {
            return { success: false, requiresPassword: true };
        }
        console.error("Error logging in:", e);
        throw e;
    }
}

async function loginWithPassword(password) {
    const c = await initClient();
    try {
        // GramJS requires calling sign in with a computed SRP or the specific helper method
        // Using built-in auth logic handling SRP
        await c.signInWithPassword({
            apiId: apiId,
            apiHash: apiHash
        }, {
            password: async () => password
        });

        // Save session after successful login
        const sessionString = c.session.save();
        fs.writeFileSync(sessionFile, sessionString);
        stringSession = new StringSession(sessionString);

        return { success: true };
    } catch (e) {
        console.error("Error logging in with password:", e);
        throw e;
    }
}

async function isConnected() {
    if (!client) return false;
    return client.connected;
}

async function logout() {
    if (client) {
        await client.disconnect();
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
        }
        stringSession = new StringSession('');
        client = null;
    }
}

module.exports = {
    initClient,
    sendCode,
    login,
    loginWithPassword,
    logout,
    isConnected,
    getClient: () => client
};