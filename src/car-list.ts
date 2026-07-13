export const LIST_PAGE_SIZE = 10;

export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

export const clampPage = (page: number, total: number): number =>
  Math.min(Math.max(page, 0), pageCount(total) - 1);

export const listCallbackData = (page: number): string => `list:${page}`;
export const findCallbackData = (plate: string): string => `find:${plate}`;
export const searchCallbackData = (query: string, page: number): string => `search:${query}:${page}`;

type ListCallback =
  | { readonly kind: "list"; readonly page: number }
  | { readonly kind: "find"; readonly plate: string }
  | { readonly kind: "search"; readonly query: string; readonly page: number };

export const parseListCallback = (data: string): ListCallback | undefined => {
  const listPage = /^list:(\d+)$/u.exec(data)?.[1];
  if (listPage) return { kind: "list", page: Number(listPage) };
  const plate = /^find:([A-Z0-9]+)$/u.exec(data)?.[1];
  if (plate) return { kind: "find", plate };
  const search = /^search:([A-Z0-9]{3,10}):(\d+)$/u.exec(data);
  if (search) return { kind: "search", query: search[1], page: Number(search[2]) };
  return undefined;
};
