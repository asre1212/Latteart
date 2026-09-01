/* Single source of truth for the app version.
   Loaded by the page AND imported by the service worker. */
const APP_VERSION = '1.1.0';
const APP_BUILD = 'latte-motion';
if (typeof self !== 'undefined') self.APP_VERSION = APP_VERSION;
