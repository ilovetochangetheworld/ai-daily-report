/**
 * Hugging Face 抓取器
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

class HuggingFaceFetcher extends BaseFetcher {
    constructor() {
        super('HuggingFace');
        this.client = axios.create({
            baseURL: 'https://huggingface.co',
            timeout: 10000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0',
            },
        });
    }

    async fetch() {
        const signals = [];
        
        try {
            const modelsResponse = await this.client.get('/api/models', {
                params: {
                    sort: 'likes',
                    direction: '-1',
                    limit: 30,
                    filter: 'pipeline_tag:text-generation,pipeline_tag:image-text-to-text',
                },
            });

            const models = modelsResponse.data || [];
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            for (const model of models.slice(0, 15)) {
                const lastModified = new Date(model.lastModified);
                if (lastModified < sevenDaysAgo) continue;
                
                signals.push({
                    id: `hf-model-${model.id.replace('/', '-')}`,
                    title: model.id,
                    url: `https://huggingface.co/${model.id}`,
                    source: 'huggingface',
                    category: 'opensource',
                    published_date: model.lastModified || new Date().toISOString(),
                    score: this.scoreHubItem(model, 'model'),
                    summary: model.cardData?.summary || model.description || '',
                    metadata: {
                        type: 'model',
                        pipeline_tag: model.pipeline_tag,
                        tags: model.tags || [],
                        downloads: model.downloads,
                        likes: model.likes,
                    },
                });
            }
            
        } catch (error) {
            console.error('HuggingFace 模型抓取失败:', error.message);
        }

        try {
            const datasetsResponse = await this.client.get('/api/datasets', {
                params: {
                    sort: 'likes',
                    direction: '-1',
                    limit: 20,
                },
            });

            const datasets = datasetsResponse.data || [];
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            for (const dataset of datasets.slice(0, 10)) {
                const lastModified = new Date(dataset.lastModified);
                if (lastModified < sevenDaysAgo) continue;
                
                signals.push({
                    id: `hf-ds-${dataset.id.replace('/', '-')}`,
                    title: dataset.id,
                    url: `https://huggingface.co/datasets/${dataset.id}`,
                    source: 'huggingface',
                    category: 'opensource',
                    published_date: dataset.lastModified || new Date().toISOString(),
                    score: this.scoreHubItem(dataset, 'dataset'),
                    summary: dataset.description || '',
                    metadata: {
                        type: 'dataset',
                        tags: dataset.tags || [],
                        downloads: dataset.downloads,
                        likes: dataset.likes,
                    },
                });
            }
            
        } catch (error) {
            console.error('HuggingFace 数据集抓取失败:', error.message);
        }

        return signals;
    }

    scoreHubItem(item, type) {
        const likes = item.likes || 0;
        const downloads = item.downloads || 0;
        const lastModified = item.lastModified ? new Date(item.lastModified) : new Date(0);
        const daysSinceUpdate = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
        const tags = (item.tags || []).join(' ').toLowerCase();

        let score = type === 'model' ? 42 : 36;
        score += Math.min(Math.log10(Math.max(likes, 1)) * 10, 24);
        score += Math.min(Math.log10(Math.max(downloads, 1)) * 6, 20);
        score += daysSinceUpdate <= 2 ? 12 : daysSinceUpdate <= 7 ? 6 : 0;
        if (/(text-generation|image-text-to-text|agents|conversational|reinforcement-learning)/i.test(`${item.pipeline_tag || ''} ${tags}`)) {
            score += 6;
        }
        if (/(eval|benchmark|dataset|preference|reasoning|agent|tool)/i.test(tags)) {
            score += 4;
        }

        return Math.max(10, Math.min(Math.round(score), 90));
    }
}

module.exports = { HuggingFaceFetcher };
