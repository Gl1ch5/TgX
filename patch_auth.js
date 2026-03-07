const fs = require('fs');
let code = fs.readFileSync('backend/telegramAuth.js', 'utf8');

// Ensure status route doesn't crash on uninitialized client
code = code.replace(
    /const client = getClient\(\);\s+await client\.connect\(\);/,
    `const client = getClient();
        if (!client) return res.json({ authenticated: false });
        await client.connect();`
);

fs.writeFileSync('backend/telegramAuth.js', code);
