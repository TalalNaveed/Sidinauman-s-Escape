<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/095a0696-6203-44a0-a5e5-65e3f709abee

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Optional: set `DUBAI_MUSIC_URL` in [.env.local](.env.local) to use a real (licensed/royalty-free) audio track as the soundtrack.
   - Example (local file served by Vite): `DUBAI_MUSIC_URL="/music/dubai-chase.mp3"`
   - Put the file at `public/music/dubai-chase.mp3`.
4. Run the app:
   `npm run dev`
