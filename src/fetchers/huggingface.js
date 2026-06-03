/**
 * Hugging Face 抓取器
 * 抓取最近 7 天热门模型和数据集
 */

import axios from 'axios';
import { BaseFetcher } from './base.js';

export class HuggingFaceFetcher extends BaseFetcher {
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
            // 抓取热门模型（按点赞数排序）
            const modelsResponse = await this.client.get('/api/models', {
                params: {
                    sort: 'likes',
                    direction: '-1',
                    limit: 30,
                    filter: 'pipeline_tag:text-generation,pipeline_tag:image-text-to-text',
                },
            });

            const models = modelsResponse.data || [];
            
            for (const model of models.slice(0, 15)) {
                // 检查模型是否最近更新（7天内）
                const lastModified = new Date(model.lastModified);
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                
                if (lastModified < sevenDaysAgo) continue;
                
                signals.push({
                    id: `hf-model-${model.id.replace('/', '-')}`,
                    title: model.id,
                    url: `https://huggingface.co/${model.id}`,
                    source: 'huggingface',
                    category: 'project',
                    published_date: model.lastModified || new Date().toISOString(),
                    score: model.likes || 0,
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
            // 抓取热门数据集
            const datasetsResponse = await this.client.get('/api/datasets', {
                params: {
                    sort: 'likes',
                    direction: '-1',
                    limit: 20,
                },
            });

            const datasets = datasetsResponse.data || [];
            
            for (const dataset of datasets.slice(0, 10)) {
                const lastModified = new Date(dataset.lastModified);
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                
                if (lastModified < sevenDaysAgo) continue;
                
                signals.push({
                    id: `hf-ds-${dataset.id.replace('/', '-')}`,
                    title: dataset.id,
                    url: `https://huggingface.co/datasets/${dataset.id}`,
                    source: 'huggingface',
                    category: 'paper', // 数据集归类为paper类
                    published_date: dataset.lastModified || new Date().toISOString(),
                    score: dataset.likes || 0,
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
}
