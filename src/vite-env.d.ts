/// <reference types="vite/client" />

/** Short commit id of this build, shown in the web build's banner and settings. */
declare const __BUILD_ID__: string;

/** The browser build is the production site: visitors only get the demo, no import. */
declare const __WEB_DEMO_ONLY__: boolean;
declare const __WEB_DOWNLOAD__: boolean;
/** A test build from build.yml (version 0.1.0): never offers a release, or the updater would swap it out. */
declare const __TEST_BUILD__: boolean;
