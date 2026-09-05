# Kept

A minimal wedding photo-sharing page, deployed on Netlify. Guests scan a QR
code, upload photos and videos straight from their phone — no app, no
account — and everything lands in one shared album you can watch fill up
live.

## What's in here

```
kept/
├── public/                    the website
│   ├── index.html              landing page — has the live QR code
│   ├── upload.html             what guests land on after scanning
│   ├── gallery.html            live view of everything guests upload
│   └── config.js               your names, date, venue — edit this one file
├── netlify/functions/
│   ├── upload.js                receives guest uploads, saves to Netlify Blobs
│   ├── photos.js                lists an album's uploads for the gallery
│   └── media.js                 streams one stored photo/video back to the browser
├── scripts/
│   └── generate-qr.js           makes a print-ready QR code once you've deployed
└── netlify.toml                 site configuration
```

Storage is **Netlify Blobs** — built-in file storage, no separate S3/Cloudinary
account needed. Functions run on Netlify's serverless platform, so there's no
server to sleep or cold-start: uploads work the same at 2am as they do at 7pm.

## 1. Make it yours

Open `public/config.js` and edit:

```js
window.KEPT_CONFIG = {
  coupleNames: "Efua & Kojo",
  weddingDate: "2026-11-14",
  venue: "Labadi Beach, Accra",
  hashtag: "#EfuaAndKojo2026",
  albumId: "efua-and-kojo",   // becomes the storage key prefix — keep it simple
  accentColor: "#B8607A"      // any hex color
};
```

That's the only file most people need to touch.

## 2. Push it to GitHub

```bash
git init
git add .
git commit -m "Set up wedding album"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 3. Deploy to Netlify

**Easiest path — no CLI needed:**
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. Connect your GitHub repo.
3. Netlify auto-detects `netlify.toml` — leave the build settings as-is and click **Deploy**.
4. You'll get a live URL like `https://kept-abc123.netlify.app` in under a minute.

That's it — Netlify Blobs works automatically once deployed, no extra setup.

**Optional: a nicer URL.** In Site settings → Domain management, you can
change the free `.netlify.app` subdomain to something like
`efua-and-kojo.netlify.app`, or connect a domain you own.

## 4. Generate the QR code for printing

Once deployed and you know your real URL:

```bash
npm install
node scripts/generate-qr.js https://efua-and-kojo.netlify.app
```

This saves `public/qr-print.png` — a 1000×1000px image, safe to print at any
size. Take it to a printer, or drop it into a Canva table-card template. If
you change it, redeploy so the printed code matches what's live (or just
print it once you're confident the URL is final).

## 5. Testing locally before you deploy

```bash
npm install
npx netlify login          # one-time, opens a browser to sign in
npx netlify link           # connects this folder to your deployed site
npx netlify dev
```

Open `http://localhost:8888` — this runs the real functions against your
real Blobs storage, so uploads during local testing show up in your actual
album. `npx netlify dev` **without** `login`/`link` first will run the static
pages fine, but uploads will fail with a Blobs connection error — Blobs
needs to know which site's storage to write to, which only happens once
you're linked.

## 6. On the day

- Print the QR code on table cards, a welcome sign, or both.
- Guests scan it with their phone camera — no app needed.
- They land on the upload page, add a few photos, and tap Upload.
- Watch `/gallery.html` fill up in real time — it quietly refreshes itself
  every 15 seconds.

## Netlify free tier — what to expect

- 100% free, no credit card required.
- 100GB bandwidth/month, 10GB blob storage free — more than a wedding needs.
- No cold starts: functions don't "sleep" the way a free-tier server does.
- One real limit to know: Netlify Blobs is optimized for many reads and
  occasional writes, which matches this app's pattern well (guests write
  once, everyone reads the gallery repeatedly).

## Notes on scope

This is intentionally simple — a single shared album, no guest accounts, no
moderation queue. Natural next steps if you want to extend it:
- **Moderation**: require a passcode before a photo appears in the public
  gallery — add a check in `photos.js` and a simple password field on the
  gallery page.
- **Downloads**: a "download all" function that zips the album using the
  Blobs list API.
- **Multiple events**: the app already supports separate album IDs (see
  `?album=` in the URLs), so an engagement party and the wedding itself can
  use the same deployment with two different QR codes and `albumId` values.

## License

MIT — see `LICENSE`. Use it, change it, share it.
