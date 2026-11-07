// "What's new": short, user-facing notes per release, newest first. The landing page (khainpain/kipple-site)
// reads this file from main when it is built.
// Add an entry before a release goes out (Actions → release): its "en" lines also become
// the GitHub release notes. Keep each item to one line, about what people can do now,
// not how it was built.
export const changelog = [
  {
    ver: "next",
    en: ["Open the original channel post in Telegram from a forwarded card"],
    ru: ["Пересланную карточку можно открыть в исходном посте канала в Telegram"],
  },
  {
    ver: "0.1.17",
    date: "2026-11-07",
    en: ["Link cards show the page's preview picture"],
    ru: ["Карточки ссылок показывают картинку превью страницы"],
  },
  {
    ver: "0.1.16",
    date: "2026-11-07",
    en: [
      "Saved videos play right in the card",
      "Opened card: content on the left, details on the right",
      "Anonymous usage stats, easy to turn off in Settings",
      "Fixed the language picker in Settings",
    ],
    ru: [
      "Сохранённые видео играют прямо в карточке",
      "Открытая карточка: содержимое слева, свойства справа",
      "Анонимная статистика использования, отключается в настройках",
      "Исправлен выбор языка в настройках",
    ],
  },
  {
    ver: "0.1.15",
    date: "2026-11-06",
    en: [
      "Photo albums as a carousel, full-screen viewer",
      "Compact cards: a short message becomes the title",
      "Site icons on cards: YouTube, Instagram, Telegram and more",
      "Create, rename and delete topics by hand",
      "View menu: layout, card fields, cover left or right",
      "New Kipple installer and smoother animations",
    ],
    ru: [
      "Альбомы фото каруселью и просмотр на весь экран",
      "Компактные карточки: короткое сообщение становится заголовком",
      "Иконки сайтов на карточках: YouTube, Instagram, Telegram и другие",
      "Свои темы: создать, переименовать, удалить",
      "Меню «Вид»: раскладка, поля карточек, обложка слева или справа",
      "Новый установщик Kipple и плавные анимации",
    ],
  },
  {
    ver: "0.1.14",
    date: "2026-11-06",
    en: ["Overview home: unsorted, important, read later at a glance", "Find duplicates and tidy similar tags", "AI only after you allow it; no-AI by default"],
    ru: ["Главная с обзором: без темы, важное, прочитать позже", "Поиск дублей и наведение порядка в тегах", "AI только с твоего согласия, по умолчанию выключен"],
  },
  {
    ver: "0.1.13",
    date: "2026-11-06",
    en: ["Saved Messages load straight from Telegram after sign-in", "Reference list in the sidebar"],
    ru: ["«Избранное» загружается прямо из Telegram после входа", "Список «Справка» в боковой панели"],
  },
  {
    ver: "0.1.12",
    date: "2026-11-06",
    en: ["Sign in to Telegram with a QR code", "The app is now called Kipple", "Updates install quietly in the background"],
    ru: ["Вход в Telegram по QR-коду", "Приложение теперь называется Kipple", "Обновления ставятся тихо, в фоне"],
  },
];
