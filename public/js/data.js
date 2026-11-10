/* ============================================================
   PAWAN MODE — catalogue, blog posts and guides
   Add or edit products here; every page reads from this file.
   art: jacket | tee | hoodie | sneaker | controller | headset |
        shades | watch | cap | backpack | car
        racing maps: track-circuit | track-ring | track-tri |
                     track-sprint | track-touge | track-city
   colors: [main colour, accent colour]

   Racing maps (category "maps") are digital downloads:
   size         S | M | L | XL. The price comes from the size
                (set prices in js/config.js → mapSizes)
   km           track length      mb           download size
   mode         race type         checkpoints  number of checkpoints
   ============================================================ */
window.PM_DATA = {
  categories: [
    { id: 'apparel', name: 'Apparel', blurb: 'Jackets, tees and hoodies', art: 'jacket', colors: ['#ff2d6f', '#ffc61a'] },
    { id: 'footwear', name: 'Footwear', blurb: 'Kicks built for the streets', art: 'sneaker', colors: ['#f4f1ea', '#ff2a3d'] },
    { id: 'gaming', name: 'Gaming Gear', blurb: 'Controllers and headsets', art: 'controller', colors: ['#7a2cff', '#2ad8ff'] },
    { id: 'accessories', name: 'Accessories', blurb: 'Shades, watches, caps, bags', art: 'shades', colors: ['#ffc61a', '#ff7a1a'] },
    { id: 'rides', name: 'Rides', blurb: 'RC cars and die-cast models', art: 'car', colors: ['#ff7a1a', '#ffc61a'] },
    { id: 'maps', name: 'Racing Maps', blurb: 'Digital race tracks, priced by size', art: 'track-circuit', colors: ['#2ad8ff', '#ffc61a'], digital: true }
  ],

  products: [
    /* ---------- Apparel ---------- */
    {
      id: 'night-rider-jacket', name: 'Night Rider Leather Jacket', cat: 'apparel', art: 'jacket',
      colors: ['#1d1d26', '#ff2d6f'], price: 4999, mrp: 7499, rating: 4.8, reviews: 312, tag: 'hot', featured: true,
      desc: 'Heavyweight faux-leather biker jacket with a quilted lining, neon-pink zip and a fit made for midnight rides.',
      features: ['Faux-leather shell, quilted lining', 'Heavy metal zips', '4 pockets incl. inner phone pocket', 'Sizes S to XXL']
    },
    {
      id: 'sunset-drip-tee', name: 'Sunset Drip Graphic Tee', cat: 'apparel', art: 'tee',
      colors: ['#ff7a1a', '#2a1033'], price: 899, mrp: 1299, rating: 4.6, reviews: 540, tag: 'new', featured: true,
      desc: '240 GSM cotton tee with a striped-sun print that pops under city lights.',
      features: ['100% combed cotton, 240 GSM', 'Oversized drop-shoulder fit', 'Puff-print graphic', 'Pre-shrunk fabric']
    },
    {
      id: 'hustler-hoodie', name: 'Hustler Oversized Hoodie', cat: 'apparel', art: 'hoodie',
      colors: ['#7a2cff', '#ffc61a'], price: 1999, mrp: 2799, rating: 4.7, reviews: 228,
      desc: 'Brushed-fleece hoodie with a double-layer hood and a kangaroo pocket for the late-night hustle.',
      features: ['320 GSM brushed fleece', 'Double-layer hood', 'Ribbed cuffs and hem', 'Unisex fit']
    },
    {
      id: 'street-king-bomber', name: 'Street King Bomber', cat: 'apparel', art: 'jacket',
      colors: ['#3b6b45', '#ff7a1a'], price: 3499, mrp: 4499, rating: 4.5, reviews: 141, tag: 'limited',
      desc: 'Flight-style bomber in olive with a padded shell and a bright orange lining.',
      features: ['Water-resistant nylon shell', 'Orange satin lining', 'Sleeve utility pocket', 'Sizes S to XXL']
    },

    /* ---------- Footwear ---------- */
    {
      id: 'turbo-street', name: 'Turbo Street Sneakers', cat: 'footwear', art: 'sneaker',
      colors: ['#f4f1ea', '#ff2a3d'], price: 3299, mrp: 4599, rating: 4.7, reviews: 402, tag: 'hot', featured: true,
      desc: 'Low-top street sneakers with a cushioned sole and a lightning-bolt side panel.',
      features: ['Mesh and suede upper', 'EVA cushioned midsole', 'Rubber grip outsole', 'UK sizes 6 to 11']
    },
    {
      id: 'drift-hightops', name: 'Drift High-Tops', cat: 'footwear', art: 'sneaker',
      colors: ['#1b1b22', '#ffc61a'], price: 3999, mrp: 5299, rating: 4.6, reviews: 187,
      desc: 'Padded high-tops in stealth black with gold hits. Built for drifting through the city in style.',
      features: ['Padded ankle collar', 'Synthetic leather upper', 'Anti-slip outsole', 'UK sizes 6 to 11']
    },
    {
      id: 'getaway-runner', name: 'Getaway Runner', cat: 'footwear', art: 'sneaker',
      colors: ['#2a6bff', '#2ad8ff'], price: 2799, mrp: 3499, rating: 4.4, reviews: 96, tag: 'new',
      desc: 'Featherweight runners for quick getaways. Breathable knit and a springy foam sole.',
      features: ['Breathable knit upper', 'Lightweight foam sole', 'Reflective heel tab', 'UK sizes 6 to 11']
    },

    /* ---------- Gaming ---------- */
    {
      id: 'heist-pro-controller', name: 'Heist Pro Wireless Controller', cat: 'gaming', art: 'controller',
      colors: ['#22222e', '#ffc61a'], price: 2999, mrp: 3999, rating: 4.8, reviews: 615, tag: 'hot', featured: true,
      desc: 'Low-latency wireless controller with drift-free hall-effect sticks, dual rumble and a 30-hour battery.',
      features: ['2.4 GHz dongle + Bluetooth 5.2', 'Hall-effect sticks (no drift)', '30-hour battery, USB-C', 'Works with PC, Android and iOS']
    },
    {
      id: 'ghost-controller', name: 'Ghost White Controller', cat: 'gaming', art: 'controller',
      colors: ['#e9e7f2', '#7a2cff'], price: 2499, mrp: 3299, rating: 4.5, reviews: 203,
      desc: 'Clean white wired-or-wireless pad with remappable back paddles and a purple light bar.',
      features: ['Wired or Bluetooth', '2 remappable back paddles', 'Adjustable trigger stops', '20-hour battery']
    },
    {
      id: 'bass-cannon-headset', name: 'Bass Cannon Gaming Headset', cat: 'gaming', art: 'headset',
      colors: ['#ff2a3d', '#1b1b22'], price: 2499, mrp: 3499, rating: 4.6, reviews: 344, featured: true,
      desc: '50 mm drivers, deep bass and a flip-to-mute mic so your crew hears every callout.',
      features: ['50 mm drivers', 'Flip-to-mute boom mic', 'Memory-foam ear cushions', '3.5 mm + USB']
    },
    {
      id: 'night-ops-headset', name: 'Night Ops Wireless Headset', cat: 'gaming', art: 'headset',
      colors: ['#2ad8ff', '#12121c'], price: 3799, mrp: 4999, rating: 4.7, reviews: 158, tag: 'new',
      desc: 'Wireless headset with 7.1 virtual surround, 40-hour battery and low-latency 2.4 GHz.',
      features: ['7.1 virtual surround', '40-hour battery', '2.4 GHz + Bluetooth', 'Detachable mic']
    },

    /* ---------- Accessories ---------- */
    {
      id: 'boss-aviators', name: 'Boss Aviator Shades', cat: 'accessories', art: 'shades',
      colors: ['#ffc61a', '#ff2d6f'], price: 1299, mrp: 1999, rating: 4.6, reviews: 276, tag: 'hot', featured: true,
      desc: 'Gold-frame aviators with polarised sunset lenses. Look like you own the city.',
      features: ['Polarised UV400 lenses', 'Lightweight metal frame', 'Spring hinges', 'Hard case + cloth included']
    },
    {
      id: 'chrono-gold', name: 'Chrono Gold Watch', cat: 'accessories', art: 'watch',
      colors: ['#1b1b22', '#ffc61a'], price: 5499, mrp: 7999, rating: 4.8, reviews: 119, tag: 'limited', featured: true,
      desc: 'Gold-tone chronograph with a matte black strap and a sweeping seconds hand.',
      features: ['Japanese quartz movement', '50 m water resistance', 'Scratch-resistant glass', '2-year warranty']
    },
    {
      id: 'mode-snapback', name: 'MODE Snapback Cap', cat: 'accessories', art: 'cap',
      colors: ['#ff2d6f', '#ffc61a'], price: 699, mrp: 999, rating: 4.5, reviews: 430,
      desc: 'Structured six-panel snapback with a raised MODE logo and a flat brim.',
      features: ['Structured 6-panel crown', 'Raised embroidery', 'Adjustable snap closure', 'One size']
    },
    {
      id: 'getaway-backpack', name: 'Getaway Backpack', cat: 'accessories', art: 'backpack',
      colors: ['#2a1033', '#ff7a1a'], price: 1799, mrp: 2499, rating: 4.6, reviews: 212,
      desc: '25 L water-resistant backpack with a padded laptop sleeve and a hidden cash pocket.',
      features: ['25 L capacity', '15.6" laptop sleeve', 'Water-resistant fabric', 'Hidden back pocket']
    },

    /* ---------- Rides ---------- */
    {
      id: 'interceptor-rc', name: 'Interceptor RC Car 1:16', cat: 'rides', art: 'car',
      colors: ['#ff2a3d', '#ffc61a'], price: 3499, mrp: 4999, rating: 4.7, reviews: 189, tag: 'hot', featured: true,
      desc: '2.4 GHz remote-control street racer that hits 30 km/h, with working headlights.',
      features: ['Top speed 30 km/h', 'Rechargeable battery (25 min)', 'LED headlights', 'Range up to 80 m']
    },
    {
      id: 'midnight-racer', name: 'Midnight Racer Die-cast 1:24', cat: 'rides', art: 'car',
      colors: ['#7a2cff', '#2ad8ff'], price: 1499, mrp: 1999, rating: 4.6, reviews: 97, tag: 'new',
      desc: 'Detailed metal die-cast model with opening doors, rubber tyres and a display base.',
      features: ['Die-cast metal body', 'Opening doors and bonnet', 'Rubber tyres', 'Display base included']
    },
    {
      id: 'sunset-cruiser-rc', name: 'Sunset Cruiser RC 1:18', cat: 'rides', art: 'car',
      colors: ['#ff7a1a', '#f4f1ea'], price: 2499, mrp: 3299, rating: 4.4, reviews: 74,
      desc: 'Retro cruiser RC car with drift tyres, so you can slide around the living room.',
      features: ['Swappable drift tyres', 'USB-rechargeable', 'Proportional steering', 'Range up to 50 m']
    },

    /* ---------- Racing maps (digital, priced by size) ---------- */
    {
      id: 'harbour-night-sprint', name: 'Harbour Night Sprint', cat: 'maps', art: 'track-sprint',
      colors: ['#2ad8ff', '#ffc61a'], size: 'S', km: 2.6, mb: 18, mode: 'Sprint', checkpoints: 14,
      rating: 4.6, reviews: 88, tag: 'new',
      desc: 'A point-to-point dash through the docks, between container stacks and under the harbour cranes. Short, fast and made for photo finishes.',
      features: ['Point-to-point sprint, 14 checkpoints', 'Tight turns between container stacks', 'Night lighting with neon dock signs', 'Install guide included']
    },
    {
      id: 'pier-drift-park', name: 'Pier Drift Park', cat: 'maps', art: 'track-ring',
      colors: ['#ff2d6f', '#ffc61a'], size: 'S', km: 1.8, mb: 12, mode: 'Drift', checkpoints: 8,
      rating: 4.5, reviews: 64,
      desc: 'A compact drift loop at the end of the pier, with one long sweeping bend and a tight chicane to link your slides.',
      features: ['Closed drift loop with a chicane', 'Wide run-off areas for big slides', 'Barriers and spectator stands', 'Install guide included']
    },
    {
      id: 'palm-drive-circuit', name: 'Palm Drive Circuit', cat: 'maps', art: 'track-circuit',
      colors: ['#ffc61a', '#ff2d6f'], size: 'M', km: 4.4, mb: 32, mode: 'Circuit', checkpoints: 22,
      rating: 4.7, reviews: 152, tag: 'hot', featured: true,
      desc: 'A palm-lined street circuit along the beachfront, with two long straights and a hairpin before the finish line.',
      features: ['Lap circuit, 22 checkpoints', 'Two full-throttle straights', 'Hairpin finish for late overtakes', 'Install guide included']
    },
    {
      id: 'canyon-touge-run', name: 'Canyon Touge Run', cat: 'maps', art: 'track-touge',
      colors: ['#ff7a1a', '#ffc61a'], size: 'M', km: 5.2, mb: 38, mode: 'Touge', checkpoints: 26,
      rating: 4.8, reviews: 203, featured: true,
      desc: 'A switchback mountain road cut into the canyon walls. Five hairpins, steep drops and no room for mistakes.',
      features: ['Uphill point-to-point, 26 checkpoints', 'Five hairpins for drift battles', 'Guard rails and lookout points', 'Install guide included']
    },
    {
      id: 'neon-ring-raceway', name: 'Neon Ring Raceway', cat: 'maps', art: 'track-ring',
      colors: ['#7a2cff', '#2ad8ff'], size: 'L', km: 7.4, mb: 64, mode: 'Circuit', checkpoints: 34,
      rating: 4.7, reviews: 118, tag: 'new',
      desc: 'A high-speed ring road wrapped around the city centre, lit up with neon arches and finished with a fast chicane.',
      features: ['Lap circuit, 34 checkpoints', 'Neon arches and light trails', 'Fast chicane before the finish', 'Install guide included']
    },
    {
      id: 'desert-delta-rally', name: 'Desert Delta Rally', cat: 'maps', art: 'track-tri',
      colors: ['#ff7a1a', '#2ad8ff'], size: 'L', km: 8.9, mb: 72, mode: 'Rally', checkpoints: 38,
      rating: 4.6, reviews: 97,
      desc: 'A mixed dirt and tarmac rally stage across the desert flats, with jumps, washouts and a long sand straight.',
      features: ['Rally stage, 38 checkpoints', 'Dirt and tarmac sections', 'Jumps and washouts', 'Install guide included']
    },
    {
      id: 'downtown-grand-loop', name: 'Downtown Grand Loop', cat: 'maps', art: 'track-city',
      colors: ['#72d572', '#ffc61a'], size: 'XL', km: 12.8, mb: 140, mode: 'Circuit', checkpoints: 52,
      rating: 4.9, reviews: 76, tag: 'limited', featured: true,
      desc: 'The whole city in one race: downtown blocks, the harbour bridge and the hills, linked into one giant loop for big crew nights.',
      features: ['Whole-city lap, 52 checkpoints', 'Downtown, bridge and hill sections', 'Built for big race nights', 'Install guide included']
    }
  ],

  dealId: 'chrono-gold',

  news: [
    'Night Rider jacket restocked — grab it before the crew does',
    'Free delivery on all orders above ₹999',
    'Use code PAWAN10 for 10% off your first heist',
    'Pay with PhonePe, Google Pay, Paytm, card or bank transfer',
    'Heist Pro controller rated 4.8 by 600+ players',
    'New drop: Getaway Runner sneakers now live',
    'HEIST20 — 20% off orders above ₹3,000',
    'New category: digital racing maps, priced by size'
  ],

  tips: [
    'Tap the phone icon or press <kbd>P</kbd> to open the menu from anywhere.',
    'Your cart total shows up as cash in the top-right corner.',
    'The more items in your cart, the higher your wanted level. Don\'t worry, it\'s only for show.',
    'Use the loadout wheel on the Categories page to switch categories fast.',
    'Orders above ₹999 ship free. Watch the meter under the minimap.',
    'Save items with the heart to find them later in your Wishlist.',
    'Code PAWAN10 takes 10% off any order.',
    'UPI payments work with PhonePe, Google Pay and Paytm.',
    'Racing maps are priced by size: Small, Medium, Large or Extra large.'
  ],

  blogs: [
    {
      id: 'race-map-sizes', title: 'Small to Extra Large: Picking the Right Race Map Size', tag: 'Maps',
      date: '2026-11-08', read: 4, art: 'track-city', colors: ['#0b2a33', '#2ad8ff'], artColors: ['#72d572', '#ffc61a'],
      excerpt: 'Bigger isn\'t always better. Here\'s which map size suits sprints, drift nights and full-crew races.',
      body: [
        { p: 'Every racing map in the store comes in one of four sizes, and the size sets the price. Here\'s how to choose.' },
        { h: 'Small: quick sprints' },
        { p: 'Up to 3 km. Great for short sprints and drift sessions you want to run again and again. Small maps download fast and suit smaller lobbies.' },
        { h: 'Medium: full circuits' },
        { p: '3 to 6 km. Enough room for long straights, a few hairpins and real overtakes. The sweet spot for most race nights.' },
        { h: 'Large: multi-zone races' },
        { p: '6 to 10 km. Routes that cross several parts of the city, so every lap changes scenery and pace.' },
        { h: 'Extra large: whole-city routes' },
        { p: 'Over 10 km. Built for long events with a full crew. Expect bigger downloads and longer loading times.' },
        { list: ['Check the download size before buying on mobile data', 'Read the README in the zip for any extra files you need', 'Back up your game files before installing a map'] }
      ]
    },
    {
      id: 'night-drip-guide', title: 'The Night Drip Guide: Dress Like You Own the City', tag: 'Style',
      date: '2026-10-28', read: 5, art: 'jacket', colors: ['#2b1055', '#ff2d6f'], artColors: ['#1d1d26', '#ff2d6f'],
      excerpt: 'Three looks for after dark, built around one jacket, one pair of kicks and a lot of attitude.',
      body: [
        { p: 'City nights call for a look that reads from across the street. The trick isn\'t wearing more. It\'s picking one loud piece and keeping the rest quiet.' },
        { h: 'Look 1: The Rider' },
        { p: 'Start with the Night Rider jacket over a plain black tee. Add dark slim denim and the Drift High-Tops. The pink zip is your one pop of colour, so leave it as the only one.' },
        { h: 'Look 2: The Sunset' },
        { p: 'Let the Sunset Drip tee lead. Pair it with relaxed cargos, white Turbo Street sneakers and the Boss Aviators pushed up on your head once the sun goes down.' },
        { h: 'Look 3: The Low Profile' },
        { p: 'Hustler hoodie, black joggers, Getaway Runners. Add the MODE snapback and you\'re ready for anything without looking like you tried.' },
        { list: ['Pick one hero piece per outfit', 'Match shoe colour to one accent in your top', 'Keep metal accessories to one tone (gold or silver)'] }
      ]
    },
    {
      id: 'controller-setup', title: 'Set Up Your Controller Like a Pro in 5 Minutes', tag: 'Gaming',
      date: '2026-10-19', read: 4, art: 'controller', colors: ['#0f2a4a', '#7a2cff'], artColors: ['#22222e', '#ffc61a'],
      excerpt: 'Dead zones, trigger stops and button maps — the five settings that make the biggest difference.',
      body: [
        { p: 'A good controller only feels great once it\'s tuned to your hands. Here are the settings worth five minutes of your time.' },
        { h: '1. Update the firmware' },
        { p: 'Plug in over USB-C and install the latest firmware from the companion app. Updates often fix connection drops and improve battery life.' },
        { h: '2. Set your dead zone' },
        { p: 'With hall-effect sticks there\'s no drift to hide, so drop the inner dead zone to 3–5% for faster, finer aim.' },
        { h: '3. Map the back paddles' },
        { p: 'Put jump and crouch on the paddles so you never take your thumb off the right stick.' },
        { h: '4. Trigger stops for shooters' },
        { p: 'Short trigger travel means faster shots. Switch to long travel for racing games where you want throttle control.' },
        { list: ['Charge fully before first use', 'Use the 2.4 GHz dongle for the lowest latency', 'Save separate profiles for racing and shooting'] }
      ]
    },
    {
      id: 'sneaker-care', title: 'Keep Your Kicks Fresh: The 10-Minute Sneaker Clean', tag: 'Care',
      date: '2026-10-08', read: 3, art: 'sneaker', colors: ['#3a0f2b', '#ff7a1a'], artColors: ['#f4f1ea', '#ff2a3d'],
      excerpt: 'A quick routine that keeps white soles white and suede looking new.',
      body: [
        { p: 'Clean sneakers say more than expensive ones. Here\'s the routine we use on every pair that comes through the store.' },
        { h: 'What you need' },
        { list: ['A soft brush (an old toothbrush works)', 'Mild soap and warm water', 'A microfibre cloth', 'A suede eraser for suede panels'] },
        { h: 'The routine' },
        { p: 'Take out the laces and insoles. Dry-brush loose dirt first, then scrub the midsole with soapy water. Wipe the upper gently. Never soak suede. Use the eraser instead.' },
        { p: 'Stuff the shoes with paper and let them air-dry away from direct sun. Heat yellows white soles and weakens the glue.' }
      ]
    },
    {
      id: 'rc-car-basics', title: 'RC Car Basics: Batteries, Range and Your First Drift', tag: 'Rides',
      date: '2026-09-27', read: 4, art: 'car', colors: ['#40120f', '#ffc61a'], artColors: ['#ff2a3d', '#ffc61a'],
      excerpt: 'Everything you need to know before your first run, from charging right to pulling a clean slide.',
      body: [
        { p: 'RC cars are pure fun once you know a few basics. Get these right and your car will last for years.' },
        { h: 'Charging' },
        { p: 'Always charge with the cable in the box, and stop once the light turns green. Let the battery cool for 10 minutes after a run before charging again.' },
        { h: 'Range' },
        { p: 'Turn on the remote first, then the car. Do the reverse when switching off. This stops the car from running away on its own.' },
        { h: 'Your first drift' },
        { p: 'Fit the drift tyres, build up speed on a smooth floor, then turn hard and ease off the throttle. Steer into the slide to hold it.' },
        { list: ['Avoid water, sand and wet grass', 'Check that the wheel nuts are tight before each run', 'Store with the battery about half charged'] }
      ]
    },
    {
      id: 'gaming-room', title: 'Build a Gaming Room That Looks Like a Hideout', tag: 'Gaming',
      date: '2026-09-15', read: 6, art: 'headset', colors: ['#0b2a33', '#ff2d6f'], artColors: ['#2ad8ff', '#12121c'],
      excerpt: 'Lighting, sound and cable tricks that make any corner feel like your own safehouse.',
      body: [
        { p: 'Your setup doesn\'t need to be big. It needs atmosphere. Three upgrades do most of the work.' },
        { h: 'Light it like sunset' },
        { p: 'Put an orange or pink LED strip behind your screen. It cuts eye strain and gives the whole room a warm city-at-dusk glow.' },
        { h: 'Sound that hits' },
        { p: 'A good headset beats cheap speakers every time. Turn on virtual surround for open-world games so you can hear where the action is coming from.' },
        { h: 'Hide the cables' },
        { p: 'Velcro ties and an adhesive cable tray under the desk make a cluttered setup look clean in about 15 minutes.' }
      ]
    },
    {
      id: 'behind-pawan-mode', title: 'Behind the Brand: Why We Built Pawan Mode', tag: 'Story',
      date: '2026-09-01', read: 3, art: 'cap', colors: ['#2b1055', '#ff7a1a'], artColors: ['#ff2d6f', '#ffc61a'],
      excerpt: 'A store that feels like stepping into an open-world game. Here\'s how it started.',
      body: [
        { p: 'Pawan Mode started with one idea: shopping online should feel less like filling in forms and more like playing.' },
        { p: 'So we built a store where your cart total is your cash, saving items feels like collecting loot, and every order ends with a mission-complete screen.' },
        { h: 'What we stand for' },
        { list: ['Gear that looks good on the street and in the lobby', 'Fair prices with no hidden charges', 'Easy payments with UPI, card or bank transfer', 'Fast delivery and easy 7-day returns'] },
        { p: 'Thanks for riding with us. The city is yours.' }
      ]
    }
  ],

  /* "How to use" — shopping flow objectives */
  objectives: [
    { title: 'Explore the city', text: 'Browse the home page or open Categories and spin the loadout wheel to pick a category.' },
    { title: 'Scout the gear', text: 'Tap any product for a quick view: photos, features, price and rating. Tap the heart to save it to your wishlist.' },
    { title: 'Grab the loot', text: 'Press "Add to cart". Your cash counter and wanted stars go up. Add ₹999 or more for free delivery.' },
    { title: 'Plan the heist', text: 'Open your cart, set quantities, and apply a coupon such as PAWAN10. Then press Checkout.' },
    { title: 'Make the getaway', text: 'Enter your delivery address (racing maps only need your email), then pay with PhonePe, Google Pay, Paytm, card or bank transfer. Mission complete!' }
  ],

  /* "How to use" — product manuals per category */
  manuals: {
    apparel: {
      title: 'Apparel care', art: 'hoodie', colors: ['#7a2cff', '#ffc61a'],
      intro: 'Keep prints sharp and fabric soft for longer.',
      steps: ['Turn tees and hoodies inside out before washing.', 'Machine wash cold (30°C) on a gentle cycle with similar colours.', 'Skip bleach and fabric softener on printed pieces.', 'Dry in the shade. Don\'t tumble-dry prints.', 'Iron inside out on low heat, never directly on the print.'],
      dos: ['Wipe faux leather with a damp cloth', 'Hang jackets on wide hangers', 'Zip up before washing'],
      donts: ['Dry-clean puff prints', 'Wring out hoodies', 'Store leather in plastic bags']
    },
    footwear: {
      title: 'Sneaker care', art: 'sneaker', colors: ['#f4f1ea', '#ff2a3d'],
      intro: 'Wear them hard and keep them clean with a 10-minute routine.',
      steps: ['Pick your usual UK size. If you\'re between sizes, go half a size up.', 'Loosen the laces fully before putting the shoes on.', 'Brush off dry dirt after every few wears.', 'Clean the soles with mild soap and a soft brush.', 'Air-dry stuffed with paper, away from direct sun.'],
      dos: ['Use a suede eraser on suede panels', 'Rotate pairs so they can dry out', 'Use shoe trees to keep the shape'],
      donts: ['Put them in a washing machine', 'Dry them on a heater', 'Soak suede or knit uppers']
    },
    gaming: {
      title: 'Controller and headset setup', art: 'controller', colors: ['#22222e', '#ffc61a'],
      intro: 'Pair once, play anywhere.',
      steps: ['Charge fully with the included USB-C cable (about 2 hours).', 'For PC: plug in the 2.4 GHz dongle and switch the device to 2.4G mode.', 'For phone or tablet: hold the pairing button for 3 seconds and pick the device in Bluetooth settings.', 'Headsets: plug into 3.5 mm or USB, then set it as the default device.', 'Optional: install the companion app to remap buttons and update firmware.'],
      dos: ['Use the dongle for the lowest latency', 'Update firmware every few months', 'Store headsets on a stand'],
      donts: ['Leave on charge for days', 'Pull cables by the wire', 'Use harsh cleaners on ear cushions']
    },
    accessories: {
      title: 'Shades, watch and bag care', art: 'watch', colors: ['#1b1b22', '#ffc61a'],
      intro: 'Small habits that keep your accessories looking new.',
      steps: ['Shades: clean lenses with the included cloth only, and keep them in the hard case.', 'Watch: pull the crown out to set the time, then push it back in fully before water contact.', 'Watch: water-resistant to 50 m, fine for rain and handwashing but not for diving.', 'Cap: spot-clean with a damp cloth and air-dry on a round object.', 'Backpack: empty it and wipe with a damp cloth. Don\'t machine wash.'],
      dos: ['Store shades lens-up', 'Wipe the watch strap weekly', 'Keep heavy items close to your back'],
      donts: ['Leave shades on a car dashboard', 'Press watch buttons underwater', 'Overload the laptop sleeve']
    },
    rides: {
      title: 'RC car quick start', art: 'car', colors: ['#ff2a3d', '#ffc61a'],
      intro: 'From box to first drift in under 10 minutes.',
      steps: ['Charge the car battery with the included USB cable until the light turns green.', 'Put batteries in the remote (2 × AA, not included).', 'Switch on the remote first, then the car. They pair automatically.', 'Start slow on a flat, dry surface. Push the throttle gently.', 'When done, switch off the car first, then the remote.'],
      dos: ['Let the battery cool before recharging', 'Check the wheels before each run', 'Fit drift tyres for smooth floors'],
      donts: ['Drive through water or sand', 'Leave it charging overnight', 'Lift the car by its wheels']
    },
    maps: {
      title: 'Installing a racing map', art: 'track-circuit', colors: ['#2ad8ff', '#ffc61a'],
      intro: 'From payment to your first lap in about five minutes.',
      steps: ['After paying, tap your map on the order screen, or download it later from Cart → My orders on the same device.','Download the .zip file and extract it with 7-Zip or WinRAR.', 'Open the README inside. It lists every file and where it goes.', 'Back up your game files, then copy the map files to the folder the README names, or install them with your mod manager.', 'Start the game, load the map from your map editor or race menu, and line up at the start.'],
      dos: ['Back up before installing', 'Keep the zip for reinstalls', 'Install any extra files the README lists'],
      donts: ['Share your map files', 'Install over another map without a backup', 'Use maps in online modes that don\'t allow mods']
    }
  },

  paymentGuide: [
    { id: 'phonepe', name: 'PhonePe', logo: 'Pe', cls: 'pl-phonepe', steps: ['Choose PhonePe at checkout', 'Scan the QR or tap "Pay" on your phone', 'Check the amount and enter your UPI PIN'] },
    { id: 'gpay', name: 'Google Pay', logo: '<em>G</em>Pay', cls: 'pl-gpay', steps: ['Choose Google Pay at checkout', 'Scan the QR with Google Pay', 'Approve with your UPI PIN'] },
    { id: 'paytm', name: 'Paytm', logo: 'Paytm', cls: 'pl-paytm', steps: ['Choose Paytm at checkout', 'Scan the QR or enter your UPI ID', 'Confirm in the Paytm app'] },
    { id: 'card', name: 'Debit / Credit Card', icon: 'card', cls: 'pl-card', steps: ['Choose Card and tap Pay. A secure Razorpay window opens', 'Enter your card details there, never anywhere else on the site', 'Complete the OTP from your bank'] },
    { id: 'bank', name: 'Bank Transfer', icon: 'bank', cls: 'pl-bank', steps:['Copy our account number and IFSC', 'Send the exact amount by NEFT, IMPS or RTGS', 'Enter the UTR / reference number to confirm'] }
  ],

  faqs: [
    { q: 'Which payment methods do you accept?', a: 'PhonePe, Google Pay and Paytm (via UPI), debit and credit cards (Visa, Mastercard, RuPay), and direct bank transfer by NEFT, IMPS or RTGS.' },
    { q: 'Is it safe to pay on Pawan Mode?', a: 'Yes. UPI payments are approved inside your own UPI app with your PIN. We never ask for your UPI PIN, card PIN or OTP over call or chat.' },
    { q: 'How long does delivery take?', a: 'Metro cities usually get orders in 2 to 4 days, and other locations in 4 to 7 days. You\'ll get tracking details once your order ships.' },
    { q: 'Is delivery free?', a: 'Delivery is free on orders of ₹999 or more. Below that, a flat ₹79 delivery fee applies. The coupon FREERIDE makes delivery free on any order. Racing maps are downloads, so they never have a delivery fee.' },
    { q: 'How do I get a racing map after I pay?', a: 'Racing maps are digital downloads, so there\'s nothing to ship. As soon as your payment is confirmed you can download them from the order screen, and again later from Cart → My orders. Each map can be downloaded 5 times within 30 days.' },
    { q: 'How are racing maps priced?', a: 'By size. Small maps (up to 3 km) cost the least, and Extra large whole-city maps cost the most. Every map shows its size, track length and download size.' },
    { q: 'Can I return a racing map?', a: 'Digital maps can\'t be returned once they\'ve been downloaded. If a map doesn\'t work for you, contact us within 7 days with your order number and we\'ll help you fix it or give you a refund.' },
    { q: 'Can I return or exchange a product?', a: 'Yes. You can return or exchange unused items with tags within 7 days of delivery. Refunds go back to the original payment method within 5 to 7 working days.' },
    { q: 'I paid by bank transfer. What happens next?', a: 'Enter your UTR or reference number at checkout. We match it with our bank statement and confirm your order, usually within a few hours.' },
    { q: 'My UPI payment failed but money was deducted.', a: 'Don\'t worry. Failed UPI payments are automatically refunded by your bank, usually within 48 hours. If not, contact us with your UPI reference number.' },
    { q: 'How do coupons work?', a: 'Enter the code in your cart and press Apply. PAWAN10 gives 10% off, HEIST20 gives 20% off orders of ₹3,000+, and FREERIDE gives free delivery. One coupon per order.' }
  ]
};
