/**
 * Twitter/X Fetcher
 * 通过 x-cli (twitter-cli) 获取 AI 大V动态
 * 需要 Cookie 认证：设置 TWITTER_AUTH_TOKEN + TWITTER_CT0 环境变量
 * 安装: uv tool install twitter-cli
 * 
 * 无 CLI 或无 Cookie 时降级到 Nitter RSS
 */

const { execSync } = require('child_process');
const axios = require('axios');
const { BaseFetcher } = require('./base');

// AI 关键账号
const AI_ACCOUNTS = [
    'sama',           // Sam Altman (OpenAI CEO)
    'ylecun',         // Yann LeCun (Meta AI)
    'AndrewYNg',      // Andrew Ng
    'kaboron_ai',     // AI watchers
    'AISafetyMemes',  // AI Safety humor/news
];

// 搜索查询
const AI_SEARCHES = [
    { query: 'AI breakthrough OR new model release', type: 'top', minLikes: 200 },
    { query: 'LLM OR GPT OR Claude', type: 'latest', minLikes: 100 },
];

class TwitterFetcher extends BaseFetcher {
    constructor() {
        super('Twitter/X');
        this.hasCli = this.checkCli();
        this.hasCookie = !!(process.env.TWITTER_AUTH_TOKEN && process.env.TWITTER_CT0);
    }

    checkCli() {
        try {
            execSync('which twitter 2>/dev/null', { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }

    async fetch() {
        if (this.hasCli && this.hasCookie) {
            return this.fetchViaCli();
        }
        if (this.hasCookie) {
            return this.fetchViaEnv();
        }
        return this.fetchViaNitter();
    }

    async fetchViaCli() {
        const signals = [];
        const env = { ...process.env };

        // 1. 搜索热帖
        for (const search of AI_SEARCHES) {
            try {
                const cmd = `twitter search "${search.query}" -t ${search.type} --min-likes ${search.minLikes} -n 15 --json`;
                const output = execSync(cmd, {
                    timeout: 20000,
                    encoding: 'utf-8',
                    env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                const tweets = JSON.parse(output);
                const list = Array.isArray(tweets) ? tweets : (tweets.data || tweets.tweets || []);
                for (const tweet of list) {
                    signals.push(this.parseTweet(tweet));
                }
            } catch (error) {
                console.error(`    ✗ Twitter 搜索失败 [${search.query.slice(0, 25)}]: ${error.message}`);
            }
        }

        // 2. 大V最近发帖
        for (const account of AI_ACCOUNTS) {
            try {
                const cmd = `twitter user-posts ${account} -n 5 --json`;
                const output = execSync(cmd, {
                    timeout: 15000,
                    encoding: 'utf-8',
                    env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                const tweets = JSON.parse(output);
                const list = Array.isArray(tweets) ? tweets : (tweets.data || tweets.tweets || []);
                for (const tweet of list) {
                    signals.push(this.parseTweet(tweet));
                }
            } catch {
                // 单账号失败不影响
            }
        }

        const unique = this.deduplicate(signals);
        console.log(`    ✓ Twitter/X (CLI): ${unique.length} 条`);
        return unique;
    }

    async fetchViaEnv() {
        // 只有环境变量没有 CLI，尝试直接用环境变量调用 CLI
        if (this.hasCli) return this.fetchViaCli();
        console.warn('  ⚠ twitter-cli 未安装，降级 Nitter RSS');
        return this.fetchViaNitter();
    }

    async fetchViaNitter() {
        // 降级方案：Nitter 公开 RSS
        const signals = [];
        const NITTER_INSTANCES = [
            'https://nitter.privacydev.net',
            'https://nitter.poast.org',
        ];

        for (const account of AI_ACCOUNTS.slice(0, 3)) {
            for (const instance of NITTER_INSTANCES) {
                try {
                    const rssUrl = `${instance}/${account}/rss`;
                    const resp = await axios.get(rssUrl, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'AIDailyReport/1.0' },
                    });

                    const items = this.parseSimpleRSS(resp.data);
                    const now = new Date();
                    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

                    for (const item of items.slice(0, 5)) {
                        const pubDate = item.pubDate ? new Date(item.pubDate) : now;
                        if (pubDate < twoDaysAgo) continue;
                        const originalUrl = (item.link || '').replace(/nitter\.[^/]+\//, 'x.com/');

                        signals.push({
                            id: `nitter-${Buffer.from(item.link || item.title).toString('base64').slice(0, 12)}`,
                            title: (item.title || '').slice(0, 120),
                            url: originalUrl.startsWith('http') ? originalUrl : `https://x.com/${account}`,
                            source: `@${account}`,
                            category: 'social',
                            published_date: pubDate.toISOString(),
                            score: 45,
                            summary: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                        });
                    }
                    break; // 成功就不换实例
                } catch {
                    // 换下一个 Nitter 实例
                }
            }
        }

        console.log(`    ✓ Twitter/X (Nitter fallback): ${signals.length} 条`);
        return signals;
    }

    parseTweet(tweet) {
        const id = tweet.id || tweet.tweet_id || '';
        const text = tweet.text || tweet.content || tweet.full_text || '';
        const url = tweet.url || `https://x.com/i/status/${id}`;
        const author = tweet.author?.screen_name || tweet.author?.screenName || tweet.user?.screen_name || tweet.username || (typeof tweet.author === 'string' ? tweet.author : '') || '';
        const likes = tweet.metrics?.likes || tweet.favorite_count || tweet.likes || 0;
        const retweets = tweet.metrics?.retweets || tweet.retweet_count || tweet.retweets || 0;

        // 提取图片/视频 URL
        let imageUrl = null;
        let videoUrl = null;

        // 从 media / mediaDetails 提取
        const media = tweet.media || tweet.extended_entities?.media || [];
        const mediaDetails = tweet.mediaDetails || tweet.extended_entities?.media || media;
        const allMedia = [...media, ...(Array.isArray(mediaDetails) ? mediaDetails : [])];

        for (const m of allMedia) {
            if (!m) continue;
            if ((m.type === 'photo' || m.type === 'image') && !imageUrl) {
                imageUrl = m.media_url_https || m.media_url || m.url;
                if (imageUrl && !imageUrl.startsWith('http')) imageUrl = null;
            }
            if ((m.type === 'video' || m.type === 'animated_gif') && !videoUrl) {
                videoUrl = this._extractVideoUrl(m.video_info || m);
            }
        }

        // 如果 media 为空，尝试从 entities 提取
        if (!imageUrl && tweet.entities?.media) {
            for (const m of tweet.entities.media) {
                if (m.media_url_https || m.media_url) {
                    imageUrl = m.media_url_https || m.media_url;
                    if (!imageUrl.startsWith('http')) imageUrl = null;
                    if (imageUrl) break;
                }
            }
        }

        return {
            id: `x-${id || Buffer.from(url).toString('base64').slice(0, 12)}`,
            title: text.slice(0, 120),
            url: url,
            source: author ? `@${author}` : 'X/Twitter',
            category: 'social',
            published_date: tweet.createdAtISO || tweet.created_at || new Date().toISOString(),
            score: Math.min(40 + Math.floor(likes / 10), 90),
            summary: text.slice(0, 300),
            image_url: imageUrl,
            video_url: videoUrl,
            metadata: { likes, retweets, author },
        };
    }

    parseSimpleRSS(xml) {
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRegex.exec(xml)) !== null) {
            const block = m[1];
            items.push({
                title: (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '',
                link: (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || '',
                description: (block.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1] || '',
                pubDate: (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1] || '',
            });
        }
        return items;
    }

    deduplicate(signals) {
        const unique = new Map();
        for (const s of signals) {
            const key = s.url || s.id;
            if (!unique.has(key)) unique.set(key, s);
        }
        return Array.from(unique.values());
    }
}

module.exports = { TwitterFetcher };
