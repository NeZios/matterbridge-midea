import type { PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { MideaPlatform, type MideaPlatformConfig } from './platform.js';
/**
 * Create the Matterbridge Midea dynamic platform.
 *
 * @param {PlatformMatterbridge} matterbridge Matterbridge platform host instance.
 * @param {AnsiLogger} log Matterbridge AnsiLogger used for plugin output.
 * @param {MideaPlatformConfig} config Plugin configuration supplied by Matterbridge.
 * @returns {MideaPlatform} Initialized Midea platform instance.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: MideaPlatformConfig): MideaPlatform;
export { MideaPlatform };
export type { MideaPlatformConfig };
