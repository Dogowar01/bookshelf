# My Bookshelf

A personal digital bookshelf for the books you're reading and the ones you've finished.

- **Photograph each book three times**: the front cover, the spine and the back cover. Crop each photo with a drag box. You can shoot the spine standing up or lying flat; it is turned upright automatically.
- **Your shelf shows the real spines**, standing on the shelves of a rustic wooden bookcase. Brass plaques mark where *Currently reading* (books with a red bookmark) and *Read* begin. The bookcase grows extra shelves as your library grows.
- **Books vary in size.** Choose Paperback, Standard or Hardback for each one, and heights vary a little within each size. Spines never get too thin to read, and long titles shrink to fit.
- **Tap a spine** and the book slides off the shelf and turns to show its front cover. **Turn over** shows the back.
- **Tap the cover** to open the book. The first page has your star rating, genre (Thriller, Sci-Fi, Crime, Fantasy…) and your thoughts. You can re-rate it there, mark it finished, edit it or remove it.
- Sort the Read shelf by recently finished, rating, title, author or genre, and filter it by genre.
- Works offline and can be installed to your phone's home screen.

## Your data

Everything is stored **on your device** in the browser (IndexedDB). Nothing is uploaded anywhere.
Use **⋯ → Export backup** now and then to save a `.json` file with all your books and photos. **Import backup** restores it, for example on a new phone.

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
| `js/book3d.js` | The floating 3D book that opens its cover |
| `js/editor.js` | Add/edit wizard (3 photos + details) |
| `js/cropper.js`, `js/images.js` | Photo cropping, rotation and compression |
| `js/library.js`, `js/db.js` | Storage and backup import/export |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install |

When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the update.

### Changing the bookcase picture

`js/shelf.js` cuts `images/bookcase.webp` into bands: the crown, each compartment, each plank and the base. The pixel rows and columns for those bands are listed at the top of that file. If you swap in a different picture, update those numbers to match where its shelves are. Compartments are stretched vertically so spines stay readable, and the planks keep their real thickness.
