export const ORGANIZATIONS_PER_BATCH = 48;

export function directoryPageUrl(page: number): string {
  return page === 1 ? '/' : `/organizations/page/${page}/`;
}
