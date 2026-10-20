# FidgetLab

A collection of fidgets with sounds made in the browser. You can install it as a PWA and deploy it on Railway.

**Fidgets:** Pop-it (3×3), Fidget Spinner, Newton's Cradle, Toggle Switches (three, stacked vertically), Knob, Slider, Gears (one gear drives two others), Joystick.

**Layouts**
- **Board:** a scrollable 2 × 8 board of fidgets with a dot pager on the right. Use *Edit board* in Settings to choose which fidget goes in each cell.
- **Swipe to switch:** one fidget at a time. Swipe left or right along the bar at the top (or tap the arrows) to move to the next or previous one.

**Features**
- Installable PWA that works offline once loaded (service worker + manifest, maskable icon)
- Optional accounts that sync your stats and color settings across devices. Guests keep everything in the browser, and signing up carries their progress into the new account.
- Color schemes: Ocean, Forest, Candy, Sunset, or Custom (you pick the three colors). Light, dark or system appearance.
- Sounds are synthesized live with the Web Audio API (pops, clicks, ticks, clacks, toggles, whir), with volume, mute and vibration settings

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm test
```

## Deploy on Railway

1. Create a new service from this repo. `railway.json` sets the start command and the `/api/health` healthcheck.
2. **Attach a Volume** to the service with mount path **`/data`**.
   Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically, and the server stores its database (`fidgetlab.json`) there. Without a volume, accounts are lost on every redeploy.
3. Generate a public domain. The PWA needs HTTPS to install, and Railway domains provide it.

| Variable   | Default                                  | Purpose                    |
|------------|------------------------------------------|----------------------------|
| `PORT`     | set by Railway                           | HTTP port                  |
| `DATA_DIR` | `$RAILWAY_VOLUME_MOUNT_PATH` or `./data` | Where account data is kept |

## Layout

```
server.js            Express server: static PWA + /api (accounts, settings, stats)
lib/store.js         JSON file store with atomic writes
lib/validate.js      Settings/stats sanitizing
public/              The app (vanilla JS modules, no build step)
  js/fidgets/*.js    One module per fidget
  js/sound.js        Web Audio sound synthesis
  sw.js              Service worker
```

Passwords are hashed with scrypt. Sessions use an httpOnly cookie, and write requests must be JSON, which blocks cross-site form posts.
