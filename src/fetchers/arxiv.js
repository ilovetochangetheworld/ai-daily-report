/**
 * arXiv Fetcher
 * 通过 arXiv Atom API 获取最新 AI 相关论文
 * 公开 API，零配置，无需 API Key
 * 
 * 支持分类：
 * - cs.AI (Artificial Intelligence)
 * - cs.CL (Computation and Language / NLP)
 * - cs.CV (Computer Vision)
 * - cs.LG (Machine Learning)
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

const ARXIV_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.CV', 'cs.LG'];

class ArxivFetcher extends BaseFetcher {
    constructor() {
        super('arXiv');
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0 (mailto:dev@example.com)',
                'Accept': 'application/atom+xml',
            },
        });
    }

    async fetch() {
        const signals = [];

        // 按分类查询最新论文（arXiv 不支持 submittedDate 筛选，按分类最新排序）
        for (const cat of ARXIV_CATEGORIES) {
            try {
                const url = `https://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=15`;
                const resp = await this.client.get(url);
                const entries = this.parseAtomEntries(resp.data);

                const now = new Date();
                const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

                for (const entry of entries) {
                    const pubDate = entry.published ? new Date(entry.published) : now;
                    if (pubDate < fiveDaysAgo) continue;

                    signals.push({
                        id: `arxiv-${entry.id.replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`,
                        title: entry.title.slice(0, 120),
                        url: entry.id.replace('http://', 'https://'),
                        source: 'arXiv',
                        category: 'paper',
                        published_date: entry.published || now.toISOString(),
                        score: 55,
                        summary: entry.summary.slice(0, 400),
                        metadata: {
                            authors: entry.authors.slice(0, 200),
                            categories: entry.categories,
                            pdf_url: entry.pdfUrl,
                            primary_category: cat,
                        },
                    });
                }

                console.log(`    ✓ arXiv [${cat}]: ${entries.length} 条`);
                // API 限速：3秒间隔
                await new Promise(r => setTimeout(r, 2500));

            } catch (error) {
                console.error(`    ✗ arXiv [${cat}] 失败: ${error.message}`);
            }
        }

        // 去重
        const unique = new Map();
        for (const s of signals) {
            if (!unique.has(s.id)) unique.set(s.id, s);
        }
        console.log(`    ✓ arXiv 总计: ${unique.size} 条去重后`);
        return Array.from(unique.values());
    }

    parseAtomEntries(xml) {
        const entries = [];
        // 简易 XML 解析（避免额外依赖）
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
            const block = match[1];

            const id = this.extractTag(block, 'id').replace('http://', 'https://');
            const title = this.extractTag(block, 'title').replace(/\s+/g, ' ').trim();
            const summary = this.extractTag(block, 'summary').replace(/\s+/g, ' ').trim();
            const published = this.extractTag(block, 'published');

            // 提取作者
            const authorNames = [];
            const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g;
            let authorMatch;
            while ((authorMatch = authorRegex.exec(block)) !== null) {
                authorNames.push(authorMatch[1].trim());
            }

            // 提取分类
            const categories = [];
            const catRegex = /<category\s+term="([^"]+)"/g;
            let catMatch;
            while ((catMatch = catRegex.exec(block)) !== null) {
                categories.push(catMatch[1]);
            }

            // 提取 PDF 链接
            let pdfUrl = '';
            const pdfMatch = block.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
            if (pdfMatch) pdfUrl = pdfMatch[1].replace('http://', 'https://');

            entries.push({
                id,
                title,
                summary,
                published,
                authors: authorNames.join(', '),
                categories,
                pdfUrl,
            });
        }

        return entries;
    }

    extractTag(xml, tagName) {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
        const match = xml.match(regex);
        return match ? match[1].trim() : '';
    }
}

module.exports = { ArxivFetcher };
