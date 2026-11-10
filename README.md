# Pawan Mode

A game-styled online store with an animated sunset city, a HUD, a radar minimap, a phone menu and mission banners. Shoppers browse streetwear, sneakers, gaming gear, accessories, RC cars and **digital racing maps priced by size**, then pay with **PhonePe, Google Pay, Paytm, card or bank transfer**.

The website is plain HTML, CSS and JavaScript in `public/`. A small Node.js server in `server/` serves it and handles everything that must not happen in the browser: pricing, orders, payments, map downloads and the admin panel.

## Run it locally

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
```

```bash
cp .env.example .env
```

Open `.env` and set `ADMIN_PASSWORD` (12+ characters) to turn on the admin panel. Then start the server:

```bash
npm start
```

Open http://localhost:3000. The admin panel is at http://localhost:3000/admin.html.

Without Razorpay keys the shop runs in **test mode**: UPI and card payments are simulated and no money moves, so you can try the whole checkout. Use `npm run dev` to restart the server automatically when you edit server files.

## Pages

| Page | File | What's on it |
| --- | --- | --- |
| Home | `index.html` | Animated city hero, news ticker, categories, hot drops, racing maps by size, deal of the day with countdown, blog preview |
| Categories | `category.html` | Category wheel, search, price filter, sorting, map size filter for racing maps |
| Cart | `cart.html` | Quantities, coupons, free-delivery meter, **My orders** with live status and map downloads |
| Wishlist | `wishlist.html` | Saved items, move to cart |
| Checkout | `checkout.html` | Delivery details, then payment: PhonePe, Google Pay, Paytm, card, bank transfer |
| Blogs | `blog.html` | Featured post, topic filters, reader styled as an in-game browser |
| How to use | `how-to-use.html` | Shopping steps, product manuals, payment guide, FAQ |
| Admin | `admin.html` | For you: order and visitor numbers, problem orders, payments to check, shipping, and adding racing maps to sell |

All page files are in `public/`.

## How the backend keeps the shop safe

| Risk | What the server does |
| --- | --- |
| Shopper edits prices in the browser | The browser only sends product ids and quantities. The server works out prices, coupons and delivery from `public/js/data.js` and `public/js/config.js`. |
| Fake "payment successful" | An order is only marked paid after Razorpay's signature checks out **and** the server asks Razorpay directly that the right amount was captured. Webhooks are signature-checked too. Bank and direct-UPI payments stay **Pending verification** until you confirm them in the admin panel. |
| Card numbers or UPI PINs leaking | They are never typed into this site. Razorpay's own secure window collects them. |
| Secret keys leaking | Keys live in `.env` on the server only. `.env`, the database and map files are never served and are ignored by git. Only files in `public/` are served. |
| Someone viewing other people's orders | Each order has a long random private key that only the buyer's browser holds. A wrong key looks exactly like a missing order. |
| Paid maps being shared or grabbed | Map files sit in `private/downloads/`, outside the website. Paid buyers get one-time links that expire after 10 minutes, with a limit per map (5 by default) for 30 days. |
| Other websites posting on a shopper's behalf | Requests from other origins are refused. Pages are sent with a strict Content Security Policy and other security headers. |
| Floods and password guessing | Rate limits on orders, payments, downloads and admin login. Request bodies are size-limited. |
| Lost track of what happened | Every order change is logged with who did it and when (shopper, Razorpay, webhook, admin). |

## Payments

### Going live with Razorpay (PhonePe, Google Pay, Paytm and cards)

1. Create a [Razorpay](https://razorpay.com) account. Start with **Test mode**.
2. In the Razorpay Dashboard go to **Account & Settings → API Keys** and generate a key. Put both parts in `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   ```
3. In **Account & Settings → Webhooks**, add `https://YOUR-DOMAIN/api/webhooks/razorpay` with the events `payment.captured`, `order.paid` and `payment.failed`. Choose a secret and put it in `.env` as `RAZORPAY_WEBHOOK_SECRET`. The webhook confirms orders even if a shopper closes the page while paying.
4. Restart the server. The checkout now opens Razorpay's window for UPI apps and cards.
5. When test payments work, switch to live keys (`rzp_live_...`) and set up the webhook again in live mode.

### Without a payment gateway

| Method | How it works |
| --- | --- |
| Bank transfer | Always available. Put your real account details in `bank` in `public/js/config.js`. The shopper enters their transfer reference (UTR) and the order shows as **Pending verification** in the admin panel until you check your bank and mark it paid. |
| PhonePe / Google Pay / Paytm | If Razorpay isn't set up, put your UPI ID in `upi.id` in `public/js/config.js`. Shoppers scan a QR code that pays you directly, then enter their 12-digit UPI reference. You confirm it in the admin panel. |
| Card | Needs Razorpay. Never collect card numbers yourself. |

Test mode (simulated payments) is on by default in development and is **always off** when `NODE_ENV=production`.

## Admin panel

Go to `/admin.html` and log in with `ADMIN_PASSWORD`. It has three tabs.

**Overview**

- **Orders:** how many are completed, in progress (payment to check, to ship, shipped), have issues, are not paid yet, or were cancelled. Click a number to see those orders.
  - *Completed* means delivered, or a racing map order that is paid (maps are ready to download straight away).
- **Sales:** paid orders and money taken today, in the last 7 and 30 days, and all time.
- **Visitors:** people who visited today, in the last 7 and 30 days, and the share who bought something. Charts show visitors and sales for each of the last 30 days (hover a bar for the numbers, or open the table view). You also see the most viewed pages and where visitors came from.
- Warnings about anything not set up yet (test mode, placeholder bank details, maps with no file).

**Orders**

- Filters: Needs action, Issues, Check payment, To ship, Shipped, Completed, Not paid yet, Cancelled, All. Search by order number, name, phone or payment reference.
- Each order shows the buyer's details, payment references, Razorpay ids, download use and full history.
- Buttons to mark orders paid, shipped, delivered or cancelled, with an optional note (for example the courier tracking number).

An order has an **issue** when something needs a look from you:

| Issue | When |
| --- | --- |
| Payment amount did not match | Razorpay reported a payment that doesn't match the order |
| Payment could not be confirmed / Payment failed | The buyer tried to pay and it didn't go through |
| Payment check waiting over 24 hours | A bank or UPI reference has been waiting for you for a day |
| Not shipped 3+ days after payment | A paid order with physical items hasn't been shipped |
| Map file missing | A buyer paid for a map that has no file to download |
| Cancelled after payment | The buyer paid, then the order was cancelled, so they need a refund |

Most issues clear by themselves once you fix the cause (mark it paid, ship it, upload the file). For the rest, for example after refunding someone, press **Mark as handled** and add a note.

**Racing maps**

- See every map with its price, sales and whether its file is uploaded.
- **Add a map:** name, size (sets the price), optional own price and "was" price, race type, track length, checkpoints, download size, description, highlights, artwork, colours and a shop badge. A live preview shows how it will look. It goes on sale as soon as you save, with no page edits or restart needed.
- **Upload the map file** (.zip) from the map's card or while adding it. Uploads work for the built-in maps too. Files are checked to be real .zip files and kept private.
- **Edit** or **Hide from shop** maps you added here. People who already bought a hidden map can still download it. Built-in maps from `public/js/data.js` are edited in that file.
- New maps show "New · no reviews yet" in the shop instead of star ratings.

### Visitor counting and privacy

The shop counts visits itself, with no Google Analytics or other trackers:

- No cookies and nothing saved in the visitor's browser.
- No IP addresses are stored. Each visitor is counted once a day using a scrambled code made from a secret that changes every day and is deleted when the day ends, so visits on different days can't be linked.
- Bots, and visitors whose browser asks not to be tracked (Do Not Track or Global Privacy Control), are not counted.
- Days follow the shop's time zone (`TIME_ZONE`, India by default). Set `COUNT_VISITORS=false` to switch counting off.

The admin panel is switched off until `ADMIN_PASSWORD` is set. Use a long password that you don't use anywhere else. Unpaid orders are cancelled automatically after 48 hours (`UNPAID_ORDER_HOURS`).

## Racing maps (digital products priced by size)

The **Racing Maps** category sells downloads, not physical items. Each map's price comes from its size:

| Size | Name | Default price | Meant for |
| --- | --- | --- | --- |
| S | Small | ₹149 | Up to 3 km, quick sprints |
| M | Medium | ₹299 | 3 to 6 km, full circuits |
| L | Large | ₹499 | 6 to 10 km, multi-zone races |
| XL | Extra large | ₹799 | 10 km+, whole-city routes |

- **Change the prices** in `mapSizes` in `public/js/config.js`. Every map of that size updates at once.
- **Add a map** from the admin panel (**Racing maps → Add a map**). Or add it in `public/js/data.js` with `cat: 'maps'` and a `size`. You don't need a `price`. Add `price` and `mrp` only if one map should cost something different from its size.
- **Upload the map file** from the admin panel, or copy it to `private/downloads/<map-id>.zip`, for example `private/downloads/harbour-night-sprint.zip`. Uploads are limited to 200 MB (`UPLOAD_MAX_MB`). Until a file is there, buyers see "being prepared" and the admin panel lists it as missing.
- **Set your platform** in `digital.platform` in `public/js/config.js`. It shows in every map's quick view.
- The seven maps in `public/js/data.js` are sample listings. Swap in your own names, sizes, descriptions and artwork.

How digital items behave differently:

- No delivery fee, and shoppers can only buy one copy of each map.
- If the cart has only maps, checkout asks for name, mobile number and email instead of an address.
- As soon as the payment is confirmed, the buyer can download each map from the order screen and later from **Cart → My orders** on the same device. If they lose access, look the order up in the admin panel and send them the file.

## Where to edit things

- **Products, categories, blog posts, manuals, FAQs:** `public/js/data.js`
- **Store settings, UPI ID, bank details, coupons, delivery fee, map size prices:** `public/js/config.js`
- **Server settings and secrets:** `.env` (see `.env.example` for every option)
- **Colours, fonts, animations:** `public/css/style.css` (colour variables are at the top)
- **Product drawings:** `public/js/art.js`

Restart the server after changing `data.js` or `config.js`, because the server reads prices and coupons from them when it starts.

## Deploying

Any host that runs Node.js works (a VPS, Render, Railway, Fly.io and similar).

1. Copy the project, then run `npm ci --omit=dev`.
2. Create `.env` on the server with `NODE_ENV=production`, your Razorpay keys, webhook secret and admin password.
3. If the app runs behind a proxy (Nginx, Cloudflare, or the host's load balancer), set `TRUST_PROXY=1` so rate limits see real visitor addresses.
4. Serve the site over **HTTPS** only. Razorpay needs it, and the server sends HTTPS-only headers in production.
5. Upload your map files from the admin panel, or copy them to `private/downloads/` on the server. If Nginx sits in front, raise its upload limit to match `UPLOAD_MAX_MB`, for example `client_max_body_size 200m;`.
6. Back up `data/store.db` and `private/downloads/` regularly. They hold every order, the maps you added in the admin panel, and their files.
7. Start with `npm start`, and use a process manager (for example `pm2` or your host's service settings) to keep it running.

## Tests

```bash
npm test
```

The tests check pricing, order privacy, payment signature checks, webhooks, downloads, the admin panel (order numbers, issues, visitor counting, adding maps and uploads) and that private files are never served. Razorpay is replaced by a stand-in during tests, so no real payments are made.

## Good to know

- Cart, wishlist and saved address stay in the shopper's browser. Orders live in the server's database.
- The newsletter form in the footer isn't connected to a mailing service yet.
- The server doesn't send emails yet. To email receipts or map links automatically, add an email service (for example Amazon SES, Resend or SMTP).
- The UPI QR code uses [qrcodejs](https://github.com/davidshimjs/qrcodejs) from cdnjs. Fonts are Anton and Rajdhani from Google Fonts.
- All animations turn off for visitors who have "reduce motion" switched on in their device settings.
- The look is inspired by open-world crime games, with all-original art and no logos, characters or names from any real game. It is not affiliated with any game publisher.
