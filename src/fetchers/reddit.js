/**
 * Reddit 抓取器
 * 抓取多个 AI 相关 subreddit 的热门帖子
 */

import axios from 'axios';
import { BaseFetcher } from './base.js';

export class RedditFetcher extends BaseFetcher {
    constructor() {
        super('Reddit');
        this.client = axios.create({
            baseURL: 'https://www.reddit.com',
            timeout: 10000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0 (by /u/your_username)',
            },
        });
        
        // AI 相关 subreddit
        this.subreddits = [
            'MachineLearning',
            'artificial',
            'OpenAI',
            'LanguageTechnology',
            'ComputerVision',
            'deeplearning',
            'LocalLLaMA',
            'ChatGPT',
            'ClaudeAI',
        ];
    }

    async fetch() {
        const signals = [];
        
        for (const subreddit of this.subreddits) {
            try {
                const response = await this.client.get(`/r/${subreddit}/hot.json`, {
                    params: { limit: 25 },
                });
                
                const posts = response.data?.data?.children || [];
                
                for (const { data: post } of posts) {
                    if (post.score < 30) continue; // 过滤低分帖子
                    if (post.stickied) continue; // 跳过置顶帖
                    
                    // 检查是否与 AI 相关（标题或正文）
                    const isAI = this._isAIRelated(post.title, post.selftext);
                    if (!isAI) continue;
                    
                    signals.push({
                        id: `reddit-${post.id}`,
                        title: post.title,
                        url: `https://www.reddit.com${post.permalink}`,
                        source: 'reddit',
                        category: 'discussion',
                        published_date: new Date(post.created_utc * 1000).toISOString(),
                        score: post.score,
                        summary: post.selftext?.substring(0, 300) || '',
                        metadata: {
                            subreddit: subreddit,
                            comments: post.num_comments,
                            author: post.author,
                            flair: post.link_flair_text,
                        },
                    });
                }
                
            } catch (error) {
                console.error(`Reddit /r/${subreddit} 抓取失败:`, error.message);
            }
        }

        return signals;
    }

    /**
     * 判断帖子是否与 AI 相关
     */
    _isAIRelated(title, text) {
        const aiKeywords = [
            'ai', 'llm', 'gpt', 'claude', 'gemini', 'model', 'training',
            'neural', 'transformer', 'diffusion', 'stable diffusion', 'midjourney',
            'anthropic', 'openai', 'hugging face', 'agent', 'rag', 'embedding',
            'fine-tuning', 'prompt', 'chatbot', 'machine learning',
        ];
        
        const content = `${title} ${text || ''}`.toLowerCase();
        return aiKeywords.some(kw => content.includes(kw));
    }
}
