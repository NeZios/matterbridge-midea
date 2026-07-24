/**
 * Enumerate Midea AC protocol operating modes.
 *
 * Numeric values match the AC LAN protocol payload.
 */
export declare enum MideaMode {
    Off = 0,
    Auto = 1,
    Cool = 2,
    Dry = 3,
    Heat = 4,
    FanOnly = 5
}
/**
 * Describe a Midea appliance returned by cloud or LAN discovery.
 *
 * @property {string} id Midea appliance identifier.
 * @property {string} name Device name from cloud or LAN discovery.
 * @property {string} sn Device serial number.
 * @property {string} type Normalized appliance type, for example `0xac`.
 * @property {string | undefined} modelNumber Optional model number reported by discovery/cloud.
 */
export type MideaAppliance = {
    id: string;
    name: string;
    sn: string;
    type: string;
    modelNumber?: string;
};
/**
 * Describe a configured Midea LAN device.
 *
 * @property {string | undefined} displayName Optional Matter display name override.
 * @property {string} ip Device IPv4 address.
 * @property {number} port LAN protocol port.
 * @property {2 | 3} version Midea LAN protocol version.
 * @property {string} token Hex-encoded LAN token.
 * @property {string} key Hex-encoded LAN key.
 */
export type MideaDeviceConfig = MideaAppliance & {
    displayName?: string;
    ip: string;
    port: number;
    version: 2 | 3;
    token: string;
    key: string;
};
/**
 * Describe one token/key candidate returned by a Midea cloud backend.
 *
 * @property {string} token Hex-encoded LAN token.
 * @property {string} key Hex-encoded LAN key.
 * @property {string} source Backend and lookup identifier that produced this candidate.
 */
export type MideaCredentialCandidate = {
    token: string;
    key: string;
    source: string;
};
/**
 * Describe the current Midea AC state decoded from LAN payloads.
 *
 * @property {boolean} power Whether the AC is on.
 * @property {MideaMode} mode Current Midea operating mode.
 * @property {number} targetTemperature Target temperature in Celsius.
 * @property {number} currentTemperature Current room temperature in Celsius.
 * @property {number} fanSpeed Midea fan speed (0..102, where 102 means auto).
 * @property {boolean} swingVertical Whether vertical swing is enabled.
 * @property {boolean} ecoMode Whether eco mode is enabled.
 */
export type MideaAcState = {
    power: boolean;
    mode: MideaMode;
    targetTemperature: number;
    currentTemperature: number;
    fanSpeed: number;
    swingVertical: boolean;
    ecoMode: boolean;
};
type DiscoveredLanDevice = Omit<MideaDeviceConfig, 'token' | 'key'>;
/**
 * Fetch appliance and LAN credential metadata from Midea cloud APIs.
 */
export declare class MideaCloudClient {
    private readonly account;
    private readonly password;
    private readonly deviceId;
    private readonly pushToken;
    private apiUrl;
    private loginId;
    private uid;
    private headerAccessToken;
    private dataKey?;
    private dataIv?;
    /**
     * Create a Midea cloud client.
     *
     * @param {string} account Midea cloud login account.
     * @param {string} password Midea cloud password.
     */
    constructor(account: string, password: string);
    /**
     * Authenticate against the MSmartHome cloud API.
     *
     * @returns {Promise<void>} Resolves when access tokens and encryption material are initialized.
     */
    login(): Promise<void>;
    /**
     * List appliances visible to the authenticated cloud account.
     *
     * Edge cases:
     *  - Non-array cloud responses return an empty appliance list
     *  - Appliances without an id are dropped
     *
     * @returns {Promise<MideaAppliance[]>} Cloud appliance entries with normalized type values.
     */
    listAppliances(): Promise<MideaAppliance[]>;
    /**
     * Return the first validated token/key candidate for an appliance.
     *
     * @param {string} applianceId Midea appliance identifier.
     * @returns {Promise<{ token: string; key: string }>} Hex-encoded token and key.
     */
    getTokenKey(applianceId: string): Promise<{
        token: string;
        key: string;
    }>;
    /**
     * Return all unique token/key candidates from supported Midea cloud backends.
     *
     * Edge cases:
     *  - Invalid numeric appliance ids produce no UDP ids and therefore an error
     *  - Backend failures are collected and included in the final error
     *
     * @param {string} applianceId Midea appliance identifier.
     * @returns {Promise<MideaCredentialCandidate[]>} Unique token/key candidates.
     */
    getTokenKeyCandidates(applianceId: string): Promise<MideaCredentialCandidate[]>;
    private getTokenKeyByUdpId;
    private resolveRegion;
    private getLoginId;
    private apiRequest;
    private basePayload;
    private setAccessToken;
    private aesDecryptString;
}
/**
 * Discover Midea LAN devices via UDP broadcast.
 */
export declare class MideaLanDiscovery {
    /**
     * Broadcast Midea discovery packets and collect AC responses.
     *
     * Edge cases:
     *  - Unsupported or malformed UDP responses are ignored
     *  - Duplicate device ids keep the latest parsed response
     *
     * @param {number} timeoutMs Discovery wait time in milliseconds.
     * @returns {Promise<DiscoveredLanDevice[]>} LAN devices discovered within the timeout.
     */
    discover(timeoutMs?: number): Promise<DiscoveredLanDevice[]>;
}
/**
 * Communicate with one Midea AC over the LAN protocol.
 */
export declare class MideaLanAcDevice {
    private readonly config;
    private commandQueue;
    private lastManualFanSpeed;
    private state;
    private readonly localSecurity;
    /**
     * Create a LAN AC device wrapper.
     *
     * @param {MideaDeviceConfig} config Validated LAN device configuration.
     */
    constructor(config: MideaDeviceConfig);
    /**
     * Return the configured Midea appliance id.
     *
     * @returns {string} Midea appliance id.
     */
    get id(): string;
    /**
     * Return the configured Midea appliance name.
     *
     * @returns {string} Midea appliance name.
     */
    get name(): string;
    /**
     * Refresh AC state from the LAN device.
     *
     * @returns {Promise<MideaAcState>} Latest decoded AC state.
     */
    refresh(): Promise<MideaAcState>;
    /**
     * Validate LAN authentication without changing AC state.
     *
     * Edge cases:
     *  - Protocol v2 has no v3 handshake and returns immediately
     *
     * @returns {Promise<void>} Resolves when authentication succeeds.
     */
    validateAuthentication(): Promise<void>;
    /**
     * Set AC power state.
     *
     * @param {boolean} power Desired power state.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setPower(power: boolean): Promise<MideaAcState>;
    /**
     * Set AC operating mode.
     *
     * @param {MideaMode} mode Desired Midea operating mode.
     * @param {boolean} power Whether the command should power the AC on.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setMode(mode: MideaMode, power?: boolean): Promise<MideaAcState>;
    /**
     * Set target temperature.
     *
     * Edge cases:
     *  - Values are rounded and clamped to the Midea 16..31 C range
     *
     * @param {number} targetTemperature Desired target temperature in Celsius.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setTargetTemperature(targetTemperature: number): Promise<MideaAcState>;
    /**
     * Set manual fan speed or turn the AC off.
     *
     * Edge cases:
     *  - Speed 0 maps to power off
     *
     * @param {number} fanSpeed Midea fan speed (0..102, where 102 means auto).
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setFanSpeed(fanSpeed: number): Promise<MideaAcState>;
    /**
     * Enable or disable Midea fan auto speed.
     *
     * @param {boolean} auto Whether auto fan should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setFanAuto(auto: boolean): Promise<MideaAcState>;
    /**
     * Enable or disable vertical swing.
     *
     * Enabling swing powers the AC on because the Matter switch represents active
     * louver movement. Disabling swing does not change the current power state.
     *
     * @param {boolean} swingVertical Whether vertical swing should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setSwingVertical(swingVertical: boolean): Promise<MideaAcState>;
    /**
     * Enable or disable eco mode.
     *
     * @param {boolean} ecoMode Whether eco mode should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    setEcoMode(ecoMode: boolean): Promise<MideaAcState>;
    private apply;
    private rememberManualFanSpeed;
    private sendLocalCommand;
    private withCommandLock;
    private sendLocalCommandUnlocked;
    private authenticate;
}
/**
 * Validate a hex-encoded Midea LAN credential.
 *
 * Edge cases:
 *  - Non-string, odd-length, and short values are rejected
 *
 * @param {unknown} value Candidate token or key value.
 * @returns {boolean} `true` when value is an even-length hex string of at least 32 characters.
 */
export declare function isHexCredential(value: unknown): value is string;
export declare function isLikelyNetworkError(error: unknown): boolean;
/**
 * Parse a Midea AC status payload into state.
 *
 * Edge cases:
 *  - Missing or short payloads return the previous state
 *  - Invalid protocol mode values fall back to auto
 *  - Missing temperature values keep the previous current temperature
 *
 * @param {Buffer} payload Midea AC LAN payload.
 * @param {MideaAcState} previous Previously known AC state.
 * @returns {MideaAcState} Decoded AC state.
 */
export declare function parseAcState(payload: Buffer, previous: MideaAcState): MideaAcState;
/**
 * Parse Midea temperature bytes into Celsius.
 *
 * Edge cases:
 *  - Raw 0 or 0xff means unavailable and returns undefined
 *
 * @param {number} raw Integer temperature byte from the AC payload.
 * @param {number} decimal Decimal nibble from the AC payload.
 * @returns {number | undefined} Temperature in Celsius, or undefined when unavailable.
 */
export declare function parseTemperature(raw: number, decimal: number): number | undefined;
export {};
