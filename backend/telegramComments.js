const tgAuth = require('./telegramAuth');
const { Api } = require('telegram');
const fs = require('fs');
const path = require('path');

// Re-use img directory from feed
const imgDir = path.join(__dirname, '..', 'public', 'img');

async function getComments(channelId, msgId) {
    const client = tgAuth.getClient();
    if (!client || !client.connected) {
        throw new Error('Not connected to Telegram');
    }

    try {
        // GramJS doesn't have a direct `getComments` method on the client level easily available for all versions.
        // Typically, we use `getMessages` on the channel entity with `replyTo` parameter.

        // Fetch the channel entity again (in a real app, cache this)
        const entity = await client.getEntity(channelId);

        // Get messages replying to the specific message ID
        const comments = await client.getMessages(entity, { replyTo: parseInt(msgId), limit: 20 });

        const processedComments = [];

        for (const msg of comments) {
            // It's a comment if it replies to the msgId we asked for

            // Get user info for the commenter
            let authorName = 'Unknown User';
            let authorUsername = 'user';
            let authorAvatar = '/assets/reactions/default-avatar.svg';
            let isVerified = false;

            try {
                if (msg.sender) {
                    authorName = msg.sender.firstName ? `${msg.sender.firstName} ${msg.sender.lastName || ''}`.trim() : (msg.sender.title || 'Unknown');
                    authorUsername = msg.sender.username || `user${msg.sender.id}`;
                    isVerified = msg.sender.verified || false;

                    // Attempt to grab avatar for commenter (timeout applied for speed)
                    try {
                        const avatarPromise = client.downloadProfilePhoto(msg.sender);
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000));
                        const buffer = await Promise.race([avatarPromise, timeoutPromise]);

                        if (buffer) {
                            const filename = `avatar_${msg.sender.id.toString()}.jpg`;
                            const filepath = path.join(imgDir, filename);
                            if (!fs.existsSync(filepath)) {
                                fs.promises.writeFile(filepath, buffer);
                            }
                            authorAvatar = `/img/${filename}`;
                        }
                    } catch (e) {
                        // skip avatar error
                    }
                }
            } catch (e) {
                // fallbacks
            }

            // Extract basic metrics for comment
            let likesCount = 0;
            if (msg.reactions && msg.reactions.results && Array.isArray(msg.reactions.results)) {
                const like = msg.reactions.results.find(r => r.reaction && r.reaction.emoticon === '👍');
                if (like) likesCount = Number(like.count) || 0;
            }

            let repliesCount = 0;
            if (msg.replies && typeof msg.replies.replies !== 'undefined') {
                repliesCount = Number(msg.replies.replies);
            }

            processedComments.push({
                id: msg.id.toString(),
                text: msg.message || '',
                timestamp: new Date(msg.date * 1000).toLocaleString(),
                name: authorName,
                username: authorUsername,
                avatar: authorAvatar,
                verified: isVerified,
                repliesCount: repliesCount,
                likes: likesCount
            });
        }

        return processedComments;

    } catch (error) {
        console.error('Error fetching comments:', error);
        throw error;
    }
}

module.exports = {
    getComments
};