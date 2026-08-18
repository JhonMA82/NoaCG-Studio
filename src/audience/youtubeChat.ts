// YOUTUBE LIVE CHAT, polled through the Data API with the OPERATOR'S OWN key.
//
// YouTube has no anonymous chat read: every route to liveChatMessages goes through the Data
// API, and the Data API needs a key. v1 is therefore bring-your-key - the operator pastes an
// API key from their own Google Cloud project, and the key never leaves their browser: it is
// held in memory for the session, sent only to googleapis.com, and never persisted or synced.
//
// THE QUOTA, stated honestly because the operator is spending their own: a default Data API
// project gets 10,000 units per day, `liveChatMessages.list` costs ~5 units per call, and the
// poller asks every 5 seconds - about 3,600 units per hour, so the free quota carries roughly
// two and a half hours of continuous chat per day. Fine for a show, wrong for a channel that
// streams all day - which is one of the reasons the plan doc records server-side ingestion as
// the eventual shape.
//
// The driver resolves the video's activeLiveChatId once, then polls, honouring the interval
// the API itself suggests (floored at 5 s to protect the quota). The FIRST page is discarded:
// it is the chat's recent history, and replaying twenty old messages into a live inbox the
// moment a source connects would read as a flood of arrivals that did not happen.

import type { ChatDriver, ChatDriverHandlers } from './chatIntake';

const API = 'https://www.googleapis.com/youtube/v3';
/** The poll floor. The API often suggests ~2-3 s; every extra poll is the operator's quota. */
const MIN_POLL_MS = 5_000;

/** The operator may paste a video id or any of the watch-page URL shapes. */
export function normalizeYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  const fromUrl =
    raw.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    raw.match(/\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{11}$/.test(raw) ? raw : null;
}

interface MessagesPage {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  offlineAt?: string;
  items?: Array<{
    id?: string;
    snippet?: { type?: string; displayMessage?: string; publishedAt?: string };
    authorDetails?: { channelId?: string; displayName?: string };
  }>;
}

/** One readable line per API refusal - the raw error names are developer words. */
function apiRefusal(status: number, body: unknown): string {
  const parsed = body as { error?: { errors?: Array<{ reason?: string }> } };
  const reason = parsed.error?.errors?.[0]?.reason ?? '';
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') return 'The API key has run out of quota for today.';
  if (reason === 'keyInvalid' || status === 400) return 'That API key was not accepted.';
  if (status === 403) return 'The API key was refused - check that the YouTube Data API v3 is enabled for it.';
  return `YouTube answered ${status}.`;
}

export function youtubeChatDriver(videoInput: string, apiKey: string, handlers: ChatDriverHandlers): ChatDriver {
  const videoId = normalizeYouTubeVideoId(videoInput);
  const key = apiKey.trim();
  let stopped = false;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pageToken: string | null = null;
  /** True until the first messages page has been read (and discarded as history). */
  let firstPage = true;
  let chatId: string | null = null;

  if (!videoId || !key) {
    setTimeout(() => handlers.onStatus('error', !videoId ? 'Not a YouTube video id or URL.' : 'An API key is needed - YouTube has no anonymous chat read.'), 0);
    return { stop: () => undefined };
  }

  const schedule = (ms: number) => {
    if (stopped || paused) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(step, ms);
  };

  const fail = (detail: string) => {
    // A hard refusal ends the polling - retrying a dead key or an ended chat would only spend
    // more of the quota that just ran out. The operator resumes by pausing and unpausing.
    handlers.onStatus('error', detail);
  };

  const step = async () => {
    if (stopped || paused) return;
    try {
      if (!chatId) {
        const answer = await fetch(`${API}/videos?part=liveStreamingDetails&id=${videoId}&key=${encodeURIComponent(key)}`);
        const body = await answer.json().catch(() => ({}));
        if (!answer.ok) return fail(apiRefusal(answer.status, body));
        const details = body.items?.[0]?.liveStreamingDetails;
        chatId = details?.activeLiveChatId ?? null;
        if (!chatId) return fail(body.items?.length ? 'That video has no open live chat - is it live right now?' : 'No such video.');
      }
      const params = new URLSearchParams({ liveChatId: chatId, part: 'snippet,authorDetails', key });
      if (pageToken) params.set('pageToken', pageToken);
      const answer = await fetch(`${API}/liveChat/messages?${params}`);
      const page: MessagesPage = await answer.json().catch(() => ({}));
      if (!answer.ok) return fail(apiRefusal(answer.status, page));

      pageToken = page.nextPageToken ?? pageToken;
      if (page.offlineAt) return fail('The live chat has ended.');
      if (firstPage) {
        // History, not arrivals - see the header. From here on, every page is genuinely new.
        firstPage = false;
        handlers.onStatus('live');
      } else {
        for (const item of page.items ?? []) {
          if (item.snippet?.type !== 'textMessageEvent') continue; // superchats etc. are v2 material
          const text = item.snippet.displayMessage ?? '';
          const authorId = item.authorDetails?.channelId ?? '';
          if (!text || !authorId) continue;
          handlers.onMessage({
            id: item.id ?? null,
            authorId,
            authorName: item.authorDetails?.displayName ?? 'Viewer',
            text,
          });
        }
        handlers.onStatus('live');
      }
      schedule(Math.max(page.pollingIntervalMillis ?? MIN_POLL_MS, MIN_POLL_MS));
    } catch {
      // A network hiccup is transient - say so and try again on the ordinary cadence.
      if (!stopped && !paused) {
        handlers.onStatus('error', 'Could not reach YouTube - retrying.');
        schedule(MIN_POLL_MS * 2);
      }
    }
  };

  handlers.onStatus('connecting');
  void step();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    // Pausing STOPS THE POLLING, because every poll is the operator's quota - unlike the
    // Twitch socket, which idles for free. Resuming polls at once; the page token survives,
    // so messages sent while paused arrive on resume (and the intake's throttle meters them).
    setPaused(next: boolean) {
      paused = next;
      if (next) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!stopped) {
        handlers.onStatus('connecting');
        void step();
      }
    },
  };
}
