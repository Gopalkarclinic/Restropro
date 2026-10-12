// Compatibility shim. Hostinger's saved "Entry file" setting is `server/src/index.js`,
// but the Root directory is already `server/`, so it looks for server/server/src/index.js.
// This file makes BOTH settings work (`src/index.js` or `server/src/index.js`).
require('../../src/index.js');
