# Aurelac

A portrait harvesting game set on Bakhroma Green. Prospectors extract **root pearls** from beneath a tethered husk, a pink membrane, and orange carrom blisters. This build is the cut-and-peel prototype for common node BG–107. The playable sequence ends at the exposed carrom lobe.

## Run the bench

Use Node 22.12 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

While the dev or preview server is running, use `npm run test:browser` to exercise pointer and touch input in Chromium. The test uses the installed system Chromium when available. Otherwise run `npx playwright install chromium` or set `AURELAC_CHROMIUM` to a browser binary. Set `AURELAC_TEST_URL` to test a published build. Screenshots go to the ignored `playtest-results/` directory.

## Code layout

- The incision lips and tools use the same tray coordinates, seam samples, ordered attachments, and tuning. [geometry.js](src/geometry.js)
- Cut, wetness, peel, and tear are derived from input positions. Specimen data is independent of browser state and rendering. [specimen.js](src/specimen.js)
- The renderer clips deeper tissue to the opening and animates recoil. Append `?debug=1` to see opening width, hit regions, and pull load. [render.js](src/render.js)
- The browser controller handles tool selection, pointer capture, cancellation, resizing, and the field guide. It maps CSS pixels to the tray, even when a finger moves past the canvas. [main.js](src/main.js)

The source pages define the milestone gates, the inked specimen art, and the in-world terminology and order of operations. [Gameplay specification](https://chatgpt.com/space/page_6c29719eb03c81918cc830afdc78cc83) · [Art direction](https://chatgpt.com/space/page_963f32e48dd08191b1b68d933026e251) · [Prospecting guide](https://chatgpt.com/space/page_4b477d5814148191b38d358d447f4819)

## Deploy to Cloudflare

Authenticate Wrangler with access to Workers and Custom Domains on `sirsean.me`. Check out the branch you intend to deploy, then run `npm run deploy -- <branch>`. The script builds static assets and uses a different Worker for each branch.

- `main` uses `aurelac.sirsean.me`.
- `peel-prototype` uses `peel-prototype.aurelac.sirsean.me`.
- Other branches use the same preview scheme. Names that need normalization get a stable hash suffix so similarly named branches deploy independently.

Cloudflare manages DNS and certificates for these exact Worker Custom Domains. The prototype uses the preview branch. Deployments are explicit.

## Prototype playtest

Run `/?playtest=starter` on a portrait phone with first-time players. It starts with a short slit, a loose corner, and Grip selected. The field guide and bench captions are hidden. Ask, “Can you get the orange lobe free in one piece?” Record the first wrong move, where the player thinks the flap is caught, what they try next, and whether they recover without prompting. Show a clean release and a tear separately and ask which left tissue behind.

Use `/?playtest=intact` to check whether a new player can find and cut the crease unaided. Reset restores the starting condition for either route. The proposed gate is at least three uncoached recoveries among five new players. Record device, viewport, whether they used one or two fingers, and any missed grab. When players recognize the lip but miss the flap, adjust the grip target. When they miss the lip itself, adjust the pose and silhouette.

### Verification on 2026-11-26

The model suite covers short-slit recovery from either end, dry catches, outward pulls, localized remnants, nicks, and sparse versus dense input sampling. Chromium 156 was exercised at 1280 × 900 with mouse input, at a narrow 320 × 640 viewport, and at 390 × 844 and 375 × 800 with touch emulation. The browser test completed a clean peel, interrupted a two-finger gesture, forced a tear, resized mid-stroke, and completed the damaged peel without resetting. Fresh-player results and physical-phone performance are pending.

## After the prototype gate

Complete the harvest on the same seed before introducing rarity. Model intrinsic size, amber depth, and potential clarity independently of handling damage. Add carrom blisters that settle, local clouding from nicks, and a severe rupture that releases poison gas and visibly melts the pearl. Fazer should preserve surviving clarity. Appraise a pearl after inspection and storage. Confirm clean, flawed, and ruined paths before adding specimen variants.

Then tune varied seeds, blade wear, sharpening, and a versioned local collection. Verify reload during a damaged harvest and idempotent storage. Tune replay and input feedback on real devices and with fresh and practiced players.
