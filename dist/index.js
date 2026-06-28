import { MideaPlatform } from './platform.js';
/**
 * Create the Matterbridge Midea dynamic platform.
 *
 * @param {PlatformMatterbridge} matterbridge Matterbridge platform host instance.
 * @param {AnsiLogger} log Matterbridge AnsiLogger used for plugin output.
 * @param {MideaPlatformConfig} config Plugin configuration supplied by Matterbridge.
 * @returns {MideaPlatform} Initialized Midea platform instance.
 */
export default function initializePlugin(matterbridge, log, config) {
    return new MideaPlatform(matterbridge, log, config);
}
export { MideaPlatform };
//# sourceMappingURL=index.js.map