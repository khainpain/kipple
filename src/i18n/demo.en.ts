// The English demo archive (src/lib/demo.ts builds the cards). Same story as demo.ru.ts, told with
// the sites an English-speaking person saves from. Everything here is made up or public.
import type { DemoSpec } from "../lib/demoSpec.js";

const DEALS = "Daily Deals";
const DESIGN = "Design Weekly";

export const DEMO_CARDS_EN: DemoSpec[] = [
  // Recipes: two sites Kipple knows, and three things sorted by hand.
  { d: 2, url: "https://www.seriouseats.com/the-best-slow-cooked-bolognese-sauce-recipe", title: "The Best Slow-Cooked Bolognese Sauce", desc: "A rich, meaty ragù that cooks low and slow in the oven. Worth every one of its four hours.", site: "Serious Eats", pin: true, tags: ["pasta", "weekend"], status: "todo" },
  { d: 11, url: "https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies", title: "BA's Best Chocolate Chip Cookies", desc: "Brown butter, two kinds of sugar and a rest in the fridge.", site: "Bon Appétit", tags: ["baking"] },
  {
    d: 5,
    url: "https://www.instagram.com/reel/C9demoReel1/",
    title: 'Anna Cooks on Instagram: "10-minute pasta 🍝\nThe sauce is ready before the water boils. You only need three things: tomatoes, garlic and good olive oil. Recipe below, save it!"',
    desc: '12K likes, 340 comments - anna.cooks on May 1, 2026: "10-minute pasta 🍝\nThe sauce is ready before the water boils. You only need three things: tomatoes, garlic and good olive oil. Recipe below, save it!". ',
    site: "Instagram",
    pic: "plate",
    tall: true,
    topic: "Recipes",
    tags: ["pasta", "quick"],
  },
  { d: 38, k: "photo", t: "Grandma's apple pie, her handwriting", pic: "paper", tall: true, topic: "Recipes", pin: true, tags: ["baking", "family"] },
  { d: 64, t: "Pancakes: 250 g flour, 2 eggs, 500 ml milk, a pinch of salt, 1 tbsp sugar. Let the batter rest for 20 minutes.", topic: "Recipes", tags: ["breakfast"] },

  // Travel
  { d: 6, url: "https://www.booking.com/city/pt/lisbon.html", title: "Lisbon hotels: where to stay", desc: "Alfama for the views, Baixa for the trams, Príncipe Real for the food.", site: "Booking.com", tags: ["lisbon", "hotels"], status: "read_later" },
  { d: 7, t: "Lisbon list: Time Out Market, tram 28 early in the morning, pastel de nata at Manteigaria, sunset at Miradouro da Graça", topic: "Travel", pin: true, tags: ["lisbon"], status: "todo" },
  { d: 8, k: "photo", t: "Lisbon, the view from the hostel roof", pic: "city", album: 4, topic: "Travel", tags: ["lisbon", "photos"] },
  { d: 9, k: "document", t: "Boarding pass AMS to LIS", file: "boarding-pass-AMS-LIS.pdf", kb: 212, topic: "Travel", pin: true, tags: ["lisbon", "tickets"] },
  { d: 20, url: "https://www.seat61.com/trains-and-routes/nightjet.htm", title: "Nightjet sleeper trains: routes, tickets and what the cabins are like", desc: "Vienna to Amsterdam overnight, with photos of every kind of compartment.", site: "The Man in Seat 61", topic: "Travel", tags: ["trains"], status: "read_later" },
  { d: 47, url: "https://www.airbnb.com/s/Porto--Portugal/homes", title: "Porto: holiday rentals and places to stay", desc: "Flats by the river in Ribeira, from two nights.", site: "Airbnb", tags: ["porto"] },
  { d: 96, k: "photo", t: "The beach near Cascais", pic: "sea", topic: "Travel", tags: ["photos"] },

  // Development: every link here got its topic from the site alone.
  { d: 1, url: "https://github.com/BurntSushi/ripgrep", title: "BurntSushi/ripgrep: recursively searches directories for a regex pattern", desc: "ripgrep is a line-oriented search tool that respects your gitignore.", site: "GitHub", tags: ["tools", "rust"] },
  { d: 13, url: "https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git", title: "How do I undo the most recent local commits in Git?", desc: "I accidentally committed the wrong files to Git, but didn't push the commit to the server yet.", site: "Stack Overflow", pin: true, tags: ["git"] },
  { d: 24, url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Masonry_layout", title: "Masonry layout - CSS | MDN", desc: "One axis uses a typical strict grid layout, the other a stacking layout.", site: "MDN Web Docs", tags: ["css"] },
  { d: 55, url: "https://github.com/tauri-apps/tauri", title: "tauri-apps/tauri: build smaller, faster and more secure desktop apps with a web frontend", desc: "Tauri is a framework for building tiny, fast binaries for all major desktop platforms.", site: "GitHub", tags: ["rust", "desktop"], status: "idea" },

  // Design
  { d: 3, url: "https://fonts.google.com/specimen/Inter", title: "Inter - Google Fonts", desc: "A variable typeface carefully crafted and designed for computer screens.", site: "Google Fonts", tags: ["fonts"] },
  { d: 16, url: "https://coolors.co/palettes/trending", title: "Trending Color Palettes - Coolors", desc: "Get inspired by thousands of beautiful color schemes and make something cool.", site: "Coolors", tags: ["colour"] },
  { d: 29, url: "https://dribbble.com/tags/dashboard", title: "Dashboard designs, themes and templates on Dribbble", desc: "Shots tagged dashboard: tables that breathe, quiet charts, one accent colour.", site: "Dribbble", tags: ["references"] },
  { d: 33, k: "photo", t: "Landing page references", pic: "screen", album: 3, topic: "Design", tags: ["references", "landing"] },

  // Movies and books
  { d: 4, url: "https://www.imdb.com/title/tt0083658/", title: "Blade Runner (1982) ⭐ 8.1 | Action, Drama, Sci-Fi", desc: "A blade runner must pursue and terminate four replicants who stole a ship in space and returned to Earth.", site: "IMDb", pin: true, tags: ["sci-fi", "to watch"], status: "todo" },
  { d: 18, url: "https://letterboxd.com/film/perfect-days-2023/", title: "Perfect Days (2023)", desc: "Hirayama cleans public toilets in Tokyo, lives his life in simplicity and daily tranquility.", site: "Letterboxd", tags: ["to watch"] },
  { d: 71, url: "https://www.imdb.com/title/tt1856101/", title: "Blade Runner 2049 (2017) ⭐ 8.0 | Action, Drama, Mystery", desc: "Young blade runner K's discovery of a long-buried secret leads him to track down former blade runner Rick Deckard.", site: "IMDb", tags: ["sci-fi"] },
  { d: 10, url: "https://www.goodreads.com/book/show/7082.Do_Androids_Dream_of_Electric_Sheep_", title: "Do Androids Dream of Electric Sheep? by Philip K. Dick", desc: "Kipple is useless objects, like junk mail or match folders after you use the last match. When nobody's around, kipple reproduces itself.", site: "Goodreads", tags: ["sci-fi", "to read"], status: "read_later" },
  { d: 122, url: "https://www.gutenberg.org/ebooks/1342", title: "Pride and Prejudice by Jane Austen", desc: "Free ebook, in EPUB and Kindle formats.", site: "Project Gutenberg", tags: ["classics"] },

  // Money: sorted by hand, so Kipple can offer the look-alikes below.
  { d: 14, t: "Budget rule: 50% needs (rent, groceries), 30% wants, 20% savings. Move the savings on payday, not at the end of the month.", topic: "Money", tags: ["budget"] },
  { d: 27, url: "https://www.investopedia.com/terms/e/emergency_fund.asp", title: "Emergency Fund: What It Is and Why It Matters", desc: "Savings set aside for the unexpected: three to six months of expenses is the usual goal.", site: "Investopedia", topic: "Money", pin: true, tags: ["savings"], status: "read_later" },
  { d: 80, k: "document", t: "Tax return, sent", file: "tax-return-2025.pdf", kb: 388, topic: "Money", tags: ["tax"] },
  { d: 12, t: "Budget for March: rent 1,150, groceries 400, savings 300, the rest is mine" },
  { d: 31, t: "Tax return deadline is May 1. Find the payslips and the rent contract first." },
  { d: 45, t: "Emergency fund: three months of rent in the savings account, 2.1% interest" },

  // Six videos from one site: a pile of its own on the cleanup screen. One was saved twice.
  { d: 2.5, url: "https://www.youtube.com/watch?v=aircAruvnKk", title: "But what is a neural network? | Deep learning chapter 1", desc: "3Blue1Brown", site: "YouTube", pic: "screen" },
  { d: 15, url: "https://www.youtube.com/watch?v=arj7oStGLkU", title: "Inside the mind of a master procrastinator | Tim Urban | TED", desc: "TED", site: "YouTube", pic: "city" },
  { d: 15.2, url: "https://youtu.be/arj7oStGLkU?si=Kq2demo", title: "Inside the mind of a master procrastinator | Tim Urban | TED", desc: "TED", site: "YouTube", pic: "city" },
  { d: 22, url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc", title: "Steve Jobs' 2005 Stanford Commencement Address", desc: "Stanford", site: "YouTube", pic: "hills" },
  { d: 41, url: "https://www.youtube.com/watch?v=rfscVS0vtbw", title: "Learn Python - Full Course for Beginners [Tutorial]", desc: "freeCodeCamp.org", site: "YouTube", pic: "screen" },
  { d: 58, url: "https://www.youtube.com/watch?v=PkZNo7MFNFg", title: "Learn JavaScript - Full Course for Beginners", desc: "freeCodeCamp.org", site: "YouTube", pic: "screen" },
  { d: 420, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Me at the zoo", desc: "jawed", site: "YouTube", pic: "hills" },

  // Forwards from two channels: one to throw out in a click, one worth a topic.
  { d: 1.5, t: "Today only: wireless headphones at 40% off. Code SOUND40 at checkout.", from: DEALS },
  { d: 4.5, t: "Robot vacuum for 129 instead of 219. 300 left in stock.", from: DEALS },
  { d: 8.5, t: "Flash sale: three months of streaming for the price of one. Ends at midnight.", from: DEALS },
  { d: 17, k: "photo", t: "Sneakers from 39. Sizes are going fast.", pic: "screen", from: DEALS },
  { d: 26, t: "Free delivery this weekend on orders over 25.", from: DEALS },
  { d: 36, t: "Last call: winter jackets at 60% off.", from: DEALS },
  { d: 3.5, k: "photo", t: "Five dashboards that don't shout: what they have in common", pic: "screen", from: DESIGN },
  { d: 10.5, t: "Spacing scale: why 4 and 8 px keep working, and where they stop", from: DESIGN },
  { d: 19, url: "https://www.nngroup.com/articles/ten-usability-heuristics/", title: "10 Usability Heuristics for User Interface Design", desc: "Jakob Nielsen's ten general principles for interaction design.", site: "Nielsen Norman Group", from: DESIGN },
  { d: 30, k: "photo", t: "A type pairing cheat sheet", pic: "paper", from: DESIGN },
  { d: 52, t: "Icon sets with a soft line: a short list", from: DESIGN },

  // Photos, videos, files and voice messages saved without a word.
  { d: 0.4, k: "photo", pic: "screen", album: 4 },
  { d: 6.5, k: "photo", pic: "plate" },
  { d: 21, k: "photo", pic: "hills", tall: true },
  { d: 34, k: "photo", pic: "paper" },
  { d: 62, k: "photo", pic: "sea" },
  { d: 90, k: "photo", pic: "city", tall: true },
  { d: 12.5, k: "video", pic: "sea", file: "IMG_4082.mp4", dur: 42, kb: 18400 },
  { d: 49, k: "animation", pic: "hills", file: "cat-jump.mp4", dur: 4, kb: 900 },
  { d: 70, k: "video_note", dur: 23, kb: 2100 },
  { d: 5.5, k: "document", file: "scan_0042.pdf", kb: 640 },
  { d: 23, k: "document", file: "shopping.txt", kb: 1 },
  { d: 44, k: "document", file: "flat-costs-2026.xlsx", kb: 48 },
  { d: 110, k: "document", file: "fonts.zip", kb: 5300 },
  { d: 0.8, k: "voice", dur: 12, kb: 30 },
  { d: 28, k: "voice", dur: 107, kb: 260 },
  { d: 75, k: "audio", file: "podcast-ep-112.mp3", dur: 2710, kb: 43000 },

  // Notes to self
  { d: 0.2, t: "Dentist on Thursday at 16:30, bring the old x-ray" },
  { d: 1.2, t: "Packing\n☑ passport\n☑ charger\n☐ sunscreen\n☐ plug adapter" },
  { d: 9.5, t: "Idea: a bot that sends three random saved messages once a week" },
  { d: 32, t: "Call the landlord about the boiler" },
  { d: 50, t: "Sam says to read The Design of Everyday Things" },
  { d: 66, k: "contact", t: "Marco (plumber) +1 555 0142" },
  { d: 85, k: "location", t: "38.7139, -9.1394" },
  { d: 17.5, url: "https://en.wikipedia.org/wiki/Zettelkasten", title: "Zettelkasten - Wikipedia", desc: "A zettelkasten or card file consists of small items of information stored on paper slips or cards that may be linked to each other.", site: "Wikipedia" },
  { d: 39, url: "https://vimeo.com/76979871", title: "The New Vimeo Player (You Know, For Videos)", desc: "Vimeo Staff", site: "Vimeo", pic: "hills" },
  { d: 24.5, url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Masonry_layout?utm_source=newsletter", title: "Masonry layout - CSS | MDN", desc: "One axis uses a typical strict grid layout, the other a stacking layout.", site: "MDN Web Docs", tags: ["css"] },

  // Passwords and card numbers: kept apart, never offered in bulk, never sent anywhere.
  { d: 19.5, t: "home wifi password: correct-horse-battery" },
  { d: 53, t: "Travel card: 4242 4242 4242 4242, exp 08/29" },
  { d: 140, t: "PIN: 4821 (gym locker)" },

  // Junk Kipple spots by itself
  { d: 0.6, k: "sticker", t: "👍" },
  { d: 14.5, t: "test" },
  { d: 37, t: "ok" },
  { d: 61, k: "sticker", t: "😂" },
  { d: 130, t: "+" },

  // Years-old saves, two of them links to pages that no longer exist.
  { d: 800, t: "Gift ideas for mum: a ceramic teapot, gardening gloves, that book about bees" },
  { d: 860, k: "poll", t: "Where do we go this summer?\n• Portugal\n• Croatia\n• Staying home" },
  { d: 1150, url: "https://plus.google.com/communities/104857329118204385512", title: "Board game nights - Google+", desc: "A community for people who play board games on Thursdays.", site: "Google+", broken: true },
  { d: 1420, url: "https://vine.co/v/OQwFdemo2Ar", title: "Dog on a skateboard - Vine", site: "Vine", broken: true },
  { d: 1600, url: "https://news.ycombinator.com/item?id=8863", title: "My YC app: Dropbox - Throw away your USB drive | Hacker News", site: "Hacker News" },
  { d: 1750, t: "Flat hunting: ask about the service charge, the boiler's age, and who the neighbours are" },
];
