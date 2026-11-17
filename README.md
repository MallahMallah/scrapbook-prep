# JB's Scrapbooks

A small web app that puts 4 photos on each 4×6 print (each photo ends up 2×3 in. after cutting).
It installs on Android like a normal app and updates itself.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `styles.css` | Colors, sizes, big touch-friendly buttons |
| `app.js` | Everything the app does: pick photos, build the sheets, share/save |
| `sw.js` | Lets the app work offline and detects new versions |
| `manifest.webmanifest` | App name, icon, colors (what makes it installable) |
| `icons/` | Home-screen icons |

## One-time setup: put it online (GitHub Pages, free)

1. Create a GitHub account if you don't have one.
2. Create a new **public** repository, for example `scrapbook-prep`.
3. Upload all of these files (keep the `icons` folder), or from VS Code:
   ```
   git init
   git add .
   git commit -m "v1"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/scrapbook-prep.git
   git push -u origin main
   ```
4. In the repo on GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main, folder: / (root) → Save**.
5. After a minute or two the app is live at `https://YOUR-NAME.github.io/scrapbook-prep/`.

## Put it on her phone

1. Open the link in **Chrome** on her phone.
2. Tap the **⋮** menu → **Add to home screen** → **Install**.
3. It now has its own icon and opens full screen like any other app.

## Shipping an update

1. Make your changes in VS Code.
2. In `sw.js`, bump the version: `const VERSION = 'v1.0.1';` (**this step is what tells her phone there's a new version**).
3. Commit and push.
4. The next time she opens the app, a banner says **"A new version is ready" → Update now**.

## Testing without touching her version

- **On your computer:** install the VS Code extension *Live Server*, right-click `index.html` → *Open with Live Server*. Use Chrome DevTools' device toolbar (Ctrl+Shift+M) to see it at phone size.
- **On your own phone:** make a second repo (e.g. `scrapbook-prep-test`) with Pages turned on and push changes there first. Install that one on your phone. When it's good, push the same changes to the real repo.

## How the layout works

- Each print is 1200×1800 pixels (4×6 in. at 300 dpi), divided into a 2×2 grid of 600×900 spots (2×3 in.).
- Wide photos are turned sideways so they fill a tall spot. Once she cuts the print, she can turn the photo any way she likes.
- **Fill** crops a little off the edges so there's no white space. **Whole photo** shows everything, with white edges if needed.
- Photos go onto the prints in the order she picked them. If the last print isn't full, its empty spots stay white.
- Light gray cut lines are optional.

## Ideas for later

- Drag to reorder photos, and pinch to adjust the crop on a single photo
- Other layouts: 2-up (3×4), 9-up wallet size, 1 photo with a border
- Remember her last settings
- "Choose from Google Photos" button on PC (Google Photos Picker API)
