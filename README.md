# Aurelac

A portrait harvesting game set on Bakhroma Green. Prospectors extract **root pearls** from beneath a tethered husk, a pink membrane, and orange carrom blisters. A harvest runs from the first incision to the case appraisal.

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

- The incision lips and tools share a seed-derived crease and ordered attachments. The same layout also places the blisters inside the opening. [geometry.js](src/geometry.js)
- Cut, wetness, peel, and tear are derived from input positions. Specimen data is independent of browser state and rendering. [specimen.js](src/specimen.js)
- Blister timing, fold geometry, coating, placement, and appraisal live in the harvest model. The renderers use the same fold and coating geometry, and rotate local damage with the clean pearl. [harvest.js](src/harvest.js) · [harvest-render.js](src/harvest-render.js) · [pearl-render.js](src/pearl-render.js)
- The renderer clips deeper tissue to the opening and animates recoil. Append `?debug=1` to see opening width, hit regions, and pull load. [render.js](src/render.js)
- Curated specimen geometry, intrinsic pearl properties, and blister timing live in node profiles. Blade wear is shared across harvests. The save module restores the active bench and appends one collection record per successful run. [nodes.js](src/nodes.js) · [blade.js](src/blade.js) · [save.js](src/save.js)
- The browser controller handles tool selection, pointer capture, cancellation, resizing, and the field guide. It maps CSS pixels to the tray, even when a finger moves past the canvas. [main.js](src/main.js)
- Optional tool feedback synthesizes short material sounds and uses the browser vibration API where available. [feedback.js](src/feedback.js)

The source pages define the milestone gates, the inked specimen art, and the in-world terminology and order of operations. [Gameplay specification](https://chatgpt.com/space/page_6c29719eb03c81918cc830afdc78cc83) · [Art direction](https://chatgpt.com/space/page_963f32e48dd08191b1b68d933026e251) · [Prospecting guide](https://chatgpt.com/space/page_4b477d5814148191b38d358d447f4819)

## Deploy to Cloudflare

Authenticate Wrangler with access to Workers and Custom Domains on `sirsean.me`. Check out the branch you intend to deploy, then run `npm run deploy -- <branch>`. The script builds static assets and uses a different Worker for each branch.

- `main` uses `aurelac.sirsean.me`.
- `peel-prototype` uses `peel-prototype.aurelac.sirsean.me`.
- `complete-harvest` uses `complete-harvest.aurelac.sirsean.me`.
- `specimens-and-collection` uses `specimens-and-collection.aurelac.sirsean.me`.
- Other branches use the same preview scheme. Names that need normalization get a stable hash suffix so similarly named branches deploy independently.

Cloudflare manages DNS and certificates for these exact Worker Custom Domains. Deployments are explicit.

## Prototype playtest

Run `/?playtest=intact` on a portrait phone with first-time players. The standard bench and the caption-free playtest both start with a closed husk and Blade selected. The earlier `/?playtest=starter` link opens the same caption-free bench. Ask, “Can you expose the orange lobe without leaving pink tissue behind?” Record how they find the crease, where they think the flap catches, what they try next, and whether they recover without prompting. Show a clean section and a tear separately and ask which left tissue behind.

Reset restores the closed specimen in either mode. The proposed gate is at least three uncoached recoveries among five new players. Record device, viewport, whether they used one or two fingers, and any missed grab. When players recognize the lip but miss the flap, adjust the grip target. When they miss the lip itself, adjust the pose and silhouette.

### Verification on 2026-11-26

The model suite covers short-slit recovery from either end, dry catches, outward pulls, localized remnants, nicks, and sparse versus dense input sampling. Chromium 156 was exercised at 1280 × 900 with mouse input, at a narrow 320 × 640 viewport, and at 390 × 844 and 375 × 800 with touch emulation. The browser test completed a clean peel, interrupted a two-finger gesture, forced a tear, resized mid-stroke, and completed the damaged peel without resetting. A manual run on the published starter bench still caught after the first extension. Cutting the opposite end and rewetting the margin freed the flap. Fresh-player results and physical-phone performance are pending.

The diffuser splashes on the exposed membrane. The sheen weakens as the fold dries, and the lip settles. Each section has its own exposed fold to wet. A fully soaked fold starts falling below the safe wetness threshold after about six seconds. A steady pull in the direction of the raised curl releases one section. The fold bunches under a wrong-way tug and tears if the pull continues hard enough. A sharp yank or a pull on a brittle fold also leaves a ragged remnant.

Model tests cover the closed start, one section per grip, timed drying and refreshing, and clean and torn pulls in both directions. Browser checks exercise the closed start and reset, the fade and dry tear, recovery after a wrong-way tear, and three clean sections with mouse and emulated touch.

## Complete harvest

Five carrom blisters surround the root pearl. Cut each pale fold at its own angle during the settled window. Pausing preserves the cut. A cut blister follows Grip and stays out when released clear of the opening. Each removal exposes more of the pearl inside the husk.

Fazer gradually treats the sticky amber coating while the spray is held over it or swept across it. The goop turns green when Wipe can lift it. Some pearls have a thicker patch that reveals more amber goop as the treated surface comes off. That patch needs another spray and wipe. Once clean, the pearl can be rolled under the work light so a nick's local acid haze rotates into view. The case appraisal records size, amber depth, and clarity. Residual coating and closing on the rim can lower the appraisal.

If a blister ruptures, the cutting bench stays in view. The torn tissue deflates, gas spreads out from the cut, and the exposed pearl softens into residue in the husk. Record loss appears when the scene settles, about five and a half seconds after the tear. With reduced motion, the bench shows the aftermath immediately.

Chromium 156 completed pristine, flawed, and ruined harvests on BG–107. Checks covered the five angled cuts, dragging a blister clear, spraying and wiping the pearl in stages, and the closed-start peel with mouse and emulated touch.

## Specimens and repeat harvests

Select the broad, small, or rare node at the top of the tray. Shape, pearl size, intrinsic amber and clarity, and blister placement vary by node. The rare node has a shorter settled window and a subtler fold. The starting properties determine pearl size and amber depth. Handling and damage affect the clarity appraisal.

Every fresh specimen has its own curved crease and two to four peel sections. Section length affects how far you need to pull. The exposed curl shows the pull direction and angle. Reloading retains the layout and existing tissue state. Reset node starts a fresh layout for the selected node type.

The broad node yields honey amber, the small node cloud white, and the rare node smoky violet. Inclusions vary by harvest. The Work light brings out the color within the stone, and reflections shift across its faces as it rolls. The collection uses the same pearl art. The rounded shapes, cloudy translucency, and amber inclusions draw on the film's practical props. [Aurelac case trailer still and prop photos](https://sionnachstudios.com/prospect-behind-the-scenes-part-one-aurelac-case/)

The Blade gradually dulls through repeated cuts. When the husk starts to bunch, select Stone and draw the blade back and forth on it. Reloading the bench preserves the incision, damage, harvest stage, and blade condition. The membrane continues drying while the bench is closed. Collection lists stored pearls in the current browser, including their source node and appraisal. Ruined pearls appear in the loss appraisal.

Sound and Haptics are independent Field guide options and start off. The bench remembers them in the current browser. Use the options on a phone to compare the cut, spray, and tear cues with and without sound and vibration.

On a fresh phone browser, ask first-time and practiced players to try the broad node and then the rare node. Listen for what tells them a fold is ready and whether they recognize a missed cut. After repeat harvests, observe whether they notice blade drag and choose Stone, and whether they can connect any appraisal flaw to the handling that caused it. Compare one-handed and two-finger runs. Physical-phone and fresh-player observations are pending.
