/**
 * 小红书发布模块
 * - 从完整日报中提取精华，生成适合小红书的专业分析版
 * - 自动生成封面图
 * - 通过 xhs-cli 发布
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm');

/**
 * 从完整日报 Markdown 提取小红书版本
 * 使用 LLM 做专业化的内容提炼，遵循 humanizer 原则去 AI 味
 */
async function generateXhsContent(fullMarkdown, date) {
    const systemPrompt = `你是资深科技分析师，负责把一份 AI 日报精炼成小红书版帖子。

核心要求：
1. 专业性优先——不是卖萌流水账，是有立场的分析
2. 每条都带观点，不是中性的信息搬运
3. 语气像在跟懂行的朋友聊天，不是写公关稿
4. 去掉所有 AI 味：不要「核心判断」「反向视角」「实战建议」这类模板标签，不要过度加粗，不要规则三排列
5. 选最有讨论价值的 5-6 条，每条 2-4 句话说到位
6. 末尾加数据来源统计和话题标签
7. 总字数控制在 600-800 字（小红书正文上限约1000字）
8. 开头一句话点题，不要寒暄

输出纯文本，不要 Markdown 标题语法（#），用数字编号即可。`;

    const userPrompt = `以下是 ${date} 的 AI 日报完整内容，请生成小红书版：

${fullMarkdown}`;

    try {
        const content = await callLLM(systemPrompt, userPrompt, { maxTokens: 4000 });
        return content.trim();
    } catch (error) {
        console.error('  ⚠ LLM生成小红书版失败，使用降级方案:', error.message);
        return generateXhsContentFallback(fullMarkdown, date);
    }
}

/**
 * 降级方案：从完整日报手动提取精华段落
 */
function generateXhsContentFallback(fullMarkdown, date) {
    // 提取每个 ## 段落的第一个 ### 子标题和第一段
    const sections = fullMarkdown.split(/(?=^## )/m);
    const picks = [];

    for (const section of sections) {
        const titleMatch = section.match(/^## .+\n\n### (\d+\.?\s*.+)/m);
        const bodyMatch = section.match(/^### .+\n\n\*\*(.+?)\*\*/m);
        if (titleMatch && bodyMatch) {
            picks.push(`${picks.length + 1}｜${titleMatch[1]}\n${bodyMatch[1]}`);
        }
        if (picks.length >= 6) break;
    }

    const lines = fullMarkdown.split('\n');
    const sources = (lines[lines.length - 1] || '').replace(/^\*数据来源：/, '').replace(/\*$/, '');

    let content = `AI 日报 · ${date}\n\n`;
    content += `今日 ${picks.length} 条值得细看。\n\n`;
    content += picks.join('\n\n');
    content += `\n\n数据：${sources}`;
    content += '\n\n#AI日报 #大模型 #AI行业趋势 #开源AI #AIAgent';

    return content;
}

/**
 * 生成封面图
 */
function generateCover(date, topics, outputPath) {
    // 尝试用 Pillow
    try {
        const script = `
from PIL import Image, ImageDraw, ImageFont
import os, sys

W, H = 1080, 1440
img = Image.new('RGB', (W, H), '#1a1a2e')
draw = ImageDraw.Draw(img)

# Subtle gradient background
for y in range(H):
    r = int(26 + y * 10 / H)
    g = int(26 + y * 6 / H)
    b = int(46 + y * 18 / H)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Top accent bar
draw.rectangle([(0, 0), (W, 6)], fill='#e94560')

# Try loading Chinese font
font_candidates = [
    os.path.expanduser('~/fonts/SimHei.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
]

font_title = None
for fp in font_candidates:
    if os.path.exists(fp):
        try:
            font_title = ImageFont.truetype(fp, 80)
            font_sub = ImageFont.truetype(fp, 38)
            font_small = ImageFont.truetype(fp, 30)
            break
        except:
            pass

if font_title is None:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_small = ImageFont.load_default()

# Title
draw.text((80, 180), "AI 日报", fill='#e94560', font=font_title)
draw.text((80, 290), "${date}", fill='#aaaaaa', font=font_sub)

# Divider
draw.rectangle([(80, 370), (W-80, 374)], fill='#e94560')

topics = ${JSON.stringify(topics)}
y_start = 430
for i, t in enumerate(topics):
    y = y_start + i * 95
    num = f"{i+1:02d}"
    draw.text((80, y), num, fill='#e94560', font=font_sub)
    draw.text((165, y+3), t, fill='#eaeaea', font=font_sub)

# Divider
draw.rectangle([(80, 1060), (W-80, 1063)], fill='#333355')

# Bottom
draw.text((80, 1100), "深度分析 · 专业视角 · 每日更新", fill='#606080', font=font_small)

img.save("${outputPath.replace(/\\/g, '/')}", quality=95)
print("OK")
`;
        const result = execSync(`python3 -c ${JSON.stringify(script)}`, {
            encoding: 'utf8',
            timeout: 30000,
        }).trim();

        if (result === 'OK' && fs.existsSync(outputPath)) {
            return true;
        }
    } catch (e) {
        console.log('  ⚠ Pillow封面图生成失败:', e.message?.substring(0, 100));
    }

    // Fallback: 生成纯色封面
    try {
        const script = `
const { createCanvas } = require('canvas');
`.trim();
        // 用简单方式生成一个纯色PNG
        const { createCanvas } = (() => {
            try { return require('canvas'); } catch { return { createCanvas: null }; }
        })();

        if (!createCanvas) {
            // 最后的备用：生成最小的有效 PNG
            const minimalPng = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAABQAAAASQCAYAAADTexfdAAAAAXNSR0IArs4c6QAAABl0RVh0U29mdHdhcmUATWljcm9zb2Z0IE9mZmljZX/tNXEAAABBSURBVHja7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeDMINaAAFxtwO8AAAAAElFTkSuQmCC',
                'base64'
            );
            fs.writeFileSync(outputPath, minimalPng);
            return true;
        }
    } catch (e) {
        console.log('  ⚠ Canvas封面图生成失败:', e.message?.substring(0, 100));
    }

    return false;
}

/**
 * 发布到小红书
 */
async function publishToXhs({ date, fullMarkdown, signals }) {
    console.log('\n📕 小红书发布流程...');

    // 1. 生成小红书版内容
    console.log('  → 生成小红书版内容...');
    const xhsContent = await generateXhsContent(fullMarkdown, date);
    console.log(`  ✓ 内容生成完成 (${xhsContent.length} 字)`);

    // 2. 生成封面图
    const coverDir = path.join(path.resolve(__dirname, '../..'), 'xhs_covers');
    fs.mkdirSync(coverDir, { recursive: true });
    const coverPath = path.join(coverDir, `xhs_cover_${date}.png`);

    // 提取话题关键词作为封面内容
    const topicList = xhsContent.split('\n')
        .filter(l => /^\d+｜/.test(l.trim()))
        .map(l => l.replace(/^\d+｜/, '').substring(0, 30));

    console.log('  → 生成封面图...');
    const coverOk = generateCover(date, topicList.length > 0 ? topicList : ['AI日报'], coverPath);

    if (!coverOk || !fs.existsSync(coverPath)) {
        console.log('  ⚠ 封面图生成失败，跳过小红书发布');
        return null;
    }
    console.log(`  ✓ 封面图就绪: ${coverPath}`);

    // 3. 发布
    const title = `AI日报·${date}`;
    console.log(`  → 发布到小红书: ${title}`);

    try {
        // 提取前30字作为搜索话题
        const firstTopic = topicList[0] || 'AI日报';
        const result = execSync(
            `xhs post --title ${JSON.stringify(title)} --body ${JSON.stringify(xhsContent)} --images ${JSON.stringify(coverPath)} --topic ${JSON.stringify(firstTopic)} --json`,
            { encoding: 'utf8', timeout: 120000 }
        );

        const parsed = JSON.parse(result);
        if (parsed.ok) {
            console.log(`  ✓ 小红书发布成功！笔记ID: ${parsed.data?.id}`);
            return parsed.data;
        } else {
            console.log(`  ✗ 小红书发布失败:`, JSON.stringify(parsed));
            return null;
        }
    } catch (error) {
        console.error('  ✗ 小红书发布异常:', error.message?.substring(0, 200));
        return null;
    }
}

module.exports = { publishToXhs, generateXhsContent, generateCover };
