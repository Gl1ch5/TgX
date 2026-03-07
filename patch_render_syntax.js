const fs = require('fs');
let code = fs.readFileSync('public/js/render.js', 'utf8');
code = code.replace(/const reactions = ;/, 'const reactions = "";');
code = code.replace(/const avatar = this\.getAvatarHtml\(comment\.author\);/g, 'const avatar = this.getAvatarHtml({channelName: comment.author.title, avatarUrl: null});');
fs.writeFileSync('public/js/render.js', code);
