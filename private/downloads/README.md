# Racing map files

Put the file for each racing map in this folder, named after the map's `id` in `public/js/data.js`:

```
private/downloads/harbour-night-sprint.zip
private/downloads/<product-id>.zip
```

- This folder is never served by the website. Shoppers only get a file through a one-time link after their payment is confirmed.
- Files here are ignored by git, so your paid maps are never pushed to GitHub. Copy them to the server separately.
- The admin panel and the server log list any map that is missing its file.
