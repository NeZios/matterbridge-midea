# matterbridge-midea

Matterbridge dynamic platform plugin for Midea SmartHome air conditioners with LAN-only operation after first bootstrap.

This plugin targets Midea AC devices exposed through the Midea SmartHome cloud, including the Midea Portasplit 3.5kW `MMCS-12HRN8-QRD0` (`0xAC` appliance type).

## Project Status

This plugin is community-maintained and was developed with AI assistance. It works in the maintainer's own setup, but Midea devices and cloud APIs vary by region, account type, firmware, and app backend.

Treat `0.x` releases as experimental. Please open issues with Matterbridge version, Node.js version, plugin version, Midea app/backend, region, AC model, sanitized logs, and sanitized config.

## Features

- Logs in to the Midea SmartHome cloud once to bootstrap device metadata and LAN credentials
- Discovers `0xAC` air conditioners on the account and on the local network
- Exposes each AC as a bridged Matter Room Air Conditioner endpoint
- Exposes a separate bridged Matter Fan endpoint for HomeKit fan-speed control
- Exposes separate On/Off endpoints for fan auto mode, vertical swing, and eco mode
- Maps LAN state to Matter `OnOff`, `Thermostat`, and `FanControl`
- Supports power, whole-degree target temperature, current temperature, AC mode, fan speed, fan auto, vertical swing, and eco mode
- Polls LAN state every 30 seconds by default
- Clears cloud credentials from config after successful LAN bootstrap

## Configuration

```json
{
  "username": "user@email.com",
  "password": "password",
  "polling_interval": 30,
  "devices": []
}
```

On first start, the plugin uses `username` and `password` to discover AC devices and fetch their LAN `token`/`key`. It tries the NetHome Plus token API first, then falls back to the Midea SmartHome cloud API used by newer integrations. It also performs LAN discovery to find the device IP and port, and can bootstrap from the LAN-discovered device ID when the cloud appliance list is empty or incomplete.

## MSmartHome App Requirement

The MSmartHome app is not required to extract the LAN `token` and `key` manually. The plugin reproduces the relevant cloud flow directly:

1. Signs in with the MSmartHome account.
2. Retrieves the account appliances and their `applianceId`.
3. Requests `token` and `key` candidates using `applianceCodes`.
4. Validates each candidate against the appliance over the local network.
5. Saves the working LAN credentials.
6. Removes the cloud username and password from the Matterbridge configuration.

The app is generally needed only for the initial appliance setup: joining the AC to Wi-Fi and linking it to the Midea account. Once the appliance is linked to the account and reachable on the LAN, the plugin can bootstrap itself.

The first bootstrap still requires temporary cloud access to obtain the LAN credentials. Subsequent control is entirely local.

The `applianceCodes` requirement was identified and documented by Cauan in [One missing field: how I got my Midea ACs working locally in Home Assistant](https://github.com/cauan/midea-local-tokens/blob/main/WRITEUP.md).

After bootstrap, Matterbridge saves a `devices` entry like:

```json
{
  "id": "123456789012345",
  "name": "Midea AC",
  "displayName": "Clim Salon",
  "sn": "000000P0000000Q11...",
  "type": "0xac",
  "ip": "192.168.1.42",
  "port": 6444,
  "version": 3,
  "token": "hex-token",
  "key": "hex-key"
}
```

When every AC has `ip`, `port`, `token`, and `key`, the plugin clears `username` and `password` from config. Future starts use LAN only and do not contact Midea cloud.

Set `displayName` to control the name exposed to Matter/HomeKit without changing the original Midea device name. The plugin derives child endpoint names from it, for example `Clim Salon Fan`, `Clim Salon Fan Auto`, `Clim Salon Swing Vertical`, and `Clim Salon Eco`.

`polling_interval` is in seconds. Values below 10 seconds are clamped to 10 seconds.

## Privacy LAN Workflow

1. Configure `username`, `password`, and `polling_interval`.
2. Start Matterbridge once with Internet access available to the Matterbridge host.
3. Confirm the plugin has populated `devices` with `ip`, `token`, and `key`.
4. Restart Matterbridge once so it runs from stored LAN credentials.
5. Block the Midea AC from Internet access at your router/firewall.

Keep LAN traffic between Matterbridge and the AC allowed. The plugin needs TCP access to the discovered AC IP/port.

## Development Install

Matterbridge plugins must not bundle or depend on `matterbridge`. Link Matterbridge from the running development installation:

```bash
npm install --no-fund --no-audit
npm link matterbridge
npm run build
matterbridge -add .
```

## Matter Mapping

- `OnOff.onOff` maps to AC power over LAN.
- `Thermostat.localTemperature` maps to indoor/current temperature.
- `Thermostat.occupiedCoolingSetpoint` and `occupiedHeatingSetpoint` map to the AC target temperature.
- `Thermostat.systemMode` maps to Midea modes: auto, cool, heat, fan-only, dry, and off.
- `FanControl.fanMode` maps to off, low, medium, high, and auto fan speeds.
- The dedicated Fan endpoint controls the same AC fan speed. It exists because some Matter controllers expose embedded Room Air Conditioner fan controls poorly.
- Target setpoints are rounded to whole Celsius degrees before being sent to the AC. Some controllers, including HomeKit, may still display a 0.5 degree UI step even though the plugin sends whole-degree commands.
- The `Fan Auto`, `Swing Vertical`, and `Eco` endpoints map to Midea LAN toggles when supported by the AC firmware.
- `Swing Vertical` reports off while the AC is powered off, even if Midea retains the swing preference internally. Turning the switch on powers the AC on; turning it off only disables swing.
- Eco preserves the previous manual fan speed when possible and also recognizes Midea's `power_saving` status bit used by some AC firmware.
- Matter attribute updates are synchronized after command handlers return, avoiding controller transaction stalls on fast repeated HomeKit actions.

## Notes

Midea has disabled some token/key retrieval APIs for certain app/cloud combinations. If automatic token/key bootstrap fails even with the NetHome Plus fallback, fill `devices` manually with `id`, `ip`, `port`, `version`, `token`, and `key`; after that the plugin can run LAN-only.

If Matterbridge logs `ENOENT ... /usr/local/lib/node_modules/matterbridge-midea/package.json`, the global npm installation is incomplete or corrupted before the plugin code is loaded. Remove the plugin from Matterbridge, restart Matterbridge, then upload and install a freshly packed `.tgz`.

The plugin only publishes Matter attribute updates when the LAN state changes, keeping regular polling quiet and reducing controller transaction load.

## Acknowledgements

This Matterbridge plugin was inspired by community work around Midea LAN/cloud integrations, especially [homebridge-midea-platform](https://github.com/kovapatrik/homebridge-midea-platform).

The MSmartHome `applianceCodes` token-request fix is based on the reverse-engineering research published by Cauan in [midea-local-tokens](https://github.com/cauan/midea-local-tokens) and its [technical write-up](https://github.com/cauan/midea-local-tokens/blob/main/WRITEUP.md).

This project is not affiliated with Midea, Homebridge, Matterbridge, or those projects.
