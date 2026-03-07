const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Ensure status route doesn't crash on uninitialized client in server.js
code = code.replace(
    /const client = getClient\(\);\s+await client\.connect\(\);/,
    `const client = getClient();
        if (!client) return res.json({ authenticated: false });
        await client.connect();`
);

fs.writeFileSync('server.js', code);
