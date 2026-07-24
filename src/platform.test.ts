import { describe, expect, it } from 'vitest';

import { MideaMode, type MideaAcState } from './midea-device.js';
import {
  celsiusToMatterSetpoint,
  celsiusToMatterTemperature,
  isSwingVerticalActive,
  isValidMideaDeviceConfig,
  matterFanPercentToMidea,
  matterTemperatureToCelsius,
  mideaFanSpeedToPercent,
  parseMideaDeviceConfigs,
} from './platform.js';

const validDevice = {
  id: '123456789',
  name: 'Bedroom AC',
  sn: 'SN123',
  type: '0xac',
  ip: '192.168.1.50',
  port: 6444,
  version: 3,
  token: '',
  key: '',
} as const;

describe('platform helpers', () => {
  it('converts Celsius values to Matter temperature units', () => {
    expect(celsiusToMatterTemperature(23.42)).toBe(2342);
    expect(celsiusToMatterSetpoint(23.6)).toBe(2400);
  });

  it('returns safe Matter temperature defaults for non-finite values', () => {
    expect(celsiusToMatterTemperature(Number.NaN)).toBe(0);
    expect(celsiusToMatterSetpoint(Number.POSITIVE_INFINITY)).toBe(1600);
  });

  it('converts Matter temperature units to clamped Celsius values', () => {
    expect(matterTemperatureToCelsius(2450)).toBe(25);
    expect(matterTemperatureToCelsius(4000)).toBe(31);
  });

  it('converts Matter fan percentages to Midea fan speed values', () => {
    expect(matterFanPercentToMidea(42)).toBe(42);
    expect(matterFanPercentToMidea(96)).toBe(100);
  });

  it('returns 0 for invalid Matter fan percentages', () => {
    expect(matterFanPercentToMidea(Number.NaN)).toBe(0);
    expect(matterFanPercentToMidea(null)).toBe(0);
  });

  it('converts Midea manual and auto fan speed values to Matter percentages', () => {
    expect(mideaFanSpeedToPercent(66)).toBe(66);
    expect(mideaFanSpeedToPercent(102)).toBe(0);
  });

  it('exposes vertical swing only while the AC is powered', () => {
    const state: MideaAcState = {
      power: false,
      mode: MideaMode.Cool,
      targetTemperature: 24,
      currentTemperature: 23,
      fanSpeed: 66,
      swingVertical: true,
      ecoMode: false,
    };

    expect(isSwingVerticalActive(state)).toBe(false);
    expect(isSwingVerticalActive({ ...state, power: true })).toBe(true);
    expect(isSwingVerticalActive({ ...state, power: true, swingVertical: false })).toBe(false);
  });

  it('validates Midea device config entries from external config', () => {
    expect(isValidMideaDeviceConfig(validDevice)).toBe(true);
    expect(parseMideaDeviceConfigs([validDevice])).toHaveLength(1);
  });

  it('drops invalid Midea device config entries from external config', () => {
    expect(isValidMideaDeviceConfig({ ...validDevice, port: Number.NaN })).toBe(false);
    expect(parseMideaDeviceConfigs([{ ...validDevice, version: 4 }, null])).toEqual([]);
  });
});
