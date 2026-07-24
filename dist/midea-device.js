import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
const APP_ID = '1010';
const APP_KEY = 'ac21b9f9cbfe4ca5a88562ef25e2b768';
const IOT_KEY = 'meicloud';
const HMAC_KEY = 'PROD_VnoClJI9aikS8dyy';
const APP_VERSION = '2.22.0';
const SYSTEM_VERSION = '8.1.0';
const DEFAULT_API_URL = 'https://mp-prod.appsmb.com/mas/v5/app/proxy?alias=';
const AC_TYPE = '0xac';
const AC_MIN_TEMPERATURE = 16;
const AC_MAX_TEMPERATURE = 31;
const AUTO_FAN_SPEED = 102;
const TCP_CONNECT_TIMEOUT_MS = 2500;
const LAN_RESPONSE_TIMEOUT_MS = 3500;
const INTERNAL_AES_KEY = Buffer.from('6a92ef406bad2f0359baad994171ea6d', 'hex');
const SIGN_SALT = Buffer.from('78686469776a6e6368656b6434643531326368646a783564386534633339344432443753', 'hex');
const DISCOVERY_PORTS = [6445, 20086];
const DISCOVERY_MESSAGE = Buffer.from([
    0x5a, 0x5a, 0x01, 0x11, 0x48, 0x00, 0x92, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f, 0x75, 0xbd, 0x6b, 0x3e, 0x4f, 0x8b, 0x76, 0x2e, 0x84, 0x9c, 0x6e, 0x57, 0x8d, 0x65, 0x90, 0x03, 0x6e,
    0x9d, 0x43, 0x42, 0xa5, 0x0f, 0x1f, 0x56, 0x9e, 0xb8, 0xec, 0x91, 0x8e, 0x92, 0xe5,
]);
/**
 * Enumerate Midea AC protocol operating modes.
 *
 * Numeric values match the AC LAN protocol payload.
 */
export var MideaMode;
(function (MideaMode) {
    MideaMode[MideaMode["Off"] = 0] = "Off";
    MideaMode[MideaMode["Auto"] = 1] = "Auto";
    MideaMode[MideaMode["Cool"] = 2] = "Cool";
    MideaMode[MideaMode["Dry"] = 3] = "Dry";
    MideaMode[MideaMode["Heat"] = 4] = "Heat";
    MideaMode[MideaMode["FanOnly"] = 5] = "FanOnly";
})(MideaMode || (MideaMode = {}));
/**
 * Fetch appliance and LAN credential metadata from Midea cloud APIs.
 */
export class MideaCloudClient {
    account;
    password;
    deviceId = randomBytes(8).toString('hex');
    pushToken = randomBytes(90).toString('base64url');
    apiUrl = DEFAULT_API_URL;
    loginId = '';
    uid = '';
    headerAccessToken = '';
    dataKey;
    dataIv;
    /**
     * Create a Midea cloud client.
     *
     * @param {string} account Midea cloud login account.
     * @param {string} password Midea cloud password.
     */
    constructor(account, password) {
        this.account = account;
        this.password = password;
    }
    /**
     * Authenticate against the MSmartHome cloud API.
     *
     * @returns {Promise<void>} Resolves when access tokens and encryption material are initialized.
     */
    async login() {
        await this.resolveRegion();
        this.loginId = await this.getLoginId();
        const stamp = timestamp();
        const response = await this.apiRequest('/mj/user/login', {
            data: {
                appKey: APP_KEY,
                appVersion: APP_VERSION,
                osVersion: SYSTEM_VERSION,
                deviceId: this.deviceId,
                platform: '2',
            },
            iotData: {
                appId: APP_ID,
                appVNum: APP_VERSION,
                appVersion: APP_VERSION,
                clientType: 1,
                clientVersion: APP_VERSION,
                format: 2,
                language: 'en_US',
                iampwd: encryptIamPassword(this.loginId, this.password),
                loginAccount: this.account,
                password: encryptPassword(this.loginId, this.password),
                pushToken: this.pushToken,
                pushType: '4',
                reqId: randomBytes(16).toString('hex'),
                retryCount: '3',
                src: '10',
                stamp,
            },
            reqId: randomBytes(16).toString('hex'),
            stamp,
        }, false, false);
        this.uid = String(response.uid ?? '');
        this.headerAccessToken = String(asRecord(response.mdata).accessToken ?? '');
        this.setAccessToken(String(response.accessToken ?? ''), String(response.randomData ?? ''));
    }
    /**
     * List appliances visible to the authenticated cloud account.
     *
     * Edge cases:
     *  - Non-array cloud responses return an empty appliance list
     *  - Appliances without an id are dropped
     *
     * @returns {Promise<MideaAppliance[]>} Cloud appliance entries with normalized type values.
     */
    async listAppliances() {
        const response = await this.apiRequest('/v1/appliance/user/list/get', {});
        const list = Array.isArray(response.list) ? response.list : [];
        return list
            .map((item) => {
            const record = asRecord(item);
            return {
                id: String(record.id ?? ''),
                name: String(record.name ?? record.id ?? 'Midea AC'),
                sn: typeof record.sn === 'string' && record.sn.length > 0 ? this.aesDecryptString(record.sn) : 'Unknown',
                type: normalizeApplianceType(record.type),
                modelNumber: typeof record.modelNumber === 'string' ? record.modelNumber : undefined,
            };
        })
            .filter((item) => item.id.length > 0);
    }
    /**
     * Return the first validated token/key candidate for an appliance.
     *
     * @param {string} applianceId Midea appliance identifier.
     * @returns {Promise<{ token: string; key: string }>} Hex-encoded token and key.
     */
    async getTokenKey(applianceId) {
        const [first] = await this.getTokenKeyCandidates(applianceId);
        if (!first)
            throw new Error(`No token/key found for appliance ${applianceId}`);
        return { token: first.token, key: first.key };
    }
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
    async getTokenKeyCandidates(applianceId) {
        const udpIds = getUdpIds(Number(applianceId));
        const errors = [];
        const candidates = [];
        try {
            const netHomePlus = new NetHomePlusCloudClient(this.account, this.password);
            await netHomePlus.login();
            for (const udpId of udpIds) {
                try {
                    candidates.push(await netHomePlus.getTokenKeyByUdpId(udpId));
                }
                catch (error) {
                    errors.push(`NetHomePlus ${udpId.slice(0, 8)}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        catch (error) {
            errors.push(`NetHomePlus login: ${error instanceof Error ? error.message : String(error)}`);
        }
        for (const udpId of udpIds) {
            try {
                candidates.push(await this.getTokenKeyByUdpId(applianceId, udpId));
            }
            catch (error) {
                errors.push(`MSmartHome ${udpId.slice(0, 8)}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const unique = new Map();
        for (const candidate of candidates)
            unique.set(`${candidate.token}:${candidate.key}`, candidate);
        if (unique.size > 0)
            return [...unique.values()];
        throw new Error(`No token/key found for appliance ${applianceId}. Attempts: ${errors.join(' | ')}`);
    }
    async getTokenKeyByUdpId(applianceId, udpId) {
        const response = await this.apiRequest('/v1/iot/secure/getToken', {
            udpid: udpId,
            // Required by MSmartHome getToken; documented at github.com/cauan/midea-local-tokens/blob/main/WRITEUP.md.
            applianceCodes: applianceId,
        });
        return { ...parseTokenKeyResponse(response, udpId), source: `MSmartHome/${udpId.slice(0, 8)}` };
    }
    async resolveRegion() {
        try {
            const response = await this.apiRequest('/v1/multicloud/platform/user/route', { userName: this.account }, false);
            const masUrl = response.masUrl;
            if (typeof masUrl === 'string' && masUrl.startsWith('https://'))
                this.apiUrl = masUrl;
        }
        catch {
            this.apiUrl = DEFAULT_API_URL;
        }
    }
    async getLoginId() {
        const response = await this.apiRequest('/v1/user/login/id/get', { loginAccount: this.account }, false);
        const loginId = response.loginId;
        if (typeof loginId !== 'string' || loginId.length === 0)
            throw new Error('Midea cloud did not return a loginId');
        return loginId;
    }
    async apiRequest(endpoint, data, authenticate = true, decoratePayload = true) {
        if (authenticate && !this.dataKey)
            await this.login();
        const payload = decoratePayload
            ? {
                ...this.basePayload(),
                ...data,
                appVNum: APP_VERSION,
                appVersion: APP_VERSION,
                clientVersion: APP_VERSION,
                platformId: '1',
                retryCount: '3',
                uid: this.uid,
                userType: '0',
            }
            : data;
        const body = JSON.stringify(payload);
        const random = Math.floor(Date.now() / 1000).toString();
        const url = `${this.apiUrl}${endpoint}`;
        const headers = {
            'x-recipe-app': APP_ID,
            Authorization: `Basic ${Buffer.from(`${APP_KEY}:${IOT_KEY}`).toString('base64')}`,
            sign: signProxied(body, random),
            secretVersion: '1',
            random,
            version: APP_VERSION,
            systemVersion: SYSTEM_VERSION,
            platform: '0',
            'Accept-Encoding': 'identity',
            'Content-Type': 'application/json',
        };
        if (this.uid)
            headers.uid = this.uid;
        if (this.headerAccessToken)
            headers.accessToken = this.headerAccessToken;
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                const responsePayload = asRecord(await response.json());
                const code = String(responsePayload.code ?? responsePayload.errorCode ?? '0');
                if (code === '0') {
                    return asRecord(responsePayload.data ?? responsePayload.result ?? responsePayload);
                }
                throw new Error(`Midea cloud API error ${code}: ${String(responsePayload.msg ?? 'unknown error')}`);
            }
            catch (error) {
                lastError = error;
                await sleep(attempt * 500);
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    basePayload() {
        return {
            appId: APP_ID,
            format: 2,
            clientType: 1,
            language: 'en_US',
            src: APP_ID,
            stamp: timestamp(),
            deviceId: this.deviceId,
            reqId: randomBytes(16).toString('hex'),
        };
    }
    setAccessToken(token, randomData) {
        if (!token || !randomData)
            throw new Error('Midea cloud login did not return encryption material');
        const hash = createHash('sha256').update(APP_KEY).digest('hex');
        const key = hash.slice(0, 16);
        const iv = hash.slice(16, 32);
        this.dataKey = this.aesDecryptString(token, key, iv);
        this.dataIv = this.aesDecryptString(randomData, key, iv);
    }
    aesDecryptString(value, key = this.dataKey, iv = this.dataIv) {
        if (!key)
            throw new Error('Midea cloud data key is not initialized');
        const decipher = createDecipheriv(iv ? 'aes-128-cbc' : 'aes-128-ecb', Buffer.from(key, 'utf8'), iv ? Buffer.from(iv, 'utf8') : null);
        return Buffer.concat([decipher.update(Buffer.from(value, 'hex')), decipher.final()]).toString('utf8');
    }
}
class NetHomePlusCloudClient {
    account;
    password;
    appId = '1017';
    loginKey = '3742e9e5842d4ad59c2db887e12449f9';
    apiUrl = 'https://mapp.appsmb.com';
    deviceId = randomBytes(8).toString('hex');
    sessionId = '';
    accessToken = '';
    uid = '';
    loginId = '';
    constructor(account, password) {
        this.account = account;
        this.password = password;
    }
    async login() {
        this.loginId = await this.getLoginId();
        const response = await this.apiRequest('/v1/user/login', {
            loginAccount: this.account,
            password: this.encryptPassword(this.loginId, this.password),
        }, false);
        this.sessionId = String(response.sessionId ?? '');
        this.accessToken = String(response.accessToken ?? '');
        this.uid = String(response.userId ?? '');
        if (!this.sessionId)
            throw new Error('NetHome Plus login did not return a sessionId');
    }
    async getTokenKeyByUdpId(udpId) {
        const response = await this.apiRequest('/v1/iot/secure/getToken', { udpid: udpId });
        return { ...parseTokenKeyResponse(response, udpId), source: `NetHomePlus/${udpId.slice(0, 8)}` };
    }
    async getLoginId() {
        const response = await this.apiRequest('/v1/user/login/id/get', { loginAccount: this.account }, false);
        const loginId = response.loginId;
        if (typeof loginId !== 'string' || loginId.length === 0)
            throw new Error('NetHome Plus did not return a loginId');
        return loginId;
    }
    async apiRequest(endpoint, data, authenticate = true) {
        if (authenticate && !this.sessionId)
            await this.login();
        const payload = {
            appId: this.appId,
            format: '2',
            clientType: '1',
            language: 'en_US',
            src: this.appId,
            stamp: timestamp(),
            deviceId: this.deviceId,
            ...stringifyRecord(data),
        };
        if (this.sessionId)
            payload.sessionId = this.sessionId;
        const url = `${this.apiUrl}${endpoint}`;
        payload.sign = this.sign(url, payload);
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (this.uid)
            headers.uid = this.uid;
        if (this.accessToken)
            headers.accessToken = this.accessToken;
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: new URLSearchParams(payload).toString(),
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                const responsePayload = asRecord(await response.json());
                const code = String(responsePayload.errorCode ?? '0');
                if (code === '0')
                    return asRecord(responsePayload.result ?? responsePayload);
                throw new Error(`NetHome Plus API error ${code}: ${String(responsePayload.msg ?? 'unknown error')}`);
            }
            catch (error) {
                lastError = error;
                await sleep(attempt * 500);
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    sign(url, payload) {
        const path = new URL(url).pathname;
        const params = new URLSearchParams(payload);
        params.sort();
        const query = decodeURIComponent(params.toString().replace(/\+/g, ' '));
        return createHash('sha256').update(`${path}${query}${this.loginKey}`, 'ascii').digest('hex');
    }
    encryptPassword(loginId, password) {
        const first = createHash('sha256').update(password, 'ascii').digest('hex');
        return createHash('sha256').update(`${loginId}${first}${this.loginKey}`, 'ascii').digest('hex');
    }
}
/**
 * Discover Midea LAN devices via UDP broadcast.
 */
export class MideaLanDiscovery {
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
    async discover(timeoutMs = 8000) {
        const socket = dgram.createSocket('udp4');
        const found = new Map();
        await new Promise((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(0, undefined, () => {
                socket.setBroadcast(true);
                resolve();
            });
        });
        socket.on('message', (message, info) => {
            try {
                const device = parseDiscoveryMessage(message, info.address);
                if (normalizeApplianceType(device.type) === AC_TYPE)
                    found.set(device.id, device);
            }
            catch {
                // Ignore non-Midea or unsupported discovery replies.
            }
        });
        for (const address of broadcastAddresses()) {
            for (const port of DISCOVERY_PORTS)
                socket.send(DISCOVERY_MESSAGE, port, address);
        }
        await sleep(timeoutMs);
        socket.close();
        return [...found.values()];
    }
}
/**
 * Communicate with one Midea AC over the LAN protocol.
 */
export class MideaLanAcDevice {
    config;
    commandQueue = Promise.resolve();
    lastManualFanSpeed = 80;
    state = {
        power: false,
        mode: MideaMode.Auto,
        targetTemperature: 24,
        currentTemperature: 23,
        fanSpeed: AUTO_FAN_SPEED,
        swingVertical: false,
        ecoMode: false,
    };
    localSecurity;
    /**
     * Create a LAN AC device wrapper.
     *
     * @param {MideaDeviceConfig} config Validated LAN device configuration.
     */
    constructor(config) {
        this.config = config;
        this.localSecurity = new LocalSecurity(Buffer.from(config.token, 'hex'), Buffer.from(config.key, 'hex'));
    }
    /**
     * Return the configured Midea appliance id.
     *
     * @returns {string} Midea appliance id.
     */
    get id() {
        return this.config.id;
    }
    /**
     * Return the configured Midea appliance name.
     *
     * @returns {string} Midea appliance name.
     */
    get name() {
        return this.config.name;
    }
    /**
     * Refresh AC state from the LAN device.
     *
     * @returns {Promise<MideaAcState>} Latest decoded AC state.
     */
    async refresh() {
        const reply = await this.sendLocalCommand(buildStatusCommand());
        this.state = parseAcState(reply, this.state);
        this.rememberManualFanSpeed(this.state.fanSpeed);
        return this.state;
    }
    /**
     * Validate LAN authentication without changing AC state.
     *
     * Edge cases:
     *  - Protocol v2 has no v3 handshake and returns immediately
     *
     * @returns {Promise<void>} Resolves when authentication succeeds.
     */
    async validateAuthentication() {
        if (this.config.version !== 3)
            return;
        this.localSecurity.reset();
        const socket = await connectTcp(this.config.ip, this.config.port);
        try {
            await this.authenticate(socket);
        }
        finally {
            socket.destroy();
        }
    }
    /**
     * Set AC power state.
     *
     * @param {boolean} power Desired power state.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setPower(power) {
        return this.apply({ power });
    }
    /**
     * Set AC operating mode.
     *
     * @param {MideaMode} mode Desired Midea operating mode.
     * @param {boolean} power Whether the command should power the AC on.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setMode(mode, power = true) {
        return this.apply({ mode, power });
    }
    /**
     * Set target temperature.
     *
     * Edge cases:
     *  - Values are rounded and clamped to the Midea 16..31 C range
     *
     * @param {number} targetTemperature Desired target temperature in Celsius.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setTargetTemperature(targetTemperature) {
        return this.apply({ targetTemperature });
    }
    /**
     * Set manual fan speed or turn the AC off.
     *
     * Edge cases:
     *  - Speed 0 maps to power off
     *
     * @param {number} fanSpeed Midea fan speed (0..102, where 102 means auto).
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setFanSpeed(fanSpeed) {
        if (fanSpeed === 0)
            return this.setPower(false);
        this.rememberManualFanSpeed(fanSpeed);
        return this.apply({ fanSpeed, power: true });
    }
    /**
     * Enable or disable Midea fan auto speed.
     *
     * @param {boolean} auto Whether auto fan should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setFanAuto(auto) {
        if (auto)
            this.rememberManualFanSpeed(this.state.fanSpeed);
        return this.apply({ fanSpeed: auto ? AUTO_FAN_SPEED : this.lastManualFanSpeed, power: true });
    }
    /**
     * Enable or disable vertical swing.
     *
     * Enabling swing powers the AC on because the Matter switch represents active
     * louver movement. Disabling swing does not change the current power state.
     *
     * @param {boolean} swingVertical Whether vertical swing should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setSwingVertical(swingVertical) {
        return this.apply(swingVertical ? { swingVertical, power: true } : { swingVertical });
    }
    /**
     * Enable or disable eco mode.
     *
     * @param {boolean} ecoMode Whether eco mode should be enabled.
     * @returns {Promise<MideaAcState>} AC state after the command.
     */
    async setEcoMode(ecoMode) {
        const fanSpeed = this.state.fanSpeed === AUTO_FAN_SPEED ? this.lastManualFanSpeed : this.state.fanSpeed;
        return this.apply({ ecoMode, fanSpeed, power: true });
    }
    async apply(update) {
        const next = {
            ...this.state,
            ...update,
            targetTemperature: clamp(Math.round(update.targetTemperature ?? this.state.targetTemperature), AC_MIN_TEMPERATURE, AC_MAX_TEMPERATURE),
        };
        const reply = await this.sendLocalCommand(buildSetCommand(next));
        this.state = parseAcState(reply, next);
        this.rememberManualFanSpeed(this.state.fanSpeed);
        if (this.state.power !== next.power ||
            this.state.mode !== next.mode ||
            this.state.targetTemperature !== next.targetTemperature ||
            ('fanSpeed' in update && this.state.fanSpeed !== next.fanSpeed) ||
            ('swingVertical' in update && this.state.swingVertical !== next.swingVertical) ||
            ('ecoMode' in update && this.state.ecoMode !== next.ecoMode)) {
            return this.refresh();
        }
        return this.state;
    }
    rememberManualFanSpeed(fanSpeed) {
        if (fanSpeed !== undefined && fanSpeed > 0 && fanSpeed !== AUTO_FAN_SPEED) {
            this.lastManualFanSpeed = fanSpeed;
        }
    }
    async sendLocalCommand(command) {
        return this.withCommandLock(async () => this.sendLocalCommandUnlocked(command));
    }
    async withCommandLock(task) {
        const previous = this.commandQueue;
        let release;
        this.commandQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await task();
        }
        finally {
            release();
        }
    }
    async sendLocalCommandUnlocked(command) {
        this.localSecurity.reset();
        const socket = await connectTcp(this.config.ip, this.config.port);
        try {
            if (this.config.version === 3)
                await this.authenticate(socket);
            const packet = buildLanPacket(Number(this.config.id), command);
            socket.write(this.config.version === 3 ? this.localSecurity.encode8370(packet, 0x06) : packet);
            const response = await readMideaFrame(socket, LAN_RESPONSE_TIMEOUT_MS);
            const messages = this.config.version === 3 ? this.localSecurity.decode8370(response) : splitV2Messages(response);
            for (const message of messages) {
                const decrypted = decryptLanPacket(message);
                const parsed = extractAcPayload(decrypted);
                if (parsed)
                    return parsed;
            }
            throw new Error('No valid Midea AC LAN response received');
        }
        finally {
            socket.destroy();
        }
    }
    async authenticate(socket) {
        socket.write(this.localSecurity.encode8370(Buffer.from(this.config.token, 'hex'), 0x00));
        const response = await readMideaFrame(socket, LAN_RESPONSE_TIMEOUT_MS);
        if (isMideaErrorResponse(response))
            throw new Error('Midea v3 handshake returned ERROR');
        if (response.length < 72)
            throw new Error(`Invalid Midea v3 handshake response length ${response.length}: ${response.toString('hex')}`);
        if (response[0] !== 0x83 || response[1] !== 0x70)
            throw new Error(`Invalid Midea v3 handshake header: ${response.subarray(0, 8).toString('hex')}`);
        this.localSecurity.setTcpKeyFromResponse(response.subarray(8, 72));
    }
}
class LocalSecurity {
    token;
    key;
    tcpKey = Buffer.alloc(0);
    requestCount = 0;
    constructor(token, key) {
        this.token = token;
        this.key = key;
    }
    reset() {
        this.tcpKey = Buffer.alloc(0);
        this.requestCount = 0;
    }
    aesEncrypt(data) {
        const cipher = createCipheriv('aes-128-ecb', INTERNAL_AES_KEY.subarray(0, 16), null);
        return Buffer.concat([cipher.update(data), cipher.final()]);
    }
    aesDecrypt(data) {
        const decipher = createDecipheriv('aes-128-ecb', INTERNAL_AES_KEY.subarray(0, 16), null);
        return Buffer.concat([decipher.update(data), decipher.final()]);
    }
    md5Signature(data) {
        return createHash('md5')
            .update(Buffer.concat([data, SIGN_SALT]))
            .digest();
    }
    setTcpKeyFromResponse(response) {
        if (response.toString() === 'ERROR')
            throw new Error('Midea v3 authentication returned ERROR');
        if (response.length !== 64)
            throw new Error(`Invalid Midea v3 authentication response length: ${response.length}`);
        const payload = response.subarray(0, 32);
        const sign = response.subarray(32);
        const plain = aesCbcDecrypt(payload, this.key);
        if (!createHash('sha256').update(plain).digest().equals(sign))
            throw new Error('Midea v3 authentication signature mismatch');
        this.tcpKey = xorBuffers(plain, this.key);
        this.requestCount = 0;
    }
    encode8370(dataToEncrypt, messageType) {
        let data = dataToEncrypt;
        let size = data.length;
        let padding = 0;
        if (messageType === 0x06 || messageType === 0x03) {
            if ((size + 2) % 16 !== 0) {
                padding = 16 - ((size + 2) & 0x0f);
                size += padding + 32;
                data = Buffer.concat([data, randomBytes(padding)]);
            }
        }
        const header = Buffer.from([0x83, 0x70, size >> 8, size & 0xff, 0x20, (padding << 4) | messageType]);
        data = Buffer.concat([numberToBuffer(this.requestCount, 2, 'big'), data]);
        this.requestCount = (this.requestCount + 1) & 0xffff;
        if (messageType === 0x06 || messageType === 0x03) {
            if (this.tcpKey.length === 0)
                throw new Error('Midea v3 tcp key is not initialized');
            const sign = createHash('sha256')
                .update(Buffer.concat([header, data]))
                .digest();
            data = Buffer.concat([aesCbcEncrypt(data, this.tcpKey), sign]);
        }
        return Buffer.concat([header, data]);
    }
    decode8370(input) {
        const messages = [];
        let data = input;
        while (data.length >= 6) {
            const header = data.subarray(0, 6);
            if (header[0] !== 0x83 || header[1] !== 0x70)
                throw new Error('Midea response is not a v3 8370 packet');
            const size = header.readUInt16BE(2) + 8;
            if (data.length < size)
                break;
            let packet = data.subarray(6, size);
            data = data.subarray(size);
            const padding = header[5] >> 4;
            const messageType = header[5] & 0x0f;
            if (messageType === 0x06 || messageType === 0x03) {
                const sign = packet.subarray(packet.length - 32);
                packet = packet.subarray(0, packet.length - 32);
                packet = aesCbcDecrypt(packet, this.tcpKey);
                if (!createHash('sha256')
                    .update(Buffer.concat([header, packet]))
                    .digest()
                    .equals(sign))
                    throw new Error('Midea v3 response signature mismatch');
                if (padding > 0)
                    packet = packet.subarray(0, packet.length - padding);
            }
            messages.push(packet.subarray(2));
        }
        return messages;
    }
}
function buildLanPacket(deviceId, command) {
    const security = new LocalSecurity(Buffer.alloc(0), Buffer.alloc(0));
    let packet = Buffer.from([
        0x5a,
        0x5a,
        0x01,
        0x11,
        0x00,
        0x00,
        0x20,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        ...packetTime(),
        ...numberToBuffer(deviceId, 8, 'little'),
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ]);
    packet = Buffer.concat([packet, security.aesEncrypt(command)]);
    numberToBuffer(packet.length + 16, 2, 'little').copy(packet, 4);
    return Buffer.concat([packet, security.md5Signature(packet)]);
}
function decryptLanPacket(message) {
    if (message.length <= 56)
        throw new Error('Midea LAN packet is too short');
    const encrypted = message.subarray(40, message.length - 16);
    return new LocalSecurity(Buffer.alloc(0), Buffer.alloc(0)).aesDecrypt(encrypted);
}
function extractAcPayload(decrypted) {
    const index = decrypted.indexOf(0xc0);
    if (index === -1)
        return undefined;
    return decrypted.subarray(index);
}
function parseDiscoveryMessage(message, ip) {
    let version;
    let buffer = message;
    if (message[0] === 0x83 && message[1] === 0x70) {
        version = 3;
        buffer = message.subarray(8, message.length - 16);
    }
    else if (message[0] === 0x5a && message[1] === 0x5a) {
        version = 2;
    }
    else {
        throw new Error('Unsupported Midea discovery response');
    }
    const deviceId = buffer.readUIntLE(20, 6).toString();
    const decrypted = new LocalSecurity(Buffer.alloc(0), Buffer.alloc(0)).aesDecrypt(buffer.subarray(40, buffer.length - 16));
    const port = decrypted.readUIntLE(4, 2);
    const sn = decrypted.subarray(8, 40).toString().replaceAll('\u0000', '');
    const modelNumber = decrypted.subarray(17, 25).toString().replaceAll('\u0000', '');
    const nameLength = decrypted.readUInt8(40);
    const name = decrypted.subarray(41, 41 + nameLength).toString() || `Midea AC ${deviceId}`;
    const typePart = name.split('_')[1] ?? 'ac';
    return {
        id: deviceId,
        name,
        sn,
        type: normalizeApplianceType(typePart),
        modelNumber,
        ip,
        port,
        version,
    };
}
function broadcastAddresses() {
    const addresses = new Set(['255.255.255.255']);
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const entry of iface ?? []) {
            if (entry.internal || entry.family !== 'IPv4')
                continue;
            const address = entry.address.split('.').map(Number);
            const netmask = entry.netmask.split('.').map(Number);
            addresses.add(address.map((part, index) => ((~netmask[index] & 0xff) | part).toString()).join('.'));
        }
    }
    return [...addresses];
}
function connectTcp(ip, port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: ip, port });
        socket.setNoDelay(true);
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error(`Timed out connecting to ${ip}:${port}`));
        }, TCP_CONNECT_TIMEOUT_MS);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(socket);
        });
        socket.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
function readMideaFrame(socket, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);
        const cleanup = () => {
            clearTimeout(timer);
            socket.off('data', onData);
            socket.off('error', onError);
            socket.off('end', onEnd);
            socket.off('close', onClose);
        };
        const finish = () => {
            if (buffer.toString() === 'ERROR') {
                cleanup();
                resolve(buffer);
                return true;
            }
            const expectedLength = expectedMideaFrameLength(buffer);
            if (expectedLength !== undefined && buffer.length >= expectedLength) {
                cleanup();
                resolve(buffer.subarray(0, expectedLength));
                return true;
            }
            return false;
        };
        const onData = (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            finish();
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onEnd = () => {
            cleanup();
            if (buffer.length > 0) {
                resolve(buffer);
            }
            else {
                reject(new Error('Midea LAN connection ended before a response was received'));
            }
        };
        const onClose = () => {
            cleanup();
            if (buffer.length > 0) {
                resolve(buffer);
            }
            else {
                reject(new Error('Midea LAN connection closed before a response was received'));
            }
        };
        const timer = setTimeout(() => {
            cleanup();
            if (buffer.length > 0) {
                resolve(buffer);
            }
            else {
                reject(new Error('Timed out waiting for Midea LAN response'));
            }
        }, timeoutMs);
        socket.on('data', onData);
        socket.once('error', onError);
        socket.once('end', onEnd);
        socket.once('close', onClose);
    });
}
function expectedMideaFrameLength(buffer) {
    if (buffer.length < 2)
        return undefined;
    if (buffer[0] === 0x83 && buffer[1] === 0x70) {
        if (buffer.length < 4)
            return undefined;
        return buffer.readUInt16BE(2) + 8;
    }
    if (buffer[0] === 0x5a && buffer[1] === 0x5a) {
        if (buffer.length < 6)
            return undefined;
        return buffer[4] + (buffer[5] << 8);
    }
    return undefined;
}
function isMideaErrorResponse(buffer) {
    if (buffer.toString() === 'ERROR')
        return true;
    if (buffer.length >= 13 && buffer[0] === 0x83 && buffer[1] === 0x70 && buffer.subarray(8).toString() === 'ERROR')
        return true;
    return false;
}
function splitV2Messages(input) {
    const messages = [];
    let data = input;
    while (data.length >= 6) {
        const length = data[4] + (data[5] << 8);
        if (data.length < length)
            break;
        messages.push(data.subarray(0, length));
        data = data.subarray(length);
    }
    return messages;
}
function packetTime() {
    const now = new Date();
    const text = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}${now
        .getUTCMilliseconds()
        .toString()
        .padStart(3, '0')
        .slice(0, 2)}`;
    const bytes = Array.from({ length: 8 }, () => 0);
    for (let index = 0; index < text.length; index += 2) {
        bytes[8 - index / 2 - 1] = Number.parseInt(text.slice(index, index + 2), 10);
    }
    return bytes;
}
function pad2(value) {
    return value.toString().padStart(2, '0');
}
function numberToBuffer(value, length, endian) {
    const buffer = Buffer.alloc(length);
    let remaining = BigInt(value);
    for (let index = 0; index < length; index += 1) {
        const offset = endian === 'little' ? index : length - index - 1;
        buffer[offset] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }
    return buffer;
}
function getUdpIds(applianceId) {
    if (!Number.isFinite(applianceId) || applianceId <= 0)
        return [];
    return [...new Set([getUdpId(applianceId, 'little'), getUdpId(applianceId, 'big')])];
}
function getUdpId(applianceId, endian) {
    const digest = createHash('sha256')
        .update(numberToBuffer(applianceId, 6, endian))
        .digest();
    const output = Buffer.alloc(16);
    for (let index = 0; index < 16; index += 1)
        output[index] = digest[index] ^ digest[index + 16];
    return output.toString('hex');
}
function parseTokenKeyResponse(response, udpId) {
    const tokenList = Array.isArray(response.tokenlist) ? response.tokenlist : Array.isArray(response.tokenList) ? response.tokenList : [];
    const match = tokenList.map(asRecord).find((item) => String(item.udpId ?? item.udpid ?? '').toLowerCase() === udpId.toLowerCase());
    const token = typeof match?.token === 'string' ? match.token : '';
    const key = typeof match?.key === 'string' ? match.key : '';
    if (!isHexCredential(token) || !isHexCredential(key))
        throw new Error('token/key not returned for this udpId');
    return { token, key };
}
function stringifyRecord(data) {
    const output = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null)
            continue;
        output[key] = String(value);
    }
    return output;
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
export function isHexCredential(value) {
    return typeof value === 'string' && value.length >= 32 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}
export function isLikelyNetworkError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /timed out|timeout|ECONN|EHOST|ENET|EPIPE|closed before|ended before|socket hang up/i.test(message);
}
function aesCbcEncrypt(data, key) {
    const cipher = createCipheriv('aes-256-cbc', key, Buffer.alloc(16));
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(data), cipher.final()]);
}
function aesCbcDecrypt(data, key) {
    const decipher = createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}
function xorBuffers(left, right) {
    const output = Buffer.alloc(left.length);
    for (let index = 0; index < left.length; index += 1)
        output[index] = left[index] ^ right[index % right.length];
    return output;
}
function buildStatusCommand() {
    return finalizeSequenceCommand(Buffer.from([
        0xaa, 0x20, 0xac, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x41, 0x81, 0x00, 0xff, 0x03, 0xff, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
    ]));
}
function buildSetCommand(state) {
    const data = Buffer.from([
        0xaa, 0x23, 0xac, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    if (state.power)
        data[11] |= 0b00000001;
    data[11] |= 0b01000000;
    data[12] |= (state.mode & 0b111) << 5;
    const temperature = Math.round(clamp(state.targetTemperature, AC_MIN_TEMPERATURE, AC_MAX_TEMPERATURE));
    data[12] |= temperature & 0b00001111;
    data[13] |= (state.fanSpeed & 0b01111111) | 0x80;
    data[17] = 0x30 | (state.swingVertical ? 0x0c : 0x00);
    if (state.ecoMode) {
        data[18] |= 0x08;
        data[19] |= 0x80;
    }
    return finalizeSequenceCommand(data);
}
let sequence = 0;
function finalizeSequenceCommand(data) {
    sequence = (sequence + 1) & 0xff;
    data[30] = sequence;
    data[data.length - 2] = crc8(data.subarray(10, data.length - 2));
    data[data.length - 1] = checksum(data.subarray(1, data.length - 1));
    return data;
}
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
export function parseAcState(payload, previous) {
    const payloadStart = payload[0] === 0xc0 ? 0 : payload.indexOf(0xc0);
    if (payloadStart < 0)
        return previous;
    const data = payload.subarray(payloadStart);
    if (data.length < 23 || data[0] !== 0xc0)
        return previous;
    const targetTemperature = Math.round((data[2] & 0b00001111) + 16 + ((data[2] & 0b00010000) !== 0 ? 0.5 : 0));
    const currentTemperature = parseTemperature(data[11], data[15] & 0x0f) ?? previous.currentTemperature;
    return {
        power: (data[1] & 0b00000001) !== 0,
        mode: parseMideaMode((data[2] & 0b11100000) >> 5),
        targetTemperature,
        currentTemperature,
        fanSpeed: data[3] & 0b01111111,
        swingVertical: (data[7] & 0x0c) > 0,
        ecoMode: (data[8] & 0x08) > 0 || (data[9] & 0x10) > 0,
    };
}
function parseMideaMode(value) {
    if (value === MideaMode.Off || value === MideaMode.Auto || value === MideaMode.Cool || value === MideaMode.Dry || value === MideaMode.Heat || value === MideaMode.FanOnly)
        return value;
    return MideaMode.Auto;
}
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
export function parseTemperature(raw, decimal) {
    if (!Number.isFinite(raw) || !Number.isFinite(decimal))
        return undefined;
    if (raw === 0 || raw === 0xff)
        return undefined;
    const base = (raw - 50) / 2;
    const digit = decimal * 0.1;
    return base < 0 ? base - digit : base + digit;
}
function crc8(data) {
    let crc = 0;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) !== 0 ? (crc >> 1) ^ 0x8c : crc >> 1;
        }
    }
    return crc & 0xff;
}
function checksum(data) {
    let sum = 0;
    for (const byte of data)
        sum += byte;
    return (~sum + 1) & 0xff;
}
function signProxied(data, random) {
    return createHmac('sha256', HMAC_KEY).update(`${IOT_KEY}${data}${random}`).digest('hex');
}
function encryptPassword(loginId, password) {
    const first = createHash('sha256').update(password, 'ascii').digest('hex');
    return createHash('sha256').update(`${loginId}${first}${APP_KEY}`, 'ascii').digest('hex');
}
function encryptIamPassword(loginId, password) {
    const first = createHash('md5').update(password, 'ascii').digest('hex');
    const second = createHash('md5').update(first, 'ascii').digest('hex');
    return createHash('sha256').update(`${loginId}${second}${APP_KEY}`, 'ascii').digest('hex');
}
function timestamp() {
    const now = new Date();
    return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}
function normalizeApplianceType(value) {
    if (typeof value === 'number')
        return `0x${value.toString(16)}`;
    const text = String(value ?? '').toLowerCase();
    if (text === 'ac')
        return AC_TYPE;
    return text.startsWith('0x') ? text : `0x${text}`;
}
function asRecord(value) {
    return value !== null && typeof value === 'object' ? value : {};
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, value));
}
async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=midea-device.js.map