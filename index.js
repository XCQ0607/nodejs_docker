// Enhanced All-in-one代理
// 扩展自 https://github.com/XCQ0607

// 配置字典
const CONFIG = {
  sites: [
    {
      name: 'google',       // 自定义路径名称 (只能包含英文字母、数字、下划线)
      target: 'google.com', // 目标网站
      interval: 5           // 连续访问间隔 (分钟), 0 表示不连续访问
    },
    {
      name: 'github',
      target: 'github.com',
      interval: 10
    }
    // 可以添加更多站点
  ],
  // 存储访问结果
  results: {}
};

// 设置定时任务来访问站点
function setupContinuousVisits() {
  CONFIG.sites.forEach(site => {
    if (site.interval > 0) {
      // 初始化结果存储
      if (!CONFIG.results[site.name]) {
        CONFIG.results[site.name] = [];
      }
      
      // 设置定时访问
      setInterval(async () => {
        try {
          const url = `https://${site.target}`;
          const response = await fetch(url);
          CONFIG.results[site.name].push({
            timestamp: new Date().toISOString(),
            status: response.status,
            ok: response.ok
          });
          
          // 只保留最近10条记录
          if (CONFIG.results[site.name].length > 10) {
            CONFIG.results[site.name].shift();
          }
        } catch (error) {
          CONFIG.results[site.name].push({
            timestamp: new Date().toISOString(),
            status: 0,
            ok: false,
            error: error.message
          });
        }
      }, site.interval * 60 * 1000); // 转换为毫秒
    }
  });
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return handleCORS(request);
  }

  const url = new URL(request.url);
  const path = url.pathname.slice(1); // Remove leading '/'
  
  // 检查是否请求API端点
  if (path === 'api/results') {
    return new Response(JSON.stringify(CONFIG.results, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
  
  // 检查是否匹配配置的路径
  const configSite = CONFIG.sites.find(site => path === site.name);
  if (configSite) {
    let targetUrl = `https://${configSite.target}`;
    return await fetchAndModify(targetUrl, request);
  }

  // 默认的代理行为
  if (path === '' || path === 'index.html') {
    return getIndexPage();
  }

  let targetUrl = path;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  return await fetchAndModify(targetUrl, request);
}

// 处理CORS预检请求
function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

// 定义CORS头部
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Cors-Proxy-Target',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

function getIndexPage() {
  // 创建站点列表
  const siteList = CONFIG.sites.map(site => {
    return `<li><a href="/${site.name}">${site.name}</a> (${site.interval > 0 ? `每${site.interval}分钟检查一次` : '不自动检查'})</li>`;
  }).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced All-in-one代理</title>
    <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0;
      padding: 2rem;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      background-color: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      max-width: 800px;
      width: 100%;
    }
    input[type="text"] {
      width: 300px;
      padding: 0.5rem;
      margin-right: 0.5rem;
    }
    button {
      padding: 0.5rem 1rem;
      background-color: #007bff;
      color: white;
      border: none;
      cursor: pointer;
    }
    .author {
      margin-top: 1rem;
      font-size: 0.8rem;
      color: #666;
    }
    .sites {
      margin-top: 2rem;
      text-align: left;
    }
    .results {
      margin-top: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      padding: 0.5rem;
      border: 1px solid #ddd;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
    }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Enhanced All-in-one代理</h1>
      <form onsubmit="return false;">
        <input type="text" id="urlInput" placeholder="请输入要访问的网址">
        <button onclick="navigate()">访问</button>
      </form>
      
      <div class="sites">
        <h2>配置站点</h2>
        <ul>
          ${siteList}
        </ul>
      </div>
      
      <div class="results">
        <h2>访问结果</h2>
        <div id="resultsContainer"></div>
        <button onclick="loadResults()">刷新结果</button>
      </div>
      
      <div class="author">
        扩展自: <a href="https://github.com/XCQ0607" target="_blank">https://github.com/XCQ0607</a>
      </div>
    </div>
    <script>
    function navigate() {
      const url = document.getElementById('urlInput').value;
      if (url) {
        window.location.href = '/' + url;
      }
    }
    
    function loadResults() {
      fetch('/api/results')
        .then(response => response.json())
        .then(data => {
          const container = document.getElementById('resultsContainer');
          container.innerHTML = '';
          
          for (const site in data) {
            const results = data[site];
            if (results && results.length > 0) {
              const table = document.createElement('table');
              table.innerHTML = \`
                <tr>
                  <th colspan="3">\${site} 访问结果</th>
                </tr>
                <tr>
                  <th>时间</th>
                  <th>状态码</th>
                  <th>结果</th>
                </tr>
              \`;
              
              results.forEach(result => {
                const row = document.createElement('tr');
                row.innerHTML = \`
                  <td>\${new Date(result.timestamp).toLocaleString()}</td>
                  <td>\${result.status}</td>
                  <td>\${result.ok ? '成功' : '失败'}</td>
                \`;
                table.appendChild(row);
              });
              
              container.appendChild(table);
              container.appendChild(document.createElement('br'));
            }
          }
          
          if (container.innerHTML === '') {
            container.textContent = '暂无数据';
          }
        })
        .catch(error => {
          console.error('Error:', error);
          document.getElementById('resultsContainer').textContent = '加载失败: ' + error;
        });
    }
    
    // 初始加载结果
    window.addEventListener('load', loadResults);
    </script>
  </body>
  </html>
  `;
  
  return new Response(html, {
    headers: { 
      'Content-Type': 'text/html; charset=UTF-8',
      ...corsHeaders()
    }
  });
}

async function fetchAndModify(url, request) {
  // 检查是否是对自身的请求，如果是，直接返回错误
  if (url.includes(new URL(request.url).hostname)) {
    return new Response('Error: Cannot proxy to self', { 
      status: 400,
      headers: corsHeaders() 
    });
  }

  // 创建新的请求头，去掉host和origin
  const headers = new Headers(request.headers);
  headers.delete('host');

  // 根据请求内容构建fetch选项
  let fetchOptions = {
    method: request.method,
    headers: headers,
    redirect: 'follow'
  };

  // 仅当非GET/HEAD请求时添加请求体
  if (!['GET', 'HEAD'].includes(request.method)) {
    fetchOptions.body = request.body;
  }

  try {
    const response = await fetch(url, fetchOptions);
    
    // 构建响应头，包含CORS头
    const responseHeaders = new Headers(response.headers);
    
    // 添加CORS头
    Object.entries(corsHeaders()).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('text/html')) {
      let text = await response.text();
      text = modifyHtml(text, new URL(url).origin, request);
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } else if (contentType.includes('text/css')) {
      let text = await response.text();
      text = modifyCss(text, new URL(url).origin, request);
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      let text = await response.text();
      text = modifyJs(text, new URL(url).origin, request);
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }

    // 对于其他类型的响应，直接返回但添加CORS头
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { 
      status: 500,
      headers: corsHeaders() 
    });
  }
}

function modifyHtml(html, baseUrl, request) {
  const workerUrl = new URL(request.url).origin;
  return html.replace(/(href|src|action)=(["'])(\/[^"']*|https?:\/\/[^"']*)(["'])/g, (match, attr, quote, url, endQuote) => {
    if (url.startsWith('/')) {
      url = baseUrl + url;
    }
    return `${attr}=${quote}${workerUrl}/${url}${endQuote}`;
  });
}

function modifyCss(css, baseUrl, request) {
  const workerUrl = new URL(request.url).origin;
  return css.replace(/url\((["']?)(\/[^"')]*|https?:\/\/[^"')]*)(["']?)\)/g, (match, quote, url, endQuote) => {
    if (url.startsWith('/')) {
      url = baseUrl + url;
    }
    return `url(${quote}${workerUrl}/${url}${endQuote})`;
  });
}

function modifyJs(js, baseUrl, request) {
  const workerUrl = new URL(request.url).origin;
  // 这里的正则表达式可能需要根据具体情况进行调整
  return js.replace(/(["'])((https?:)?\/\/[^"']*)(["'])/g, (match, quote, url, protocol, endQuote) => {
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = baseUrl + url;
    }
    return `${quote}${workerUrl}/${url}${endQuote}`;
  });
}

// 启动定时访问
setupContinuousVisits(); 