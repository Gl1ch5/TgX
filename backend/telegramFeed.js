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
                // Fetch Avatar
                let avatarUrl = '/assets/reactions/default-avatar.svg';
                try {
                    const avatarBuffer = await client.downloadProfilePhoto(channel.entity);
                    if (avatarBuffer) {
                        const avatarFilename = `avatar_${channel.id.toString()}.jpg`;
                        const avatarFilepath = path.join(imgDir, avatarFilename);
                        if (!fs.existsSync(avatarFilepath)) {
                            fs.writeFileSync(avatarFilepath, avatarBuffer);
                        }
                        avatarUrl = `/img/${avatarFilename}`;
                    }
                } catch (e) {
                    console.log(`Failed to download avatar for ${channel.title}`);
                }

                const messages = await client.getMessages(channel.entity, { limit: 5 });

                // Process messages concurrently
                const messagePromises = messages.map(async (msg) => {
                    let parsedReactions = [];
                    if (msg.reactions && msg.reactions.results && Array.isArray(msg.reactions.results)) {
                        for (const r of msg.reactions.results) {
                            if (r.reaction && r.reaction.emoticon) {
                                parsedReactions.push({ emoji: r.reaction.emoticon, count: r.count });
                            }
                        }
                    }

                    // Handle BigInt views and comments safely
                    let viewsCount = 0;
                    if (msg.views) viewsCount = Number(msg.views);

                    let commentsCount = 0;
                    if (msg.replies && typeof msg.replies.replies !== 'undefined') {
                        commentsCount = Number(msg.replies.replies);
                    }

                    let repostsCount = 0;
                    if (msg.forwards) repostsCount = Number(msg.forwards);

                    const postData = {
                        id: msg.id.toString(), // stringify ID
                        channelId: channel.id.toString(),
                        channelName: channel.title,
                        author: '@' + (channel.entity.username || channel.title.replace(/\s+/g, '').toLowerCase()),
                        avatarUrl: avatarUrl,
                        date: msg.date,
                        dateStr: new Date(msg.date * 1000).toLocaleString(),
                        text: msg.message || '',
                        media: null,
                        metrics: {
                            comments: commentsCount,
                            reposts: repostsCount,
                            views: viewsCount
                        },
                        reactions: parsedReactions
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