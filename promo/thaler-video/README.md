# Thaler promo video

A 32-second vertical (1080×1920, 30 fps) motion video for www.thaler.ir, a German-learning site for Persian speakers.
It's made for Instagram Reels and the Telegram channel. The on-screen copy is Persian, with English and German subtitles burned in.

| Time | Scene |
| --- | --- |
| 0–4 s | A gold Thaler coin stamped "DE", the تالر wordmark and the hook line from the site |
| 4–8 s | Spaced repetition with FSRS: flashcards deal in and one flips to its meaning, then the word bank counts up to 100,000 |
| 8–14 s | Six dashboard features, highlighted in pairs: grammar path, AI conversation, writing correction, pronunciation, music/podcasts, mock exams |
| 14–18 s | Dictionary bot on Telegram (@ThalerWortBot): send a word, get article, meaning, pronunciation and an example |
| 18–22 s | The chat flips over to the Bale bot (thaler_bot), which works inside Iran without a VPN |
| 22–28 s | Four plans with counting prices; the 6-month plan gets the "پیشنهاد ما" highlight |
| 28–32 s | Call to action: free start, the site address and both bot usernames |

## Change the text

Everything the video says is in [`content.js`](content.js): brand, features, the bot chats, plans and prices, and the EN/DE subtitle cues.
Setting `draft: true` adds a red DRAFT label.

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
- `music.py`: an original 120 BPM soundtrack (D major, one chord per 2 s bar, so every scene cut lands on a downbeat) plus sound effects placed on the animation's hits, synthesized with numpy (no samples).
- `render.mjs`: captures every frame in headless Chromium and encodes H.264 High / AAC, loudness-normalized to −14 LUFS.

Fonts: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) and [Manrope](https://github.com/sharanda/manrope), both OFL (licences in `fonts/`).
Icons: [Lucide](https://lucide.dev) (ISC) and the Telegram mark from [Simple Icons](https://simpleicons.org) (CC0). Animation: [GSAP](https://gsap.com).
