import { config, required } from "../config.js";

/**
 * Session client for UPBnet (sistemas.upb.edu), a server-rendered PHP site.
 *
 * Login is a plain form POST that sets an `upb_session` cookie. The site
 * answers unauthenticated requests and failed logins alike with a 302 to
 * /user/login, so landing there is how both cases are detected.
 */

// nginx returns 403 to clients that don't look like a browser.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_REDIRECTS = 5;

export class UpbnetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpbnetError";
  }
}

const cookies = new Map<string, string>();
let session: Promise<void> | undefined;

function storeCookies(res: Response): void {
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function isLoginPage(url: URL): boolean {
  return url.pathname.replace(/\/+$/, "") === "/user/login";
}

interface Sent {
  res: Response;
  url: URL;
}

/** One request with manual redirects, so cookies set on every hop are kept. */
async function send(path: string, form?: Record<string, string>): Promise<Sent> {
  let url = new URL(path, config.baseUrl);
  let method = form ? "POST" : "GET";
  let body = form ? new URLSearchParams(form).toString() : undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";

    const res = await fetch(url, { method, headers, body, redirect: "manual" });
    storeCookies(res);

    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return { res, url };

    await res.body?.cancel();
    url = new URL(location, url);
    if (url.origin !== new URL(config.baseUrl).origin) {
      throw new UpbnetError(`UPBnet redirected off-site to ${url.origin}`);
    }
    method = "GET";
    body = undefined;
  }
  throw new UpbnetError(`Too many redirects requesting ${path}`);
}

async function login(): Promise<void> {
  cookies.clear();
  const { res, url } = await send("/user/login", {
    "user[username]": required("ID"),
    "user[password]": required("PASSWORD"),
  });
  await res.body?.cancel();
  if (isLoginPage(url)) {
    throw new UpbnetError("UPBnet login failed: check ID and PASSWORD in .env");
  }
}

/** Log in once per process; a failed attempt is not cached so the next call retries. */
function ensureSession(): Promise<void> {
  session ??= login().catch((err: unknown) => {
    session = undefined;
    throw err;
  });
  return session;
}

/**
 * Authenticated request. If the session has expired (we land on the login
 * page), log in again and retry once.
 */
export async function request(path: string, form?: Record<string, string>): Promise<Response> {
  const used = ensureSession();
  await used;
  let sent = await send(path, form);
  if (isLoginPage(sent.url)) {
    await sent.res.body?.cancel();
    // Only drop the session we used: a concurrent caller may already have re-logged in.
    if (session === used) session = undefined;
    await ensureSession();
    sent = await send(path, form);
    if (isLoginPage(sent.url)) {
      await sent.res.body?.cancel();
      throw new UpbnetError(`UPBnet rejected the session for ${path}`);
    }
  }
  if (!sent.res.ok) {
    await sent.res.body?.cancel();
    throw new UpbnetError(`HTTP ${sent.res.status} requesting ${path}`);
  }
  return sent.res;
}

export async function fetchHtml(path: string, form?: Record<string, string>): Promise<string> {
  return (await request(path, form)).text();
}
