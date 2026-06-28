import { type BasePlatformConfig, MatterbridgeDynamicPlatform, type PlatformConfig, type PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { type MideaDeviceConfig } from './midea-device.js';
/**
 * Describe the plugin configuration consumed by the Midea platform.
 *
 * @property {string | undefined} username Midea cloud username used only for LAN bootstrap.
 * @property {string | undefined} password Midea cloud password used only for LAN bootstrap.
 * @property {number | undefined} polling_interval Polling interval in seconds; values below 10 are clamped to 10.
 * @property {MideaDeviceConfig[] | undefined} devices Stored LAN device configuration.
 */
export type MideaPlatformConfig = BasePlatformConfig & {
    username?: string;
    password?: string;
    polling_interval?: number;
    devices?: MideaDeviceConfig[];
};
/**
 * Bridge configured Midea LAN air conditioners into Matterbridge endpoints.
 *
 * The platform registers one room-air-conditioner endpoint plus auxiliary fan and switch endpoints per AC.
 */
export declare class MideaPlatform extends MatterbridgeDynamicPlatform {
    private cloud?;
    private pollTimer?;
    private pendingCloudBootstrap?;
    private readonly stateSyncTimers;
    private readonly registeredAcs;
    private updatingFromCloud;
    private applyingConfigChange;
    private reloadInProgress;
    private pollInProgress;
    private stopped;
    /**
     * Create the Midea platform and verify the required Matterbridge runtime.
     *
     * @param {PlatformMatterbridge} matterbridge Matterbridge host instance.
     * @param {AnsiLogger} log Matterbridge AnsiLogger instance.
     * @param {MideaPlatformConfig} config Plugin configuration supplied by Matterbridge.
     */
    constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: MideaPlatformConfig);
    /**
     * Start the platform, register LAN devices, and defer optional cloud bootstrap.
     *
     * @param {string | undefined} reason Optional Matterbridge start reason.
     * @returns {Promise<void>} Resolves when initial LAN registration has completed.
     */
    onStart(reason?: string): Promise<void>;
    /**
     * Configure the platform after Matterbridge setup and trigger an immediate poll.
     *
     * @returns {Promise<void>} Resolves when configuration and initial poll complete.
     */
    onConfigure(): Promise<void>;
    /**
     * Apply updated Matterbridge config and schedule credential bootstrap if credentials are present.
     *
     * @param {PlatformConfig} config Updated Matterbridge platform config.
     * @returns {Promise<void>} Resolves after scheduling reload work.
     */
    onConfigChanged(config: PlatformConfig): Promise<void>;
    /**
     * Stop polling, clear pending bootstrap work, and unregister devices when configured.
     *
     * @param {string | undefined} reason Optional Matterbridge shutdown reason.
     * @returns {Promise<void>} Resolves when platform shutdown cleanup has completed.
     */
    onShutdown(reason?: string): Promise<void>;
    /**
     * Record Matterbridge logger level changes.
     *
     * @param {LogLevel} logLevel New Matterbridge logger level.
     * @returns {Promise<void>} Resolves after logging the level change.
     */
    onChangeLoggerLevel(logLevel: LogLevel): Promise<void>;
    private scheduleCloudBootstrap;
    private scheduleDeviceReload;
    private scheduleReload;
    private reloadDevices;
    private saveCurrentConfig;
    private discoverDevices;
    private bootstrapDevices;
    private selectWorkingCredentials;
    private getConfiguredDevices;
    private createEndpoint;
    private createFanEndpoint;
    private createSwitchEndpoint;
    private bindEndpoint;
    private bindFanEndpoint;
    private bindSwitchEndpoint;
    private shouldIgnoreAttributeWrite;
    private runUserCommand;
    private deferStateSync;
    private startPolling;
    private pollAll;
    private syncRegisteredState;
    private updateEndpointState;
    private updateFanEndpointState;
    private updateAuxiliaryEndpointState;
}
/**
 * Parse configured devices from unknown external configuration data.
 *
 * Edge cases:
 *  - Non-array values produce an empty array
 *  - Device placeholders are retained only if their required fields have the right primitive type
 *
 * @param {unknown} value Candidate `devices` config value.
 * @returns {MideaDeviceConfig[]} Validated Midea device config entries.
 */
export declare function parseMideaDeviceConfigs(value: unknown): MideaDeviceConfig[];
/**
 * Validate a single Midea device config object.
 *
 * Edge cases:
 *  - Empty token/key are allowed during first cloud bootstrap
 *  - Port must be a finite number in the TCP/UDP port range
 *
 * @param {unknown} value Candidate device config value from config JSON.
 * @returns {boolean} `true` when the value has the required Midea device config shape.
 */
export declare function isValidMideaDeviceConfig(value: unknown): value is MideaDeviceConfig;
/**
 * Convert Celsius to Matter temperature units.
 *
 * Edge cases:
 *  - Non-finite values return 0
 *
 * @param {number} value Temperature in Celsius.
 * @returns {number} Matter temperature in Celsius * 100.
 */
export declare function celsiusToMatterTemperature(value: number): number;
/**
 * Convert a Celsius setpoint to a Matter integer setpoint.
 *
 * Edge cases:
 *  - Non-finite values return the minimum setpoint
 *  - Fractional Celsius values are rounded to a whole degree
 *
 * @param {number} value Setpoint in Celsius.
 * @returns {number} Matter setpoint in Celsius * 100.
 */
export declare function celsiusToMatterSetpoint(value: number): number;
/**
 * Convert Matter temperature units to a clamped Midea Celsius setpoint.
 *
 * Edge cases:
 *  - Non-finite values fall back to the minimum Midea setpoint
 *  - Values below/above Midea bounds are clamped to 16..31 C
 *
 * @param {number} value Matter temperature in Celsius * 100.
 * @returns {number} Clamped setpoint in Celsius.
 */
export declare function matterTemperatureToCelsius(value: number): number;
/**
 * Convert a Matter fan percent setting to a Midea fan speed.
 *
 * Edge cases:
 *  - null/undefined/non-finite -> 0 (turn fan off)
 *  - >=95% is sent as 100 for high speed
 *
 * @param {number | null | undefined} value Matter fan percent setting (0..100).
 * @returns {number} Midea fan speed (0..100).
 */
export declare function matterFanPercentToMidea(value: number | null | undefined): number;
/**
 * Convert Midea fan speed to a Matter fan percent.
 *
 * Edge cases:
 *  - undefined, <=0, non-finite, or auto speed 102 -> 0
 *  - Manual speed values are clamped to 1..100
 *
 * @param {number | undefined} speed Midea fan speed (0..102, where 102 means auto).
 * @returns {number} Matter fan percent (0..100).
 */
export declare function mideaFanSpeedToPercent(speed?: number): number;
