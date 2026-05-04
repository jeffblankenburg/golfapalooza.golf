import type { HandlerInput, RequestHandler, ErrorHandler } from "ask-sdk-core";
import type { interfaces } from "ask-sdk-model";
import { createAdminClient } from "@/lib/supabase/admin";

type Song = {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  duration_seconds: number | null;
};

type PlaybackToken = {
  songId: string;
  queue: string[];
  index: number;
  shuffle: boolean;
};

const encodeToken = (t: PlaybackToken) =>
  Buffer.from(JSON.stringify(t)).toString("base64url");

const decodeToken = (s: string | undefined): PlaybackToken | null => {
  if (!s) return null;
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString());
  } catch {
    return null;
  }
};

async function loadCatalog(): Promise<Song[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("songs")
    .select("id, title, mp3_url, art_url, duration_seconds")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function recordPlay(songId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("song_plays")
    .insert({ song_id: songId, source: "alexa", user_id: null });
}

function findSong(query: string, songs: Song[]): Song | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const exact = songs.find((s) => s.title.toLowerCase() === q);
  if (exact) return exact;
  const contains = songs.find((s) => {
    const t = s.title.toLowerCase();
    return t.includes(q) || q.includes(t);
  });
  return contains ?? null;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPlay(
  song: Song,
  token: PlaybackToken,
  opts: { offsetMs?: number; enqueueAfter?: string } = {}
): interfaces.audioplayer.PlayDirective {
  const { offsetMs = 0, enqueueAfter } = opts;
  const stream: interfaces.audioplayer.Stream = {
    token: encodeToken(token),
    url: song.mp3_url,
    offsetInMilliseconds: offsetMs,
  };
  if (enqueueAfter) stream.expectedPreviousToken = enqueueAfter;
  return {
    type: "AudioPlayer.Play",
    playBehavior: enqueueAfter ? "ENQUEUE" : "REPLACE_ALL",
    audioItem: {
      stream,
      metadata: {
        title: song.title,
        subtitle: "Golfapalooza",
        ...(song.art_url
          ? { art: { sources: [{ url: song.art_url }] } }
          : {}),
      },
    },
  };
}

// ---------- intent handlers ----------

const LaunchRequestHandler: RequestHandler = {
  canHandle(input) {
    return input.requestEnvelope.request.type === "LaunchRequest";
  },
  async handle(input) {
    const songs = await loadCatalog();
    if (!songs.length) {
      return input.responseBuilder
        .speak("There's no Golfapalooza music available right now.")
        .withShouldEndSession(true)
        .getResponse();
    }
    const queue = songs.map((s) => s.id);
    const first = songs[0];
    const token: PlaybackToken = {
      songId: first.id,
      queue,
      index: 0,
      shuffle: false,
    };
    return input.responseBuilder
      .speak(`Playing ${first.title}.`)
      .addDirective(buildPlay(first, token))
      .getResponse();
  },
};

const PlayMusicIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "PlayMusicIntent";
  },
  async handle(input) {
    return LaunchRequestHandler.handle(input);
  },
};

const ShuffleIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return (
      r.type === "IntentRequest" &&
      (r.intent.name === "ShuffleIntent" ||
        r.intent.name === "AMAZON.ShuffleOnIntent")
    );
  },
  async handle(input) {
    const songs = await loadCatalog();
    if (!songs.length) {
      return input.responseBuilder
        .speak("No music available.")
        .withShouldEndSession(true)
        .getResponse();
    }
    const shuffled = shuffle(songs);
    const queue = shuffled.map((s) => s.id);
    const first = shuffled[0];
    const token: PlaybackToken = {
      songId: first.id,
      queue,
      index: 0,
      shuffle: true,
    };
    return input.responseBuilder
      .speak(`Shuffling. Playing ${first.title}.`)
      .addDirective(buildPlay(first, token))
      .getResponse();
  },
};

const PlaySongIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "PlaySongIntent";
  },
  async handle(input) {
    const r = input.requestEnvelope.request as {
      type: "IntentRequest";
      intent: { slots?: Record<string, { value?: string }> };
    };
    const query = r.intent.slots?.song?.value;
    if (!query) {
      return input.responseBuilder
        .speak("Which song would you like to hear?")
        .reprompt("What song?")
        .getResponse();
    }
    const songs = await loadCatalog();
    const match = findSong(query, songs);
    if (!match) {
      return input.responseBuilder
        .speak(`I couldn't find a song called ${query}.`)
        .getResponse();
    }
    // Queue: start at match, then continue with the rest in catalog order.
    const startIdx = songs.findIndex((s) => s.id === match.id);
    const queue = [
      ...songs.slice(startIdx).map((s) => s.id),
      ...songs.slice(0, startIdx).map((s) => s.id),
    ];
    const token: PlaybackToken = {
      songId: match.id,
      queue,
      index: 0,
      shuffle: false,
    };
    return input.responseBuilder
      .speak(`Playing ${match.title}.`)
      .addDirective(buildPlay(match, token))
      .getResponse();
  },
};

const PauseIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return (
      r.type === "IntentRequest" &&
      (r.intent.name === "AMAZON.PauseIntent" ||
        r.intent.name === "AMAZON.StopIntent" ||
        r.intent.name === "AMAZON.CancelIntent")
    );
  },
  handle(input) {
    return input.responseBuilder
      .addDirective({ type: "AudioPlayer.Stop" })
      .getResponse();
  },
};

const ResumeIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "AMAZON.ResumeIntent";
  },
  async handle(input) {
    const ctx = input.requestEnvelope.context.AudioPlayer;
    const decoded = decodeToken(ctx?.token);
    const offsetMs = ctx?.offsetInMilliseconds ?? 0;
    const songs = await loadCatalog();
    if (!decoded) {
      // No prior token — fall back to launch behavior.
      return LaunchRequestHandler.handle(input);
    }
    const song = songs.find((s) => s.id === decoded.songId);
    if (!song) {
      return input.responseBuilder
        .speak("That song is no longer available.")
        .getResponse();
    }
    return input.responseBuilder
      .addDirective(buildPlay(song, decoded, { offsetMs }))
      .getResponse();
  },
};

async function step(input: HandlerInput, delta: 1 | -1) {
  const ctx = input.requestEnvelope.context.AudioPlayer;
  const decoded = decodeToken(ctx?.token);
  if (!decoded) {
    return input.responseBuilder.speak("Nothing is playing.").getResponse();
  }
  const newIndex = decoded.index + delta;
  if (newIndex < 0 || newIndex >= decoded.queue.length) {
    return input.responseBuilder
      .speak(delta > 0 ? "End of the playlist." : "Already at the start.")
      .getResponse();
  }
  const songs = await loadCatalog();
  const next = songs.find((s) => s.id === decoded.queue[newIndex]);
  if (!next) {
    return input.responseBuilder.speak("Song not found.").getResponse();
  }
  const token: PlaybackToken = {
    ...decoded,
    songId: next.id,
    index: newIndex,
  };
  return input.responseBuilder.addDirective(buildPlay(next, token)).getResponse();
}

const NextIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "AMAZON.NextIntent";
  },
  handle(input) {
    return step(input, 1);
  },
};

const PreviousIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "AMAZON.PreviousIntent";
  },
  handle(input) {
    return step(input, -1);
  },
};

const HelpIntentHandler: RequestHandler = {
  canHandle(input) {
    const r = input.requestEnvelope.request;
    return r.type === "IntentRequest" && r.intent.name === "AMAZON.HelpIntent";
  },
  handle(input) {
    return input.responseBuilder
      .speak(
        "You can say play music, shuffle, or play followed by a song name. What would you like?"
      )
      .reprompt("Try saying shuffle.")
      .getResponse();
  },
};

const SessionEndedRequestHandler: RequestHandler = {
  canHandle(input) {
    return input.requestEnvelope.request.type === "SessionEndedRequest";
  },
  handle(input) {
    return input.responseBuilder.getResponse();
  },
};

// ---------- AudioPlayer event handlers (no session/voice response) ----------

const PlaybackNearlyFinishedHandler: RequestHandler = {
  canHandle(input) {
    return (
      input.requestEnvelope.request.type === "AudioPlayer.PlaybackNearlyFinished"
    );
  },
  async handle(input) {
    const r = input.requestEnvelope.request as {
      type: "AudioPlayer.PlaybackNearlyFinished";
      token: string;
    };
    const decoded = decodeToken(r.token);
    if (!decoded) return input.responseBuilder.getResponse();
    const nextIndex = decoded.index + 1;
    if (nextIndex >= decoded.queue.length) {
      return input.responseBuilder.getResponse();
    }
    const songs = await loadCatalog();
    const next = songs.find((s) => s.id === decoded.queue[nextIndex]);
    if (!next) return input.responseBuilder.getResponse();
    const token: PlaybackToken = {
      ...decoded,
      songId: next.id,
      index: nextIndex,
    };
    return input.responseBuilder
      .addDirective(buildPlay(next, token, { enqueueAfter: r.token }))
      .getResponse();
  },
};

const PlaybackFinishedHandler: RequestHandler = {
  canHandle(input) {
    return input.requestEnvelope.request.type === "AudioPlayer.PlaybackFinished";
  },
  async handle(input) {
    const r = input.requestEnvelope.request as {
      type: "AudioPlayer.PlaybackFinished";
      token: string;
    };
    const decoded = decodeToken(r.token);
    if (decoded) await recordPlay(decoded.songId);
    return input.responseBuilder.getResponse();
  },
};

const PlaybackPassthroughHandler: RequestHandler = {
  canHandle(input) {
    const t = input.requestEnvelope.request.type;
    return (
      t === "AudioPlayer.PlaybackStarted" ||
      t === "AudioPlayer.PlaybackStopped" ||
      t === "AudioPlayer.PlaybackFailed"
    );
  },
  handle(input) {
    if (input.requestEnvelope.request.type === "AudioPlayer.PlaybackFailed") {
      console.error(
        "[alexa] PlaybackFailed",
        JSON.stringify(input.requestEnvelope.request)
      );
    }
    return input.responseBuilder.getResponse();
  },
};

const GenericErrorHandler: ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(input, error) {
    console.error("[alexa] handler error", error);
    return input.responseBuilder
      .speak("Something went wrong. Please try again.")
      .getResponse();
  },
};

export const requestHandlers: RequestHandler[] = [
  LaunchRequestHandler,
  PlayMusicIntentHandler,
  ShuffleIntentHandler,
  PlaySongIntentHandler,
  PauseIntentHandler,
  ResumeIntentHandler,
  NextIntentHandler,
  PreviousIntentHandler,
  HelpIntentHandler,
  SessionEndedRequestHandler,
  PlaybackNearlyFinishedHandler,
  PlaybackFinishedHandler,
  PlaybackPassthroughHandler,
];

export const errorHandlers: ErrorHandler[] = [GenericErrorHandler];
