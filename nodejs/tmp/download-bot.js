// 下载 Linux 版本的 bot 文件
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadBot() {
    const url = 'https://amd64.ssss.nyc.mn/2go';
    const filePath = path.join(__dirname, 'bot');
    
    console.log('正在下载 Linux 版本的 bot 文件...');
    console.log('下载地址:', url);
    console.log('保存路径:', filePath);
    
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 60000
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 设置执行权限
        fs.chmodSync(filePath, 0o755);
        
        console.log('✅ Linux 版本的 bot 文件下载完成');
        console.log('文件大小:', fs.statSync(filePath).size, 'bytes');
        
    } catch (error) {
        console.error('❌ 下载失败:', error.message);
        process.exit(1);
    }
}

downloadBot();
