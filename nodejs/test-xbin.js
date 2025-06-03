// 测试 xbin 上传功能
const axios = require('axios');

// 模拟 xbin 上传功能
async function testXbinUpload() {
    const BINURL = 'https://httpbin.org';
    const BINPATH = '/post';
    const BINPWD = 'test-password';
    
    const deploymentInfo = {
        uuid: 'test-uuid-123',
        domain: 'test.example.com',
        port: 3000,
        selectUrl: `http://test.example.com:3000/test-uuid-123/select`,
        configUrl: `http://test.example.com:3000/test-uuid-123`,
        timestamp: new Date().toISOString(),
        hostname: require('os').hostname(),
        platform: require('os').platform(),
        arch: require('os').arch()
    };

    try {
        console.log('开始测试 xbin 上传功能...');
        console.log('上传数据:', JSON.stringify(deploymentInfo, null, 2));
        
        const uploadData = {
            password: BINPWD,
            data: deploymentInfo
        };

        const response = await axios.post(`${BINURL}${BINPATH}`, uploadData, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'NodeJS-VLESS-Client/1.1.0'
            },
            timeout: 10000
        });

        if (response.status === 200) {
            console.log('✅ xbin 上传测试成功');
            console.log('响应状态:', response.status);
            console.log('响应数据:', JSON.stringify(response.data, null, 2));
        } else {
            console.log('❌ xbin 上传测试失败，状态码:', response.status);
        }
    } catch (error) {
        console.error('❌ xbin 上传测试失败:', error.message);
    }
}

// 运行测试
testXbinUpload();
