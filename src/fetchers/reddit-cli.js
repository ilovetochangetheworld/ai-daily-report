/**
 * Reddit Fetcher (via rdt-cli)
 * 通过 rdt-cli Cookie 认证获取 AI 相关热帖
 * 安装: uv tool install rdt-cli
 * 认证: rdt login（需本地浏览器登录 reddit.com）
 * 
 * 无 Cookie 时降级到公开 JSON API（大概率 403）
 */

const { execSync } = require('child_process');
const axios = require('axios');
const { BaseFetcher } = require('./base');

const SUBREDDITS = [
    'MachineLearning',
    'artificial',
    'OpenAI',
    'LocalLLaMA',
    'ChatGPT',
    'ClaudeAI',
    'singularity',
];

class RedditCLIFetcher extends BaseFetcher {
    constructor() {
        super('Reddit');
        this.hasCli = this.checkCli();
    }

    checkCli() {
        try {
            const result = execSync('rdt status --json 2>/dev/null', {
                timeout: 5000,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const status = JSON.parse(result);
            return status?.data?.authenticated === true;
        } catch {
            return false;
        }
    }

    async fetch() {
        if (this.hasCli) {
            return this.fetchViaCli();
        }
        return this.fetchViaAPI();
    }

    async fetchViaCli() {
        const signals = [];

        // 1. 搜索热帖
        const searches = ['AI breakthrough', 'new LLM model', 'AI agent coding'];
        for (const q of searches) {
            try {
                const cmd = `rdt search "${q}" --sort top --time day -n 10 --compact --json`;
                const output = execSync(cmd, {
                    timeout: 15000,
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                const posts = JSON.parse(output);
                const list = Array.isArray(posts) ? posts : (posts.data || posts.posts || []);
                for (const post of list) {
                    const data = post.data || post;
                    signals.push(this.parsePost(data));
                }
            } catch (error) {
                console.error(`    ✗ Reddit 搜索失败 [${q}]: ${error.message}`);
            }
        }

        // 2. 各 subreddit 热帖
        for (const sub of SUBREDDITS) {
            try {
                const cmd = `rdt sub ${sub} -s hot -n 10 --compact --json`;
                const output = execSync(cmd, {
                    timeout: 12000,
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                const posts = JSON.parse(output);
                const list = Array.isArray(posts) ? posts : (posts.data || posts.posts || []);
                for (const post of list) {
                    const data = post.data || post;
                    if ((data.score || 0) < 30) continue;
                    if (!this._isAIRelated(data.title)) continue;
                    signals.push(this.parsePost(data));
                }
            } catch {
                // 单个 subreddit 失败不影响
            }
        }

        const unique = this.deduplicate(signals);
        console.log(`    ✓ Reddit (CLI): ${unique.length} 条`);
        return unique;
    }

    async fetchViaAPI() {
        // 降级方案
        const signals = [];
        const client = axios.create({
            baseURL: 'https://www.reddit.com',
            timeout: 10000,
            headers: { 'User-Agent': 'AIDailyReport/1.0' },
        });

        for (const subreddit of SUBREDDITS.slice(0, 4)) {
            try {
                const resp = await client.get(`/r/${subreddit}/hot.json`, {
                    params: { limit: 20 },
                });
                const posts = resp.data?.data?.children || [];
                for (const { data: post } of posts) {
                    if (post.score < 30 || post.stickied) continue;
                    if (!this._isAIRelated(post.title)) continue;
                    signals.push(this.parsePost(post));
                }
            } catch (error) {
                console.error(`    ✗ Reddit API /r/${subreddit} 失败: ${error.message}`);
            }
        }

        console.log(`    ✓ Reddit (API fallback): ${signals.length} 条`);
        return signals;
    }

    parsePost(post) {
        const id = post.id || post.name || '';
        const subreddit = post.subreddit || '';

        // 提取图片/视频 URL
        let imageUrl = null;
        let videoUrl = null;

        // 从 url 字段提取（Reddit 帖子直接链接图片/视频）
        const postUrl = post.url || '';
        if (postUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
            imageUrl = postUrl;
        } else if (postUrl.match(/\.(mp4|webm)(\?|$)/i)) {
            videoUrl = postUrl;
        }

        // 从 preview 提取
        if (!imageUrl && post.preview?.images?.[0]?.source?.url) {
            imageUrl = post.preview.images[0].source.url.replace(/&amp;/g, '&');
        }

        // 从 secure_media 提取视频
        if (!videoUrl && post.secure_media?.reddit_video?.fallback_url) {
            videoUrl = post.secure_media.reddit_video.fallback_url;
        }
        if (!videoUrl && post.media?.reddit_video?.fallback_url) {
            videoUrl = post.media.reddit_video.fallback_url;
        }

        return {
            id: `reddit-${id}`,
            title: (post.title || '').slice(0, 120),
            url: `https://www.reddit.com${post.permalink || `/r/${subreddit}/comments/${id}`}`,
            source: `r/${subreddit}`,
            category: 'discussion',
            published_date: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : new Date().toISOString(),
            score: post.score || 0,
            summary: (post.selftext || '').slice(0, 300),
            image_url: imageUrl,
            video_url: videoUrl,
            metadata: {
                subreddit,
                comments: post.num_comments || 0,
                author: post.author || '',
            },
        };
    }

    _isAIRelated(title) {
        if (!title) return false;
        const kw = ['ai', 'llm', 'gpt', 'claude', 'gemini', 'model', 'agent', 'ml', 'deep learning'];
        return kw.some(k => title.toLowerCase().includes(k));
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

module.exports = { RedditCLIFetcher };
