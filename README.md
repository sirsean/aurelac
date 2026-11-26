# Aurelac

A portrait harvesting game set on Bakhroma Green. Prospectors extract **root pearls** from beneath a tethered husk, a pink membrane, and orange carrom blisters. The complete-harvest preview plays through one common node, BG–107, from the first incision to case appraisal.

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
- Blister timing, cuts, Fazer coverage, placement, and appraisal live in the harvest model. Its renderer shows the same fold geometry and rotates local damage with the pearl. [harvest.js](src/harvest.js) · [harvest-render.js](src/harvest-render.js)
- The renderer clips deeper tissue to the opening and animates recoil. Append `?debug=1` to see opening width, hit regions, and pull load. [render.js](src/render.js)
- The browser controller handles tool selection, pointer capture, cancellation, resizing, and the field guide. It maps CSS pixels to the tray, even when a finger moves past the canvas. [main.js](src/main.js)

The source pages define the milestone gates, the inked specimen art, and the in-world terminology and order of operations. [Gameplay specification](https://chatgpt.com/space/page_6c29719eb03c81918cc830afdc78cc83) · [Art direction](https://chatgpt.com/space/page_963f32e48dd08191b1b68d933026e251) · [Prospecting guide](https://chatgpt.com/space/page_4b477d5814148191b38d358d447f4819)

## Deploy to Cloudflare

Authenticate Wrangler with access to Workers and Custom Domains on `sirsean.me`. Check out the branch you intend to deploy, then run `npm run deploy -- <branch>`. The script builds static assets and uses a different Worker for each branch.

- `main` uses `aurelac.sirsean.me`.
- `peel-prototype` uses `peel-prototype.aurelac.sirsean.me`.
- `complete-harvest` uses `complete-harvest.aurelac.sirsean.me`.
- Other branches use the same preview scheme. Names that need normalization get a stable hash suffix so similarly named branches deploy independently.

Cloudflare manages DNS and certificates for these exact Worker Custom Domains. Deployments are explicit.

## Prototype playtest

Run `/?playtest=intact` on a portrait phone with first-time players. The standard bench and the caption-free playtest both start with a closed husk and Blade selected. The earlier `/?playtest=starter` link opens the same caption-free bench. Ask, “Can you expose the orange lobe without leaving pink tissue behind?” Record how they find the crease, where they think the flap catches, what they try next, and whether they recover without prompting. Show a clean section and a tear separately and ask which left tissue behind.

Reset restores the closed specimen in either mode. The proposed gate is at least three uncoached recoveries among five new players. Record device, viewport, whether they used one or two fingers, and any missed grab. When players recognize the lip but miss the flap, adjust the grip target. When they miss the lip itself, adjust the pose and silhouette.

### Verification on 2026-11-26

The model suite covers short-slit recovery from either end, dry catches, outward pulls, localized remnants, nicks, and sparse versus dense input sampling. Chromium 156 was exercised at 1280 × 900 with mouse input, at a narrow 320 × 640 viewport, and at 390 × 844 and 375 × 800 with touch emulation. The browser test completed a clean peel, interrupted a two-finger gesture, forced a tear, resized mid-stroke, and completed the damaged peel without resetting. A manual run on the published starter bench still caught after the first extension. Cutting the opposite end and rewetting the margin freed the flap. Fresh-player results and physical-phone performance are pending.

The diffuser splashes on the exposed membrane. The sheen weakens as the fold dries, and the lip settles. Each of the three sections has its own exposed fold to wet. A fully soaked fold starts falling below the safe wetness threshold after about six seconds. The raised lips curl right, left, and right. A steady pull in the direction of the curl releases one section. The fold bunches under a wrong-way tug and tears if the pull continues hard enough. A sharp yank or a pull on a brittle fold also leaves a ragged remnant.

Model tests cover the closed start, one section per grip, timed drying and refreshing, and clean and torn pulls in both directions. Browser checks exercise the closed start and reset, the fade and dry tear, recovery after a wrong-way tear, and three clean sections with mouse and emulated touch.

## Complete harvest

Cut each blister along its pale fold during the settled window, then lift it with Grip. Pausing a cut preserves the opening. Acid from a nick leaves a local haze that rotates with the pearl. A rupture releases poison gas and melts the pearl. Fazer spreads as the player rolls the pearl, and the work light reveals patches where the solution has not reached. Closing the case produces a size, amber depth, and clarity appraisal. Closing on the rim can chip the pearl.

Chromium 156 completed pristine, flawed, and ruined harvests on BG–107 with desktop mouse and emulated touch. The checks resumed a paused cut, treated a hazy patch before storage, and verified that blade, diffuser, and Grip still complete the closed-start peel.

## Next milestones

Introduce three curated specimens with independent size, intrinsic clarity, blister placement, and slack windows. Check whether players can read the rare specimen's shorter settled window on a phone. Then add blade wear, sharpening, and a versioned local collection that preserves damage across reloads and records each stored pearl once. Tune replay and input feedback with fresh and practiced players.
