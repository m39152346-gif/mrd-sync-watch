<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use browser-safe helpers in src/lib for upload validation and stable room-scoped upload names; this enables resumability and independent rule tests.
- Persist shared playback and completed uploads in Lovable Cloud; browser history only remembers room codes, never overrides an active room's shared playback.
- Read guest browser identity in effects or handlers, never during SSR rendering, to prevent hydration mismatches.
- Video page discovery uses a bounded public fetch with DNS checks and no redirects; do not introduce a media proxy or bypass provider protections.
- Keep user-facing translations in the shared i18n dictionary; switch language without remounting players or room connections, and keep URLs, codes and playback timelines left-to-right for readability.
