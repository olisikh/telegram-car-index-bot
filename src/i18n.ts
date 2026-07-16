export const SUPPORTED_LOCALES = ["en", "uk"] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: Locale = "en";

export interface CommandDescriptions {
  readonly start: string;
  readonly find: string;
  readonly list: string;
  readonly verbose: string;
  readonly collect: string;
  readonly lang: string;
}

export interface Messages {
  readonly start: string;
  readonly verboseUsage: string;
  readonly verboseEnabled: string;
  readonly verboseDisabled: string;
  readonly collectUsage: string;
  readonly collectEnabled: string;
  readonly collectDisabled: string;
  readonly languageUsage: string;
  readonly languageChanged: string;
  readonly findUsage: string;
  readonly noIndexedCars: string;
  readonly photo: string;
  readonly video: string;
  readonly photoAndVideo: string;
  readonly plate: string;
  readonly plateNotRecognized: string;
  readonly analysisTimedOut: string;
  readonly analysisFailed: string;
  readonly link: string;
  readonly commandDescriptions: CommandDescriptions;
  readonly nothingFound: (plate: string) => string;
  readonly findResults: (count: number, plate: string, links: string) => string;
  readonly findChoices: (count: number, query: string) => string;
  readonly carList: (count: number) => string;
  readonly seconds: (milliseconds: number) => string;
  readonly milliseconds: (milliseconds: number) => string;
}

const englishCount = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

const ukrainianMessageCount = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "повідомлення";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "повідомлення";
  return "повідомлень";
};

const decimal = (locale: Locale, value: number): string => new Intl.NumberFormat(
  locale === "uk" ? "uk-UA" : "en-US",
  { minimumFractionDigits: 1, maximumFractionDigits: 1 },
).format(value);

const catalog = {
  en: {
    start: "Ready. Send a car photo and the bot will try to recognize its plate.\nSearch: /find AA1234BB · List: /list\nRecognition status: /verbose on or /verbose off\nPlate-crop collection is on by default for local training; opt out: /collect off\nLanguage: /lang en or /lang uk",
    verboseUsage: "Usage: /verbose on or /verbose off",
    verboseEnabled: "🔔 Detailed recognition status is enabled for this chat.",
    verboseDisabled: "🔕 Detailed recognition status is disabled for this chat.",
    collectUsage: "Usage: /collect on or /collect off",
    collectEnabled: "📦 Plate-crop collection is enabled for this chat.",
    collectDisabled: "📦 Plate-crop collection is disabled for this chat. New photos will not be saved for training.",
    languageUsage: "Usage: /lang en or /lang uk",
    languageChanged: "Language changed to English.",
    findUsage: "Plate search: enter 3 to 10 characters.",
    noIndexedCars: "No cars have been indexed yet.",
    photo: "Photo",
    video: "Video",
    photoAndVideo: "Photo and Video",
    plate: "Plate",
    plateNotRecognized: "plate not recognized.",
    analysisTimedOut: "analysis timed out.",
    analysisFailed: "analysis failed.",
    link: "link",
    commandDescriptions: {
      start: "Show instructions",
      find: "Find photos by plate",
      list: "List indexed cars",
      verbose: "Photo recognition status",
      collect: "Save plate crops for local training",
      lang: "Set language: en or uk",
    },
    nothingFound: (plate) => `Nothing found for ${plate}.`,
    findResults: (count, plate, links) => `Found ${count} ${englishCount(count, "message")} for ${plate}:\n${links}`,
    findChoices: (count, query) => `Found ${count} ${englishCount(count, "car")} for ${query}. Select a plate:`,
    carList: (count) => `Cars: ${count}. Newest first:`,
    seconds: (milliseconds) => `${decimal("en", milliseconds / 1_000)} s`,
    milliseconds: (milliseconds) => `${Math.round(milliseconds)} ms`,
  },
  uk: {
    start: "Готово. Надішліть фото авто — бот спробує розпізнати ДНЗ.\nПошук: /find AA1234BB · Список: /list\nСтатус розпізнавання: /verbose on або /verbose off\nЗбір вирізок ДНЗ для локального навчання увімкнено за замовчуванням; вимкнути: /collect off\nМова: /lang en або /lang uk",
    verboseUsage: "Формат: /verbose on або /verbose off",
    verboseEnabled: "🔔 Детальний статус розпізнавання увімкнено для цього чату.",
    verboseDisabled: "🔕 Детальний статус розпізнавання вимкнено для цього чату.",
    collectUsage: "Формат: /collect on або /collect off",
    collectEnabled: "📦 Збір вирізок ДНЗ увімкнено для цього чату.",
    collectDisabled: "📦 Збір вирізок ДНЗ вимкнено для цього чату. Нові фото не зберігатимуться для навчання.",
    languageUsage: "Формат: /lang en або /lang uk",
    languageChanged: "Мову змінено на українську.",
    findUsage: "Пошук за номером: введіть від 3 до 10 символів.",
    noIndexedCars: "Ще немає проіндексованих авто.",
    photo: "Фото",
    video: "Відео",
    photoAndVideo: "Фото і Відео",
    plate: "ДНЗ",
    plateNotRecognized: "ДНЗ не розпізнано.",
    analysisTimedOut: "час аналізу вичерпано.",
    analysisFailed: "помилка аналізу.",
    link: "лінк",
    commandDescriptions: {
      start: "Показати інструкцію",
      find: "Знайти фото за ДНЗ",
      list: "Список авто",
      verbose: "Статус розпізнавання фото",
      collect: "Зберігати вирізки ДНЗ для локального навчання",
      lang: "Обрати мову: en або uk",
    },
    nothingFound: (plate) => `Для ${plate} нічого не знайдено.`,
    findResults: (count, plate, links) => `Знайдено ${count} ${ukrainianMessageCount(count)} для ${plate}:\n${links}`,
    findChoices: (count, query) => `Знайдено ${count} авто для ${query}. Оберіть ДНЗ:`,
    carList: (count) => `Авто: ${count}. Від найновіших до найстаріших:`,
    seconds: (milliseconds) => `${decimal("uk", milliseconds / 1_000)} с`,
    milliseconds: (milliseconds) => `${Math.round(milliseconds)} мс`,
  },
} satisfies Record<Locale, Messages>;

export const parseLocale = (value: string): Locale | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ua") return "uk";
  return SUPPORTED_LOCALES.find((locale) => locale === normalized);
};

export const messages = (locale: Locale): Messages => catalog[locale];
