/**
 * 小红书 Fetcher (via xiaohongshu-cli)
 * 通过 xhs-cli Cookie 认证搜索 AI 相关笔记
 * 安装: uv tool install xiaohongshu-cli
 * 认证: 写入 ~/.xiaohongshu-cli/cookies.json
 * 
 * 也可通过环境变量 XHS_A1 / XHS_WEB_SESSION 提供 Cookie
 * 无 Cookie 时跳过
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BaseFetcher } = require('./base');

const XHS_KEYWORDS = ['AI', '大模型', 'ChatGPT', 'Claude', 'AI工具', 'AI编程', 'Cursor', 'AI副业'];
const SEARCH_DELAY_MS = 4000; // 每次搜索间隔4秒，避免验证码

class XHSFetcher extends BaseFetcher {
    constructor() {
        super('小红书');
        this.authenticated = this.checkAuth();
    }

    checkAuth() {
        // 0. 如果环境变量有值，自动写入 cookies.json（CI 环境）
        const envA1 = process.env.XHS_A1;
        const envSession = process.env.XHS_WEB_SESSION;
        if (envA1 && envSession) {
            try {
                const cookieDir = path.join(os.homedir(), '.xiaohongshu-cli');
                const cookiePath = path.join(cookieDir, 'cookies.json');
                if (!fs.existsSync(cookieDir)) fs.mkdirSync(cookieDir, { recursive: true });
                if (!fs.existsSync(cookiePath)) {
                    const payload = {
                        a1: envA1,
                        web_session: envSession,
                        xsecappid: 'xhs-pc-web',
                        webBuild: '6.16.0',
                        saved_at: Date.now() / 1000,
                    };
                    fs.writeFileSync(cookiePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
                }
            } catch { /* ignore */ }
        }

        // 1. 检查 cookies.json 文件是否存在且有 a1
        try {
            const cookiePath = path.join(os.homedir(), '.xiaohongshu-cli', 'cookies.json');
            if (fs.existsSync(cookiePath)) {
                const data = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
                if (data.a1) {
                    return true;
                }
            }
        } catch { /* ignore */ }

        // 2. 尝试 CLI status
        try {
            const output = execSync('xhs status --json 2>/dev/null', {
                timeout: 5000,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const status = JSON.parse(output);
            return status?.data?.authenticated === true;
        } catch {
            return false;
        }
    }

    async fetch() {
        if (!this.authenticated) {
            console.warn('  ⚠ 小红书未认证，跳过（需要 xhs login 或写入 ~/.xiaohongshu-cli/cookies.json）');
            return [];
        }
        return this.fetchViaCli();
    }

    async fetchViaCli() {
        const signals = [];

        for (const keyword of XHS_KEYWORDS) {
            try {
                const cmd = `xhs search "${keyword}" --sort general --json`;
                const output = execSync(cmd, {
                    timeout: 25000,
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                const data = JSON.parse(output);
                const items = this.extractItems(data);
                let addedCount = 0;

                for (const item of items) {
                    const card = item.note_card || item;
                    const noteId = item.id || card.note_id || '';
                    
                    const title = card.display_title || card.title || card.desc || '';
                    if (!title || title.length < 4) continue;

                    const interact = card.interact_info || {};
                    const likes = parseInt(interact.liked_count || card.liked_count || card.likes || '0', 10);
                    const comments = parseInt(interact.comment_count || card.comment_count || '0', 10);
                    const collected = parseInt(interact.collected_count || '0', 10);

                    const user = card.user || {};
                    const author = user.nickname || user.nick_name || user.name || '';

                    // 提取封面图：优先 url_pre > url > url_default，强制 https
                    const cover = card.cover || {};
                    const rawImg = cover.url_pre || cover.url || cover.url_default || '';
                    const imageUrl = rawImg ? this._ensureHttps(rawImg) : '';

                    // 提取视频
                    const videoObj = card.video;
                    const videoUrl = this._extractVideoUrl(videoObj);

                    signals.push({
                        id: `xhs-${noteId || Buffer.from(title).toString('base64').slice(0, 12)}`,
                        title: title.slice(0, 120),
                        url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '',
                        source: '小红书',
                        category: 'social',
                        published_date: new Date().toISOString(),
                        score: Math.min(35 + Math.floor(likes / 3) + Math.floor(collected / 5), 90),
                        summary: (card.desc || '').slice(0, 300),
                        image_url: imageUrl,
                        video_url: videoUrl,
                        metadata: {
                            keyword,
                            likes,
                            comments,
                            collected,
                            type: card.type || '',
                            author,
                        },
                    });
                    addedCount++;
                }
                
                console.log(`    ✓ xhs [${keyword}]: ${addedCount} 条`);
                
                // 请求间隔，避免触发验证码
                if (addedCount > 0 || items.length > 0) {
                    await new Promise(r => setTimeout(r, SEARCH_DELAY_MS));
                }
            } catch (error) {
                const errMsg = error.message.slice(0, 80);
                if (errMsg.includes('Captcha')) {
                    console.warn(`    ⚠ xhs [${keyword}]: 触发验证码，停止后续搜索`);
                    break; // 遇到验证码直接停止后续关键词
                }
                console.error(`    ✗ xhs [${keyword}]: ${errMsg}`);
                // 失败后等待更久
                await new Promise(r => setTimeout(r, SEARCH_DELAY_MS * 2));
            }
        }

        // 去重
        const unique = new Map();
        for (const s of signals) {
            if (!unique.has(s.id)) unique.set(s.id, s);
        }

        const result = Array.from(unique.values());
        console.log(`    ✓ 小红书 (CLI): ${result.length} 条`);
        return result;
    }

    /**
     * 确保URL是https
     */
    _ensureHttps(url) {
        if (!url || typeof url !== 'string') return '';
        return url.replace(/^http:\/\//, 'https://');
    }

    extractItems(data) {
        if (data?.data?.items && Array.isArray(data.data.items)) {
            return data.data.items;
        }
        if (Array.isArray(data?.data)) {
            return data.data;
        }
        if (Array.isArray(data)) {
            return data;
        }
        return [];
    }
}

module.exports = { XHSFetcher };
