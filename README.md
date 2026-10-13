# My Bookshelf

A personal digital bookshelf for the books you want to read, are reading, and have finished.

- **Find a book fast.** Scan the barcode on the back, type the ISBN, or search by title or author. The title, author, page count, year and a suggested genre are filled in from Open Library (with Google Books as a fallback). You can also use the published cover if you don't want to photograph the front.
- **Photograph each book three times**: the front cover, the spine and the back cover. Crop each photo with a drag box. You can shoot the spine standing up or lying flat; it is turned upright automatically.
- **Your shelf shows the real spines**, standing on the shelves of a rustic wooden bookcase. Brass plaques mark *Currently reading*, *Want to read* and *Read*. The bookcase grows extra shelves as your library grows.
- **Books vary in size.** Choose Paperback, Standard or Hardback for each one, and heights vary a little within each size. Spines never get too thin to read, and long titles shrink to fit.
- **Tap a spine** and the book slides off the shelf and turns to show its front cover. **Turn over** shows the back.
- **Tap the cover** to open the book. The first page shows:
  - your star rating, genre, format and page count
  - reading progress: enter the page you're on, and the red ribbon on the spine grows as you go
  - your thoughts and favourite quotes (with page numbers)
  - earlier reads, if you've re-read it
  - buttons for **Start reading**, **Finished it!**, **Read again**, **Lend**, **Edit** and **Remove**
- **Lending:** a lent book shows as a ghost on the shelf with a "Lent" tag until you tap **It's back**.
- **Formats:** mark a book as print, ebook or audiobook; ebooks and audiobooks get a small badge on the spine.
- **Search:** type in the search box and matching spines glow while the rest dim.
- **Arrange:** tap **Arrange**, then drag books into your own order. The Read shelf switches to "My order".
- **Year in review** (in the ⋯ menu): books finished each month, pages read, average rating, favourite genres, longest book, quickest read, and your top rated. Re-reads count too.
- **Sounds:** a soft page-turn when a book opens. Switch them off in the ⋯ menu.
- Works offline and can be installed to your phone's home screen.

## Your data

Everything is stored **on your device** in the browser (IndexedDB). Unless you turn on sync, nothing is uploaded anywhere.

- **Backups:** **⋯ → Export backup** saves a `.json` file with all your books and photos, and **Import backup** restores it, for example on a new phone. The app reminds you if you haven't backed up for two weeks (unless sync is on), and the menu shows when you last did.
- **Sync** keeps your library safe online and the same on all your devices. See below.

Internet is only needed for looking books up, sync, and barcode scanning on iPhone. Those load a scanning library and the Supabase client from the jsDelivr CDN the first time they're used.

## Syncing across devices

Sync uses your own free [Supabase](https://supabase.com) project, so your books live in an account you control. You set it up once, which takes about 10 minutes:

1. **Create a project.** Sign up at supabase.com, click **New project**, give it a name (e.g. "bookshelf") and a database password (you won't need it again), and wait a minute while it starts.
2. **Create the tables.** In the project, open **SQL Editor**, paste in everything from [`supabase/setup.sql`](supabase/setup.sql), and click **Run**. It should say "Success".
3. **Optional: skip email confirmation.** Go to **Authentication → Sign In / Providers → Email** and turn off **Confirm email**. You can leave it on; you'll then need to tap a link in an email once before you can sign in.
4. **Copy your keys.** Open **Project Settings → API Keys** (or **Data API**). Copy the **Project URL** and the **anon public** key; the newer **publishable** key also works.
5. **Connect the app.** In the app, open **⋯ → Sync across devices**, paste the URL and key, and tap **Connect**. Then tap **Create an account** with your email and a password.
6. **On each other device**, do step 5 again, but tap **Sign in** with the same email and password.

After that, changes sync automatically whenever you're online. If the same book is edited on two devices before they sync, the most recent edit wins. Only photos that changed are uploaded, so syncing stays quick.

## Running it

It's a static web app with no build step. Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

### Putting it on your phone (GitHub Pages)

1. In the GitHub repo go to **Settings → Pages**, and set *Source* to "Deploy from a branch", choosing your branch and `/ (root)`.
2. Open the published `https://<username>.github.io/bookshelf/` link on your phone.
3. Add it to your home screen: on iPhone (Safari), tap **Share → Add to Home Screen**; on Android (Chrome), tap **⋮ → Install app**.

It then opens full-screen like a normal app, and "Take photo" uses the camera.

## Project layout

| File | What it does |
| --- | --- |
| `index.html`, `css/styles.css` | Page and styling (bookcase, 3D book, editor) |
| `js/app.js` | Wires it together: shelves, sorting, filters, backup |
| `js/shelf.js` | Builds the bookcase from `images/bookcase.webp` and stands spines on its shelves |
| `js/book3d.js` | The floating 3D book that opens its cover, and the page inside |
| `js/editor.js` | Add/edit wizard (find the book, 3 photos, details) |
| `js/lookup.js` | Barcode scanning and Open Library / Google Books lookups |
| `js/stats.js` | Year in review |
| `js/arrange.js` | Drag-to-reorder on the shelf |
| `js/sync.js`, `js/syncui.js`, `supabase/setup.sql` | Optional sync through Supabase |
| `js/sound.js` | Page-turn sounds (generated, no audio files) |
| `js/cropper.js`, `js/images.js` | Photo cropping, rotation and compression |
| `js/library.js`, `js/db.js` | Storage and backup import/export |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install |

When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the update.

### Changing the bookcase picture

`js/shelf.js` cuts `images/bookcase.webp` into bands: the crown, each compartment, each plank and the base. The pixel rows and columns for those bands are listed at the top of that file. If you swap in a different picture, update those numbers to match where its shelves are. Compartments are stretched vertically so spines stay readable, and the planks keep their real thickness.
