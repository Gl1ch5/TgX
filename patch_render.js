const fs = require('fs');

let renderJs = fs.readFileSync('public/js/render.js', 'utf8');

// The backend sends postData like this:
// { id, channelId, channelName, author, avatarUrl, date, dateStr, text, media, metrics: { likes, comments, reposts, views, fire } }

renderJs = renderJs.replace(/post\.channel\.id/g, 'post.channelId');
renderJs = renderJs.replace(/post\.channel\.title/g, 'post.channelName');
renderJs = renderJs.replace(/this\.getAvatarHtml\(post\.channel\)/g, 'this.getAvatarHtml(post)');
renderJs = renderJs.replace(/channel\.avatarUrl/g, 'channel.avatarUrl');
renderJs = renderJs.replace(/channel\.title/g, 'channel.channelName');

renderJs = renderJs.replace(/this\.getMediaHtml\(post\.media\)/g, 'post.media ? `<div class="post-media"><img src="${this.escapeHtml(post.media)}" alt="Media"></div>` : ""');

renderJs = renderJs.replace(/this\.formatCount\(post\.replies \|\| 0\)/g, 'this.formatCount(post.metrics?.comments || 0)');
renderJs = renderJs.replace(/this\.formatCount\(post\.forwards \|\| 0\)/g, 'this.formatCount(post.metrics?.reposts || 0)');
renderJs = renderJs.replace(/this\.formatCount\(post\.views \|\| 0\)/g, 'this.formatCount(post.metrics?.views || 0)');
renderJs = renderJs.replace(/<span><\/span>/g, '<span>${this.formatCount(post.metrics?.likes || 0)}</span>'); // Like count
renderJs = renderJs.replace(/this\.getReactionsHtml\(post\.reactions\)/g, ''); // We don't have reactions object anymore

fs.writeFileSync('public/js/render.js', renderJs);
