export const LIST_PAGE_SIZE = 10;

export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

export const clampPage = (page: number, total: number): number =>
  Math.min(Math.max(page, 0), pageCount(total) - 1);

export const listCallbackData = (page: number): string => `list:${page}`;
export const findCallbackData = (plate: string): string => `find:${plate}`;

type ListCallback =
  | { readonly kind: "list"; readonly page: number }
  | { readonly kind: "find"; readonly plate: string };

export const parseListCallback = (data: string): ListCallback | undefined => {
  const listPage = /^list:(\d+)$/u.exec(data)?.[1];
  if (listPage) return { kind: "list", page: Number(listPage) };
  const plate = /^find:([A-Z0-9]+)$/u.exec(data)?.[1];
  if (plate) return { kind: "find", plate };
  return undefined;
};
