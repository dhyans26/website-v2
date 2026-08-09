/**
 * Build-time GitHub data, shared by the projects page and the home-page
 * activity section.
 *
 * Everything here runs during `astro build` only — nothing reaches the client.
 * All fetches are cached on disk and degrade to `null` (or to stale cache) so a
 * rate-limited or offline build still produces a working site.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const CACHE_DIR = '.cache';

/** Unauthenticated GitHub allows 60 req/hr per IP; a token raises it to 5000. */
const TOKEN = import.meta.env.GITHUB_TOKEN;

type CacheEntry<T> = { fetchedAt: number; data: T };

/**
 * Read-through disk cache. On a fetch failure we deliberately fall back to
 * *stale* data rather than nothing — a flaky network during a deploy should
 * degrade the page's freshness, not blank it out.
 */
export async function cached<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
): Promise<T | null> {
    const file = `${CACHE_DIR}/${key}.json`;
    let stale: T | null = null;

    try {
        const entry: CacheEntry<T> = JSON.parse(readFileSync(file, 'utf-8'));
        // `data === undefined` catches entries written by an older cache format.
        if (entry?.data !== undefined) {
            if (Date.now() - entry.fetchedAt < ttlMs) return entry.data;
            stale = entry.data;
        }
    } catch {}

    try {
        const data = await load();
        try {
            mkdirSync(CACHE_DIR, { recursive: true });
            writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), data }));
        } catch {}
        return data;
    } catch {
        return stale;
    }
}

/** Throws on any non-2xx so callers can treat "private/missing repo" as a null row. */
export async function gh(path: string): Promise<any> {
    const resp = await fetch(`https://api.github.com${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
    });
    if (!resp.ok) throw new Error(`GitHub ${path} → ${resp.status}`);
    return resp.json();
}

export function timeAgo(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
}

/* ---------------------------------------------------- contribution graph -- */

export type ContributionDay = { date: string; count: number; level: number };
export type Contributions = { total: number; weeks: ContributionDay[][] };

const CONTRIB_TTL = 60 * 60 * 1000; // 1 hour

/** GitHub buckets the days for us, so no quantile maths on our side. */
const LEVELS: Record<string, number> = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
};

const CONTRIB_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date contributionCount contributionLevel }
          }
        }
      }
    }
  }
`;

/**
 * The contribution calendar exists ONLY in the GraphQL API — there is no REST
 * endpoint for it — and GraphQL rejects unauthenticated requests outright.
 * Without a token we return null and the graph simply doesn't render.
 */
export async function fetchContributions(login: string): Promise<Contributions | null> {
    if (!TOKEN) return null;

    return cached(`github-contributions-${login}`, CONTRIB_TTL, async () => {
        const resp = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                Authorization: `bearer ${TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: CONTRIB_QUERY, variables: { login } }),
        });
        if (!resp.ok) throw new Error(`GitHub GraphQL → ${resp.status}`);

        const json = await resp.json();
        // GraphQL reports errors with a 200, so this has to be checked explicitly.
        if (json.errors?.length) throw new Error(json.errors[0]?.message ?? 'GraphQL error');

        const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
        if (!cal?.weeks?.length) throw new Error('no contribution calendar');

        return {
            total: cal.totalContributions ?? 0,
            weeks: cal.weeks.map((w: any) =>
                (w.contributionDays ?? []).map((d: any) => ({
                    date: d.date,
                    count: d.contributionCount ?? 0,
                    level: LEVELS[d.contributionLevel] ?? 0,
                })),
            ),
        };
    });
}

/* --------------------------------------------------------------- activity -- */

export type Activity = {
    icon: string;
    text: string;
    repo: string;
    url: string;
    date: string;
};

const ACTIVITY_TTL = 10 * 60 * 1000; // 10 minutes, matching the commit strip

/** Pushes to one branch collapse into a single row; this tracks the combined span. */
type PushMeta = { full: string; branch: string; before: string; head: string; count: number };
/** `key` identifies the underlying work item, so repeat events on it fold together. */
type Row = Activity & { key: string; push?: PushMeta };

/**
 * Turn a raw GitHub event into a display row, or null for event types that are
 * noise on a portfolio (branch creates/deletes, forks, stars given).
 *
 * The events API returns a *trimmed* payload: `PushEvent` carries no commit
 * count or commit list, and the nested `pull_request` object has no `html_url`.
 * So counts aren't claimed, and permalinks are built from ids by hand.
 */
function describe(e: any): Row | null {
    const full = e.repo?.name ?? '';
    const repo = full.split('/')[1] ?? full;
    const date = e.created_at;
    const p = e.payload ?? {};
    if (!repo || !date) return null;

    switch (e.type) {
        case 'PushEvent': {
            if (!p.head) return null;
            const branch = String(p.ref ?? '').replace('refs/heads/', '') || 'HEAD';
            return {
                key: `push:${full}:${branch}`,
                icon: 'bi-git',
                text: `pushed to ${branch}`,
                repo,
                date,
                url: `https://github.com/${full}/commit/${p.head}`,
                push: { full, branch, before: p.before ?? '', head: p.head, count: 1 },
            };
        }
        case 'PullRequestEvent': {
            const num = p.number ?? p.pull_request?.number;
            if (!num) return null;
            const url = `https://github.com/${full}/pull/${num}`;
            // This API reports a merge as its own action; older payloads used
            // closed + merged, so both are accepted.
            if (p.action === 'merged' || (p.action === 'closed' && p.pull_request?.merged)) {
                return { key: `pr:${full}:${num}`, icon: 'bi-check-circle', text: `merged PR #${num}`, repo, date, url };
            }
            if (p.action === 'opened') {
                return { key: `pr:${full}:${num}`, icon: 'bi-arrow-up-right-circle', text: `opened PR #${num}`, repo, date, url };
            }
            return null;
        }
        case 'ReleaseEvent': {
            if (p.action !== 'published') return null;
            const tag = p.release?.tag_name;
            return {
                key: `release:${full}:${tag ?? ''}`,
                icon: 'bi-tag',
                text: `released ${tag ?? 'a version'}`,
                repo,
                date,
                url: tag ? `https://github.com/${full}/releases/tag/${tag}` : `https://github.com/${full}/releases`,
            };
        }
        case 'IssuesEvent': {
            if (p.action !== 'opened' || !p.issue?.number) return null;
            return {
                key: `issue:${full}:${p.issue.number}`,
                icon: 'bi-exclamation-circle',
                text: `opened issue #${p.issue.number}`,
                repo,
                date,
                url: `https://github.com/${full}/issues/${p.issue.number}`,
            };
        }
        case 'CreateEvent': {
            if (p.ref_type !== 'repository') return null;
            return { key: `create:${full}`, icon: 'bi-plus-circle', text: 'created repo', repo, date, url: `https://github.com/${full}` };
        }
        default:
            return null;
    }
}

/**
 * Fold every event that refers to the same work item into one row, keeping the
 * newest. Without this a single PR shows up twice (opened, then merged) and a
 * week of commits to one branch floods the feed.
 *
 * Input must be newest-first, which is the order the API returns.
 */
function collapse(rows: Row[]): Activity[] {
    const order: string[] = [];
    const byKey = new Map<string, Row>();

    for (const row of rows) {
        const seen = byKey.get(row.key);

        if (!seen) {
            order.push(row.key);
            byKey.set(row.key, { ...row, push: row.push ? { ...row.push } : undefined });
            continue;
        }

        // Same item again, but older. For pushes that widens the commit span;
        // for anything else the newest state already won (merged beats opened).
        if (seen.push && row.push) {
            seen.push.count += 1;
            seen.push.before = row.push.before;
        }
    }

    return order.map((k) => {
        const { key, push, ...row } = byKey.get(k)!;
        if (!push || push.count === 1) return row;
        return {
            ...row,
            text: `pushed ${push.count} times to ${push.branch}`,
            url: push.before
                ? `https://github.com/${push.full}/compare/${push.before}...${push.head}`
                : row.url,
        };
    });
}

export async function fetchActivity(login: string, limit = 6): Promise<Activity[]> {
    const events = await cached(`github-events-${login}`, ACTIVITY_TTL, async () => {
        const raw: any[] = await gh(`/users/${login}/events/public?per_page=100`);
        return collapse(raw.map(describe).filter(Boolean) as Row[]);
    });

    return (events ?? []).slice(0, limit);


}
