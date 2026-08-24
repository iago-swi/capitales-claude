import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { AnswerRecord, RunInput } from '@capitales/core';
import { countCountries, insertRun, listCountries, topRuns } from './db.js';

export const PORT = 8787;
export const HOST = '127.0.0.1';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 40;
/** Refuse absurd payloads rather than buffering them. */
const MAX_BODY_BYTES = 256 * 1024;

class BadRequest extends Error {}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BadRequest('body too large');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequest('body is not valid JSON');
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates an untrusted request body into a RunInput.
 *
 * This is the trust boundary: everything past this point is typed, and those
 * types are only honest because this function checked them.
 */
function parseRun(body: unknown): RunInput {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequest('expected a JSON object');
  }
  const b = body as Record<string, unknown>;

  const playerName = b['playerName'];
  if (typeof playerName !== 'string' || playerName.length === 0) {
    throw new BadRequest('playerName must be a non-empty string');
  }
  for (const key of ['score', 'correctCount', 'bestStreak', 'questionCount']) {
    if (!isFiniteNumber(b[key])) throw new BadRequest(`${key} must be a number`);
  }
  const startedAt = b['startedAt'];
  if (typeof startedAt !== 'string') {
    throw new BadRequest('startedAt must be an ISO 8601 string');
  }
  const rawAnswers = b['answers'];
  if (!Array.isArray(rawAnswers)) {
    throw new BadRequest('answers must be an array');
  }

  const answers: AnswerRecord[] = rawAnswers.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new BadRequest(`answer ${i} must be an object`);
    }
    const a = raw as Record<string, unknown>;
    if (typeof a['code'] !== 'string') {
      throw new BadRequest(`answer ${i}: code must be a string`);
    }
    if (a['chosen'] !== null && typeof a['chosen'] !== 'string') {
      throw new BadRequest(`answer ${i}: chosen must be a string or null`);
    }
    if (typeof a['correct'] !== 'boolean') {
      throw new BadRequest(`answer ${i}: correct must be a boolean`);
    }
    if (!isFiniteNumber(a['ms'])) {
      throw new BadRequest(`answer ${i}: ms must be a number`);
    }
    return {
      code: a['code'],
      chosen: a['chosen'] as string | null,
      correct: a['correct'],
      ms: a['ms'],
    };
  });

  return {
    playerName: playerName.slice(0, MAX_NAME_LENGTH),
    score: b['score'] as number,
    correctCount: b['correctCount'] as number,
    bestStreak: b['bestStreak'] as number,
    questionCount: b['questionCount'] as number,
    startedAt,
    answers,
  };
}

/** Clamps ?limit= into something sane. Nonsense falls back to the default. */
function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Builds the server. Not listening yet, so tests can bind an ephemeral port.
 *
 * Note what is absent: there is no PUT, PATCH or DELETE anywhere. That absence
 * IS the append-only guarantee from spec section 5.4, which is why the tests
 * assert it explicitly.
 */
export function createServer(db: DatabaseSync): Server {
  return createHttpServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const route = `${req.method ?? 'GET'} ${url.pathname}`;

    void (async () => {
      try {
        switch (route) {
          case 'GET /api/health':
            return send(res, 200, { ok: true, countries: countCountries(db) });

          case 'GET /api/countries':
            return send(res, 200, listCountries(db));

          case 'GET /api/leaderboard':
            return send(
              res,
              200,
              topRuns(db, parseLimit(url.searchParams.get('limit'))),
            );

          case 'POST /api/runs': {
            const run = parseRun(await readJson(req));
            return send(res, 201, { id: insertRun(db, run) });
          }

          default:
            return send(res, 404, { error: `no route for ${route}` });
        }
      } catch (error) {
        if (error instanceof BadRequest) {
          return send(res, 400, { error: error.message });
        }
        // Log the route, return JSON. Never leak a stack trace as HTML.
        console.error(`500 on ${route}:`, error);
        return send(res, 500, { error: 'internal server error' });
      }
    })();
  });
}
