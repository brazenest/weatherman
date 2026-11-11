import { createApp } from './app.js';
import { APP_VERSION, loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);

await app.start(config.port);
console.log(`Weatherman v${APP_VERSION} listening on port ${config.port} (POST /slack/events)`);
