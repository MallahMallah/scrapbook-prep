# JB's Scrapbooks

A small web app that puts 4 photos on each print (4×6, 5×7 or 8×10), ready to cut apart for scrapbooking.
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

## Put it on a phone

1. Open the link in **Chrome** on a phone.
2. Tap the **⋮** menu → **Add to home screen** → **Install**.
3. It now has its own icon and opens full screen like any other app.

## Shipping an update

1. Make your changes in VS Code.
2. In `sw.js`, bump the version, e.g. `const VERSION = 'v1.1.0';` → `'v1.1.1'` (**this step is what tells installed copies there's a new version**).
3. Commit and push.
4. The next time the app is opened, a banner says **"A new version is ready" → Update now**.

## Testing without touching the live version

- **On your computer:** install the VS Code extension *Live Server*, right-click `index.html` → *Open with Live Server*. Use Chrome DevTools' device toolbar (Ctrl+Shift+M) to see it at phone size.
- **On your own phone:** make a second repo (e.g. `scrapbook-prep-test`) with Pages turned on and push changes there first. Install that one on your phone. When it's good, push the same changes to the real repo.

## How it works

- Pick a print size: **4×6** (photos come out 2×3 in.), **5×7** (2½×3½) or **8×10** (4×5). Prints are made at 300 dpi. Order the same size in the print app.
- Every print is a 2×2 grid. Wide photos are turned sideways so they fill a tall spot; after cutting, each photo can be turned any way.
- **Fill** crops a little off the edges so there's no white space. **Whole photo** shows everything, with white edges if needed.
- **Tap a photo** to select it. In Fill, drag a selected photo to choose which part shows. Press and hold an unselected photo to select and drag in one go. Tap it again to unselect.
- The **drawer at the bottom** has options for the selected photo: color (color, black & white, sepia), shape (square, rounded corners, circle), copy those to every photo, or remove the photo. Drag it up or tap its top edge to open it.
- Print size, Fill or Whole photo, and cut lines are remembered between visits.
- Photos go onto the prints in the order picked. If the last print isn't full, its empty spots stay white.

## Ideas for later

- "Choose from Google Photos" (Google Photos Picker API; needs a Google Cloud project and sign-in)
