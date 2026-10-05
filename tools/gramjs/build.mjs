import * as esbuild from 'esbuild';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tg = path.join(here, 'node_modules/telegram');

// GramJS picks browser code paths at runtime; replace node-only modules with browser shims.
const shims = {
  name: 'gramjs-browser-shims',
  setup(build) {
    build.onResolve({ filter: /^\.\/CryptoFile$/ }, () => ({ path: 'CryptoFile', namespace: 'shim' }));
    build.onResolve({ filter: /inspect$/ }, (a) => a.importer.includes('telegram') ? { path: 'inspect', namespace: 'shim' } : undefined);
    build.onResolve({ filter: /^os$/ }, () => ({ path: 'os', namespace: 'shim' }));
    build.onResolve({ filter: /^path$/ }, () => ({ path: path.join(here, 'node_modules/path-browserify/index.js') }));
    build.onResolve({ filter: /^(fs|net|events|stream|util|assert|constants|crypto|node-localstorage|socks)$/ }, (a) => ({ path: a.path, namespace: 'empty' }));
    build.onLoad({ filter: /^inspect$/, namespace: 'shim' }, () => ({ contents: 'export const inspect = { custom: Symbol.for("nodejs.util.inspect.custom") };' }));
    build.onLoad({ filter: /^CryptoFile$/, namespace: 'shim' }, () => ({
      contents: `import * as c from ${JSON.stringify(path.join(tg, 'crypto/crypto.js'))}; export default c;`,
      resolveDir: here,
    }));
    build.onLoad({ filter: /^os$/, namespace: 'shim' }, () => ({ contents: 'export default { type: () => "Browser", release: () => "1.0" };' }));
    build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'module.exports = {};' }));
    // GramJS pops a browser alert() on an unknown constructor (a corrupted packet it then skips).
    build.onLoad({ filter: /telegram[\\/]errors[\\/]Common\.js$/ }, async (a) => ({
      contents: (await readFile(a.path, 'utf8')).replace(/if \(typeof alert !== "undefined"\) \{[\s\S]*?\}\n/, ''),
      loader: 'js',
    }));
    // Connections to other DCs (files, avatars) closed after 30 s idle; reopening
    // them on every scroll pause costs a handshake. Keep them for 10 minutes.
    build.onLoad({ filter: /telegram[\\/]client[\\/]telegramBaseClient\.js$/ }, async (a) => ({
      contents: (await readFile(a.path, 'utf8')).replace('EXPORTED_SENDER_RELEASE_TIMEOUT = 30000', 'EXPORTED_SENDER_RELEASE_TIMEOUT = 600000'),
      loader: 'js',
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  outfile: process.argv[2] || path.join(here, 'out/gramjs.js'),
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  inject: [path.join(here, 'buffer-shim.js')],
  plugins: [shims],
  logLevel: 'warning',
});
