# Watch Party Sync

Build a mobile-friendly web app called "SyncWatch" (working title) — a synchronized watch-party platform similar to Kosmi/Rave. This is Phase 1 — build exactly this scope, nothing more.

ROOMS & AUTH
- Landing page: "Create Room" and "Join Room" (via a 6-character room code) actions.
- Guest mode: user enters a display name, no account needed, gets a temporary session tied to the room.
- Optional full account: Supabase Auth (email/password) so returning users can save a profile/display name; guests must still be fully supported without signup.
- Room record: unique short code, host (creator), list of active participants (display name, avatar color), created_at.

REALTIME SYNC ENGINE (core feature — build this carefully, it's the heart of the app)
- Use Supabase Realtime (a `player_state` table + Realtime subscription, or a broadcast channel) to sync one shared playback state per room: { source_type, source_ref (video id/url), is_playing, position_seconds, updated_at, updated_by }.
- Any participant can control playback (play/pause/seek) for this MVP — no host-only lock needed yet.
- When state changes, all clients reconcile their local player to the new position, accounting for network delay (position_seconds + elapsed time since updated_at when is_playing = true).
- Debounce/throttle seek updates to avoid excessive writes.

VIDEO SOURCES (Phase 1 — exactly these five, nothing else)
1. YouTube — in-app search (call the YouTube Data API v3 search endpoint; store the API key as a Supabase secret/env var and leave a clear placeholder + code comment explaining where to add it) plus a "paste YouTube link" option. Playback via the official YouTube IFrame Player API (enablejsapi=1) for accurate programmatic play/pause/seek and state sync.
2. Vimeo — paste link, playback via the Vimeo Player postMessage API for programmatic control.
3. Direct video file link — any standard extension (mp4, webm, ogg, mov, etc.) played via a native HTML5 <video> element, fully controllable.
4. Local file upload — user uploads a video file, store it in Supabase Storage, get a shareable URL, and play it via the same HTML5 <video> path as #3 so every participant streams from that URL.
5. "Other link" (e.g. Aparat or any other site) — best-effort iframe embed only. Clearly show a small badge: "Sync not guaranteed for this source" since there is no reliable control API for arbitrary third-party sites. Never let this break the app if a site refuses iframe embedding — show a friendly fallback message with a plain link instead of a broken embed.

Do NOT attempt to scrape Google search results, and do NOT attempt to support Netflix/Disney+/HBO/Prime-style integrations — that requires native-app WebView script injection and is not technically possible inside a website. Out of scope, do not build it.

CHAT
- Realtime per-room text chat (Supabase Realtime), stored in a `messages` table, shows display name + timestamp, auto-scrolls, works for both guests and logged-in users.

ROOM UI
- Room page: large video player area, participant list (avatars/names) in a sidebar, chat panel (collapsible on mobile), room code visible with a "copy invite link" button, basic playback controls (play/pause/seek bar/volume) under the player.
- Clean, modern UI with a sleek dark theme by default (this is a media/entertainment product) and an accent color of your choice.

EXPLICITLY OUT OF SCOPE FOR THIS PHASE (do not build now, but keep the code reasonably extensible for adding these later)
- Voice chat / WebRTC calls
- Screen or tab sharing
- Netflix/Disney+/HBO/Prime Video or any native-app-only integration
- Video games / mashup-style tools

Set up Supabase (Auth, Postgres tables, Realtime, and a Storage bucket for uploads) as part of this build. Keep everything as lean and focused as possible — this is an MVP, avoid extra pages, extra routes, or decorative content not listed above.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mrd-sync-watch.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2da45f0a-86b8-4d92-86f4-cac9c599fef2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
