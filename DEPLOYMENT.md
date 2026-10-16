# Play online with GitHub Pages

The production build is prepared for the free GitHub Pages address:
`https://losttnt.github.io/Surgery-Simulator/`.

## One-time activation

After the prepared `gh-pages` branch has been uploaded:

1. Open https://github.com/LostTNT/Surgery-Simulator/settings/pages
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **gh-pages**, leave the folder as **/(root)**, and click **Save**.

GitHub will publish the site; its build can take a few minutes. The page settings
will show the live URL once deployment finishes. GitHub Free includes Pages for
public repositories. No backend, server subscription, or custom domain is needed.

The Git repository connection works in this workspace. The GitHub management API
is blocked by its network policy, so activating Pages requires the one-time web
settings change above. A successful Git push establishes uploaded files, not a
live or verified Pages deployment.

## Publish updates

Source is on `main`; the built static files are on `gh-pages`.

```sh
VITE_BASE_PATH=/Surgery-Simulator/ npm run build
npm test
```

To update the branch deployment, replace the files in a checkout of `gh-pages`
with the contents of `dist`, including `.nojekyll`, commit, and push normally.
Preserve the branch history. GitHub's branch deployment then updates the site.

As an alternative, the included manual **Publish game to GitHub Pages** workflow
builds and deploys using GitHub Actions. To use that workflow instead of the
prepared branch, change Pages' source to **GitHub Actions**, then run it from the
**Actions** tab. Do not switch sources just to play the prepared branch build.

## Verify the production build locally

```sh
VITE_BASE_PATH=/Surgery-Simulator/ npm run build
VITE_BASE_PATH=/Surgery-Simulator/ npm run preview -- --port 4174
node tools/qa-hosting.cjs http://localhost:4174/Surgery-Simulator/
```

The browser regression loads the production subpath and uses visible controls
to cut the bone path, lift the flap, clear the fluid pockets, rinse and finish.
No development diagnostic API is required.
It uses local Chromium (override `CHROMIUM_PATH` when needed).

Model, texture, font, CSS, and favicon URLs support the repository subpath.
For a root-domain host, build without `VITE_BASE_PATH`.

See [asset provenance](public/ASSETS.md) and the shipped license notices. This is
a fictional interaction prototype, not a clinically validated simulator.
