# Pawan Mode

A game-styled online store with an animated sunset city, a HUD, a radar minimap, a phone menu and mission banners. Shoppers browse streetwear, sneakers, gaming gear, accessories, RC cars and **digital racing maps priced by size**, then pay with **PhonePe, Google Pay, Paytm, card or bank transfer**.

It's a plain static site (HTML, CSS and JavaScript) with no build step.

## Pages

| Page | File | What's on it |
| --- | --- | --- |
| Home | `index.html` | Animated city hero, news ticker, categories, hot drops, racing maps by size, deal of the day with countdown, blog preview |
| Categories | `category.html` | Category wheel, search, price filter, sorting, map size filter for racing maps |
| Cart | `cart.html` | Quantities, coupons, free-delivery meter, order history |
| Wishlist | `wishlist.html` | Saved items, move to cart |
| Checkout | `checkout.html` | Delivery address, then payment: PhonePe, Google Pay, Paytm, card, bank transfer |
| Blogs | `blog.html` | Featured post, topic filters, reader styled as an in-game browser |
| How to use | `how-to-use.html` | Shopping steps, product manuals, payment guide, FAQ |

## Run it locally

From this folder, start any static server, for example:

```bash
py -m http.server 5500
```

Then open http://localhost:5500.

## Where to edit things

- **Products, categories, blog posts, manuals, FAQs:** `js/data.js`
- **Store settings, UPI ID, bank details, coupons, delivery fee, map size prices:** `js/config.js`
- **Colours, fonts, animations:** `css/style.css` (colour variables are at the top)
- **Product drawings:** `js/art.js` (inline SVG; to use photos, swap `productArt()` in `js/app.js` for an `<img>`)

## Racing maps (digital products priced by size)

The **Racing Maps** category sells downloads, not physical items. Each map's price comes from its size:

| Size | Name | Default price | Meant for |
| --- | --- | --- | --- |
| S | Small | ₹149 | Up to 3 km, quick sprints |
| M | Medium | ₹299 | 3 to 6 km, full circuits |
| L | Large | ₹499 | 6 to 10 km, multi-zone races |
| XL | Extra large | ₹799 | 10 km+, whole-city routes |

- **Change the prices** in `mapSizes` in `js/config.js`. Every map of that size updates at once.
- **Add a map** in `js/data.js` with `cat: 'maps'` and a `size`. You don't need a `price`. Add `price` and `mrp` only if one map should cost something different from its size. `km`, `mb`, `mode` and `checkpoints` show up on the product card and in quick view.
- **Set your platform** in `digital.platform` in `js/config.js` (for example the game and version or the mod tool your maps work with). It shows in every map's quick view.
- The seven maps in `js/data.js` are sample listings. Swap in your own names, sizes, descriptions and artwork.

How digital items behave differently:

- No delivery fee, and shoppers can only add one copy of each map.
- If the cart has only maps, checkout asks for name, mobile number and email instead of an address. If the cart also has physical items, it asks for the address and makes email required.
- The order is saved with the shopper's email so you know where to send the download link.

**Sending the download is up to you for now.** After you've checked the payment, email the buyer a download link (for example a Google Drive or Dropbox link shared only with them). Don't put download links in `js/data.js` or anywhere else on the site. Anyone can read those files, so the maps would be free to grab. To send links automatically, you need the payment gateway and backend described below: after the gateway confirms a payment, your server emails the buyer a private link that expires.

## Payments: what works now and what you need to go live

`demoMode: true` in `js/config.js` is the default. No real money moves in demo mode:

| Method | In demo mode | To accept real payments |
| --- | --- | --- |
| PhonePe / Google Pay / Paytm | QR and buttons simulate a payment | Put your UPI ID in `upi.id`. The QR codes and app buttons then send real UPI payments to you. The shopper enters their UPI reference (UTR) and the order is saved as **Pending verification**. Check it against your bank or UPI app before shipping. |
| Card | Simulated (test card `4111 1111 1111 1111`) | Needs a payment gateway (see below). Never collect card numbers on your own server. |
| Bank transfer | Shows account details and records the UTR | Put your real account details in `bank`. Orders are saved as **Pending verification** until you confirm the money arrived. |

**Automatic payment confirmation needs a payment gateway and a small backend.** A static site can't confirm a payment by itself. Gateways such as Razorpay, Cashfree or PayU handle UPI apps, cards and net banking in one checkout. The usual flow:

1. Your server creates an order with the gateway's API (secret key stays on the server).
2. The checkout page opens the gateway's checkout with that order ID.
3. Your server verifies the payment signature or webhook before marking the order paid.

The place to hook this in is the `submit` and `click` handlers in `js/pages/checkout.js`.

## Good to know

- Cart, wishlist, saved address and order history are kept in the shopper's browser (`localStorage`). There's no server database yet, so you won't see orders from other people. A backend is needed for that.
- The newsletter form in the footer isn't connected to a mailing service yet.
- The UPI QR code uses [qrcodejs](https://github.com/davidshimjs/qrcodejs) from cdnjs. Fonts are Anton and Rajdhani from Google Fonts.
- All animations turn off for visitors who have "reduce motion" switched on in their device settings.
- The look is inspired by open-world crime games, with all-original art and no logos, characters or names from any real game. It is not affiliated with any game publisher.
