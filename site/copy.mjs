// Landing page copy, English and Russian. Written with the marketing-agent, brand-voice and
// product-lens skills (.claude/); only claims that are true of the app today. **bold** works.
// {ver} and {size} are filled in at build time from the latest GitHub release.

export const en = {
  lang: "en",
  locale: "en_US",
  path: "/",
  title: "Kipple: Telegram Saved Messages organizer for Windows",
  description: "Turn Telegram Saved Messages into a searchable board of cards with topics, tags and read-later lists. Free, open source, stays on your PC.",
  ogTitle: "Kipple: your Telegram Saved Messages as a board you can search",
  ogDescription: "Links, photos, videos, PDFs and notes from Saved Messages, laid out as cards. Search, topics, tags, export to Markdown. Free Windows app, fully local.",
  ogAlt: "Kipple showing Telegram Saved Messages as a grid of cards with topics and tags",
  nav: { features: "Features", privacy: "Privacy", faq: "FAQ", other: "Русский", otherLang: "ru" },
  slogan: "Tame your kipple",
  hero: {
    title: "Turn your Telegram Saved Messages into a board you can search",
    sub: "Kipple lays out everything you saved (links, photos, videos, PDFs, notes) as cards, with search, topics and tags. It runs on your computer, and your library stays there.",
    download: "Download for Windows",
    meta: ["Windows 10 and 11", "{size}", "Free"],
    demo: "Try the demo in your browser",
    demoMeta: "Sample library, no sign-in",
    shotAlt: "Kipple window: Telegram Saved Messages as a grid of cards with titles, statuses and tags, and topics in the sidebar",
    caption: "The real app, running the browser demo. Kipple is Philip K. Dick's word for junk that multiplies by itself. Saved Messages is full of it.",
  },
  started: "Download started. If Windows warns you, click **More info**, then **Run anyway**.",
  notWindows: "Kipple is a Windows app for now. The demo works in any browser.",
  pains: {
    title: "You saved it. You just can't find it.",
    items: [
      ["You know the link is in there somewhere, under three years of forwards.", "Search across text, links and file names, and filter by type: links, photos, videos, documents, notes."],
      ["Saved Messages is one long feed. Recipes sit next to work docs and screenshots.", "Cards on a board, grouped into topics you set yourself, or that AI suggests if you turn it on."],
      ["“Read later” turns into “never”, and the same link is saved four times.", "Mark cards as read later, idea or todo, see them on the home overview, and clear out duplicates in a couple of clicks."],
    ],
  },
  features: {
    title: "What's inside",
    items: [
      ["Cards for every kind of save", "Link previews, photo albums as a carousel, YouTube and Instagram videos that play in the card, PDF previews, plain notes."],
      ["Search, filters, tags", "Find a card by any word, then narrow it down by type, topic or tag."],
      ["Topics, by hand or with AI", "Sort cards into topics yourself. Optional AI suggests topics, tags and short summaries. It stays off until you allow it."],
      ["Home overview", "What's unsorted, what's starred, what you set aside to read, your todos and the last 30 days, on one screen."],
      ["Duplicates and Tidy up", "Finds the same link, file or text saved twice, and merges near-identical tags and topics. Every merge can be undone."],
      ["Export to Markdown and CSV", "Take your library to Obsidian or a spreadsheet whenever you want."],
    ],
  },
  how: {
    title: "Three steps, a few minutes",
    items: [
      ["Install Kipple", "Download the {size} installer and run it. Windows may warn you first; the questions below show the two clicks."],
      ["Bring in your Saved Messages", "Sign in to Telegram inside the app with a QR code or your phone number, and Kipple loads Saved Messages by itself. Or skip the sign-in and pick a Telegram Desktop export folder."],
      ["Sort, find, export", "Search, set topics and statuses, clear duplicates. New messages are added on the next load, and your edits stay."],
    ],
  },
  privacy: {
    title: "Your library stays on your computer",
    lead: "Saved Messages is private. Kipple keeps it that way.",
    items: [
      "The library is a file on your PC. No Kipple account, no cloud sync, no analytics.",
      "Passwords and login codes go only to Telegram. Kipple never sees them.",
      "AI is off by default. It turns on only after you accept a consent dialog; then message text goes to Claude by Anthropic for tagging. Messages that look like passwords, keys or card numbers are never sent.",
      "Link previews load from the sites your saved links point to. You can turn them off in Settings.",
      "Settings, then Delete all data, removes the library and signs you out of Telegram.",
    ],
    proof: "The code is public, so you can check all of this yourself.",
    proofLink: "Read the source on GitHub",
  },
  trust: {
    title: "Early, open and checkable",
    items: [
      ["Open source", "Every line is on GitHub.", "repo"],
      ["Version {ver}", "Updates install from inside the app.", "releases"],
      ["One developer", "Bugs and ideas go to GitHub Issues.", "issues"],
    ],
  },
  faq: {
    title: "Questions",
    items: [
      ["Windows says “Windows protected your PC”. Is it safe?", "The warning appears because the installer isn't code-signed yet. A signing certificate is planned; a one-person project hasn't bought one yet. To install, click **More info**, then **Run anyway**. If you'd rather check first, the full source is on GitHub, and the installer is built there by GitHub Actions."],
      ["Is there a Mac or Linux version?", "Not yet. Kipple is a Windows 10 and 11 app for now. The demo works in any browser."],
      ["How much does it cost?", "Nothing. Kipple is free and open source, and it works without Telegram Premium."],
      ["Are my messages uploaded anywhere?", "No. The library is stored on your computer, and there is no Kipple account or cloud. The app goes online to talk to Telegram (if you sign in), to load link previews from the linked sites (you can turn this off), to check for updates, and to reach the AI if you turn it on."],
      ["Do I need AI? What does it send?", "You don't need it. Search, topics, tags, statuses and export all work without it. AI is off until you accept a consent dialog. When it's on, it suggests topics, tags and short summaries, and for that the message text is sent to Claude by Anthropic. Messages that look like passwords, keys or card numbers are never sent. You can switch it off any time in Settings."],
      ["Can my Telegram account get banned for this?", "Kipple signs in like any other Telegram app, through Telegram's official API, and only reads your own Saved Messages. We can't speak for Telegram's rules, but Kipple doesn't do the things that usually get accounts flagged, like mass messaging. If you'd rather not sign in at all, import a Telegram Desktop export instead: then Kipple never connects to your account."],
      ["What gets imported?", "Links, photos and albums, videos, documents and text notes from Saved Messages. Importing again adds only new messages and keeps your edits."],
    ],
  },
  closing: {
    title: "Your Saved Messages, sorted by tonight",
    text: "Install Kipple, sign in or pick your export, and see everything you saved as one board.",
    demo: "Or try the demo first",
  },
  footer: {
    note: "Kipple is an independent open-source project, not affiliated with Telegram.",
    links: [["GitHub", "repo"], ["Releases", "releases"], ["Report a bug", "issues"]],
  },
};

export const ru = {
  lang: "ru",
  locale: "ru_RU",
  path: "/ru/",
  title: "Kipple: органайзер «Избранного» Telegram для Windows",
  description: "Kipple превращает «Избранное» Telegram в доску карточек с поиском, темами и тегами. Бесплатно, открытый код, всё хранится на твоём компьютере.",
  ogTitle: "Kipple: «Избранное» Telegram в виде доски с поиском",
  ogDescription: "Ссылки, фото, видео, PDF и заметки из «Избранного» в виде карточек. Поиск, темы, теги, экспорт в Markdown. Бесплатное приложение для Windows, работает локально.",
  ogAlt: "Kipple: «Избранное» Telegram в виде сетки карточек с темами и тегами",
  nav: { features: "Возможности", privacy: "Приватность", faq: "Вопросы", other: "English", otherLang: "en" },
  slogan: "Tame your kipple",
  hero: {
    title: "Твоё «Избранное» в Telegram, наконец разложенное по полочкам",
    sub: "Kipple показывает всё, что ты сохранил (ссылки, фото, видео, PDF, заметки), в виде карточек с поиском, темами и тегами. Работает на твоём компьютере, и библиотека остаётся там же.",
    download: "Скачать для Windows",
    meta: ["Windows 10 и 11", "{size}", "Бесплатно"],
    demo: "Открыть демо в браузере",
    demoMeta: "Пример библиотеки, без входа",
    shotAlt: "Окно Kipple: «Избранное» Telegram в виде сетки карточек с заголовками, статусами и тегами, слева список тем",
    caption: "Настоящее приложение в режиме демо. Kipple у Филипа К. Дика: хлам, который размножается сам. В «Избранном» его хватает.",
  },
  started: "Загрузка началась. Если Windows предупредит, нажми **Подробнее**, затем **Выполнить в любом случае**.",
  notWindows: "Пока Kipple работает только на Windows. Демо открывается в любом браузере.",
  pains: {
    title: "Сохранить легко. Найти потом сложно.",
    items: [
      ["Ссылка точно где-то там, под тремя годами пересланных сообщений.", "Поиск по тексту, ссылкам и названиям файлов, фильтр по типу: ссылки, фото, видео, документы, заметки."],
      ["«Избранное» это одна длинная лента. Рецепты вперемешку с рабочими файлами и скриншотами.", "Карточки на доске, разложенные по темам: своим или тем, что предложит AI, если его включить."],
      ["«Прочитать позже» превращается в «никогда», а одна и та же ссылка сохранена четыре раза.", "Отмечай карточки как «Прочитать позже», «Идея» или «Сделать», смотри их на главной и убирай дубли в пару кликов."],
    ],
  },
  features: {
    title: "Что внутри",
    items: [
      ["Карточки для любых сохранёнок", "Превью ссылок, альбомы фото с прокруткой, видео с YouTube и Instagram прямо в карточке, просмотр PDF, обычные заметки."],
      ["Поиск, фильтры, теги", "Найди карточку по любому слову и сузь выбор по типу, теме или тегу."],
      ["Темы вручную или с AI", "Раскладывай карточки по темам сам. AI по желанию предложит темы, теги и короткие описания. Пока не разрешишь, он выключен."],
      ["Главная с обзором", "Что без темы, что отмечено звёздочкой, что отложено почитать, задачи и сохранённое за 30 дней, на одном экране."],
      ["Дубли и «Навести порядок»", "Находит одну и ту же ссылку, файл или текст, сохранённые дважды, и сливает похожие теги и темы. Любое слияние можно отменить."],
      ["Экспорт в Markdown и CSV", "Забери библиотеку в Obsidian или в таблицу, когда захочешь."],
    ],
  },
  how: {
    title: "Три шага, пара минут",
    items: [
      ["Установи Kipple", "Скачай установщик ({size}) и запусти. Windows может сначала предупредить; что нажать, написано ниже в вопросах."],
      ["Перенеси «Избранное»", "Войди в Telegram прямо в приложении по QR-коду или номеру, и Kipple сам загрузит «Избранное». Или без входа: выбери папку экспорта из Telegram Desktop."],
      ["Разбирай, ищи, выгружай", "Ищи, раскладывай по темам, отмечай статусы, убирай дубли. Новые сообщения добавятся при следующей загрузке, твои правки останутся."],
    ],
  },
  privacy: {
    title: "Библиотека остаётся на твоём компьютере",
    lead: "«Избранное» личное. Kipple не выносит его наружу.",
    items: [
      "Библиотека хранится файлом на твоём компьютере. Ни аккаунта Kipple, ни облака, ни аналитики.",
      "Пароль и коды вводятся только в Telegram, Kipple их не видит.",
      "AI по умолчанию выключен и включается только после того, как ты подтвердишь согласие. Тогда текст сообщений уходит в модель Claude от Anthropic для разметки. Сообщения, похожие на пароли, ключи и номера карт, не отправляются никогда.",
      "Превью ссылок загружаются с сайтов, на которые ведут сохранённые ссылки. Их можно выключить в настройках.",
      "В настройках есть «Удалить все данные»: стирает библиотеку и выходит из Telegram.",
    ],
    proof: "Код открыт, так что всё это можно проверить самому.",
    proofLink: "Смотреть код на GitHub",
  },
  trust: {
    title: "Ранняя версия, всё открыто",
    items: [
      ["Открытый код", "Каждая строчка лежит на GitHub.", "repo"],
      ["Версия {ver}", "Обновления ставятся прямо из приложения.", "releases"],
      ["Один разработчик", "Ошибки и идеи пиши в GitHub Issues.", "issues"],
    ],
  },
  faq: {
    title: "Вопросы",
    items: [
      ["Windows пишет «Система Windows защитила ваш компьютер». Это безопасно?", "Предупреждение появляется, потому что у установщика пока нет цифровой подписи. Сертификат в планах, но проект одного разработчика его ещё не купил. Чтобы установить, нажми **Подробнее**, затем **Выполнить в любом случае**. Если хочешь сначала проверить: весь код открыт на GitHub, и установщик собирается там же, в GitHub Actions."],
      ["Есть версия для Mac или Linux?", "Пока нет, сейчас Kipple работает на Windows 10 и 11. Демо можно открыть в любом браузере."],
      ["Сколько стоит?", "Нисколько. Kipple бесплатный, код открыт. Telegram Premium тоже не нужен."],
      ["Мои сообщения куда-то загружаются?", "Нет. Библиотека хранится на твоём компьютере, аккаунта Kipple и облака нет. В сеть приложение ходит, чтобы связаться с Telegram (если ты вошёл), загрузить превью ссылок с самих сайтов (это можно выключить), проверить обновления и обратиться к AI, если ты его включил."],
      ["AI обязателен? Что он отправляет?", "Не обязателен. Поиск, темы, теги, статусы и экспорт работают и без него. AI выключен, пока ты не подтвердишь согласие. Если включить, он предлагает темы, теги и короткие описания, и для этого текст сообщений уходит в модель Claude от Anthropic. Сообщения, похожие на пароли, ключи и номера карт, не отправляются никогда. Выключить можно в любой момент в настройках."],
      ["Telegram не заблокирует аккаунт?", "Kipple входит в Telegram как обычное приложение-клиент, через официальный API, и читает только твоё «Избранное». Говорить за Telegram мы не можем, но Kipple не делает того, за что обычно ограничивают аккаунты, например массовых рассылок. Если не хочешь входить вовсе, загрузи экспорт из Telegram Desktop: тогда Kipple к аккаунту не подключается."],
      ["Что именно загружается?", "Ссылки, фото и альбомы, видео, документы и текстовые заметки из «Избранного». Повторная загрузка добавит только новые сообщения и сохранит твои правки."],
    ],
  },
  closing: {
    title: "Разбери «Избранное» уже сегодня",
    text: "Установи Kipple, войди в Telegram или выбери экспорт и посмотри на всё сохранённое как на одну доску.",
    demo: "Или сначала открыть демо",
  },
  footer: {
    note: "Kipple: независимый проект с открытым кодом, не связан с Telegram.",
    links: [["GitHub", "repo"], ["Версии", "releases"], ["Сообщить об ошибке", "issues"]],
  },
};
