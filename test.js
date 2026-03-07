require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

async function test() {
    const stringSession = new StringSession(fs.readFileSync('session.txt', 'utf8'));
    const client = new TelegramClient(stringSession, parseInt(process.env.API_ID), process.env.API_HASH, {
        connectionRetries: 5,
        deviceModel: "Desktop",
        systemVersion: "Windows 10",
        appVersion: "4.15.0",
        langCode: "ru",
        systemLangCode: "ru"
    });
    await client.connect();
    const dialogs = await client.getDialogs({});
    const channels = dialogs.filter(d => d.isChannel && d.entity && d.entity.broadcast);
    if(channels.length > 0) {
        const msgs = await client.getMessages(channels[0].entity, {limit: 1});
        console.log(JSON.stringify(msgs[0], (key, value) => {
            if (key === 'client' || key === 'originalArgs') return undefined;
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 2));
    }
    process.exit(0);
}
test();
