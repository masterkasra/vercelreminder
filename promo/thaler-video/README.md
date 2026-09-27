# Thaler promo video

A 30-second vertical (1080×1920, 30 fps) motion video for Instagram Reels and the Telegram channel.
The on-screen copy is Persian, with English and German subtitles burned in.

| Time | Scene |
| --- | --- |
| 0–4 s | Gold coin, the تالر wordmark and the tagline |
| 4–10 s | Website: four feature cards, highlighted one by one |
| 10–14 s | Telegram bot: a live chat with inline buttons |
| 14–18 s | Bale bot: the chat flips over into Bale |
| 18–24 s | Packages: three plans with counting prices; the featured plan gets the gold treatment |
| 24–30 s | Call to action: the site address and both bot usernames |

## Change the text

Everything the video says is in [`content.js`](content.js): brand, features, bot messages and buttons, packages and prices, and the EN/DE subtitle cues.
Set `draft: false` to remove the red DRAFT label.

## Render

Needs Node 18+, Python 3 with `numpy` and `scipy`, and an ffmpeg build with libx264.

```bash
npm install                     # Playwright
pip install numpy scipy
npm run stills                  # PNG stills in out/ for a quick check
npm run render                  # out/music.wav, then out/thaler-promo.mp4
```

`FFMPEG=/path/to/ffmpeg` and `WORKERS=4` (parallel browser pages) can be set as environment variables.
Open `index.html?play` in Chrome for a live preview, or `index.html?t=21.5` to freeze at a moment.

## Pieces

- `index.html`: the composition. GSAP timeline, a canvas background, and `window.__seek(t)` for frame-exact rendering.
- `music.py`: an original 120 BPM soundtrack plus sound effects placed on the animation's hits, synthesized with numpy (no samples).
- `render.mjs`: captures every frame in headless Chromium and encodes H.264 High / AAC, loudness-normalized to −14 LUFS.

Fonts: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) and [Manrope](https://github.com/sharanda/manrope), both OFL (licences in `fonts/`).
Icons: [Lucide](https://lucide.dev) (ISC) and the Telegram mark from [Simple Icons](https://simpleicons.org) (CC0). Animation: [GSAP](https://gsap.com).
