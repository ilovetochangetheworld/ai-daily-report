/**
 * 日报渲染器 - 支持 Markdown→HTML 自动渲染
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const OUTPUT_BASE = path.join(__dirname, '..');

// 配置 marked：外部链接新窗口打开
const renderer = new marked.Renderer();
const origLink = renderer.link.bind(renderer);
renderer.link = function(href, title, text) {
    const html = origLink(href, title, text);
    return html.replace('<a ', '<a target="_blank" rel="noopener" ');
};
marked.setOptions({ renderer });

function saveReport(markdown, lang, date) {
    const dir = path.join(OUTPUT_BASE, lang, date.substring(0, 4));
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${date}.md`;
    const outputPath = path.join(dir, filename);
    fs.writeFileSync(outputPath, markdown, 'utf8');

    // 渲染 HTML 版本
    const htmlFilename = `${date}.html`;
    const htmlPath = path.join(dir, htmlFilename);
    const htmlContent = renderMarkdownToFullHtml(markdown, lang, date);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`✓ 已生成 ${lang}/${date.substring(0, 4)}/${filename} + HTML 版本`);

    return outputPath;
}

/**
 * 通用 Markdown 样式块
 */
const MARKDOWN_STYLES = `
        .markdown-body {
            background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px;
        }
        .markdown-body h1 { color: #e6edf3; font-size: 1.8em; margin: 0 0 16px 0; border-bottom: 1px solid #21262d; padding-bottom: 12px; }
        .markdown-body h2 { color: #e6edf3; font-size: 1.35em; margin: 28px 0 12px 0; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
        .markdown-body h3 { color: #e6edf3; font-size: 1.1em; margin: 20px 0 8px 0; }
        .markdown-body h4 { color: #e6edf3; font-size: 1em; margin: 16px 0 6px 0; }
        .markdown-body p { margin: 10px 0; }
        .markdown-body blockquote {
            border-left: 3px solid #1f6feb;
            padding: 10px 16px; margin: 16px 0; color: #8b949e;
            background: #0d1117; border-radius: 0 8px 8px 0;
        }
        .markdown-body strong { color: #e6edf3; }
        .markdown-body em { color: #8b949e; }
        .markdown-body hr { border: none; border-top: 1px solid #21262d; margin: 24px 0; }
        .markdown-body ul, .markdown-body ol { padding-left: 24px; margin: 10px 0; }
        .markdown-body li { margin: 6px 0; }
        .markdown-body a { color: #58a6ff; text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }
        .markdown-body code { background: #1c2128; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #f78166; }
        .markdown-body pre { background: #0d1117; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
        .markdown-body pre code { background: none; padding: 0; color: #c9d1d9; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .markdown-body th, .markdown-body td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; }
        .markdown-body th { background: #21262d; color: #e6edf3; }
        .markdown-body img { max-width: 100%; border-radius: 8px; }`;

/**
 * 将 Markdown 渲染为完整的 HTML 页面
 */
function renderMarkdownToFullHtml(markdown, lang, date) {
    const htmlContent = marked.parse(markdown);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 日报 ${date}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
            background: #0d1117; color: #c9d1d9; line-height: 1.7;
        }
        .container { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
        .back { display: inline-block; margin-bottom: 24px; color: #58a6ff; text-decoration: none; font-size: 0.95em; }
        .back:hover { text-decoration: underline; }
        ${MARKDOWN_STYLES}
        footer {
            text-align: center; margin-top: 40px; padding: 20px 0;
            border-top: 1px solid #21262d; color: #484f58; font-size: 0.85em;
        }
        footer a { color: #58a6ff; text-decoration: none; }
    </style>
</head>
<body>
<div class="container">
    <a class="back" href="../../">← 返回首页</a>
    <div class="markdown-body">
        ${htmlContent}
    </div>
    <footer>
        Powered by <a href="https://github.com/ilovetochangetheworld/ai-daily-report">AI Daily Report</a> · GitHub Actions
    </footer>
</div>
</body>
</html>`;
}

/**
 * 扫描 zh 目录获取所有日报数据，按月份分组
 */
function scanReports() {
    const zhDir = path.join(OUTPUT_BASE, 'zh');
    if (!fs.existsSync(zhDir)) return [];

    const years = fs.readdirSync(zhDir).filter(f => /^\d{4}$/.test(f));
    let items = [];

    for (const year of years.sort().reverse()) {
        const yearDir = path.join(zhDir, year);
        const files = fs.readdirSync(yearDir)
            .filter(f => f.endsWith('.html') && !f.startsWith('index'))
            .sort().reverse();

        for (const file of files) {
            const date = file.replace('.html', '');
            items.push({ year, file, date });
        }
    }
    return items;
}

/**
 * 生成首页 - 左侧日报内容 + 右侧月份时间轴
 */
function generateIndex() {
    const indexPath = path.join(OUTPUT_BASE, 'index.html');
    const items = scanReports();

    // 获取最新日报内容
    let latestHtml = '<div class="empty-state"><p>📭 暂无日报，请等待自动生成...</p></div>';
    let latestDate = '';
    if (items.length > 0) {
        latestDate = items[0].date;
        const mdPath = path.join(OUTPUT_BASE, 'zh', items[0].year, `${latestDate}.md`);
        if (fs.existsSync(mdPath)) {
            const md = fs.readFileSync(mdPath, 'utf8');
            latestHtml = marked.parse(md);
        }
    }

    // 按月份分组生成时间轴
    const months = {};
    for (const item of items) {
        const monthKey = item.date.substring(0, 7); // 2026-06
        if (!months[monthKey]) months[monthKey] = [];
        months[monthKey].push(item);
    }

    // 生成时间轴 HTML
    let timelineHtml = '';
    const sortedMonths = Object.keys(months).sort().reverse();

    for (const monthKey of sortedMonths) {
        const [y, m] = monthKey.split('-');
        const monthLabel = `${y}年${parseInt(m)}月`;
        const monthItems = months[monthKey];

        timelineHtml += `
            <div class="timeline-month">
                <div class="month-label">
                    <span class="month-dot"></span>
                    ${monthLabel}
                </div>
                <div class="month-items">
                    ${monthItems.map(item => {
                        const day = parseInt(item.date.split('-')[2]);
                        const isActive = item.date === latestDate;
                        return `<a class="timeline-item${isActive ? ' active' : ''}" 
                                   href="./zh/${item.year}/${item.file}" 
                                   target="_blank" rel="noopener"
                                   data-date="${item.date}"
                                   title="AI 日报 ${item.date}">
                            <span class="day-num">${day}日</span>
                            <span class="day-week">${getWeekDay(item.date)}</span>
                        </a>`;
                    }).join('')}
                </div>
            </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AI 日报 — 每日 AI 行业洞察</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.7; }

        /* 顶部导航 */
        .top-bar {
            position: sticky; top: 0; z-index: 100;
            background: #161b22ee; backdrop-filter: blur(12px);
            border-bottom: 1px solid #21262d;
            padding: 12px 24px;
            display: flex; align-items: center; justify-content: space-between;
        }
        .top-bar .brand {
            font-size: 1.2em; font-weight: 700;
        }
        .top-bar .brand span {
            background: linear-gradient(135deg, #58a6ff, #f78166);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .top-bar .date-badge {
            background: #1f6feb22; color: #58a6ff; border: 1px solid #1f6feb44;
            padding: 4px 14px; border-radius: 20px; font-size: 0.85em; font-weight: 500;
        }

        /* 主布局 */
        .main-layout {
            display: flex; max-width: 1400px; margin: 0 auto; min-height: calc(100vh - 52px);
        }

        /* 左侧内容区 */
        .content-area {
            flex: 1; min-width: 0; padding: 32px 32px 48px;
            border-right: 1px solid #21262d;
        }

        /* 右侧时间轴 */
        .sidebar {
            width: 220px; flex-shrink: 0;
            padding: 24px 16px;
            overflow-y: auto; max-height: calc(100vh - 52px);
            position: sticky; top: 52px;
        }
        .sidebar-title {
            font-size: 0.8em; text-transform: uppercase; letter-spacing: 1px;
            color: #484f58; margin-bottom: 16px; padding-left: 8px;
        }

        /* 时间轴样式 */
        .timeline-month { margin-bottom: 20px; }
        .month-label {
            display: flex; align-items: center; gap: 8px;
            font-size: 0.9em; font-weight: 600; color: #e6edf3;
            margin-bottom: 8px; padding: 4px 8px;
        }
        .month-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #58a6ff; flex-shrink: 0;
        }
        .month-items { padding-left: 16px; border-left: 2px solid #21262d; }
        .timeline-item {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 10px; margin: 2px 0;
            border-radius: 6px; text-decoration: none;
            color: #8b949e; font-size: 0.82em;
            transition: all .15s;
        }
        .timeline-item:hover {
            background: #1c2128; color: #e6edf3;
        }
        .timeline-item.active {
            background: #1f6feb22; color: #58a6ff; font-weight: 600;
        }
        .day-num { min-width: 22px; }
        .day-week { color: #484f58; font-size: 0.9em; }

        /* Markdown 内容 */
        ${MARKDOWN_STYLES}

        /* 最新日期标签 */
        .content-date-tag {
            display: inline-flex; align-items: center; gap: 6px;
            background: #1f6feb22; color: #58a6ff;
            padding: 4px 12px; border-radius: 6px;
            font-size: 0.85em; font-weight: 500; margin-bottom: 16px;
        }

        /* 空状态 */
        .empty-state {
            text-align: center; padding: 80px 20px; color: #484f58;
        }

        /* 底部 */
        .content-footer {
            text-align: center; margin-top: 48px; padding: 20px 0;
            border-top: 1px solid #21262d; color: #484f58; font-size: 0.82em;
        }
        .content-footer a { color: #58a6ff; text-decoration: none; }

        /* 响应式 */
        @media (max-width: 900px) {
            .main-layout { flex-direction: column-reverse; }
            .sidebar {
                width: 100%; max-height: none; position: static;
                padding: 12px 24px; border-bottom: 1px solid #21262d;
                display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
            }
            .sidebar-title { margin-bottom: 0; margin-right: 8px; }
            .timeline-month { margin-bottom: 0; }
            .month-label { display: none; }
            .month-items {
                border-left: none; padding-left: 0;
                display: flex; flex-wrap: wrap; gap: 4px;
            }
            .content-area { padding: 20px 16px 40px; border-right: none; }
        }
    </style>
</head>
<body>
<div class="top-bar">
    <div class="brand">🤖 <span>AI 日报</span></div>
    ${latestDate ? `<div class="date-badge">📅 ${latestDate}</div>` : ''}
</div>
<div class="main-layout">
    <div class="content-area">
        ${latestDate ? `<div class="content-date-tag">📌 最新 · ${latestDate} ${getWeekDay(latestDate)}</div>` : ''}
        <div class="markdown-body">
            ${latestHtml}
        </div>
        <div class="content-footer">
            自动生成 by <a href="https://github.com/ilovetochangetheworld/ai-daily-report">AI Daily Report</a> · Powered by GitHub Actions
        </div>
    </div>
    <div class="sidebar">
        <div class="sidebar-title">📅 归档</div>
        ${timelineHtml || '<div style="color:#484f58;font-size:0.85em;padding:8px;">暂无归档</div>'}
    </div>
</div>
</body>
</html>`;

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('✓ 已生成 index.html（首页阅读模式）');
}

/**
 * 生成中文目录页 —— 简化版，只有列表
 */
function generateZhIndex() {
    const zhDir = path.join(OUTPUT_BASE, 'zh');
    if (!fs.existsSync(zhDir)) {
        fs.mkdirSync(zhDir, { recursive: true });
    }

    const years = fs.readdirSync(zhDir).filter(f => /^\d{4}$/.test(f));
    let items = [];
    for (const year of years.sort().reverse()) {
        const yearDir = path.join(zhDir, year);
        const files = fs.readdirSync(yearDir)
            .filter(f => f.endsWith('.html'))
            .sort().reverse();
        for (const file of files) {
            const date = file.replace('.html', '');
            items.push({ year, file, date });
        }
    }

    const listHtml = items.length > 0
        ? items.map(item => `<li><a href="./${item.year}/${item.file}"><span class="date-label">${item.date}</span><br>AI 日报 ${item.date}</a></li>`).join('\n')
        : '<li><p>暂无日报，请等待 GitHub Actions 自动生成。</p></li>';

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 日报 — 归档</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
        .container { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
        h1 { font-size: 2em; margin-bottom: 8px; }
        h1 span { background: linear-gradient(135deg, #58a6ff, #f78166); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .back { display: inline-block; margin: 20px 0; color: #58a6ff; text-decoration: none; font-size: 0.95em; }
        .back:hover { text-decoration: underline; }
        ul { list-style: none; }
        li { margin: 12px 0; }
        li a { display: block; background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px 20px; color: #e6edf3; text-decoration: none; transition: all .2s; }
        li a:hover { border-color: #58a6ff; background: #1c2333; }
        li a .date-label { color: #8b949e; font-size: 0.85em; }
        footer { text-align: center; margin-top: 48px; padding: 20px 0; border-top: 1px solid #21262d; color: #484f58; font-size: 0.85em; }
    </style>
</head>
<body>
<div class="container">
    <h1>📥 <span>日报归档</span></h1>
    <a class="back" href="../">← 返回首页</a>
    <ul>
        ${listHtml}
    </ul>
    <footer>Powered by <a href="https://github.com/ilovetochangetheworld/ai-daily-report" style="color:#58a6ff">AI Daily Report</a></footer>
</div>
</body>
</html>`;

    fs.writeFileSync(path.join(zhDir, 'index.html'), html, 'utf8');
    console.log('✓ 已生成 zh/index.html');
}

/**
 * 获取星期几
 */
function getWeekDay(dateStr) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d = new Date(dateStr + 'T00:00:00+08:00');
    return days[d.getDay()];
}

module.exports = { saveReport, generateIndex, generateZhIndex };
