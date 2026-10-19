import { config, required } from "../config.js";

/**
 * Thin wrapper over the Moodle Web Services REST API.
 *
 * All data calls go through webservice/rest/server.php with a wstoken.
 * File downloads go through the fileurl returned by Moodle, with the token appended.
 */

export interface MoodleError {
  exception?: string;
  errorcode?: string;
  message?: string;
}

export class MoodleApiError extends Error {
  errorcode?: string;
  constructor(message: string, errorcode?: string) {
    super(message);
    this.name = "MoodleApiError";
    this.errorcode = errorcode;
  }
}

/**
 * Flatten a nested params object into Moodle's bracket-array wire format.
 * e.g. { courseids: [1, 2] }  ->  courseids[0]=1&courseids[1]=2
 *      { options: { id: 5 } } ->  options[id]=5
 */
function flattenParams(
  obj: Record<string, unknown>,
  prefix = "",
  out: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const itemKey = `${paramKey}[${i}]`;
        if (item !== null && typeof item === "object") {
          flattenParams(item as Record<string, unknown>, itemKey, out);
        } else {
          out.append(itemKey, String(item));
        }
      });
    } else if (typeof value === "object") {
      flattenParams(value as Record<string, unknown>, paramKey, out);
    } else {
      out.append(paramKey, String(value));
    }
  }
  return out;
}

/**
 * Call a Moodle web-service function and return the parsed JSON result.
 * Throws MoodleApiError if Moodle returns an exception.
 */
export async function callFunction<T = unknown>(
  wsfunction: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = `${config.baseUrl}/webservice/rest/server.php`;
  const body = flattenParams(params);
  body.append("wstoken", await moodleToken());
  body.append("wsfunction", wsfunction);
  body.append("moodlewsrestformat", "json");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new MoodleApiError(`HTTP ${res.status} calling ${wsfunction}`);
  }

  const data = (await res.json()) as T & MoodleError;
  if (data && typeof data === "object" && "exception" in data) {
    const err = data as MoodleError;
    throw new MoodleApiError(
      `${wsfunction}: ${err.message ?? "unknown error"}`,
      err.errorcode
    );
  }
  return data as T;
}

/**
 * Exchange username/password for a web-services token.
 * Used by scripts/get-token.ts, and by moodleToken() when MOODLE_TOKEN is unset.
 */
export async function getToken(
  username: string,
  password: string,
  service = "moodle_mobile_app"
): Promise<string> {
  // Credentials go in the body, not the query string, so they stay out of access logs.
  const res = await fetch(`${config.baseUrl}/login/token.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password, service }).toString(),
  });
  const data = (await res.json()) as { token?: string; error?: string; errorcode?: string };
  if (data.error) {
    throw new MoodleApiError(data.error, data.errorcode);
  }
  if (!data.token) {
    throw new MoodleApiError("No token returned by login/token.php");
  }
  return data.token;
}

let pendingToken: Promise<string> | undefined;

/**
 * MOODLE_TOKEN if set; otherwise exchange ID/PASSWORD (the same UPB credentials
 * buhoSistemas uses) for a token once per process. A failed exchange is not
 * cached, so the next call retries.
 */
export function moodleToken(): Promise<string> {
  const explicit = process.env.MOODLE_TOKEN?.trim();
  if (explicit) return Promise.resolve(explicit);
  pendingToken ??= getToken(required("ID"), required("PASSWORD")).catch((err: unknown) => {
    pendingToken = undefined;
    throw err;
  });
  return pendingToken;
}

/**
 * Append the web-services token to a Moodle fileurl. Refuses URLs outside the
 * Moodle site so a tool argument can't send the token to another host.
 */
export async function authedFileUrl(fileurl: string): Promise<string> {
  const url = new URL(fileurl);
  if (url.origin !== new URL(config.baseUrl).origin) {
    throw new MoodleApiError(`Refusing to send the Moodle token to ${url.origin}`);
  }
  url.searchParams.set("token", await moodleToken());
  return url.toString();
}
