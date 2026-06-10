/**
 * 小红书卡片图生成模块
 * HTML 模板 + Puppeteer 截图
 * 支持自动分页：每个板块内容多时自动拆成多张卡片
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;
const FONT_STACK = "'Noto Sans CJK SC','PingFang SC','Microsoft YaHei','WenQuanYi Micro Hei',sans-serif";
const BRAND_URL = 'ilovetochangetheworld.github.io/ai-daily-report';

/**
 * 从日报 Markdown 解析出 7 板块的所有条目
 * 每条: { subtitle, summary }，summary 控制在 120 字以内
 */
function parseFullSections(markdown) {
    const rawSections = markdown.split(/(?=^## )/m).filter(s => s.startsWith('## '));
    const result = [];
    const emojiMap = {
        '产品与功能更新': '🚀',
        '前沿研究': '🔬',
        '行业展望与社会影响': '🌍',
        '开源 TOP 项目': '⭐',
        '社媒热议': '💬',
        '社媒分享': '💬',
        'AI Coding & 工程': '💻',
        'AI Coding & harness 工程': '💻',
        '发现机会': '💡',
    };

    for (const sec of rawSections) {
        const titleMatch = sec.match(/^## (.+)/);
        if (!titleMatch) continue;
        let sectionTitle = titleMatch[1].trim();

        // 跳过 Top 5 信号
        if (sectionTitle.includes('Top 5') || sectionTitle.includes('📌')) continue;

        // 从标题中提取已有 emoji
        const emMatch = sectionTitle.match(/^([\u{1F300}-\u{1F9FF}])\s*/u);
        let emoji = '';
        if (emMatch) {
            emoji = emMatch[1];
            sectionTitle = sectionTitle.replace(emMatch[0], '').trim();
        }

        // 判断分析标题归属板块
        const belongMap = {
            '产品与功能更新': '产品与功能更新',
            '维度分析': '产品与功能更新',
            '前沿研究': '前沿研究',
            '下沉战': '前沿研究',
            '本地推理': '前沿研究',
            '行业展望': '行业展望与社会影响',
            '社会影响': '行业展望与社会影响',
            '开源 TOP': '开源 TOP 项目',
            '开源TOP': '开源 TOP 项目',
            '安卓化': '开源 TOP 项目',
            '社媒': '社媒热议',
            'Coding': 'AI Coding & 工程',
            'harness': 'AI Coding & 工程',
            '发现机会': '发现机会',
        };
        let normalizedTitle = '';
        for (const [key, val] of Object.entries(belongMap)) {
            if (sectionTitle.includes(key)) { normalizedTitle = val; break; }
        }
        // 如果自身已是标准板块名就不变
        const standardNames = ['产品与功能更新', '前沿研究', '行业展望与社会影响', '开源 TOP 项目', '社媒热议', 'AI Coding & 工程', '发现机会'];
        if (standardNames.includes(sectionTitle)) {
            normalizedTitle = sectionTitle;
        }
        if (!normalizedTitle) {
            // 无法归类的分析标题跳过（内容会被前面的板块捕获）
            continue;
        }

        // 如果板块已存在，追加条目；否则新建
        let existing = result.find(s => s.title === normalizedTitle);
        if (!existing) {
            existing = { emoji: emoji || emojiMap[normalizedTitle] || '📌', title: normalizedTitle, items: [] };
            result.push(existing);
        }
        if (emoji && !existing.emoji) existing.emoji = emoji;

        // 提取 ### 子条目
        const subs = sec.split(/(?=^### )/m).filter(s => s.startsWith('### '));
        const items = [];
        for (const sub of subs) {
            const subMatch = sub.match(/^### (.+)/);
            if (!subMatch) continue;
            let subTitle = cleanCardText(subMatch[1].replace(/^\d+\.\s*/, '').trim());

            // 提取核心判断段落作为摘要
            const body = sub.replace(/^### .*/m, '').trim();
            let summary = '';

            const coreSummary = extractCoreSummary(body);
            if (coreSummary) summary = coreSummary;

            // 产品类条目常直接用首段加粗表达核心判断，而不写“核心判断”。
            if (!summary) {
                const firstBold = body.match(/^\s*\*\*(.+?)\*\*/s);
                if (firstBold) {
                    summary = cleanCardText(firstBold[1]);
                }
            }

            // 如果没找到核心判断，取第一段非空文本
            if (!summary) {
                const firstPara = body.split('\n\n').find(p => p.trim() && !p.trim().startsWith('-') && !p.trim().startsWith('>') && !p.trim().startsWith('**'));
                if (firstPara) {
                    summary = cleanCardText(firstPara.replace(/[\-\*]\s*/g, ''));
                }
            }

            // 补充第一条关键证据（仅当核心判断未提取到时，或 summary 极短）
            if (summary && coreSummary) {
                // 核心判断已成功提取，不再追加证据列表
            } else if (summary.length < 40) {
                const evidences = body.match(/^-\s+(.+)/gm) || [];
                for (const ev of evidences) {
                    const evText = cleanCardText(ev.replace(/^-\s+/, ''));
                    if (evText.length > 15 && !summary.includes(evText.substring(0, 15))) {
                        summary = summary ? summary + '；' + evText : evText;
                        break;
                    }
                }
            }

            // 截断到 150 字
            if (summary.length > 150) {
                summary = summary.substring(0, 147) + '...';
            }

            // 如果还是没有，从关键证据里取第一条
            if (!summary) {
                const evidence = body.match(/-\s*(.+)/);
                if (evidence) {
                    summary = cleanCardText(evidence[1]);
                    if (summary.length > 120) summary = summary.substring(0, 117) + '...';
                }
            }

            if (subTitle && summary) {
                existing.items.push({ subtitle: subTitle, summary });
            }
        }

        // 也收集关键证据作为额外条目（如果 ### 条目少于2个）
        if (existing.items.length < 2) {
            const evidenceLines = sec.match(/^-\s+(.+)/gm) || [];
            for (const el of evidenceLines) {
                const text = cleanCardText(el.replace(/^-\s+/, ''));
                if (text.length > 15 && text.length < 150 && existing.items.length < 4) {
                    // 避免重复
                    if (!existing.items.some(it => it.summary.includes(text.substring(0, 20)))) {
                        existing.items.push({ subtitle: text.substring(0, 25), summary: text });
                    }
                }
            }
        }
    }

    return result;
}

/**
 * 自动分页：每张卡片最多放 MAX_ITEMS 条，超出则拆分
 */
function paginateSection(section, maxItemsPerPage = 3) {
    const pages = [];
    for (let i = 0; i < section.items.length; i += maxItemsPerPage) {
        pages.push({
            emoji: section.emoji,
            title: section.title,
            items: section.items.slice(i, i + maxItemsPerPage),
            pageNum: Math.floor(i / maxItemsPerPage) + 1,
            totalPages: Math.ceil(section.items.length / maxItemsPerPage),
        });
    }
    return pages;
}

/**
 * 生成封面 HTML
 */
function coverHtml(date, sectionCount, totalItems) {
    const dateLabel = date.substring(5).replace('-', '.');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#f7f3ea;
  color:#101828;
  position:relative;
}
.grain { position:absolute; inset:0; background-image:linear-gradient(rgba(16,24,40,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px, transparent 1px); background-size:36px 36px; }
.top-bar { position:absolute; top:0; left:0; right:0; height:14px; background:#ff4d3d; }
.content { position:relative; z-index:1; padding:88px 72px; height:100%; }
.badge { display:inline-block; background:#101828; color:#fff; border-radius:999px; padding:10px 22px; font-size:24px; font-weight:800; letter-spacing:1px; margin-bottom:34px; }
.title { font-size:120px; font-weight:1000; letter-spacing:0; line-height:.95; color:#101828; margin-bottom:18px; }
.title-accent { color:#ff4d3d; }
.date { font-size:44px; color:#475467; letter-spacing:2px; font-weight:800; margin-bottom:56px; }
.hero-card { background:#fff; border:4px solid #101828; border-radius:8px; padding:34px 36px; box-shadow:12px 12px 0 #101828; margin-bottom:50px; }
.hero-title { font-size:42px; line-height:1.25; font-weight:1000; margin-bottom:16px; }
.hero-copy { font-size:27px; color:#475467; line-height:1.55; font-weight:600; }
.sections-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 22px; }
.section-item { display:flex; align-items:center; gap:12px; background:#fff; border:2px solid #101828; border-radius:8px; padding:14px 16px; font-size:27px; font-weight:850; color:#101828; }
.section-emoji { font-size:31px; }
.footer { position:absolute; bottom:58px; left:72px; right:72px; display:flex; justify-content:space-between; align-items:flex-end; border-top:3px solid #101828; padding-top:22px; }
.stats { font-size:24px; color:#101828; font-weight:850; }
.credit { font-size:18px; color:#667085; text-align:right; }
</style>
</head><body>
<div class="grain"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="badge">AI DAILY · ${dateLabel}</div>
  <div class="title">AI<span class="title-accent">日报</span></div>
  <div class="date">${date}</div>
  <div class="hero-card">
    <div class="hero-title">今天 AI 圈最值得看的信号</div>
    <div class="hero-copy">${totalItems} 条精华，拆成 ${sectionCount} 个维度。适合收藏、复盘、找选题。</div>
  </div>
  <div class="sections-grid">
    <div class="section-item"><span class="section-emoji">🚀</span> 产品与功能更新</div>
    <div class="section-item"><span class="section-emoji">🔬</span> 前沿研究</div>
    <div class="section-item"><span class="section-emoji">🌍</span> 行业展望与社会影响</div>
    <div class="section-item"><span class="section-emoji">⭐</span> 开源 TOP 项目</div>
    <div class="section-item"><span class="section-emoji">💬</span> 社媒热议</div>
    <div class="section-item"><span class="section-emoji">💻</span> AI Coding & 工程</div>
    <div class="section-item"><span class="section-emoji">💡</span> 发现机会</div>
  </div>
</div>
<div class="footer">
  <div class="stats">${totalItems} 条精华 · ${sectionCount} 维度</div>
  <div class="credit">${BRAND_URL}</div>
</div>
</body></html>`;
}

/**
 * 生成板块卡片 HTML（支持分页）
 */
function sectionCardHtml(page, date, globalIndex) {
    const itemsHtml = page.items.map(item => `
    <div class="card">
      <div class="card-header">
        <span class="card-bullet"></span>
        <span class="card-subtitle">${escHtml(item.subtitle)}</span>
      </div>
      <div class="card-body">${escHtml(item.summary)}</div>
    </div>`).join('\n');

    const pageLabel = page.totalPages > 1 ? ` (${page.pageNum}/${page.totalPages})` : '';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;
  font-family:${FONT_STACK};
  overflow:hidden;
  background:#f7f3ea;
  color:#101828;
  position:relative;
}
.paper-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(16,24,40,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px, transparent 1px); background-size:36px 36px; }
.top-bar {
  position:absolute; top:0; left:0; right:0; height:14px;
  background:#ff4d3d;
}
.content {
  position:relative; z-index:1;
  padding:64px 60px;
}
.section-header { margin-bottom:30px; }
.eyebrow { display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; }
.section-emoji { font-size:52px; display:block; }
.section-meta {
  font-size:19px; color:#101828; background:#fff;
  border:2px solid #101828; border-radius:999px; padding:8px 16px;
  font-weight:850;
}
.section-title {
  font-size:52px; font-weight:1000; line-height:1.12;
  color:#101828; letter-spacing:0;
}
.header-line {
  width:130px; height:8px; border-radius:999px;
  background:#ff4d3d; margin-top:18px;
}
.cards { display:flex; flex-direction:column; gap:18px; }
.card {
  background:#fff; border:3px solid #101828;
  border-radius:8px; padding:24px 26px;
  box-shadow:8px 8px 0 rgba(16,24,40,.12);
}
.card-header {
  display:flex; align-items:center; gap:10px;
  margin-bottom:12px;
}
.card-bullet {
  width:24px; height:24px; border-radius:50%;
  background:#ff4d3d; border:3px solid #101828; flex-shrink:0;
}
.card-subtitle { font-size:28px; line-height:1.25; font-weight:950; color:#101828; }
.card-body {
  font-size:23px; line-height:1.62;
  color:#475467; padding-left:34px; font-weight:600;
}
.footer {
  position:absolute; bottom:40px; left:60px; right:60px;
  display:flex; justify-content:space-between; align-items:center;
  border-top:3px solid #101828; padding-top:18px;
}
.footer-left { font-size:21px; color:#101828; font-weight:850; }
.footer-right { font-size:16px; color:#667085; }
</style>
</head><body>
<div class="paper-grid"></div>
<div class="top-bar"></div>
<div class="content">
  <div class="section-header">
    <div class="eyebrow">
      <span class="section-emoji">${page.emoji || '📌'}</span>
      <div class="section-meta">SECTION ${globalIndex}</div>
    </div>
    <div class="section-title">${escHtml(page.title)}${pageLabel}</div>
    <div class="header-line"></div>
  </div>
  <div class="cards">
    ${itemsHtml}
  </div>
</div>
<div class="footer">
  <span class="footer-left">AI日报 · ${date}</span>
  <span class="footer-right">${BRAND_URL}</span>
</div>
</body></html>`;
}

/**
 * 生成所有卡片：封面 + 各板块（自动分页）
 */
async function generateCoverAndCards(date, sectionsOrMarkdown, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    // 如果传入的是 markdown 字符串，先解析
    let sections;
    if (typeof sectionsOrMarkdown === 'string' && sectionsOrMarkdown.includes('## ')) {
        sections = parseFullSections(sectionsOrMarkdown);
    } else if (Array.isArray(sectionsOrMarkdown)) {
        sections = sectionsOrMarkdown;
    } else {
        sections = getDefaultSections();
    }

    // 所有板块分页
    const allPages = [];
    let globalIdx = 1;
    for (const sec of sections) {
        const pages = paginateSection(sec, 3);
        for (const page of pages) {
            allPages.push({ ...page, globalIndex: globalIdx });
        }
        globalIdx++;
    }

    // 小红书最多18张图
    if (allPages.length + 1 > 18) {
        // 合并最后几个板块如果超限
        while (allPages.length + 1 > 18 && allPages.length > 7) {
            const last = allPages.pop();
            const prev = allPages[allPages.length - 1];
            if (prev.title === last.title) {
                prev.items = prev.items.concat(last.items);
                prev.totalPages = prev.pageNum;
            }
        }
    }

    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

    // 导入 puppeteer
    let puppeteer;
    try {
        puppeteer = require(os.homedir() + '/node_modules/puppeteer');
    } catch {
        puppeteer = require('puppeteer');
    }

    const executablePath = resolveChromeExecutable(puppeteer);
    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        dumpio: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT, deviceScaleFactor: 2 });

    const paths = [];

    try {
        // 封面
        const coverPath = path.join(outputDir, 'xhs_0_cover.png');
        await page.setContent(coverHtml(date, sections.length, totalItems), { waitUntil: 'load', timeout: 15000 });
        await page.screenshot({ path: coverPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
        paths.push(coverPath);
        console.log(`  ✓ 封面图`);

        // 板块卡片
        for (let i = 0; i < allPages.length; i++) {
            const p = allPages[i];
            const safeTitle = p.title.replace(/[\s&]/g, '');
            const suffix = p.totalPages > 1 ? `_p${p.pageNum}` : '';
            const cardPath = path.join(outputDir, `xhs_${i + 1}_${safeTitle}${suffix}.png`);
            await page.setContent(sectionCardHtml(p, date, p.globalIndex), { waitUntil: 'load', timeout: 15000 });
            await page.screenshot({ path: cardPath, type: 'png', clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
            paths.push(cardPath);
            console.log(`  ✓ ${p.emoji} ${p.title}${suffix} (${p.items.length}条)`);
        }
    } finally {
        await browser.close();
    }

    return paths;
}

function getDefaultSections() {
    return [
        { emoji: '🚀', title: '产品与功能更新', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '🔬', title: '前沿研究', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '🌍', title: '行业展望与社会影响', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '⭐', title: '开源TOP项目', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💬', title: '社媒热议', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💻', title: 'AICoding&工程', items: [{ subtitle: '详见完整日报', summary: '' }] },
        { emoji: '💡', title: '发现机会', items: [{ subtitle: '详见完整日报', summary: '' }] },
    ];
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cleanCardText(str) {
    return String(str || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/^(分析思路与推演链条|分析推演链条|分析思路|推演链条)[：:]\s*/i, '')
        .replace(/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]\s*/i, '')
        .replace(/^(实战建议|反向视角|不确定性)[：:]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCoreSummary(body) {
    const text = String(body || '').trim();
    const strength = '(?:（证据强度[：:][强中弱]）)?';
    const patterns = [
        // **核心判断（证据强度：强）：判断正文**
        new RegExp(`^\\s*\\*\\*核心判断${strength}[：:]\\s*(.+?)\\*\\*`, 's'),
        // **核心判断（证据强度：强）：** 判断正文
        new RegExp(`^\\s*\\*\\*核心判断${strength}[：:]\\*\\*\\s*(.+)`, 's'),
        // **核心判断（证据强度：强）**：判断正文
        new RegExp(`^\\s*\\*\\*核心判断${strength}\\*\\*[：:]\\s*(.+)`, 's'),
        // 核心判断（证据强度：强）：判断正文
        new RegExp(`^\\s*核心判断${strength}[：:]\\s*(.+)`, 's'),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const cleaned = cleanCardText(match[1].split('\n\n')[0]);
        if (cleaned && !/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]?$/.test(cleaned)) {
            return cleaned;
        }
    }

    return '';
}

function resolveChromeExecutable(puppeteer) {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : undefined;
}

module.exports = { generateCoverAndCards, parseFullSections, paginateSection, coverHtml, sectionCardHtml };
