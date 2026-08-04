// Loads the suite with a per-run token so a reload always tests the code as it is on disk.
//
// tests.js already does this for the modules it imports, but it couldn't do it for itself:
// index.html asks for it by name, and the browser is free to serve a cached copy. That's the
// worst kind of stale, because the suite runs and reports green against code you just changed.
//
// The token can't be built in the HTML — every page ships script-src 'self', so no inline
// script runs. Hence this file. Its own content never changes, so its being cached is fine.
import(`./tests.js?run=${Date.now()}`);
