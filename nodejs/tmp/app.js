const os = require('os');
const http = require('http');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 检查Node.js版本
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
if (majorVersion < 20) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️ 警告: 您正在使用Node.js ' + nodeVersion);
  console.log('\x1b[33m%s\x1b[0m', '建议使用Node.js 20或更高版本以获得最佳体验和性能');
  console.log('\x1b[36m%s\x1b[0m', '升级指南:');
  console.log('\x1b[36m%s\x1b[0m', '1. 使用nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install 20');
  console.log('\x1b[36m%s\x1b[0m', '2. 或官方安装包: https://nodejs.org/en/download/');
  console.log('\x1b[33m%s\x1b[0m', '将尝试继续运行，但可能会遇到兼容性问题...\n');
}

// 在 Docker 环境中，依赖已经预安装，直接导入
const axios = require('axios');

const { WebSocket, createWebSocketStream } = require('ws');
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const NAME = process.env.NAME || os.hostname();

// Argo 隧道相关环境变量
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const FILE_PATH = process.env.FILE_PATH || './tmp';

// xbin 粘贴板配置（可选）
const BINURL = process.env.BINURL || '';
const BINPATH = process.env.BINPATH || '';
const BINPWD = process.env.BINPWD || '';
console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
console.log("Cloudflare一键无交互Vless代理脚本");
console.log("当前版本：V1.0.0");
console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
async function getVariableValue(variableName, defaultValue) {
    const envValue = process.env[variableName];
    if (envValue) {
        return envValue;
    }
    if (defaultValue) {
        return defaultValue;
    }
  let input = '';
  while (!input) {
    input = await ask(`请输入${variableName}: `);
    if (!input) {
      console.log(`${variableName}不能为空，请重新输入!`);
    }
  }
  return input;
}
function ask(question) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}
async function main() {
    const UUID = await getVariableValue('UUID', ''); // 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
    console.log('你的UUID:', UUID);

    const PORT = await getVariableValue('PORT', '');// 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
    console.log('你的端口:', PORT);

    let DOMAIN;
    let useArgo = false;

    // 检查是否使用 Argo 隧道
    if (PORT === '0') {
        console.log('检测到端口为0，启用 Argo 隧道模式');
        useArgo = true;

        // 创建运行目录
        if (!fs.existsSync(FILE_PATH)) {
            fs.mkdirSync(FILE_PATH, { recursive: true });
            console.log(`${FILE_PATH} 目录已创建`);
        }

        // 先设置一个临时域名，稍后会被 Argo 隧道域名替换
        DOMAIN = 'temp-domain.trycloudflare.com';
    } else {
        DOMAIN = await getVariableValue('DOMAIN', '');// 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
        console.log('你的域名:', DOMAIN);
    }

    // 从API获取优选IP列表
    let apiData = await fetchApiData();
    let lastUpdateTime = new Date().toLocaleString();

    // 设置定时任务，每10分钟更新一次API数据
    const updateInterval = 10 * 60 * 1000; // 10分钟，单位为毫秒
    setInterval(async () => {
        console.log('定时更新API数据...');
        try {
            const newApiData = await fetchApiData();
            apiData = newApiData; // 更新全局变量
            lastUpdateTime = new Date().toLocaleString();
            console.log(`API数据已更新，当前共有 ${apiData.length} 个API IP，更新时间: ${lastUpdateTime}`);
        } catch (error) {
            console.error('定时更新API数据失败:', error);
        }
    }, updateInterval);
    console.log(`已设置定时任务，每 ${updateInterval / 60000} 分钟更新一次API数据`);

    const httpServer = http.createServer((req, res) => {
        try {
            // 解析URL和查询参数
            const url = new URL(req.url, `http://${req.headers.host}`);
            const path = url.pathname;
            const isBase64 = url.searchParams.has('base64') || url.searchParams.has('b64');

            console.log(`收到请求: ${req.url}, 路径: ${path}, Base64: ${isBase64}`);

            if (path === '/') {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                const statsInfo = `Hello, World \nAPI IP数量: ${apiData.length}\n最后更新时间: ${lastUpdateTime}`;
                res.end(statsInfo);
            } else if (path === `/${UUID}`) {
                let vlessURL;
                // 定义域名列表和对应的名称列表
                const domainList = [
                    // 基本地址
                    { domain: DOMAIN, name: `Vl-ws-tls-${NAME}` },
                    // Cloudflare IP地址
                    { domain: "104.16.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.17.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.18.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.19.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.20.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.21.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.22.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.24.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.25.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.26.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "104.27.0.0", name: `Vl-ws-tls-${NAME}` },
                    { domain: "[2606:4700::]", name: `Vl-ws-tls-${NAME}` },
                    { domain: "[2400:cb00:2049::]", name: `Vl-ws-tls-${NAME}` },
                    // 官方优选
                    { domain: "cf.090227.xyz", name: "三网自适应分流官方优选" },
                    { domain: "ct.090227.xyz", name: "电信官方优选" },
                    { domain: "cmcc.090227.xyz", name: "移动官方优选" },
                    // 官方域名优选
                    { domain: "shopify.com", name: "优选官方域名-shopify" },
                    { domain: "time.is", name: "优选官方域名-time" },
                    { domain: "icook.hk", name: "优选官方域名-icook.hk" },
                    { domain: "icook.tw", name: "优选官方域名-icook.tw" },
                    { domain: "ip.sb", name: "优选官方域名-ip.sb" },
                    { domain: "japan.com", name: "优选官方域名-japan" },
                    { domain: "malaysia.com", name: "优选官方域名-malaysia" },
                    { domain: "russia.com", name: "优选官方域名-russia" },
                    { domain: "singapore.com", name: "优选官方域名-singapore" },
                    { domain: "skk.moe", name: "优选官方域名-skk" },
                    { domain: "www.visa.com.sg", name: "优选官方域名-visa.sg" },
                    { domain: "www.visa.com.hk", name: "优选官方域名-visa.hk" },
                    { domain: "www.visa.com.tw", name: "优选官方域名-visa.tw" },
                    { domain: "www.visa.co.jp", name: "优选官方域名-visa.jp" },
                    { domain: "www.visakorea.com", name: "优选官方域名-visa.kr" },
                    { domain: "www.gco.gov.qa", name: "优选官方域名-gov.qa" },
                    { domain: "www.gov.se", name: "优选官方域名-gov.se" },
                    { domain: "www.gov.ua", name: "优选官方域名-gov.ua" },
                    // 第三方维护
                    { domain: "cfip.xxxxxxxx.tk", name: "OTC提供维护官方优选" },
                    { domain: "bestcf.onecf.eu.org", name: "Mingyu提供维护官方优选" },
                    { domain: "cf.zhetengsha.eu.org", name: "小一提供维护官方优选" },
                    { domain: "xn--b6gac.eu.org", name: "第三方维护官方优选" },
                    { domain: "yx.887141.xyz", name: "第三方维护官方优选" },
                    { domain: "8.889288.xyz", name: "第三方维护官方优选" },
                    { domain: "cfip.1323123.xyz", name: "第三方维护官方优选" },
                    { domain: "cf.515188.xyz", name: "第三方维护官方优选" },
                    { domain: "cf-st.annoy.eu.org", name: "第三方维护官方优选" },
                    { domain: "cf.0sm.com", name: "第三方维护官方优选" },
                    { domain: "cf.877771.xyz", name: "第三方维护官方优选" },
                    { domain: "cf.345673.xyz", name: "第三方维护官方优选" },
                    { domain: "bestproxy.onecf.eu.org", name: "Mingyu提供维护反代优选" },
                    { domain: "proxy.xxxxxxxx.tk", name: "OTC提供维护反代优选" },
                    // 从API获取的IP列表
                    ...apiData
                ];

                // 构建vlessURL
                vlessURL = domainList.map(item =>
                    `vless://${UUID}@${item.domain}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#${item.name}`
                ).join('\n');

                // 检查是否需要Base64编码
                if (isBase64) {
                    console.log('执行Base64编码');
                    vlessURL = Buffer.from(vlessURL).toString('base64');
                    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                    console.log(`返回Base64编码内容，长度: ${vlessURL.length} 字符`);
                    res.end(vlessURL);
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                    console.log(`返回普通文本内容，${domainList.length} 个URL`);
                    res.end(vlessURL + '\n');
                }
            } else if (path.match(new RegExp(`^/[a-zA-Z]{2}/${UUID}$`))) {
                // 处理国家代码请求: /国家代号/UUID
                const countryCode = path.split('/')[1].toUpperCase(); // 获取国家代码
                console.log(`收到国家代码请求: ${countryCode}`);

                // 调用函数获取特定国家的IP和端口
                fetchCountryBestIP(countryCode)
                    .then(ipData => {
                        if (ipData.length === 0) {
                            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`未找到国家代码 ${countryCode} 的数据\n`);
                            return;
                        }

                        // 构造VLESS URL
                        let vlessURL = ipData.map(item =>
                            `vless://${UUID}@${item.ip}:${item.port}?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#${countryCode}-${item.ip}-${item.port}`
                        ).join('\n');

                        // 检查是否需要Base64编码
                        if (isBase64) {
                            console.log('执行Base64编码');
                            vlessURL = Buffer.from(vlessURL).toString('base64');
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回Base64编码内容，长度: ${vlessURL.length} 字符`);
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回国家 ${countryCode} 的普通文本内容，${ipData.length} 个URL`);
                        }
                        res.end(vlessURL);
                    })
                    .catch(error => {
                        console.error(`获取国家 ${countryCode} 的数据失败:`, error.message);
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`获取国家 ${countryCode} 的数据失败: ${error.message}\n`);
                    });
            } else if (path === `/bestip/${UUID}`) {
                // 处理全球最佳IP请求: /bestip/UUID
                console.log(`收到全球最佳IP请求`);

                // 调用函数获取全球最佳IP和端口
                fetchGlobalBestIP()
                    .then(ipData => {
                        if (ipData.length === 0) {
                            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`未找到全球最佳IP数据\n`);
                            return;
                        }

                        // 构造VLESS URL
                        let vlessURL = ipData.map(item => {
                            // 构建节点名称: ip-端口-city-延迟
                            const nodeName = `${item.ip}-${item.port}-${item.city || 'Unknown'}-${item.latency || 'Unknown'}`;
                            return `vless://${UUID}@${item.ip}:${item.port}?encryption=none&security=${item.tls ? 'tls' : 'none'}&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#${nodeName}`;
                        }).join('\n');

                        // 检查是否需要Base64编码
                        if (isBase64) {
                            console.log('执行Base64编码');
                            vlessURL = Buffer.from(vlessURL).toString('base64');
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回Base64编码内容，长度: ${vlessURL.length} 字符`);
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回全球最佳IP的普通文本内容，${ipData.length} 个URL`);
                        }
                        res.end(vlessURL);
                    })
                    .catch(error => {
                        console.error(`获取全球最佳IP数据失败:`, error.message);
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`获取全球最佳IP数据失败: ${error.message}\n`);
                    });
            } else if (path.match(new RegExp(`^/([^/]+)/${UUID}$`))) {
                // 处理地区请求: /地区/UUID (例如 /Europe/UUID)
                const region = path.split('/')[1]; // 获取地区
                console.log(`收到地区请求: ${region}`);

                // 调用函数获取特定地区的IP和端口
                fetchRegionBestIP(region, url.searchParams.has('regex'))
                    .then(ipData => {
                        if (ipData.length === 0) {
                            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`未找到地区 ${region} 的数据\n`);
                            return;
                        }

                        // 构造VLESS URL
                        let vlessURL = ipData.map(item => {
                            // 构建节点名称: ip-端口-city-延迟
                            const nodeName = `${region}-${item.city || 'Unknown'}-${item.latency || 'Unknown'}`;
                            return `vless://${UUID}@${item.ip}:${item.port}?encryption=none&security=${item.tls ? 'tls' : 'none'}&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#${nodeName}`;
                        }).join('\n');

                        // 检查是否需要Base64编码
                        if (isBase64) {
                            console.log('执行Base64编码');
                            vlessURL = Buffer.from(vlessURL).toString('base64');
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回Base64编码内容，长度: ${vlessURL.length} 字符`);
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                            console.log(`返回地区 ${region} 的普通文本内容，${ipData.length} 个URL`);
                        }
                        res.end(vlessURL);
                    })
                    .catch(error => {
                        console.error(`获取地区 ${region} 的数据失败:`, error.message);
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`获取地区 ${region} 的数据失败: ${error.message}\n`);
                    });
            } else if (path === `/${UUID}/select`) {
                // 处理代理URL构造界面请求: /UUID/select
                console.log(`收到代理URL构造界面请求`);

                // 获取统计数据
                fetchStatsData()
                    .then(statsData => {
                        // 返回HTML页面
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

                        // 将国家名称映射到两位国家代码
                        const cityToCountryCode = {
                            'Frankfurt': 'DE', 'Stockholm': 'SE', 'Amsterdam': 'NL', 'Paris': 'FR',
                            'Seoul': 'KR', 'Los Angeles': 'US', 'Warsaw': 'PL', 'London': 'GB',
                            'San Jose': 'US', 'Helsinki': 'FI', 'Tokyo': 'JP', 'Singapore': 'SG',
                            'Hong Kong': 'HK', 'Riga': 'LV', 'Fukuoka': 'JP', 'Ashburn': 'US',
                            'Istanbul': 'TR', 'Toronto': 'CA', 'Madrid': 'ES', 'Portland': 'US',
                            'Zurich': 'CH', 'Düsseldorf': 'DE', 'Seattle': 'US', 'Osaka': 'JP',
                            'Bucharest': 'RO', 'Sofia': 'BG', 'Moscow': 'RU', 'Vienna': 'AT',
                            'Chicago': 'US', 'Sydney': 'AU', 'Mumbai': 'IN', 'Milan': 'IT',
                            'Newark': 'US', 'Buffalo': 'US', 'Tel Aviv': 'IL', 'Dallas': 'US',
                            'Copenhagen': 'DK', 'Montréal': 'CA', 'São Paulo': 'BR', 'Taipei': 'TW',
                            'Chișinău': 'MD', 'Yerevan': 'AM', 'Atlanta': 'US', 'Dublin': 'IE',
                            'Geneva': 'CH', 'Kyiv': 'UA', 'Almaty': 'KZ', 'Budapest': 'HU',
                            'Rome': 'IT', 'Bangkok': 'TH', 'Phoenix': 'US', 'Kansas City': 'US',
                            'Kaohsiung City': 'TW', 'Marseille': 'FR', 'Saint Petersburg': 'RU',
                            'Miami': 'US', 'Bangalore': 'IN', 'Hyderabad': 'IN', 'Barcelona': 'ES',
                            'Berlin': 'DE', 'Muscat': 'OM', 'Columbus': 'US', 'Prague': 'CZ',
                            'Buenos Aires': 'AR', 'Kuala Lumpur': 'MY', 'Melbourne': 'AU',
                            'Chennai': 'IN', 'Manchester': 'GB', 'Munich': 'DE', 'Bratislava': 'SK',
                            'Hamburg': 'DE', 'Nicosia': 'CY', 'Vancouver': 'CA', 'Denver': 'US'
                        };

                        // 从统计数据中提取地区和城市信息
                        const regions = statsData.byRegion ? Object.keys(statsData.byRegion) : [];
                        const cities = statsData.byCity ? Object.keys(statsData.byCity) : [];
                        const datacenters = statsData.byDatacenter ? Object.keys(statsData.byDatacenter) : [];

                        // 生成HTML页面
                        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vless代理URL构造工具</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .option-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        select, input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        select[multiple] {
            height: 150px;
        }
        .checkbox-label {
            font-weight: normal;
            display: flex;
            align-items: center;
        }
        .checkbox-label input {
            width: auto;
            margin-right: 8px;
        }
        button {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        .result {
            margin-top: 20px;
            padding: 15px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .result input {
            margin-top: 10px;
        }
        .result-link {
            word-break: break-all;
            color: #0066cc;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .tabs {
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
        }
        .tab {
            padding: 10px 15px;
            cursor: pointer;
            background-color: #f1f1f1;
            border: 1px solid #ddd;
            border-bottom: none;
            margin-right: 5px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
        }
        .tab.active {
            background-color: #fff;
            border-bottom: 1px solid #fff;
            margin-bottom: -1px;
        }
        .stats-info {
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
        }
        .copy-btn {
            background-color: #2196F3;
            margin-left: 10px;
        }
        .copy-btn:hover {
            background-color: #0b7dda;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Vless代理URL构造工具</h1>

        <div class="stats-info">
            <p>当前共有 ${statsData.total || 0} 个IP地址</p>
            <p>平均延迟: ${statsData.averageLatency ? statsData.averageLatency.toFixed(2) + 'ms' : '未知'}</p>
            <p>最后更新时间: ${statsData.lastUpdate || '未知'}</p>
        </div>

        <div class="tabs">
            <div class="tab active" data-tab="multi-api">多API整合模式</div>
            <div class="tab" data-tab="country-api">国家API模式</div>
            <div class="tab" data-tab="region-api">地区API模式</div>
        </div>

        <div class="tab-content active" id="multi-api">
            <div class="section">
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="multi-base64"> 使用Base64编码
                    </label>
                </div>
                <button onclick="generateMultiApiUrl()">生成URL</button>
                <div class="result" id="multi-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <a href="#" class="result-link" id="multi-api-link" target="_blank"></a>
                    <button class="copy-btn" onclick="copyToClipboard('multi-api-link')">复制</button>
                </div>
            </div>
        </div>

        <div class="tab-content" id="country-api">
            <div class="section">
                <div class="option-group">
                    <label for="country-select">选择国家:</label>
                    <select id="country-select" multiple>
                        ${cities.map(city => {
                            const code = cityToCountryCode[city] || '';
                            if (code) {
                                return `<option value="${code}">${city} (${code})</option>`;
                            }
                            return '';
                        }).filter(Boolean).join('')}
                    </select>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="country-base64"> 使用Base64编码
                    </label>
                </div>
                <button onclick="generateCountryApiUrl()">生成URL</button>
                <div class="result" id="country-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <div id="country-api-links"></div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="region-api">
            <div class="section">
                <div class="option-group">
                    <label for="region-select">选择地区:</label>
                    <select id="region-select">
                        ${regions.map(region => `<option value="${region}">${region}</option>`).join('')}
                    </select>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="region-base64"> 使用Base64编码
                    </label>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="region-regex"> 启用正则搜索
                    </label>
                </div>
                <button onclick="generateRegionApiUrl()">生成URL</button>
                <div class="result" id="region-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <a href="#" class="result-link" id="region-api-link" target="_blank"></a>
                    <button class="copy-btn" onclick="copyToClipboard('region-api-link')">复制</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 存储UUID
        const UUID = '${UUID}';

        // 切换标签
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // 移除所有tab和content的active类
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                // 添加active类到当前tab和对应的content
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });

        // 生成多API整合模式URL
        function generateMultiApiUrl() {
            const useBase64 = document.getElementById('multi-base64').checked;
            let url = window.location.origin + '/' + UUID;
            if (useBase64) {
                url += '?base64';
            }

            const resultDiv = document.getElementById('multi-api-result');
            const linkElem = document.getElementById('multi-api-link');

            linkElem.href = url;
            linkElem.textContent = url;
            resultDiv.style.display = 'block';
        }

        // 生成国家API模式URL
        function generateCountryApiUrl() {
            const select = document.getElementById('country-select');
            const selectedCountries = Array.from(select.selectedOptions).map(option => option.value);
            const useBase64 = document.getElementById('country-base64').checked;

            if (selectedCountries.length === 0) {
                alert('请至少选择一个国家');
                return;
            }

            const linksDiv = document.getElementById('country-api-links');
            linksDiv.innerHTML = '';

            selectedCountries.forEach(country => {
                let url = window.location.origin + '/' + country + '/' + UUID;
                if (useBase64) {
                    url += '?base64';
                }

                const linkContainer = document.createElement('div');
                linkContainer.style.marginBottom = '10px';

                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.className = 'result-link';
                link.target = '_blank';

                const copyBtn = document.createElement('button');
                copyBtn.textContent = '复制';
                copyBtn.className = 'copy-btn';
                copyBtn.onclick = function() {
                    navigator.clipboard.writeText(url).then(() => {
                        alert('已复制到剪贴板');
                    });
                };

                linkContainer.appendChild(link);
                linkContainer.appendChild(copyBtn);
                linksDiv.appendChild(linkContainer);
            });

            document.getElementById('country-api-result').style.display = 'block';
        }

        // 生成地区API模式URL
        function generateRegionApiUrl() {
            const select = document.getElementById('region-select');
            const selectedRegion = select.value;
            const useBase64 = document.getElementById('region-base64').checked;
            const useRegex = document.getElementById('region-regex').checked;

            if (!selectedRegion) {
                alert('请选择一个地区');
                return;
            }

            let url = window.location.origin + '/' + selectedRegion + '/' + UUID;
            const params = [];

            if (useBase64) {
                params.push('base64');
            }

            if (useRegex) {
                params.push('regex=true');
            }

            if (params.length > 0) {
                url += '?' + params.join('&');
            }

            const resultDiv = document.getElementById('region-api-result');
            const linkElem = document.getElementById('region-api-link');

            linkElem.href = url;
            linkElem.textContent = url;
            resultDiv.style.display = 'block';
        }

        // 复制到剪贴板
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            navigator.clipboard.writeText(element.textContent).then(() => {
                alert('已复制到剪贴板');
            });
        }
    </script>
</body>
</html>
            `;

            res.end(html);
        })
        .catch(error => {
            console.error('获取统计数据失败:', error.message);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('获取统计数据失败，无法生成URL构造界面\n');
        });
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found\n');
            }
        } catch (error) {
            console.error('处理HTTP请求时出错:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error\n');
        }
    });

    // 根据是否使用 Argo 隧道选择监听端口
    const listenPort = useArgo ? ARGO_PORT : PORT;
    httpServer.listen(listenPort, async () => {
        console.log(`HTTP Server is running on port ${listenPort}`);

        // 如果使用 Argo 隧道，在 HTTP 服务器启动后再启动隧道
        if (useArgo) {
            try {
                console.log('正在启动 Argo 隧道...');
                DOMAIN = await startArgoTunnel();
                if (!DOMAIN) {
                    console.error('Argo 隧道启动失败，退出程序');
                    process.exit(1);
                }
                console.log('Argo 隧道域名:', DOMAIN);
                console.log(`Argo 隧道模式：内部端口 ${listenPort}，外部域名 ${DOMAIN}`);
            } catch (error) {
                console.error('启动 Argo 隧道时出错:', error);
                process.exit(1);
            }
        }

        // 上传部署信息到 xbin
        try {
            const deploymentInfo = {
                uuid: UUID,
                port: PORT,
                domain: DOMAIN,
                useArgo: useArgo
            };

            const uploadResult = await uploadToXbin(deploymentInfo);
            if (uploadResult && uploadResult.success) {
                console.log(`📋 部署信息已上传到: ${uploadResult.url}`);
            }
        } catch (error) {
            console.error('上传部署信息时出错:', error.message);
        }
    });

    const wss = new WebSocket.Server({ server: httpServer });
    const uuid = UUID.replace(/-/g, "");
    wss.on('connection', ws => {
        ws.once('message', msg => {
            const [VERSION] = msg;
            const id = msg.slice(1, 17);
            if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
            let i = msg.slice(17, 18).readUInt8() + 19;
            const port = msg.slice(i, i += 2).readUInt16BE(0);
            const ATYP = msg.slice(i, i += 1).readUInt8();
            const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
                (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
                    (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
            ws.send(new Uint8Array([VERSION, 0]));
            const duplex = createWebSocketStream(ws);
            net.connect({ host, port }, function () {
                this.write(msg.slice(i));
                duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
            }).on('error', () => { });
        }).on('error', () => { });
    });

    downloadFiles();
}

function getSystemArchitecture() {
    const arch = os.arch();
    if (arch === 'arm' || arch === 'arm64') {
        return 'arm';
    } else {
        return 'amd';
    }
}

function downloadFile(fileName, fileUrl, callback) {
    const filePath = path.join("./", fileName);
    const writer = fs.createWriteStream(filePath);
    axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    })
        .then(response => {
            response.data.pipe(writer);
            writer.on('finish', function () {
                writer.close();
                callback(null, fileName);
            });
        })
        .catch(error => {
            callback(`Download ${fileName} failed: ${error.message}`);
        });
}

function downloadFiles() {
    console.log("跳过下载文件步骤，Docker环境中不需要此操作");
    // 在Docker环境中，我们不需要下载和执行npm文件
    return;
}

function authorizeFiles() {
    console.log("跳过授权文件步骤，Docker环境中不需要此操作");
    // 在Docker环境中，我们不需要下载和执行npm文件
    return;
}

// 添加从API获取IP的函数
async function fetchApiData() {
    const apiList = [
        {
            url: 'https://ipdb.api.030101.xyz/?type=bestcf&country=true',
            namePrefix: '优选官方API(1-'
        },
        {
            url: 'https://addressesapi.090227.xyz/CloudFlareYes',
            namePrefix: '优选官方API(2-'
        },
        {
            url: 'https://addressesapi.090227.xyz/ip.164746.xyz',
            namePrefix: '优选官方API(3-'
        },
        {
            url: 'https://ipdb.api.030101.xyz/?type=bestproxy&country=true',
            namePrefix: '优选反代API(1-'
        }
    ];

    let allResults = [];

    try {
        // 逐个处理API，而不是并行请求
        for (let apiIndex = 0; apiIndex < apiList.length; apiIndex++) {
            const api = apiList[apiIndex];
            console.log(`正在请求 API: ${api.url}`);

            try {
                const response = await axios.get(api.url, {
                    timeout: 8000, // 增加超时时间
                    validateStatus: function (status) {
                        return status >= 200 && status < 300;
                    }
                });

                if (response.data) {
                    let ipList;
                    if (typeof response.data === 'string') {
                        // 将返回的数据按行分割
                        ipList = response.data.trim().split(/[\r\n]+/);
                        console.log(`API ${api.url} 返回 ${ipList.length} 个IP`);
                    } else {
                        console.error(`API返回的数据不是字符串:`, response.data);
                        ipList = [];
                    }

                    // 为每个IP创建一个对象，包含域名和名称
                    ipList.forEach((item, index) => {
                        const ipParts = item.split('#');
                        const ip = ipParts[0].trim();
                        if (ip) {
                            const nameIndex = index + 1;
                            let name = `${api.namePrefix}${nameIndex})`;

                            // 如果IP后面有额外信息（#后面的部分），添加到名称中
                            if (ipParts.length > 1) {
                                name += `-${ipParts[1]}`;
                            }

                            allResults.push({ domain: ip, name: name });
                            // 添加确认日志
                            console.log(`添加IP: ${ip} 名称: ${name}`);
                        }
                    });
                }
            } catch (error) {
                console.error(`获取 ${api.url} 失败: ${error.message}`);
            }
        }

        console.log(`总共获取到 ${allResults.length} 个API IP`);
        return allResults;
    } catch (error) {
        console.error('获取API数据时出错:', error.message);
        return []; // 出错时返回空数组
    }
}

// 添加获取特定国家最佳IP的函数
async function fetchCountryBestIP(countryCode) {
    try {
        console.log(`正在请求国家 ${countryCode} 的最佳IP数据...`);
        const url = `https://bestip.06151953.xyz/country/${countryCode}`;
        console.log(`请求URL: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (response.data && Array.isArray(response.data)) {
            console.log(`获取到 ${response.data.length} 个IP数据`);
            response.data.forEach(item => {
                console.log(`IP: ${item.ip}, 端口: ${item.port}`);
            });
            return response.data;
        } else {
            console.error('API返回的数据格式不正确:', response.data);
            return [];
        }
    } catch (error) {
        console.error(`获取国家 ${countryCode} 的最佳IP数据失败:`, error.message);
        return [];
    }
}

// 添加获取全球最佳IP的函数
async function fetchGlobalBestIP() {
    try {
        console.log(`正在请求全球最佳IP数据...`);
        const url = `https://bestip.06151953.xyz/bestip`;
        console.log(`请求URL: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (response.data && Array.isArray(response.data)) {
            console.log(`获取到 ${response.data.length} 个全球最佳IP数据`);
            response.data.forEach(item => {
                console.log(`IP: ${item.ip}, 端口: ${item.port}, 城市: ${item.city || 'Unknown'}, 延迟: ${item.latency || 'Unknown'}`);
            });
            return response.data;
        } else {
            console.error('API返回的数据格式不正确:', response.data);
            return [];
        }
    } catch (error) {
        console.error(`获取全球最佳IP数据失败:`, error.message);
        return [];
    }
}

// 添加获取特定地区最佳IP的函数
async function fetchRegionBestIP(region, useRegex) {
    try {
        console.log(`正在请求地区 ${region} 的最佳IP数据...`);

        // 先解码，再编码，解决双重编码问题
        let decodedRegion;
        try {
            // 尝试解码，如果已经是编码形式
            decodedRegion = decodeURIComponent(region);
        } catch (e) {
            // 如果解码失败，说明不是编码形式，直接使用
            decodedRegion = region;
        }

        // 重新编码
        const encodedRegion = encodeURIComponent(decodedRegion);

        let url = `https://bestip.06151953.xyz/bestip/${encodedRegion}`;

        if (useRegex) {
            url += '?regex=true';
        }

        console.log(`请求URL: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (response.data && Array.isArray(response.data)) {
            console.log(`获取到 ${response.data.length} 个地区 ${region} 的IP数据`);
            response.data.forEach(item => {
                console.log(`IP: ${item.ip}, 端口: ${item.port}, 城市: ${item.city || 'Unknown'}, 延迟: ${item.latency || 'Unknown'}`);
            });
            return response.data;
        } else {
            console.error('API返回的数据格式不正确:', response.data);
            return [];
        }
    } catch (error) {
        console.error(`获取地区 ${region} 的最佳IP数据失败:`, error.message);
        return [];
    }
}

// 添加获取统计数据的函数
async function fetchStatsData() {
    try {
        console.log('正在请求统计数据...');
        const url = 'https://bestip.06151953.xyz/api/stats';
        console.log(`请求URL: ${url}`);

        const response = await axios.get(url, {
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (response.data) {
            console.log('成功获取统计数据');
            return response.data;
        } else {
            console.error('API返回的数据格式不正确:', response.data);
            return {};
        }
    } catch (error) {
        console.error('获取统计数据失败:', error.message);
        return {};
    }
}

// Argo 隧道相关函数
async function startArgoTunnel() {
    try {
        console.log('正在启动 Argo 隧道...');

        // 下载 cloudflared 二进制文件
        await downloadCloudflared();

        // 处理固定隧道配置
        if (ARGO_AUTH && ARGO_DOMAIN) {
            console.log('使用固定隧道配置');
            setupFixedTunnel();
        }

        // 启动 cloudflared
        await startCloudflared();

        // 获取隧道域名
        const domain = await extractArgoDomain();
        return domain;
    } catch (error) {
        console.error('启动 Argo 隧道失败:', error);
        return null;
    }
}

async function downloadCloudflared() {
    const arch = getSystemArchitecture();
    const platform = os.platform();  // 移到函数开头
    // 根据平台选择文件名
    const fileName = platform === 'win32' ? 'bot.exe' : 'bot';
    const filePath = path.join(FILE_PATH, fileName);

    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
        console.log('cloudflared 已存在，跳过下载');
        return;
    }

    // 在 Windows 下不使用现有的 cloudflared 文件，因为可能是 Linux 版本
    if (platform !== 'win32') {
        // 只在非 Windows 系统下检查现有的 cloudflared 文件
        const cloudflaredPath = path.join(FILE_PATH, 'cloudflared');
        if (fs.existsSync(cloudflaredPath)) {
            console.log('发现现有的 cloudflared 文件，复制为 bot');
            fs.copyFileSync(cloudflaredPath, filePath);
            fs.chmodSync(filePath, '755');
            return;
        }
    }

    console.log('正在下载 cloudflared...');

    let downloadUrl;

    // 定义多个下载源
    let downloadUrls = [];

    if (platform === 'win32') {
        // Windows 版本 - 多个下载源
        if (arch === 'arm' || arch === 'arm64') {
            downloadUrls = [
                'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe',
                'https://github.com/cloudflare/cloudflared/releases/download/2024.6.1/cloudflared-windows-arm64.exe',
                'https://cloudflared.bowring.uk/binaries/cloudflared-windows-arm64.exe'
            ];
        } else {
            downloadUrls = [
                'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
                'https://github.com/cloudflare/cloudflared/releases/download/2024.6.1/cloudflared-windows-amd64.exe',
                'https://cloudflared.bowring.uk/binaries/cloudflared-windows-amd64.exe'
            ];
        }
    } else {
        // Linux 版本 - 使用与 node_argo.js 相同的下载源
        if (arch === 'arm' || arch === 'arm64') {
            downloadUrls = ['https://arm64.ssss.nyc.mn/2go'];
        } else {
            downloadUrls = ['https://amd64.ssss.nyc.mn/2go'];
        }
    }

    // 尝试多个下载源
    let downloadSuccess = false;
    let lastError = null;

    for (let i = 0; i < downloadUrls.length; i++) {
        downloadUrl = downloadUrls[i];
        console.log(`尝试下载源 ${i + 1}/${downloadUrls.length}: ${downloadUrl}`);

        try {
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream',
                timeout: 30000  // 减少超时时间
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // 设置执行权限
            if (platform !== 'win32') {
                fs.chmodSync(filePath, '755');
            }

            console.log('cloudflared 下载完成');
            downloadSuccess = true;
            break;
        } catch (error) {
            console.error(`下载源 ${i + 1} 失败:`, error.message);
            lastError = error;

            // 删除可能的不完整文件
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }

    if (!downloadSuccess) {
        console.error('所有下载源都失败了');
        throw lastError || new Error('下载失败');
    }
}

function setupFixedTunnel() {
    if (ARGO_AUTH.includes('TunnelSecret')) {
        // JSON 格式的认证
        fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
        const tunnelId = JSON.parse(ARGO_AUTH).TunnelID;

        const tunnelYaml = `
tunnel: ${tunnelId}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
        fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
        console.log('固定隧道配置文件已生成');
    } else {
        console.log('使用 Token 格式的固定隧道');
    }
}

// 系统检测和策略选择
function getSystemInfo() {
    const platform = os.platform();
    const arch = os.arch();

    console.log(`检测到系统: ${platform}, 架构: ${arch}`);

    const systemInfo = {
        platform,
        arch,
        isWindows: platform === 'win32',
        isLinux: platform === 'linux',
        isMac: platform === 'darwin'
    };

    // 显示详细的系统信息
    console.log('系统信息详情:');
    console.log(`- 操作系统: ${systemInfo.isWindows ? 'Windows' : systemInfo.isLinux ? 'Linux' : systemInfo.isMac ? 'macOS' : '其他'}`);
    console.log(`- 架构类型: ${getSystemArchitecture()}`);
    console.log(`- 运行策略: ${systemInfo.isWindows ? 'Windows策略' : systemInfo.isLinux ? 'Linux策略' : '默认策略(类Linux)'}`);

    return systemInfo;
}

// 上传部署信息到 xbin 粘贴板
async function uploadToXbin(deploymentInfo) {
    if (!BINURL) {
        console.log('BINURL 未配置，跳过上传到 xbin');
        return null;
    }

    try {
        console.log('正在上传部署信息到 xbin...');

        // 构建上传内容
        const content = `# Cloudflare Vless 代理部署信息
部署时间: ${new Date().toLocaleString()}
系统信息: ${os.platform()} ${os.arch()}

## 基本配置
UUID: ${deploymentInfo.uuid}
端口: ${deploymentInfo.port}
域名: ${deploymentInfo.domain}

## 访问地址
主页: https://${deploymentInfo.domain}/
订阅地址: https://${deploymentInfo.domain}/${deploymentInfo.uuid}
Base64订阅: https://${deploymentInfo.domain}/${deploymentInfo.uuid}?base64
配置界面: https://${deploymentInfo.domain}/${deploymentInfo.uuid}/select

## Argo 隧道信息
${deploymentInfo.useArgo ? `Argo 端口: ${ARGO_PORT}` : '未使用 Argo 隧道'}
${ARGO_DOMAIN ? `固定域名: ${ARGO_DOMAIN}` : ''}
${ARGO_AUTH ? '使用固定隧道认证' : '使用临时隧道'}

## 节点名称
${NAME}

## 使用说明
1. 复制订阅地址到你的代理客户端
2. 如需 Base64 格式，使用 Base64 订阅地址
3. 访问配置界面可以自定义选择地区和IP

---
生成时间: ${new Date().toISOString()}`;

        // 构建请求数据
        const requestData = {
            content: content
        };

        // 如果配置了自定义路径，使用它
        if (BINPATH) {
            requestData.customId = BINPATH;
        }

        // 如果配置了密码，使用它
        if (BINPWD) {
            requestData.password = BINPWD;
        }

        // 发送请求到 xbin API
        const response = await axios.post(`${BINURL}/api/paste`, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.data && response.data.success) {
            const pasteUrl = response.data.url;
            const pasteId = response.data.id;

            console.log('✅ 部署信息上传成功!');
            console.log(`📋 粘贴板地址: ${pasteUrl}`);
            console.log(`🔗 粘贴板ID: ${pasteId}`);

            if (BINPWD) {
                console.log(`🔒 密码保护: 已启用`);
            }

            return {
                success: true,
                url: pasteUrl,
                id: pasteId
            };
        } else {
            throw new Error('API 返回格式错误');
        }

    } catch (error) {
        console.error('❌ 上传到 xbin 失败:', error.message);

        if (error.response) {
            console.error('响应状态:', error.response.status);
            console.error('响应数据:', error.response.data);
        }

        return {
            success: false,
            error: error.message
        };
    }
}

// 获取系统架构类型 (参考 node_argo.js)
function getSystemArchitecture() {
    const arch = os.arch();
    if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
        return 'arm';
    } else {
        return 'amd';
    }
}

// Linux 下载文件函数 (参考 node_argo.js)
function downloadFileLinux(fileName, fileUrl) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(FILE_PATH, fileName);
        const writer = fs.createWriteStream(filePath);

        axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
        })
        .then(response => {
            response.data.pipe(writer);

            writer.on('finish', () => {
                writer.close();
                console.log(`Download ${fileName} successfully`);
                resolve(fileName);
            });

            writer.on('error', err => {
                fs.unlink(filePath, () => { });
                const errorMessage = `Download ${fileName} failed: ${err.message}`;
                console.error(errorMessage);
                reject(errorMessage);
            });
        })
        .catch(err => {
            const errorMessage = `Download ${fileName} failed: ${err.message}`;
            console.error(errorMessage);
            reject(errorMessage);
        });
    });
}

// Linux 策略：启动 cloudflared (使用预复制的文件)
async function startCloudflaredLinux() {
    const fileName = 'bot';
    const cloudflaredPath = path.join(FILE_PATH, fileName);

    // 检查预复制的文件是否存在
    if (!fs.existsSync(cloudflaredPath)) {
        console.error('cloudflared Linux 版本文件不存在:', cloudflaredPath);
        throw new Error('cloudflared Linux 版本文件不存在');
    }

    console.log('cloudflared 已存在，跳过下载');

    // 确保文件有执行权限
    try {
        fs.chmodSync(cloudflaredPath, 0o775);
    } catch (error) {
        console.warn('设置执行权限失败:', error.message);
    }

    // 构建启动参数 - 使用与 node_argo.js 完全相同的逻辑
    const logPath = path.join(FILE_PATH, 'boot.log');
    let args;

    if (ARGO_AUTH && ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
        args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH && ARGO_AUTH.match(/TunnelSecret/)) {
        args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
        args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${logPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
        // 使用与 node_argo.js 完全相同的命令格式
        const command = `nohup ${cloudflaredPath} ${args} >/dev/null 2>&1 &`;
        await execAsync(command);
        console.log('bot is running. (Linux)');

        // 等待启动
        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.error('启动 cloudflared 失败:', error);
        throw error;
    }
}

// Windows 策略：启动 cloudflared
async function startCloudflaredWindows() {
    const fileName = 'bot.exe';
    const cloudflaredPath = path.join(FILE_PATH, fileName);

    if (!fs.existsSync(cloudflaredPath)) {
        console.log('cloudflared 不存在，正在下载...');
        await downloadCloudflared();
    } else {
        console.log('cloudflared 已存在，跳过下载');
    }

    // 构建启动参数
    const logPath = path.join(FILE_PATH, 'boot.log');
    let args;

    if (ARGO_AUTH && ARGO_DOMAIN) {
        if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
            // Token 格式
            args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
        } else if (ARGO_AUTH.includes('TunnelSecret')) {
            // JSON 格式
            args = `tunnel --edge-ip-version auto --config ${path.join(FILE_PATH, 'tunnel.yml')} run`;
        }
    } else {
        // 临时隧道
        args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${logPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    console.log('启动 cloudflared 命令:', `"${cloudflaredPath}" ${args}`);

    try {
        // Windows 下直接使用 spawn 启动，避免阻塞
        console.log('执行命令:', `"${cloudflaredPath}" ${args}`);
        const { spawn } = require('child_process');
        const argsArray = args.split(' ');
        const child = spawn(cloudflaredPath, argsArray, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref(); // 让子进程独立运行
        console.log('cloudflared 已启动 (Windows PID:', child.pid, ')');

        // 等待启动
        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.error('启动 cloudflared 失败:', error);
        throw error;
    }
}



// 统一的启动 cloudflared 函数
async function startCloudflared() {
    const systemInfo = getSystemInfo();

    if (systemInfo.isLinux) {
        console.log('使用 Linux 运行策略');
        await startCloudflaredLinux();
    } else if (systemInfo.isWindows) {
        console.log('使用 Windows 运行策略');
        await startCloudflaredWindows();
    } else {
        console.log('使用默认运行策略 (类 Linux)');
        await startCloudflaredLinux();
    }
}

// 获取临时隧道domain - 完全按照 node_argo.js 的逻辑
async function extractArgoDomain() {
    let argoDomain;

    if (ARGO_AUTH && ARGO_DOMAIN) {
        argoDomain = ARGO_DOMAIN;
        console.log('ARGO_DOMAIN:', argoDomain);
        return argoDomain;
    } else {
        const logPath = path.join(FILE_PATH, 'boot.log');
        let retries = 0;
        const maxRetries = 30; // 最多等待30秒

        // 等待日志文件生成并尝试提取域名
        while (retries < maxRetries) {
            try {
                if (fs.existsSync(logPath)) {
                    const fileContent = fs.readFileSync(logPath, 'utf-8');
                    const lines = fileContent.split('\n');
                    const argoDomains = [];

                    lines.forEach((line) => {
                        // 尝试解析 JSON 格式的日志
                        try {
                            const logEntry = JSON.parse(line);
                            if (logEntry.message) {
                                // 在 JSON 消息中查找域名
                                const domainMatch = logEntry.message.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
                                if (domainMatch) {
                                    const domain = domainMatch[1];
                                    argoDomains.push(domain);
                                    return;
                                }
                            }
                        } catch (e) {
                            // 如果不是 JSON，尝试文本格式（兼容性）
                        }

                        // 使用与 node_argo.js 完全相同的正则表达式（文本格式）
                        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
                        if (domainMatch) {
                            const domain = domainMatch[1];
                            argoDomains.push(domain);
                        }
                    });

                    if (argoDomains.length > 0) {
                        argoDomain = argoDomains[0];
                        console.log('ArgoDomain:', argoDomain);
                        return argoDomain;
                    }
                }
            } catch (error) {
                console.error('Error reading boot.log:', error);
            }

            retries++;
            console.log(`等待隧道域名生成... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 如果等待超时，尝试重新启动（按照 node_argo.js 的逻辑）
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');

        // 完全按照 node_argo.js 的重试逻辑
        // 删除 boot.log 文件
        if (fs.existsSync(logPath)) {
            fs.unlinkSync(logPath);
        }

        // 杀死现有进程 - 使用与 node_argo.js 相同的命令
        async function killBotProcess() {
            try {
                await execAsync('pkill -f "[b]ot" > /dev/null 2>&1');
            } catch (error) {
                // 忽略输出
            }
        }
        await killBotProcess();
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 重新启动 - 使用与 node_argo.js 相同的命令
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
            await execAsync(`nohup ${path.join(FILE_PATH, 'bot')} ${args} >/dev/null 2>&1 &`);
            console.log('bot is running.');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await extractArgoDomain(); // 重新提取域名
        } catch (error) {
            console.error(`Error executing command: ${error}`);
        }
    }

    return null;
}

// 清理函数
async function cleanup() {
    console.log('正在清理资源...');
    try {
        if (os.platform() === 'win32') {
            // Windows 下杀死进程
            try {
                await execAsync('taskkill /F /IM bot.exe 2>nul');
                console.log('bot.exe 进程已停止');
            } catch (error) {
                console.log('bot.exe 进程已停止或不存在');
            }

            try {
                await execAsync('taskkill /F /IM cloudflared.exe 2>nul');
                console.log('cloudflared 进程已停止');
            } catch (error) {
                console.log('cloudflared 进程已停止或不存在');
            }
        } else {
            // Linux/Unix 下杀死进程
            exec('pkill -f "[b]ot"', (error) => {
                if (error) {
                    console.log('bot 进程已停止或不存在');
                } else {
                    console.log('bot 进程已停止');
                }
            });

            exec('pkill -f cloudflared', (error) => {
                if (error) {
                    console.log('cloudflared 进程已停止或不存在');
                } else {
                    console.log('cloudflared 进程已停止');
                }
            });
        }
    } catch (error) {
        console.error('清理过程中出错:', error);
    }
}

// 监听进程退出信号
process.on('SIGINT', async () => {
    console.log('\n收到 SIGINT 信号，正在退出...');
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n收到 SIGTERM 信号，正在退出...');
    await cleanup();
    process.exit(0);
});

process.on('exit', () => {
    console.log('程序退出');
});

main();