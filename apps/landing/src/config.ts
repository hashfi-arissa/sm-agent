// Where the desktop app is published (electron-builder `publish` in apps/desktop).
// TODO(release): replace OWNER/REPO with the real GitHub repository.
export const GITHUB_REPO = "OWNER/REPO";

export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
/** Always points at the newest release's page (installer is attached there). */
export const DOWNLOAD_URL = `${RELEASES_URL}/latest`;
export const ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`;
