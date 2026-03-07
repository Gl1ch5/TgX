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

        // 3. Collect messages concurrently using Promise.all to speed up the feed significantly
        let allMessages = [];
        // Only fetch from top 8 channels to stay fast and avoid flood wait
        const channelsToFetch = channels.slice(0, 8);

        const channelPromises = channelsToFetch.map(async (channel) => {
            try {
                const messages = await client.getMessages(channel.entity, { limit: 5 });
                let avatarUrl = '/assets/reactions/default-avatar.svg';

                // Process messages concurrently
                const messagePromises = messages.map(async (msg) => {
                    let likesCount = 0;
                    let fireCount = 0;
                    if (msg.reactions && msg.reactions.results && Array.isArray(msg.reactions.results)) {
                        const like = msg.reactions.results.find(r => r.reaction && r.reaction.emoticon === '👍');
                        if (like) likesCount = like.count || 0;
                        const fire = msg.reactions.results.find(r => r.reaction && r.reaction.emoticon === '🔥');
                        if (fire) fireCount = fire.count || 0;
                    }

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
                            likes: likesCount,
                            comments: msg.replies ? msg.replies.replies : 0,
                            reposts: msg.forwards || 0,
                            views: msg.views || 0,
                            fire: fireCount
                        }
                    };

                    // Download media extremely fast (thumbnail preview size instead of full bytes)
                    if (msg.media && msg.media.photo) {
                        try {
                            const downloadPromise = client.downloadMedia(msg.media, { thumb: 1 }); // '1' is the smallest size index usually available for thumbnail
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));

                            const buffer = await Promise.race([downloadPromise, timeoutPromise]);

                            if (buffer) {
                                const filename = `post_${msg.id}_${Date.now()}.jpg`;
                                const filepath = path.join(imgDir, filename);
                                fs.promises.writeFile(filepath, buffer); // async write to not block execution
                                postData.media = `/img/${filename}`;
                            }
                        } catch (mediaError) {
                            // Silently fail to keep logs clean, media just won't show
                        }
                    }
                    return postData;
                });

                const resolvedMessages = await Promise.all(messagePromises);
                return resolvedMessages;
            } catch (chanErr) {
                console.error(`Error fetching from channel ${channel.title}`, chanErr);
                return [];
            }
        });

        // Wait for all channels to fetch concurrently
        const results = await Promise.all(channelPromises);
        results.forEach(channelPosts => {
            allMessages.push(...channelPosts);
        });

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