/**
 * 日报渲染器 - 支持 Markdown→HTML 自动渲染
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const OUTPUT_BASE = path.join(__dirname, '..');

function saveReport(markdown, lang, date) {
    const dir = path.join(OUTPUT_BASE, lang, date.substring(0, 4));
    fs.mkdirSync(dir, { recursive: true });

    const filename = lang === 'zh' ? `${date}.md` : `today.md`;
    const outputPath = path.join(dir, filename);
    fs.writeFileSync(outputPath, markdown, 'utf8');

    // Also create latest link for English
    if (lang === 'en') {
        const todayPath = path.join(OUTPUT_BASE, 'en', 'today.md');
        fs.writeFileSync(todayPath, markdown, 'utf8');
    }

    // 同时渲染 HTML 版本，确保 .md 和 .html 内容一致
    const htmlFilename = lang === 'zh' ? `${date}.html` : `today.html`;
    const htmlPath = path.join(dir, htmlFilename);
    const htmlContent = renderMarkdownToFullHtml(markdown, lang, date);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`✓ 已生成 ${lang}/${date.substring(0, 4)}/${filename} + HTML 版本`);

    return outputPath;
}

/**
 * 将 Markdown 渲染为完整的 HTML 页面
 */
function renderMarkdownToFullHtml(markdown, lang, date) {
    const isZh = lang === 'zh';
    const htmlContent = marked.parse(markdown);

    return `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isZh ? 'AI 日报' : 'AI Daily Report'} ${date}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
            background: #0d1117; color: #c9d1d9; line-height: 1.7;
        }
        .container { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
        .back { display: inline-block; margin-bottom: 24px; color: ${isZh ? '#58a6ff' : '#f78166'}; text-decoration: none; font-size: 0.95em; }
        .back:hover { text-decoration: underline; }
        .markdown-body {
            background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px;
        }
        .markdown-body h1 { color: #e6edf3; font-size: 1.8em; margin: 0 0 16px 0; border-bottom: 1px solid #21262d; padding-bottom: 12px; }
        .markdown-body h2 { color: #e6edf3; font-size: 1.35em; margin: 28px 0 12px 0; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
        .markdown-body h3 { color: #e6edf3; font-size: 1.1em; margin: 20px 0 8px 0; }
        .markdown-body h4 { color: #e6edf3; font-size: 1em; margin: 16px 0 6px 0; }
        .markdown-body p { margin: 10px 0; }
        .markdown-body blockquote {
            border-left: 3px solid ${isZh ? '#1f6feb' : '#f78166'};
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
        .markdown-body img { max-width: 100%; border-radius: 8px; }
        footer {
            text-align: center; margin-top: 40px; padding: 20px 0;
            border-top: 1px solid #21262d; color: #484f58; font-size: 0.85em;
        }
        footer a { color: ${isZh ? '#58a6ff' : '#f78166'}; text-decoration: none; }
    </style>
</head>
<body>
<div class="container">
    <a class="back" href="${isZh ? '../../zh/' : '../en/'}">← ${isZh ? '返回中文日报列表' : 'Back to English Daily'}</a>
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

function generateIndex() {
    const indexPath = path.join(OUTPUT_BASE, 'index.html');
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 AI 日报 — 每日 AI 行业洞察</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
        .container { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
        .hero { text-align: center; margin-bottom: 48px; }
        .hero h1 { font-size: 2.4em; margin-bottom: 12px; }
        .hero h1 span { background: linear-gradient(135deg, #58a6ff, #f78166); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .hero p { color: #8b949e; font-size: 1.1em; max-width: 540px; margin: 0 auto; }
        .nav-links { display: flex; justify-content: center; gap: 16px; margin: 32px 0; }
        .nav-links a { display: inline-flex; align-items: center; gap: 6px; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: all .2s; }
        .nav-zh { background: #1f6feb22; color: #58a6ff; border: 1px solid #1f6feb44; }
        .nav-zh:hover { background: #1f6feb44; }
        .nav-en { background: #f7816622; color: #f78166; border: 1px solid #f7816644; }
        .nav-en:hover { background: #f7816644; }
        .section-title { font-size: 1.4em; margin-bottom: 20px; color: #e6edf3; border-bottom: 1px solid #21262d; padding-bottom: 12px; }
        footer { text-align: center; margin-top: 60px; padding: 24px 0; border-top: 1px solid #21262d; color: #484f58; font-size: 0.85em; }
        footer a { color: #58a6ff; text-decoration: none; }
    </style>
</head>
<body>
<div class="container">
    <div class="hero">
        <h1>🤖 <span>AI 日报</span></h1>
        <p>每日自动聚合全球 AI 行业动态 — 产品更新、前沿研究、开源项目、AI Coding、社媒热议、行业展望</p>
    </div>
    <div class="nav-links">
        <a class="nav-zh" href="./zh/">📥 中文日报</a>
        <a class="nav-en" href="./en/">🇬🇧 English Daily</a>
    </div>
    <footer>
        自动生成 by <a href="https://github.com/ilovetochangetheworld/ai-daily-report">AI Daily Report</a> · Powered by GitHub Actions
    </footer>
</div>
</body>
</html>`;

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('✓ 已生成 index.html');
}

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
    <title>AI 日报 — 中文</title>
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
    <h1>📥 <span>中文日报</span></h1>
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

function generateEnIndex() {
    const enDir = path.join(OUTPUT_BASE, 'en');
    if (!fs.existsSync(enDir)) {
        fs.mkdirSync(enDir, { recursive: true });
    }

    const years = fs.readdirSync(enDir).filter(f => /^\d{4}$/.test(f));

    let items = [];
    for (const year of years.sort().reverse()) {
        const yearDir = path.join(enDir, year);
        if (!fs.existsSync(yearDir)) continue;
        const files = fs.readdirSync(yearDir)
            .filter(f => f.endsWith('.html'))
            .sort().reverse();

        for (const file of files) {
            const date = file.replace('.html', '');
            items.push({ year, file, date });
        }
    }
    // Also check for today.html at root level
    if (fs.existsSync(path.join(enDir, 'today.html'))) {
        const stat = fs.statSync(path.join(enDir, 'today.html'));
        items.unshift({ year: '', file: 'today.html', date: new Date(stat.mtime).toISOString().split('T')[0] });
    }

    const listHtml = items.length > 0
        ? items.map(item => `<li><a href="./${item.file}"><span class="date-label">${item.date}</span><br>AI Daily Report ${item.date}</a></li>`).join('\n')
        : '<li><p>No reports yet. Waiting for GitHub Actions.</p></li>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Daily Report — English</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
        .container { max-width: 860px; margin: 0 auto; padding: 40px 20px; }
        h1 { font-size: 2em; margin-bottom: 8px; }
        h1 span { background: linear-gradient(135deg, #f78166, #58a6ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .back { display: inline-block; margin: 20px 0; color: #f78166; text-decoration: none; font-size: 0.95em; }
        .back:hover { text-decoration: underline; }
        ul { list-style: none; }
        li { margin: 12px 0; }
        li a { display: block; background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px 20px; color: #e6edf3; text-decoration: none; transition: all .2s; }
        li a:hover { border-color: #f78166; background: #1c2333; }
        li a .date-label { color: #8b949e; font-size: 0.85em; }
        footer { text-align: center; margin-top: 48px; padding: 20px 0; border-top: 1px solid #21262d; color: #484f58; font-size: 0.85em; }
    </style>
</head>
<body>
<div class="container">
    <h1>🇬🇧 <span>English Daily</span></h1>
    <a class="back" href="../">← Back to Home</a>
    <ul>
        ${listHtml}
    </ul>
    <footer>Powered by <a href="https://github.com/ilovetochangetheworld/ai-daily-report" style="color:#f78166">AI Daily Report</a></footer>
</div>
</body>
</html>`;

    fs.writeFileSync(path.join(enDir, 'index.html'), html, 'utf8');
    console.log('✓ 已生成 en/index.html');
}

module.exports = { saveReport, generateIndex, generateZhIndex, generateEnIndex };
