# itch.io submission checklist

- [x] Release page copy prepared in `metadata/en-AU/`
- [x] Cover image prepared at `release/itch-cover.png`
- [x] Browser-playable HTML build produced in `dist/` and `index.html` is at its root
- [x] `release.toml` points to `austin-c/ab-line-evolve`, `dist`, and the `html5` channel. The account homepage confirms `austin-c.itch.io` (display name Aman11).
- [ ] Create and save the itch.io project page as `https://austin-c.itch.io/ab-line-evolve` (currently returns 404)
- [ ] Upload the cover and set the listing to public
- [ ] Publish the `html5` channel with `release-kit itch-push --execute`

The Release Kit currently has no automated desktop-game screenshot capture. It can capture an already-visible Android screen only. Gameplay screenshots are optional on itch.io and have not been captured for this release.
