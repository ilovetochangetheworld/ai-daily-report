/**
 * 列出 API 可用模型 - 用于调试
 */
const OpenAI = require('openai');

async function listModels() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.lkeap.cloud.tencent.com/plan/v3';
    
    if (!apiKey) {
        console.error('OPENAI_API_KEY 未设置');
        process.exit(1);
    }
    
    console.log('Base URL:', baseURL);
    console.log('API Key prefix:', apiKey.substring(0, 8) + '...');
    
    const client = new OpenAI({ apiKey, baseURL });
    
    try {
        const models = await client.models.list();
        console.log('\n=== 可用模型列表 ===');
        for await (const model of models) {
            console.log(`  - ${model.id}`);
        }
    } catch (error) {
        console.error('获取模型列表失败:', error.message);
        if (error.error) console.error('Error body:', JSON.stringify(error.error));
        
        // 尝试直接调用一个简单的请求测试模型
        console.log('\n=== 尝试直接测试模型 ===');
        const testModels = ['GLM-5.1', 'glm-5.1', 'glm-4-flash', 'hunyuan-lite', 'hunyuan-turbo', 'deepseek-v3'];
        for (const m of testModels) {
            try {
                const resp = await client.chat.completions.create({
                    model: m,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 5,
                });
                console.log(`  ✅ ${m}: 可用`);
            } catch (e) {
                console.log(`  ❌ ${m}: ${e.status} ${e.error?.message || e.message}`);
            }
        }
    }
}

listModels();
