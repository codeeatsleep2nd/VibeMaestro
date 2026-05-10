/**
 * Detects the visitor's OS, queries the GitHub Releases API for the latest
 * VibeMaestro release, and routes the primary CTA + per-platform links to
 * the matching artifact.
 *
 * Falls back gracefully:
 *   - No releases yet → CTA reads "Coming soon" + links to the GitHub repo.
 *   - GitHub API rate-limited / offline → same fallback.
 */

type Platform = "darwin-arm64" | "darwin-x64" | "win32" | "linux" | "unknown";

const REPO_OWNER = "codeeatsleep2nd";
const REPO_NAME = "VibeMaestro";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) {
    // navigator.userAgentData is the modern API for arch hints, but it's not
    // present on Safari. The platform string and userAgent contain "Mac" for
    // both Intel and Apple Silicon. We default to the universal arm64 build.
    return "darwin-arm64";
  }
  if (/Windows/i.test(ua)) return "win32";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

type GitHubAsset = {
  name: string;
  browser_download_url: string;
};
type GitHubRelease = {
  tag_name: string;
  assets: GitHubAsset[];
  html_url: string;
};

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as GitHubRelease;
  } catch {
    return null;
  }
}

function pickAsset(assets: GitHubAsset[], pattern: RegExp): GitHubAsset | undefined {
  return assets.find((a) => pattern.test(a.name));
}

const REPO_FALLBACK = `https://github.com/${REPO_OWNER}/${REPO_NAME}#download`;

(async () => {
  const cta = document.getElementById("download-cta") as HTMLButtonElement | null;
  const hint = document.getElementById("platform-hint") as HTMLElement | null;
  const dlMac = document.getElementById("dl-macos") as HTMLAnchorElement | null;
  const dlWin = document.getElementById("dl-windows") as HTMLAnchorElement | null;
  const dlLinux = document.getElementById("dl-linux") as HTMLAnchorElement | null;
  const versionEl = document.getElementById("version");

  const platform = detectPlatform();
  if (cta) {
    cta.textContent =
      platform === "darwin-arm64"
        ? "Download for macOS"
        : platform === "win32"
          ? "Download for Windows"
          : platform === "linux"
            ? "Download for Linux"
            : "Download VibeMaestro";
  }

  const release = await fetchLatestRelease();

  if (!release) {
    if (cta) cta.textContent = "Coming soon — build from source";
    if (hint) hint.textContent = "(no release yet)";
    if (cta) cta.addEventListener("click", () => window.open(REPO_FALLBACK, "_blank"));
    if (dlMac) dlMac.href = REPO_FALLBACK;
    if (dlWin) dlWin.href = REPO_FALLBACK;
    if (dlLinux) dlLinux.href = REPO_FALLBACK;
    return;
  }

  if (versionEl) versionEl.textContent = release.tag_name.replace(/^v/, "");

  const dmg = pickAsset(release.assets, /\.dmg$/i);
  const exe = pickAsset(release.assets, /\.exe$/i);
  const appImage = pickAsset(release.assets, /\.AppImage$/i);
  const deb = pickAsset(release.assets, /\.deb$/i);

  if (dlMac) dlMac.href = dmg?.browser_download_url ?? release.html_url;
  if (dlWin) dlWin.href = exe?.browser_download_url ?? release.html_url;
  if (dlLinux) dlLinux.href = appImage?.browser_download_url ?? deb?.browser_download_url ?? release.html_url;

  const primaryHref =
    platform === "win32"
      ? exe?.browser_download_url
      : platform === "linux"
        ? appImage?.browser_download_url ?? deb?.browser_download_url
        : dmg?.browser_download_url;

  if (cta) {
    cta.addEventListener("click", () => {
      window.location.href = primaryHref ?? release.html_url;
    });
  }
})();
