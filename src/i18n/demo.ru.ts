// The Russian demo archive (src/lib/demo.ts builds the cards). Same story as demo.en.ts, told with
// the sites a Russian-speaking person saves from. Everything here is made up or public.
import type { DemoSpec } from "../lib/demoSpec.js";

const DEALS = "Скидки дня";
const DESIGN = "Дизайн-канал";

export const DEMO_CARDS_RU: DemoSpec[] = [
  // Recipes: a site Kipple knows, and things sorted by hand.
  { d: 2, url: "https://eda.ru/recepty/pasta-picca/spagetti-karbonara-s-krasnym-lukom-17614", title: "Спагетти карбонара с красным луком", desc: "Пошаговый рецепт на 4 порции: спагетти, бекон, желтки, пармезан. Готовится 30 минут.", site: "Еда.ру", pin: true, tags: ["паста", "ужин"], status: "todo" },
  { d: 11, url: "https://www.povarenok.ru/recipes/show/52413/", title: "Шарлотка с яблоками: рецепт с фото", desc: "Три яйца, стакан сахара, стакан муки и кислые яблоки. В духовке 40 минут.", site: "Поварёнок.ру", tags: ["выпечка"] },
  {
    d: 5,
    url: "https://www.instagram.com/reel/C9demoReel1/",
    // Instagram writes its page title like this whatever the language; the app splits it up.
    title: 'Анна готовит on Instagram: "Паста за 10 минут 🍝\nСоус готов, пока закипает вода. Нужны всего три вещи: томаты, чеснок и хорошее оливковое масло. Рецепт в описании, сохраняйте!"',
    desc: '12K likes, 340 comments - anna.gotovit on May 1, 2026: "Паста за 10 минут 🍝\nСоус готов, пока закипает вода. Нужны всего три вещи: томаты, чеснок и хорошее оливковое масло. Рецепт в описании, сохраняйте!". ',
    site: "Instagram",
    pic: "plate",
    tall: true,
    topic: "Рецепты",
    tags: ["паста", "быстро"],
  },
  { d: 38, k: "photo", t: "Бабушкин яблочный пирог, её почерком", pic: "paper", tall: true, topic: "Рецепты", pin: true, tags: ["выпечка", "семья"] },
  { d: 64, t: "Блины: 250 г муки, 2 яйца, 500 мл молока, щепотка соли, ложка сахара. Дать постоять 20 минут.", topic: "Рецепты", tags: ["завтрак"] },

  // Travel
  { d: 6, url: "https://www.booking.com/city/pt/lisbon.ru.html", title: "Отели в Лиссабоне: где остановиться", desc: "Алфама ради видов, Байша ради трамваев, Принсипи-Реал ради еды.", site: "Booking.com", tags: ["лиссабон", "отели"], status: "read_later" },
  { d: 7, t: "Лиссабон, список: рынок Time Out, трамвай 28 рано утром, паштел-де-ната в Manteigaria, закат на смотровой Граса", topic: "Путешествия", pin: true, tags: ["лиссабон"], status: "todo" },
  { d: 8, k: "photo", t: "Лиссабон, вид с крыши хостела", pic: "city", album: 4, topic: "Путешествия", tags: ["лиссабон", "фото"] },
  { d: 9, k: "document", t: "Посадочный Амстердам — Лиссабон", file: "boarding-pass-AMS-LIS.pdf", kb: 212, topic: "Путешествия", pin: true, tags: ["лиссабон", "билеты"] },
  { d: 20, url: "https://www.seat61.com/trains-and-routes/nightjet.htm", title: "Nightjet sleeper trains: routes, tickets and what the cabins are like", desc: "Vienna to Amsterdam overnight, with photos of every kind of compartment.", site: "The Man in Seat 61", topic: "Путешествия", tags: ["поезда"], status: "read_later" },
  { d: 47, url: "https://2gis.ru/kazan/geo/2956015537025516", title: "Казанский кремль — 2ГИС", desc: "Как добраться, часы работы, отзывы и фотографии.", site: "2ГИС", tags: ["казань"] },
  { d: 96, k: "photo", t: "Пляж под Кашкайшем", pic: "sea", topic: "Путешествия", tags: ["фото"] },

  // Development: every link here got its topic from the site alone.
  { d: 1, url: "https://github.com/BurntSushi/ripgrep", title: "BurntSushi/ripgrep: recursively searches directories for a regex pattern", desc: "ripgrep is a line-oriented search tool that respects your gitignore.", site: "GitHub", tags: ["инструменты", "rust"] },
  { d: 13, url: "https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git", title: "How do I undo the most recent local commits in Git?", desc: "I accidentally committed the wrong files to Git, but didn't push the commit to the server yet.", site: "Stack Overflow", pin: true, tags: ["git"] },
  { d: 24, url: "https://habr.com/ru/articles/784256/", title: "Раскладка masonry на чистом CSS: что уже работает", desc: "Разбираем grid-template-rows: masonry, поддержку в браузерах и запасные варианты.", site: "Хабр", tags: ["css"] },
  { d: 55, url: "https://github.com/tauri-apps/tauri", title: "tauri-apps/tauri: build smaller, faster and more secure desktop apps with a web frontend", desc: "Tauri is a framework for building tiny, fast binaries for all major desktop platforms.", site: "GitHub", tags: ["rust", "десктоп"], status: "idea" },

  // Design
  { d: 3, url: "https://fonts.google.com/specimen/Inter", title: "Inter - Google Fonts", desc: "Вариативный шрифт, который делали специально для экранов. Кириллица есть.", site: "Google Fonts", tags: ["шрифты"] },
  { d: 16, url: "https://coolors.co/palettes/trending", title: "Trending Color Palettes - Coolors", desc: "Get inspired by thousands of beautiful color schemes and make something cool.", site: "Coolors", tags: ["цвет"] },
  { d: 29, url: "https://dribbble.com/tags/dashboard", title: "Dashboard designs, themes and templates on Dribbble", desc: "Работы с тегом dashboard: воздух в таблицах, тихие графики, один акцентный цвет.", site: "Dribbble", tags: ["референсы"] },
  { d: 33, k: "photo", t: "Референсы для лендинга", pic: "screen", album: 3, topic: "Дизайн", tags: ["референсы", "лендинг"] },

  // Movies and books
  { d: 4, url: "https://www.kinopoisk.ru/film/403/", title: "Бегущий по лезвию (1982) — Кинопоиск", desc: "Отставной детектив ищет в Лос-Анджелесе будущего сбежавших репликантов. Фантастика, триллер.", site: "Кинопоиск", pin: true, tags: ["фантастика", "посмотреть"], status: "todo" },
  { d: 18, url: "https://letterboxd.com/film/perfect-days-2023/", title: "Perfect Days (2023)", desc: "Hirayama cleans public toilets in Tokyo, lives his life in simplicity and daily tranquility.", site: "Letterboxd", tags: ["посмотреть"] },
  { d: 71, url: "https://www.kinopoisk.ru/film/589290/", title: "Бегущий по лезвию 2049 (2017) — Кинопоиск", desc: "Офицер Кей находит тайну, которая может разрушить то, что осталось от общества.", site: "Кинопоиск", tags: ["фантастика"] },
  { d: 10, url: "https://www.livelib.ru/book/1000326807", title: "Мечтают ли андроиды об электроовцах? Филип К. Дик", desc: "Хлам — это бесполезные вещи вроде рекламных писем или пустых спичечных коробков. Когда никого нет рядом, хлам размножается.", site: "LiveLib", tags: ["фантастика", "прочитать"], status: "read_later" },
  { d: 122, url: "https://www.litres.ru/book/mihail-bulgakov/master-i-margarita-9527389/", title: "Мастер и Маргарита, Михаил Булгаков", desc: "Читать онлайн или скачать в fb2 и epub.", site: "Литрес", tags: ["классика"] },

  // Money: sorted by hand, so Kipple can offer the look-alikes below.
  { d: 14, t: "Правило бюджета: 50% на нужное (аренда, продукты), 30% на желания, 20% в накопления. Накопления переводить в день зарплаты, а не в конце месяца.", topic: "Деньги", tags: ["бюджет"] },
  { d: 27, url: "https://journal.tinkoff.ru/guide/podushka/", title: "Как накопить финансовую подушку", desc: "Сколько откладывать, где хранить и когда подушку можно тратить.", site: "Т—Ж", topic: "Деньги", pin: true, tags: ["накопления"], status: "read_later" },
  { d: 80, k: "document", t: "Налоговый вычет, заявление отправлено", file: "вычет-2025.pdf", kb: 388, topic: "Деньги", tags: ["налоги"] },
  { d: 12, t: "Бюджет на март: аренда 65 000, продукты 30 000, накопления 20 000, остальное моё" },
  { d: 31, t: "Налоговый вычет: подать заявление до 1 мая" },
  { d: 45, t: "Финансовая подушка: три месяца аренды на накопительном счёте, 14% годовых" },

  // Six videos from one site: a pile of its own on the cleanup screen. One was saved twice.
  { d: 2.5, url: "https://www.youtube.com/watch?v=aircAruvnKk", title: "But what is a neural network? | Deep learning chapter 1", desc: "3Blue1Brown", site: "YouTube", pic: "screen" },
  { d: 15, url: "https://www.youtube.com/watch?v=arj7oStGLkU", title: "Inside the mind of a master procrastinator | Tim Urban | TED", desc: "TED", site: "YouTube", pic: "city" },
  { d: 15.2, url: "https://youtu.be/arj7oStGLkU?si=Kq2demo", title: "Inside the mind of a master procrastinator | Tim Urban | TED", desc: "TED", site: "YouTube", pic: "city" },
  { d: 22, url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc", title: "Steve Jobs' 2005 Stanford Commencement Address", desc: "Stanford", site: "YouTube", pic: "hills" },
  { d: 41, url: "https://www.youtube.com/watch?v=rfscVS0vtbw", title: "Learn Python - Full Course for Beginners [Tutorial]", desc: "freeCodeCamp.org", site: "YouTube", pic: "screen" },
  { d: 58, url: "https://www.youtube.com/watch?v=PkZNo7MFNFg", title: "Learn JavaScript - Full Course for Beginners", desc: "freeCodeCamp.org", site: "YouTube", pic: "screen" },
  { d: 420, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Me at the zoo", desc: "jawed", site: "YouTube", pic: "hills" },

  // Forwards from two channels: one to throw out in a click, one worth a topic.
  { d: 1.5, t: "Только сегодня: беспроводные наушники со скидкой 40%. Промокод ЗВУК40.", from: DEALS },
  { d: 4.5, t: "Робот-пылесос за 12 990 вместо 21 990. Осталось 300 штук.", from: DEALS },
  { d: 8.5, t: "Три месяца онлайн-кинотеатра по цене одного. До полуночи.", from: DEALS },
  { d: 17, k: "photo", t: "Кроссовки от 3 990. Размеры заканчиваются.", pic: "screen", from: DEALS },
  { d: 26, t: "В выходные бесплатная доставка при заказе от 2 000.", from: DEALS },
  { d: 36, t: "Последний шанс: зимние куртки со скидкой 60%.", from: DEALS },
  { d: 3.5, k: "photo", t: "Пять дашбордов, которые не кричат: что у них общего", pic: "screen", from: DESIGN },
  { d: 10.5, t: "Шкала отступов: почему 4 и 8 px работают до сих пор и где перестают", from: DESIGN },
  { d: 19, url: "https://www.nngroup.com/articles/ten-usability-heuristics/", title: "10 Usability Heuristics for User Interface Design", desc: "Jakob Nielsen's ten general principles for interaction design.", site: "Nielsen Norman Group", from: DESIGN },
  { d: 30, k: "photo", t: "Шпаргалка по сочетанию шрифтов", pic: "paper", from: DESIGN },
  { d: 52, t: "Наборы иконок с мягкой линией: короткий список", from: DESIGN },

  // Photos, videos, files and voice messages saved without a word.
  { d: 0.4, k: "photo", pic: "screen", album: 4 },
  { d: 6.5, k: "photo", pic: "plate" },
  { d: 21, k: "photo", pic: "hills", tall: true },
  { d: 34, k: "photo", pic: "paper" },
  { d: 62, k: "photo", pic: "sea" },
  { d: 90, k: "photo", pic: "city", tall: true },
  { d: 12.5, k: "video", pic: "sea", file: "IMG_4082.mp4", dur: 42, kb: 18400 },
  { d: 49, k: "animation", pic: "hills", file: "кот-прыгает.mp4", dur: 4, kb: 900 },
  { d: 70, k: "video_note", dur: 23, kb: 2100 },
  { d: 5.5, k: "document", file: "скан_0042.pdf", kb: 640 },
  { d: 23, k: "document", file: "покупки.txt", kb: 1 },
  { d: 44, k: "document", file: "расходы-на-квартиру-2026.xlsx", kb: 48 },
  { d: 110, k: "document", file: "шрифты.zip", kb: 5300 },
  { d: 0.8, k: "voice", dur: 12, kb: 30 },
  { d: 28, k: "voice", dur: 107, kb: 260 },
  { d: 75, k: "audio", file: "подкаст-выпуск-112.mp3", dur: 2710, kb: 43000 },

  // Notes to self
  { d: 0.2, t: "Стоматолог в четверг в 16:30, взять старый снимок" },
  { d: 1.2, t: "Собрать в дорогу\n☑ паспорт\n☑ зарядка\n☐ крем от солнца\n☐ переходник для розетки" },
  { d: 9.5, t: "Идея: бот, который раз в неделю присылает три случайные сохранёнки" },
  { d: 32, t: "Позвонить хозяину квартиры насчёт бойлера" },
  { d: 50, t: "Саша советует прочитать «Дизайн привычных вещей»" },
  { d: 66, k: "contact", t: "Марат (сантехник) +7 900 555 01 42" },
  { d: 85, k: "location", t: "38.7139, -9.1394" },
  { d: 17.5, url: "https://ru.wikipedia.org/wiki/Цеттелькастен", title: "Цеттелькастен — Википедия", desc: "Метод ведения заметок: небольшие карточки с отдельными мыслями, которые ссылаются друг на друга.", site: "Википедия" },
  { d: 39, url: "https://vimeo.com/76979871", title: "The New Vimeo Player (You Know, For Videos)", desc: "Vimeo Staff", site: "Vimeo", pic: "hills" },
  { d: 24.5, url: "https://habr.com/ru/articles/784256/?utm_source=newsletter", title: "Раскладка masonry на чистом CSS: что уже работает", desc: "Разбираем grid-template-rows: masonry, поддержку в браузерах и запасные варианты.", site: "Хабр", tags: ["css"] },

  // Passwords and card numbers: kept apart, never offered in bulk, never sent anywhere.
  { d: 19.5, t: "wifi дома пароль: correct-horse-battery" },
  { d: 53, t: "Карта для поездки: 4242 4242 4242 4242, до 08/29" },
  { d: 140, t: "Пин-код: 4821 (шкафчик в зале)" },

  // Junk Kipple spots by itself
  { d: 0.6, k: "sticker", t: "👍" },
  { d: 14.5, t: "тест" },
  { d: 37, t: "ок" },
  { d: 61, k: "sticker", t: "😂" },
  { d: 130, t: "+" },

  // Years-old saves, two of them links to pages that no longer exist.
  { d: 800, t: "Что подарить маме: керамический чайник, перчатки для сада, ту книгу про пчёл" },
  { d: 860, k: "poll", t: "Куда едем летом?\n• Португалия\n• Хорватия\n• Остаёмся дома" },
  { d: 1150, url: "https://plus.google.com/communities/104857329118204385512", title: "Настолки по четвергам - Google+", desc: "Сообщество тех, кто играет в настольные игры по четвергам.", site: "Google+", broken: true },
  { d: 1420, url: "https://vine.co/v/OQwFdemo2Ar", title: "Собака на скейте - Vine", site: "Vine", broken: true },
  { d: 1600, url: "https://news.ycombinator.com/item?id=8863", title: "My YC app: Dropbox - Throw away your USB drive | Hacker News", site: "Hacker News" },
  { d: 1750, t: "Поиск квартиры: спросить про коммуналку, сколько лет бойлеру и кто соседи" },
];
