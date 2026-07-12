export const MESSAGE_PREVIEW_MAX_LENGTH = 70;

const CAR_COMMAND_WITH_PLATE = /^\/car(?:@\w+)?\s+\S+\s*/iu;

const truncate = (value: string): string => {
  const characters = [...value];
  return characters.length <= MESSAGE_PREVIEW_MAX_LENGTH
    ? value
    : `${characters.slice(0, MESSAGE_PREVIEW_MAX_LENGTH - 1).join("")}…`;
};

export const carMessagePreview = (text: string, hasMedia: boolean): string => {
  const note = text.replace(CAR_COMMAND_WITH_PLATE, "").replace(/\s+/gu, " ").trim();
  if (note) return truncate(note);
  return hasMedia ? "Мультимедіа" : "Без опису";
};
