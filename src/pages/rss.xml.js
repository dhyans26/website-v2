import rss from '@astrojs/rss';
import { INFO } from '../consts';

// Pulls every markdown post under src/pages/blog/ that declares a `title` and
// `pubDate` in its frontmatter. The blog is "coming soon" today, so the feed
// is valid-but-empty until real posts land — no further wiring needed then.
export function GET(context) {
    const posts = Object.values(
        import.meta.glob('./blog/*.md', { eager: true }),
    );

    const items = posts
        .filter((p) => p.frontmatter?.title && p.frontmatter?.pubDate)
        .map((p) => ({
            title: p.frontmatter.title,
            pubDate: new Date(p.frontmatter.pubDate),
            description: p.frontmatter.description ?? '',
            link: p.url,
        }))
        .sort((a, b) => b.pubDate - a.pubDate);

    return rss({
        title: `${INFO.name} — Blog`,
        description: `Writing and notes from ${INFO.name}.`,
        site: context.site,
        items,
    });
}
