import { describe, expect, it } from 'vitest';

import { isHexCredential, isLikelyNetworkError, MideaMode, type MideaAcState, parseAcState, parseTemperature } from './midea-device.js';

const previousState: MideaAcState = {
  power: false,
  mode: MideaMode.Auto,
  targetTemperature: 24,
  currentTemperature: 23,
  fanSpeed: 102,
  swingVertical: false,
  ecoMode: false,
};

function createStatusPayload(): Buffer {
  const payload = Buffer.alloc(23);
  payload[0] = 0xc0;
  payload[1] = 0b00000001;
  payload[2] = (MideaMode.Cool << 5) | 8;
  payload[3] = 66;
  payload[7] = 0x0c;
  payload[8] = 0x08;
  payload[11] = 97;
  payload[15] = 0;
  return payload;
}

describe('Midea protocol helpers', () => {
  it('validates even-length hex LAN credentials', () => {
    expect(isHexCredential('a'.repeat(32))).toBe(true);
    expect(isHexCredential('a'.repeat(31))).toBe(false);
  });

  it('parses signed Midea temperatures in Celsius', () => {
    expect(parseTemperature(97, 0)).toBe(23.5);
    expect(parseTemperature(49, 3)).toBe(-0.8);
  });

  it('returns undefined for unavailable or invalid Midea temperatures', () => {
    expect(parseTemperature(0, 0)).toBeUndefined();
    expect(parseTemperature(Number.NaN, 0)).toBeUndefined();
  });

  it('parses AC status payloads into state', () => {
    expect(parseAcState(createStatusPayload(), previousState)).toEqual({
      power: true,
      mode: MideaMode.Cool,
      targetTemperature: 24,
      currentTemperature: 23.5,
      fanSpeed: 66,
      swingVertical: true,
      ecoMode: true,
    });
  });

  it('keeps previous state for payloads without an AC status marker', () => {
    expect(parseAcState(Buffer.from([0x01, 0x02, 0x03]), previousState)).toBe(previousState);
  });

  it('falls back to auto mode for invalid decoded protocol modes', () => {
    const payload = createStatusPayload();
    payload[2] = (7 << 5) | 8;
    expect(parseAcState(payload, previousState).mode).toBe(MideaMode.Auto);
  });

  it('classifies transient LAN network failures', () => {
    expect(isLikelyNetworkError(new Error('Timed out connecting to 192.168.1.16:6444'))).toBe(true);
    expect(isLikelyNetworkError(new Error('connect ECONNREFUSED 192.168.1.16:6444'))).toBe(true);
    expect(isLikelyNetworkError(new Error('Midea LAN connection closed before a response was received'))).toBe(true);
    expect(isLikelyNetworkError(new Error('Midea v3 authentication signature mismatch'))).toBe(false);
  });
});
