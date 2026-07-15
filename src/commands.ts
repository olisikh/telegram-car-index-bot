import { messages, type Locale } from "./i18n.js";

export const groupCommands = (locale: Locale) => {
  const descriptions = messages(locale).commandDescriptions;
  return [
    { command: "start", description: descriptions.start },
    { command: "find", description: descriptions.find },
    { command: "list", description: descriptions.list },
    { command: "verbose", description: descriptions.verbose },
    { command: "lang", description: descriptions.lang },
  ] as const;
};

export const chatCommandMenu = (locale: Locale, chatId: number) => ({
  commands: groupCommands(locale),
  options: { scope: { type: "chat" as const, chat_id: chatId } },
});
