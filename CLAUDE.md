# Listagram

A single userscript that makes Instagram usable without mindless scrolling. It runs in Safari on iPhone through the Userscripts app.

## Intended behavior
Don't change this unless asked to.

**Keep:** DMs, stories, friends' posts and reels, profiles, photo posts, activity and follow requests, settings.

**Remove:** the Reels tab and feed, Explore (and so search), the recommended home feed, "Suggested for you" on profiles and the activity page, and swiping from one reel to the next.

The goal is to stop mindless scrolling, not to ban friends' reels. Tapping a friend's reel should work. Moving on to the next one should not.

## Hard rules
- **Stay passive.** No Instagram API calls, no reading responses, no automated likes, follows or messages. It only hides things and blocks pages locally. This is what keeps ban risk low, so don't trade it for a feature.
- **No third-party code.** No `@require`, `@updateURL`, `GM.*` grants or runtime dependencies. `jsdom` is for tests only.
- **Nothing personal in the repo.** No usernames, post IDs, screenshots or message text in code, tests, docs or commits.

## Repo map
- `src/listagram.user.js`: the script. Anything Instagram-specific lives in the `IG` block at the top.
- `tests/listagram.test.js`: behavior tests on a mock page (`npm test`).
- `scripts/live-probe.js`: read-only check of whether Instagram still matches our assumptions.
- `CHANGELOG.md`: version history.

## Fixing breakage
Instagram changes its site often, so most fixes are small.

1. Run `npm test`. If it fails, the script is the problem, not Instagram.
2. Test against Instagram's phone layout, because a narrowed desktop window gets a different page. Run `scripts/live-probe.js` to see which assumptions changed.
3. Fix the `IG` block if you can. Change logic only if the behavior itself has to change.
4. Add or update a mock test, then bump `@version` and update `CHANGELOG.md`.

Keep any testing on a real account read-only, and say whether results came from a real iPhone or an emulated one.
