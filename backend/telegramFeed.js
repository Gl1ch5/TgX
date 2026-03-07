const tgAuth = require('./telegramAuth');
const { Api } = require('telegram');
const fs = require('fs');
const path = require('path');

// Ensure image upload dir exists
const imgDir = path.join(__dirname, '..', 'public', 'img');
if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
}

async function getFeed() {
    const client = tgAuth.getClient();
    if (!client || !client.connected) {
        throw new Error('Not connected to Telegram');
    }

    try {
        // 1. Get all dialogs
        const dialogs = await client.getDialogs({});

        // 2. Filter out ONLY channels (exclude groups and bots)
        const channels = dialogs.filter(d => d.isChannel && d.entity && d.entity.broadcast);

        // 3. Collect messages
        let allMessages = [];
        // Only fetch from top 10 channels to avoid flood wait for this prototype
        const channelsToFetch = channels.slice(0, 10);

        for (const channel of channelsToFetch) {
            try {
                const messages = await client.getMessages(channel.entity, { limit: 5 });

                // Process channel info (like avatar) - Simplified for prototype to save performance
                let avatarUrl = '/assets/reactions/default-avatar.svg';

                for (const msg of messages) {
                    // Extract relevant data
                    const postData = {
                        id: msg.id,
                        channelId: channel.id.toString(),
                        channelName: channel.title,
                        author: '@' + (channel.entity.username || channel.title.replace(/\s+/g, '').toLowerCase()),
                        avatarUrl: avatarUrl,
                        date: msg.date,
                        dateStr: new Date(msg.date * 1000).toLocaleString(),
                        text: msg.message || '',
                        media: null,
                        metrics: {
                            likes: msg.reactions ? (msg.reactions.results.find(r => r.reaction.emoticon === '👍')?.count || 0) : 0,
                            comments: msg.replies ? msg.replies.replies : 0,
                            reposts: msg.forwards || 0,
                            views: msg.views || 0,
                            fire: msg.reactions ? (msg.reactions.results.find(r => r.reaction.emoticon === '🔥')?.count || 0) : 0
                        }
                    };

                    // 4. Download media if present (and not too big, prioritize photos for prototype)
                    if (msg.media && msg.media.photo) {
                        try {
                            const buffer = await client.downloadMedia(msg.media);
                            if (buffer) {
                                const filename = `post_${msg.id}_${Date.now()}.jpg`;
                                const filepath = path.join(imgDir, filename);
                                fs.writeFileSync(filepath, buffer);
                                postData.media = `/img/${filename}`;
                            }
                        } catch (mediaError) {
                            console.error(`Error downloading media for msg ${msg.id}`, mediaError);
                        }
                    }

                    allMessages.push(postData);
                }

                // Add a small delay to avoid FloodWait
                await new Promise(r => setTimeout(r, 500));

            } catch (chanErr) {
                console.error(`Error fetching from channel ${channel.title}`, chanErr);
            }
        }

        // Sort chronologically (newest first)
        allMessages.sort((a, b) => b.date - a.date);

        return allMessages;

    } catch (error) {
        console.error('Error fetching feed:', error);
        throw error;
    }
}

module.exports = {
    getFeed
};