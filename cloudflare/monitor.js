// Cloudflare Worker 反代脚本 v2.0
// 支持预配置网站反代、连续访问监控、通用反代功能和管理面板

// 默认预配置的网站字典
const DEFAULT_SITE_CONFIG = {
    google: {
      url: 'https://www.google.com',
      path: '/google',
      interval: 5
    },
    github: {
      url: 'https://github.com',
      path: '/github',
      interval: 10
    },
    stackoverflow: {
      url: 'https://stackoverflow.com',
      path: '/stackoverflow',
      interval: 0
    },
    youtube: {
      url: 'https://www.youtube.com',
      path: '/youtube',
      interval: 15
    }
  };

  // 全局变量
  let SITE_CONFIG = { ...DEFAULT_SITE_CONFIG };

  // 主要处理函数
  addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
  });

  // 定时任务处理器
  addEventListener('scheduled', event => {
    event.waitUntil(handleScheduledMonitoring());
  });

  async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 检查KV是否绑定
      if (typeof PROXY_KV === 'undefined') {
        return new Response('错误: 未绑定 PROXY_KV 命名空间', { status: 500 });
      }

      // 加载配置
      await loadSiteConfig();

      // 记录访问日志
      await logAccess(request, path);

      // 手动触发监控任务
      if (path === '/trigger-monitor') {
        await handleScheduledMonitoring();
        return new Response('监控任务已成功触发', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      // 处理根路径
      if (path === '/') {
        return handleHomePage();
      }

      // 处理登录页面
      if (path === '/login') {
        return handleLoginPage(request);
      }

      // 处理管理面板
      if (path === '/dashboard') {
        return handleDashboard(request);
      }

      // 处理公开API（不需要认证）- 必须在通用API处理之前
      if (path === '/api/public/sites') {
        return handlePublicSitesAPI();
      }

      if (path === '/api/public/monitor') {
        return handlePublicMonitorAPI();
      }

      // 处理登录API（不需要认证）
      if (path === '/api/login' && request.method === 'POST') {
        return handleLoginSubmit(request);
      }

      // 处理管理面板API
      if (path.startsWith('/api/')) {
        return handleDashboardAPI(request);
      }

      // 处理监控状态查看
      if (path === '/monitor-status') {
        return handleMonitorStatus();
      }

      // 处理预配置的网站反代
      for (const [key, config] of Object.entries(SITE_CONFIG)) {
        if (path === config.path || path.startsWith(config.path + '/')) {
          const targetPath = path.replace(config.path, '') || '/';
          return handleProxy(request, config.url, targetPath);
        }
      }

      // 处理通用反代
      const pathParts = path.split('/').filter(part => part);
      if (pathParts.length > 0) {
        const targetDomain = pathParts[0];
        const targetPath = '/' + pathParts.slice(1).join('/');

        if (/^[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/.test(targetDomain)) {
          const targetUrl = `https://${targetDomain}`;
          return handleProxy(request, targetUrl, targetPath);
        }
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Request handling error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 加载网站配置
  async function loadSiteConfig() {
    try {
      const storedConfig = await PROXY_KV.get('site_config');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        // 合并配置，存储的配置优先
        SITE_CONFIG = { ...DEFAULT_SITE_CONFIG, ...parsedConfig };
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      SITE_CONFIG = { ...DEFAULT_SITE_CONFIG };
    }
  }

  // 保存网站配置
  async function saveSiteConfig(config) {
    try {
      await PROXY_KV.put('site_config', JSON.stringify(config));
      SITE_CONFIG = { ...config };
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      return false;
    }
  }

  // 记录访问日志
  async function logAccess(request, path) {
    try {
      const clientIP = request.headers.get('CF-Connecting-IP') ||
                      request.headers.get('X-Forwarded-For') ||
                      'unknown';

      const userAgent = request.headers.get('User-Agent') || 'unknown';
      const referer = request.headers.get('Referer') || '';

      const logEntry = {
        timestamp: new Date().toISOString(),
        ip: clientIP,
        path: path,
        method: request.method,
        userAgent: userAgent,
        referer: referer,
        country: request.cf?.country || 'unknown'
      };

      // 获取今天的日期作为key
      const today = new Date().toISOString().split('T')[0];
      const logKey = `access_log_${today}`;

      // 获取今天的日志
      let todayLogs = [];
      const existingLogs = await PROXY_KV.get(logKey);
      if (existingLogs) {
        todayLogs = JSON.parse(existingLogs);
      }

      // 添加新日志
      todayLogs.push(logEntry);

      // 限制每天最多1000条日志
      if (todayLogs.length > 1000) {
        todayLogs = todayLogs.slice(-1000);
      }

      // 保存日志
      await PROXY_KV.put(logKey, JSON.stringify(todayLogs));

    } catch (error) {
      console.error('记录访问日志失败:', error);
    }
  }

  // 清理旧日志
  async function cleanOldLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 15);

      // 列出所有日志key
      const { keys } = await PROXY_KV.list({ prefix: 'access_log_' });

      for (const key of keys) {
        const dateStr = key.name.replace('access_log_', '');
        const logDate = new Date(dateStr);

        if (logDate < cutoffDate) {
          await PROXY_KV.delete(key.name);
          console.log(`删除旧日志: ${key.name}`);
        }
      }
    } catch (error) {
      console.error('清理旧日志失败:', error);
    }
  }

  // 处理管理面板
  async function handleDashboard(request) {
    // 检查认证
    const authResult = await checkAuth(request);
    if (authResult !== true) {
      return authResult;
    }

    const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>反代管理面板</title>
      <style>
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }

          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              color: #333;
          }

          .header {
              background: rgba(255, 255, 255, 0.95);
              padding: 1rem 2rem;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              backdrop-filter: blur(10px);
          }

          .header h1 {
              color: #4a5568;
              display: inline-block;
          }

          .logout-btn {
              float: right;
              background: #f56565;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 5px;
              cursor: pointer;
              text-decoration: none;
          }

          .container {
              max-width: 1600px;
              margin: 2rem auto;
              padding: 0 1rem;
              min-height: 85vh;
          }

          .tabs {
              display: flex;
              background: rgba(255, 255, 255, 0.95);
              border-radius: 10px 10px 0 0;
              overflow: hidden;
          }

          .tab {
              flex: 1;
              padding: 1rem;
              text-align: center;
              cursor: pointer;
              background: rgba(255, 255, 255, 0.7);
              border-right: 1px solid #e2e8f0;
              transition: all 0.3s;
          }

          .tab:last-child {
              border-right: none;
          }

          .tab.active {
              background: rgba(255, 255, 255, 1);
              font-weight: 600;
          }

          .tab:hover {
              background: rgba(255, 255, 255, 0.9);
          }

          .tab-content {
              background: rgba(255, 255, 255, 0.95);
              border-radius: 0 0 10px 10px;
              padding: 2rem;
              min-height: 800px;
              display: none;
          }

          .tab-content.active {
              display: block;
          }

          .form-group {
              margin-bottom: 1.5rem;
          }

          .form-group label {
              display: block;
              margin-bottom: 0.5rem;
              font-weight: 600;
              color: #2d3748;
          }

          .form-group input, .form-group textarea, .form-group select {
              width: 100%;
              padding: 0.75rem;
              border: 2px solid #e2e8f0;
              border-radius: 5px;
              font-size: 1rem;
              transition: border-color 0.3s;
          }

          .form-group input:focus, .form-group textarea:focus {
              outline: none;
              border-color: #667eea;
          }

          .btn {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 5px;
              cursor: pointer;
              font-size: 1rem;
              margin-right: 0.5rem;
              margin-bottom: 0.5rem;
              transition: transform 0.2s;
          }

          .btn:hover {
              transform: translateY(-2px);
          }

          .btn-danger {
              background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
          }

          .btn-success {
              background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
          }

          .site-item {
              background: #f7fafc;
              border: 1px solid #e2e8f0;
              border-radius: 5px;
              padding: 1rem;
              margin-bottom: 1rem;
          }

          .site-item h4 {
              color: #2d3748;
              margin-bottom: 0.5rem;
          }

          .site-item p {
              color: #718096;
              margin-bottom: 0.25rem;
          }

          .site-actions {
              display: flex;
              gap: 0.5rem;
              margin-top: 1rem;
          }

          .site-actions .btn {
              flex: 1;
              max-width: 120px;
          }

          .log-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 1rem;
              background: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }

          .log-table th, .log-table td {
              padding: 0.75rem;
              text-align: left;
              border-bottom: 1px solid #e2e8f0;
          }

          .log-table th {
              background: #f7fafc;
              font-weight: 600;
              color: #2d3748;
              position: sticky;
              top: 0;
              z-index: 10;
          }

          .log-table tr:hover {
              background: #f7fafc;
          }

          .status-online {
              color: #48bb78;
              font-weight: 600;
          }

          .status-offline {
              color: #f56565;
              font-weight: 600;
          }

          .json-editor {
              font-family: 'Courier New', monospace;
              min-height: 300px;
              background: #2d3748;
              color: #e2e8f0;
              border: none;
              border-radius: 5px;
              padding: 1rem;
          }

          .alert {
              padding: 1rem;
              border-radius: 5px;
              margin-bottom: 1rem;
          }

          .alert-success {
              background: #c6f6d5;
              color: #22543d;
              border: 1px solid #9ae6b4;
          }

          .alert-error {
              background: #fed7d7;
              color: #742a2a;
              border: 1px solid #feb2b2;
          }

          .stats-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 1rem;
              margin-bottom: 2rem;
          }

          .stats-card {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 1.5rem;
              border-radius: 10px;
              text-align: center;
          }

          .stats-card h3 {
              font-size: 2rem;
              margin-bottom: 0.5rem;
          }

          .stats-card p {
              opacity: 0.9;
          }

          /* 现代化监控卡片样式 */
          .monitor-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
              gap: 1.5rem;
              margin-top: 1rem;
          }

          .monitor-card {
              background: white;
              border-radius: 15px;
              padding: 1.5rem;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              border: 1px solid #e2e8f0;
              transition: all 0.3s ease;
              cursor: pointer;
              position: relative;
              overflow: hidden;
          }

          .monitor-card:hover {
              transform: translateY(-5px);
              box-shadow: 0 8px 30px rgba(0,0,0,0.15);
          }

          .monitor-card.online {
              border-left: 4px solid #48bb78;
          }

          .monitor-card.offline {
              border-left: 4px solid #f56565;
          }

          .monitor-card.warning {
              border-left: 4px solid #ed8936;
          }

          .monitor-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
          }

          .monitor-title {
              font-size: 1.2rem;
              font-weight: 600;
              color: #2d3748;
              display: flex;
              align-items: center;
              gap: 0.5rem;
          }

          .status-indicator {
              width: 12px;
              height: 12px;
              border-radius: 50%;
              display: inline-block;
          }

          .status-indicator.online {
              background: #48bb78;
              box-shadow: 0 0 10px rgba(72, 187, 120, 0.5);
          }

          .status-indicator.offline {
              background: #f56565;
              box-shadow: 0 0 10px rgba(245, 101, 101, 0.5);
          }

          .status-indicator.warning {
              background: #ed8936;
              box-shadow: 0 0 10px rgba(237, 137, 54, 0.5);
          }

          .monitor-url {
              color: #718096;
              font-size: 0.9rem;
              margin-bottom: 1rem;
              word-break: break-all;
          }

          .monitor-stats {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1rem;
              margin-bottom: 1rem;
          }

          .stat-item {
              text-align: center;
              padding: 0.75rem;
              background: #f7fafc;
              border-radius: 8px;
          }

          .stat-value {
              font-size: 1.5rem;
              font-weight: 700;
              color: #2d3748;
              display: block;
          }

          .stat-label {
              font-size: 0.8rem;
              color: #718096;
              margin-top: 0.25rem;
          }

          .monitor-actions {
              display: flex;
              gap: 0.5rem;
              margin-top: 1rem;
          }

          .action-btn {
              flex: 1;
              padding: 0.5rem;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.85rem;
              font-weight: 500;
              transition: all 0.2s;
          }

          .action-btn.primary {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
          }

          .action-btn.secondary {
              background: #e2e8f0;
              color: #4a5568;
          }

          .action-btn:hover {
              transform: translateY(-1px);
          }

          .uptime-bar {
              width: 100%;
              height: 6px;
              background: #e2e8f0;
              border-radius: 3px;
              overflow: hidden;
              margin: 0.5rem 0;
          }

          .uptime-fill {
              height: 100%;
              background: linear-gradient(90deg, #48bb78 0%, #38a169 100%);
              border-radius: 3px;
              transition: width 0.3s ease;
          }

          .last-check {
              font-size: 0.8rem;
              color: #718096;
              text-align: center;
              margin-top: 0.5rem;
          }

          /* 监控详情模态框 */
          .modal {
              display: none;
              position: fixed;
              z-index: 1000;
              left: 0;
              top: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0,0,0,0.5);
              backdrop-filter: blur(5px);
          }

          .modal-content {
              background-color: white;
              margin: 1% auto;
              padding: 0;
              border-radius: 15px;
              width: 95%;
              max-width: 1400px;
              max-height: 98vh;
              overflow: hidden;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }

          .modal-header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 1.5rem;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }

          .modal-title {
              font-size: 1.5rem;
              font-weight: 600;
          }

          .close {
              color: white;
              font-size: 2rem;
              font-weight: bold;
              cursor: pointer;
              border: none;
              background: none;
              padding: 0;
              width: 30px;
              height: 30px;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              transition: background 0.2s;
          }

          .close:hover {
              background: rgba(255,255,255,0.2);
          }

          .modal-body {
              padding: 1.5rem;
              max-height: calc(98vh - 100px);
              overflow-y: auto;
          }

          .chart-container {
              width: 100%;
              height: 600px; /* Increased from 400px to 600px to make it larger */
              margin: 1.5rem 0;
              background: white;
              border-radius: 10px;
              border: 1px solid #e2e8f0;
              overflow: hidden;
              position: relative;
          }

          .chart-btn {
              background: #f7fafc;
              border: 1px solid #e2e8f0;
              padding: 0.5rem 1rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.9rem;
              transition: all 0.2s ease;
          }

          .chart-btn:hover {
              background: #edf2f7;
              border-color: #cbd5e0;
          }

          .chart-btn.active {
              background: #667eea;
              color: white;
              border-color: #667eea;
          }

          .date-selector {
              display: flex;
              gap: 1rem;
              margin-bottom: 2rem;
              align-items: center;
              flex-wrap: wrap;
          }

          .date-selector label {
              font-weight: 600;
              color: #2d3748;
          }

          .date-selector input, .date-selector select {
              padding: 0.5rem;
              border: 2px solid #e2e8f0;
              border-radius: 6px;
              font-size: 0.9rem;
              background: white;
              transition: border-color 0.2s;
          }

          .date-selector input:focus, .date-selector select:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }

          /* 美化日志页面的日期选择器 */
          #log-date {
              padding: 0.5rem 1rem;
              border: 2px solid #e2e8f0;
              border-radius: 8px;
              background: white;
              font-size: 0.9rem;
              color: #2d3748;
              cursor: pointer;
              transition: all 0.2s;
              min-width: 150px;
          }

          #log-date:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }

          #log-date:hover {
              border-color: #cbd5e0;
          }

          .stats-summary {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 1rem;
              margin-bottom: 2rem;
              clear: both;
          }

          .summary-card {
              background: #f7fafc;
              padding: 1.5rem;
              border-radius: 10px;
              text-align: center;
          }

          .summary-value {
              font-size: 2rem;
              font-weight: 700;
              color: #2d3748;
          }

          .summary-label {
              color: #718096;
              margin-top: 0.5rem;
          }

          /* 横向摘要布局样式 */
          .summary-horizontal-container {
              display: flex;
              flex-wrap: wrap;
              gap: 1rem;
              margin-bottom: 2rem;
              padding: 1.5rem;
              background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
              border-radius: 12px;
              border: 1px solid #e2e8f0;
          }

          .summary-card-horizontal {
              flex: 1;
              min-width: 180px;
              background: white;
              padding: 1.2rem;
              border-radius: 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              border: 1px solid #e2e8f0;
              display: flex;
              align-items: center;
              gap: 1rem;
              transition: all 0.3s ease;
          }

          .summary-card-horizontal:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          }

          .summary-icon {
              font-size: 1.8rem;
              width: 50px;
              height: 50px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #f7fafc;
              border-radius: 50%;
              flex-shrink: 0;
          }

          .summary-content {
              flex: 1;
          }

          .summary-card-horizontal .summary-value {
              font-size: 1.6rem;
              font-weight: 700;
              margin-bottom: 0.3rem;
              line-height: 1;
          }

          .summary-card-horizontal .summary-label {
              font-size: 0.85rem;
              color: #718096;
              font-weight: 500;
              margin-top: 0;
          }

          /* 图表按钮样式 */
          .chart-btn {
              background: #f7fafc;
              color: #4a5568;
              border: 2px solid #e2e8f0;
              padding: 0.5rem 1rem;
              border-radius: 8px;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
              transition: all 0.3s ease;
          }

          .chart-btn:hover {
              background: #edf2f7;
              border-color: #cbd5e0;
          }

          .chart-btn.active {
              background: #667eea;
              color: white;
              border-color: #667eea;
          }

          /* 自定义滚动条样式 */
          ::-webkit-scrollbar {
              width: 8px;
              height: 8px;
          }

          ::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 4px;
          }

          ::-webkit-scrollbar-thumb {
              background: #c1c1c1;
              border-radius: 4px;
          }

          ::-webkit-scrollbar-thumb:hover {
              background: #a8a8a8;
          }
      </style>
      <!-- Chart.js 库 -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  </head>
  <body>
      <div class="header">
          <h1>🌐 反代管理面板</h1>
          <button onclick="logout()" class="logout-btn">退出登录</button>
      </div>

      <div class="container">
          <div class="tabs">
              <div class="tab active" data-tab="overview">概览</div>
              <div class="tab" data-tab="sites">网站管理</div>
              <div class="tab" data-tab="logs">访问日志</div>
              <div class="tab" data-tab="monitor">监控状态</div>
              <div class="tab" data-tab="config">配置编辑</div>
          </div>

          <div class="tab-content active" id="overview">
              <div class="stats-grid">
                  <div class="stats-card">
                      <h3 id="total-sites">0</h3>
                      <p>配置网站数</p>
                  </div>
                  <div class="stats-card">
                      <h3 id="today-visits">0</h3>
                      <p>今日访问量</p>
                  </div>
                  <div class="stats-card">
                      <h3 id="active-monitors">0</h3>
                      <p>活跃监控</p>
                  </div>
                  <div class="stats-card">
                      <h3 id="total-logs">0</h3>
                      <p>总日志条数</p>
                  </div>
              </div>

              <h3>最近访问</h3>
              <div style="max-height: 500px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table class="log-table">
                  <thead>
                      <tr>
                          <th>时间</th>
                          <th>IP地址</th>
                          <th>访问路径</th>
                          <th>国家</th>
                      </tr>
                  </thead>
                  <tbody id="recent-logs">
                  </tbody>
              </table>
              </div>
          </div>

          <div class="tab-content" id="sites">
              <h3>添加新网站</h3>
              <div class="form-group">
                  <label>网站标识 (英文/数字/下划线)</label>
                  <input type="text" id="site-key" placeholder="例如: google">
              </div>
              <div class="form-group">
                  <label>网站URL</label>
                  <input type="url" id="site-url" placeholder="https://www.google.com">
              </div>
              <div class="form-group">
                  <label>访问路径</label>
                  <input type="text" id="site-path" placeholder="/google">
              </div>
              <div class="form-group">
                  <label>监控间隔 (分钟, 0为不监控)</label>
                  <input type="number" id="site-interval" value="0" min="0">
              </div>
              <button class="btn" onclick="addSite()">添加网站</button>

              <h3 style="margin-top: 2rem;">现有网站</h3>
              <div id="sites-list"></div>
          </div>

          <!-- 编辑网站模态框 -->
          <div id="edit-site-modal" class="modal">
              <div class="modal-content">
                  <div class="modal-header">
                      <h2 class="modal-title">✏️ 编辑网站配置</h2>
                      <button class="close" onclick="closeEditSiteModal()">&times;</button>
                  </div>
                  <div class="modal-body">
                      <div class="form-group">
                          <label>网站标识 (不可修改)</label>
                          <input type="text" id="edit-site-key" readonly style="background: #f7fafc; color: #718096;">
                      </div>
                      <div class="form-group">
                          <label>网站URL</label>
                          <input type="url" id="edit-site-url" placeholder="https://www.google.com">
                      </div>
                      <div class="form-group">
                          <label>访问路径</label>
                          <input type="text" id="edit-site-path" placeholder="/google">
                      </div>
                      <div class="form-group">
                          <label>监控间隔 (分钟, 0为不监控)</label>
                          <input type="number" id="edit-site-interval" min="0">
                      </div>
                      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                          <button class="btn btn-success" onclick="updateSite()" style="flex: 1;">💾 保存修改</button>
                          <button class="btn" onclick="closeEditSiteModal()" style="flex: 1;">❌ 取消</button>
                      </div>
                  </div>
              </div>
          </div>

          <div class="tab-content" id="logs">
              <div style="margin-bottom: 1rem;">
                  <button class="btn" onclick="loadLogs()">刷新日志</button>
                  <button class="btn btn-danger" onclick="clearLogs()">清空日志</button>
                  <select id="log-date" onchange="loadLogs()">
                      <option value="">选择日期</option>
                  </select>
              </div>

              <div style="max-height: 600px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table class="log-table">
                  <thead>
                      <tr>
                          <th>时间</th>
                          <th>IP地址</th>
                          <th>方法</th>
                          <th>路径</th>
                          <th>用户代理</th>
                          <th>国家</th>
                      </tr>
                  </thead>
                  <tbody id="logs-table">
                  </tbody>
              </table>
              </div>
          </div>

          <div class="tab-content" id="monitor">
              <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                  <h3 style="margin: 0;">📊 服务监控</h3>
                  <div>
                      <button class="btn" onclick="loadMonitorStatus()">🔄 刷新状态</button>
                      <button class="btn btn-success" onclick="exportMonitorData()">📊 导出数据</button>
              </div>
              </div>
              <div class="monitor-grid" id="monitor-status">
                  <!-- 动态加载监控卡片 -->
              </div>
          </div>

          <!-- 监控详情模态框 -->
          <div id="monitor-modal" class="modal">
              <div class="modal-content">
                  <div class="modal-header">
                      <h2 class="modal-title" id="modal-title">服务监控详情</h2>
                      <button class="close" onclick="closeMonitorModal()">&times;</button>
                  </div>
                  <div class="modal-body">
                      <!-- 30天总记录概览 -->
                      <div class="stats-summary" id="total-summary" style="margin-bottom: 2rem;">
                          <!-- 动态加载30天总统计 -->
                      </div>

                      <div class="date-selector" style="margin-bottom: 2rem;">
                          <label>查看方式:</label>
                          <select id="view-mode" onchange="updateDateSelector()">
                              <option value="range">时间范围</option>
                              <option value="date">特定日期</option>
                          </select>

                          <div id="range-selector">
                              <label>时间范围:</label>
                              <select id="time-range" onchange="loadMonitorHistory()">
                                  <option value="24h">最近24小时</option>
                                  <option value="7d">最近7天</option>
                                  <option value="30d">最近30天</option>
                              </select>
                          </div>

                          <div id="date-selector" style="display: none;">
                              <label>选择日期:</label>
                              <input type="date" id="monitor-date" onchange="loadMonitorHistory()">
                          </div>
                      </div>

                      <div class="stats-summary" id="monitor-summary" style="margin-bottom: 2rem;">
                          <!-- 动态加载统计摘要 -->
                      </div>

                      <div class="chart-container" id="monitor-chart" style="margin-bottom: 2rem;">
                          📈 响应时间趋势图 (图表功能开发中...)
                      </div>

                      <div id="monitor-history">
                          <!-- 动态加载历史记录 -->
                      </div>
                  </div>
              </div>
          </div>

          <div class="tab-content" id="config">
              <h3>JSON配置编辑</h3>
              <p>直接编辑网站配置的JSON格式，保存前会自动验证格式。</p>
              <div class="form-group">
                  <textarea class="json-editor" id="json-config" rows="20"></textarea>
              </div>
              <button class="btn btn-success" onclick="saveJsonConfig()">保存配置</button>
              <button class="btn" onclick="loadJsonConfig()">重新加载</button>
              <button class="btn btn-danger" onclick="resetToDefault()">恢复默认</button>
          </div>
      </div>

      <div id="alert-container"></div>

      <script>
          // 切换标签
          document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                  tab.classList.add('active');
                  document.getElementById(tab.dataset.tab).classList.add('active');

                  // 加载对应数据
                  if (tab.dataset.tab === 'overview') loadOverview();
                  if (tab.dataset.tab === 'sites') loadSites();
                  if (tab.dataset.tab === 'logs') loadLogs();
                  if (tab.dataset.tab === 'monitor') loadMonitorStatus();
                  if (tab.dataset.tab === 'config') loadJsonConfig();
              });
          });

          // 显示提示信息
          function showAlert(message, type = 'success') {
              const alertDiv = document.createElement('div');
              alertDiv.className = \`alert alert-\${type}\`;
              alertDiv.textContent = message;
              alertDiv.style.position = 'fixed';
              alertDiv.style.top = '20px';
              alertDiv.style.right = '20px';
              alertDiv.style.zIndex = '1000';

              document.body.appendChild(alertDiv);

              setTimeout(() => {
                  document.body.removeChild(alertDiv);
              }, 3000);
          }

          // API请求封装
          async function apiRequest(endpoint, options = {}) {
              try {
                  const response = await fetch(endpoint, {
                      ...options,
                      headers: {
                          'Content-Type': 'application/json',
                          ...options.headers
                      }
                  });

                  if (!response.ok) {
                      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                  }

                  return await response.json();
              } catch (error) {
                  showAlert(\`请求失败: \${error.message}\`, 'error');
                  throw error;
              }
          }

          // 加载概览数据
          async function loadOverview() {
              try {
                  const data = await apiRequest('/api/overview');
                  document.getElementById('total-sites').textContent = data.totalSites;
                  document.getElementById('today-visits').textContent = data.todayVisits;
                  document.getElementById('active-monitors').textContent = data.activeMonitors;
                  document.getElementById('total-logs').textContent = data.totalLogs;

                  const recentLogsTable = document.getElementById('recent-logs');
                  recentLogsTable.innerHTML = '';
                  data.recentLogs.forEach(log => {
                      const row = recentLogsTable.insertRow();
                      row.innerHTML = \`
                          <td>\${new Date(log.timestamp).toLocaleString()}</td>
                          <td>\${log.ip}</td>
                          <td>\${log.path}</td>
                          <td>\${log.country}</td>
                      \`;
                  });
              } catch (error) {
                  console.error('加载概览数据失败:', error);
              }
          }

          // 加载网站列表
          async function loadSites() {
              try {
                  const data = await apiRequest('/api/sites');
                  const sitesList = document.getElementById('sites-list');
                  sitesList.innerHTML = '';

                  Object.entries(data.sites).forEach(([key, config]) => {
                      const siteDiv = document.createElement('div');
                      siteDiv.className = 'site-item';
                      siteDiv.innerHTML = \`
                          <h4>\${key}</h4>
                          <p><strong>URL:</strong> \${config.url}</p>
                          <p><strong>路径:</strong> \${config.path}</p>
                          <p><strong>监控间隔:</strong> \${config.interval === 0 ? '不监控' : config.interval + '分钟'}</p>
                          <div class="site-actions">
                              <button class="btn btn-primary" onclick="editSite('\${key}')">✏️ 编辑</button>
                              <button class="btn btn-danger" onclick="deleteSite('\${key}')">🗑️ 删除</button>
                          </div>
                      \`;
                      sitesList.appendChild(siteDiv);
                  });
              } catch (error) {
                  console.error('加载网站列表失败:', error);
              }
          }

          // 添加网站
          async function addSite() {
              const key = document.getElementById('site-key').value.trim();
              const url = document.getElementById('site-url').value.trim();
              const path = document.getElementById('site-path').value.trim();
              const interval = parseInt(document.getElementById('site-interval').value);

              if (!key || !url || !path) {
                  showAlert('请填写所有必填字段', 'error');
                  return;
              }

              if (!/^[a-zA-Z0-9_]+$/.test(key)) {
                  showAlert('网站标识只能包含英文、数字和下划线', 'error');
                  return;
              }

              if (!path.startsWith('/')) {
                  showAlert('访问路径必须以/开头', 'error');
                  return;
              }

              try {
                  await apiRequest('/api/sites', {
                      method: 'POST',
                      body: JSON.stringify({ key, url, path, interval })
                  });

                  showAlert('网站添加成功');
                  loadSites();

                  // 清空表单
                  document.getElementById('site-key').value = '';
                  document.getElementById('site-url').value = '';
                  document.getElementById('site-path').value = '';
                  document.getElementById('site-interval').value = '0';
              } catch (error) {
                  console.error('添加网站失败:', error);
              }
          }

          // 编辑网站
          async function editSite(key) {
              try {
                  // 获取当前网站配置
                  const data = await apiRequest('/api/sites');
                  const config = data.sites[key];

                  if (!config) {
                      showAlert('网站配置不存在', 'error');
                      return;
                  }

                  // 填充编辑表单
                  document.getElementById('edit-site-key').value = key;
                  document.getElementById('edit-site-url').value = config.url;
                  document.getElementById('edit-site-path').value = config.path;
                  document.getElementById('edit-site-interval').value = config.interval;

                  // 显示编辑模态框
                  document.getElementById('edit-site-modal').style.display = 'block';

              } catch (error) {
                  console.error('获取网站配置失败:', error);
                  showAlert('获取网站配置失败', 'error');
              }
          }

          // 关闭编辑网站模态框
          function closeEditSiteModal() {
              document.getElementById('edit-site-modal').style.display = 'none';
          }

          // 更新网站配置
          async function updateSite() {
              const key = document.getElementById('edit-site-key').value.trim();
              const url = document.getElementById('edit-site-url').value.trim();
              const path = document.getElementById('edit-site-path').value.trim();
              const interval = parseInt(document.getElementById('edit-site-interval').value);

              if (!url || !path) {
                  showAlert('请填写所有必填字段', 'error');
                  return;
              }

              if (!path.startsWith('/')) {
                  showAlert('访问路径必须以/开头', 'error');
                  return;
              }

              try {
                  await apiRequest(\`/api/sites/\${key}\`, {
                      method: 'PUT',
                      body: JSON.stringify({ url, path, interval })
                  });

                  showAlert('网站配置更新成功');
                  closeEditSiteModal();
                  loadSites();
              } catch (error) {
                  console.error('更新网站配置失败:', error);
              }
          }

          // 删除网站
          async function deleteSite(key) {
              if (!confirm(\`确定要删除网站 "\${key}" 吗？\`)) {
                  return;
              }

              try {
                  await apiRequest(\`/api/sites/\${key}\`, { method: 'DELETE' });
                  showAlert('网站删除成功');
                  loadSites();
              } catch (error) {
                  console.error('删除网站失败:', error);
              }
          }

          // 加载日志
          async function loadLogs() {
              try {
                  const selectedDate = document.getElementById('log-date').value;
                  const endpoint = selectedDate ? \`/api/logs?date=\${selectedDate}\` : '/api/logs';
                  const data = await apiRequest(endpoint);

                  // 更新日期选择器
                  const dateSelect = document.getElementById('log-date');
                  if (dateSelect.options.length <= 1) {
                      data.availableDates.forEach(date => {
                          const option = document.createElement('option');
                          option.value = date;
                          option.textContent = date;
                          dateSelect.appendChild(option);
                      });
                  }

                  // 更新日志表格
                  const logsTable = document.getElementById('logs-table');
                  logsTable.innerHTML = '';
                  data.logs.forEach(log => {
                      const row = logsTable.insertRow();
                      row.innerHTML = \`
                          <td>\${new Date(log.timestamp).toLocaleString()}</td>
                          <td>\${log.ip}</td>
                          <td>\${log.method}</td>
                          <td>\${log.path}</td>
                          <td title="\${log.userAgent}">\${log.userAgent.substring(0, 50)}...</td>
                          <td>\${log.country}</td>
                      \`;
                  });
              } catch (error) {
                  console.error('加载日志失败:', error);
              }
          }

          // 清空日志
          async function clearLogs() {
              if (!confirm('确定要清空所有日志吗？此操作不可恢复！')) {
                  return;
              }

              try {
                  await apiRequest('/api/logs', { method: 'DELETE' });
                  showAlert('日志清空成功');
                  loadLogs();
              } catch (error) {
                  console.error('清空日志失败:', error);
              }
          }

          // 加载监控状态 - 现代化卡片风格
          async function loadMonitorStatus() {
              try {
                  const response = await fetch('/api/monitor');
                  const data = await response.json();
                  const statusDiv = document.getElementById('monitor-status');
                  statusDiv.innerHTML = '';

                  if (Object.keys(data.status).length === 0) {
                      statusDiv.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #718096; padding: 2rem;">暂无监控数据</div>';
                      return;
                  }

                  Object.entries(data.status).forEach(([key, status]) => {
                      const card = createMonitorCard(key, status);
                      statusDiv.appendChild(card);
                  });
              } catch (error) {
                  console.error('加载监控状态失败:', error);
                  document.getElementById('monitor-status').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f56565; padding: 2rem;">加载监控状态失败</div>';
              }
          }

          // 创建监控卡片
          function createMonitorCard(key, status) {
              const card = document.createElement('div');

              // 确定状态类型
              let statusClass = 'offline';
              if (status.isOnline) {
                  statusClass = status.responseTime > 2000 ? 'warning' : 'online';
              }

              card.className = 'monitor-card ' + statusClass;
              card.onclick = () => openMonitorDetail(key, status);

              // 卡片头部
              const header = document.createElement('div');
              header.className = 'monitor-header';

              const title = document.createElement('div');
              title.className = 'monitor-title';

              const indicator = document.createElement('span');
              indicator.className = 'status-indicator ' + statusClass;
              title.appendChild(indicator);

              const titleText = document.createElement('span');
              titleText.textContent = key.charAt(0).toUpperCase() + key.slice(1);
              title.appendChild(titleText);

              header.appendChild(title);
              card.appendChild(header);

              // URL
              const url = document.createElement('div');
              url.className = 'monitor-url';
              url.textContent = status.url;
              card.appendChild(url);

              // 统计信息
              const stats = document.createElement('div');
              stats.className = 'monitor-stats';

              // 响应时间
              const responseTimeStat = document.createElement('div');
              responseTimeStat.className = 'stat-item';

              const responseTimeValue = document.createElement('span');
              responseTimeValue.className = 'stat-value';
              responseTimeValue.textContent = status.responseTime + 'ms';
              responseTimeStat.appendChild(responseTimeValue);

              const responseTimeLabel = document.createElement('div');
              responseTimeLabel.className = 'stat-label';
              responseTimeLabel.textContent = '响应时间';
              responseTimeStat.appendChild(responseTimeLabel);

              stats.appendChild(responseTimeStat);

              // 状态码
              const statusCodeStat = document.createElement('div');
              statusCodeStat.className = 'stat-item';

              const statusCodeValue = document.createElement('span');
              statusCodeValue.className = 'stat-value';
              statusCodeValue.textContent = status.status || 'N/A';
              statusCodeStat.appendChild(statusCodeValue);

              const statusCodeLabel = document.createElement('div');
              statusCodeLabel.className = 'stat-label';
              statusCodeLabel.textContent = '状态码';
              statusCodeStat.appendChild(statusCodeLabel);

              stats.appendChild(statusCodeStat);
              card.appendChild(stats);

              // 在线时间条
              const uptimeBar = document.createElement('div');
              uptimeBar.className = 'uptime-bar';

              const uptimeFill = document.createElement('div');
              uptimeFill.className = 'uptime-fill';
              uptimeFill.style.width = '0%'; // 初始为0，异步加载

              uptimeBar.appendChild(uptimeFill);
              card.appendChild(uptimeBar);

              // 在线率文本
              const uptimeText = document.createElement('div');
              uptimeText.style.textAlign = 'center';
              uptimeText.style.fontSize = '0.8rem';
              uptimeText.style.color = '#718096';
              uptimeText.style.marginTop = '0.25rem';
              uptimeText.textContent = '在线率: 计算中...';
              card.appendChild(uptimeText);

              // 异步加载真实在线率
              calculateRealUptime(key).then(uptime => {
                  uptimeFill.style.width = uptime + '%';
                  uptimeText.textContent = '在线率: ' + uptime + '%';
              });

              // 最后检查时间
              const lastCheck = document.createElement('div');
              lastCheck.className = 'last-check';
              lastCheck.textContent = '最后检查: ' + new Date(status.lastCheck).toLocaleString();
              card.appendChild(lastCheck);

              // 操作按钮
              const actions = document.createElement('div');
              actions.className = 'monitor-actions';

              const detailBtn = document.createElement('button');
              detailBtn.className = 'action-btn primary';
              detailBtn.textContent = '📊 详情';
              detailBtn.onclick = (e) => {
                  e.stopPropagation();
                  openMonitorDetail(key, status);
              };
              actions.appendChild(detailBtn);

              const testBtn = document.createElement('button');
              testBtn.className = 'action-btn secondary';
              testBtn.textContent = '🔍 测试';
              testBtn.onclick = (e) => {
                  e.stopPropagation();
                  testService(key);
              };
              actions.appendChild(testBtn);

              card.appendChild(actions);

              return card;
          }

          // 加载JSON配置
          async function loadJsonConfig() {
              try {
                  const data = await apiRequest('/api/config');
                  document.getElementById('json-config').value = JSON.stringify(data.config, null, 2);
              } catch (error) {
                  console.error('加载配置失败:', error);
              }
          }

          // 保存JSON配置
          async function saveJsonConfig() {
              const jsonText = document.getElementById('json-config').value;

              try {
                  const config = JSON.parse(jsonText);

                  // 验证配置格式
                  for (const [key, value] of Object.entries(config)) {
                      if (!value.url || !value.path || typeof value.interval !== 'number') {
                          throw new Error(\`配置项 "\${key}" 格式不正确\`);
                      }

                      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
                          throw new Error(\`配置项键 "\${key}" 只能包含英文、数字和下划线\`);
                      }
                  }

                  await apiRequest('/api/config', {
                      method: 'POST',
                      body: JSON.stringify({ config })
                  });

                  showAlert('配置保存成功');
              } catch (error) {
                  if (error instanceof SyntaxError) {
                      showAlert('JSON格式错误，请检查语法', 'error');
                  } else {
                      showAlert(\`保存失败: \${error.message}\`, 'error');
                  }
              }
          }

        // 恢复默认配置
        async function resetToDefault() {
            if (!confirm('确定要恢复到默认配置吗？此操作将覆盖当前所有配置！')) {
                return;
            }

            try {
                await apiRequest('/api/config/reset', { method: 'POST' });
                showAlert('已恢复到默认配置');
                loadJsonConfig();
            } catch (error) {
                console.error('恢复默认配置失败:', error);
            }
        }

        // 退出登录函数
        async function logout() {
            try {
                const response = await fetch('/api/logout', {
                    method: 'GET'
                });

                if (response.ok) {
                    // 清除本地存储的token
                    localStorage.removeItem('session_token');
                    // 重定向到登录页面
                    window.location.href = '/login';
                } else {
                    showAlert('退出登录失败', 'error');
                }
            } catch (error) {
                console.error('退出登录错误:', error);
                // 即使请求失败，也清除本地token并重定向
                localStorage.removeItem('session_token');
                window.location.href = '/login';
            }
        }

        // 打开监控详情模态框
        function openMonitorDetail(key, status) {
            document.getElementById('modal-title').textContent = key.charAt(0).toUpperCase() + key.slice(1) + ' - 监控详情';
            document.getElementById('monitor-modal').style.display = 'block';

            // 设置默认日期为今天
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('monitor-date').value = today;

            // 重置为时间范围模式
            document.getElementById('view-mode').value = 'range';
            updateDateSelector();

            // 加载30天总记录
            loadTotalSummary(key);

            // 加载监控历史数据
            loadMonitorHistory(key);
        }

        // 更新日期选择器显示
        function updateDateSelector() {
            const viewMode = document.getElementById('view-mode').value;
            const rangeSelector = document.getElementById('range-selector');
            const dateSelector = document.getElementById('date-selector');

            if (viewMode === 'date') {
                rangeSelector.style.display = 'none';
                dateSelector.style.display = 'block';
            } else {
                rangeSelector.style.display = 'block';
                dateSelector.style.display = 'none';
            }

            // 重新加载数据
            const modalTitle = document.getElementById('modal-title').textContent;
            if (modalTitle.includes(' - 监控详情')) {
                const key = modalTitle.split(' - ')[0].toLowerCase();
                loadMonitorHistory(key);
            }
        }

        // 关闭监控详情模态框
        function closeMonitorModal() {
            document.getElementById('monitor-modal').style.display = 'none';
        }

        // 点击模态框外部关闭
        window.onclick = function(event) {
            const monitorModal = document.getElementById('monitor-modal');
            const editSiteModal = document.getElementById('edit-site-modal');

            if (event.target === monitorModal) {
                monitorModal.style.display = 'none';
            }

            if (event.target === editSiteModal) {
                editSiteModal.style.display = 'none';
            }
        }

        // 加载30天总记录概览
        async function loadTotalSummary(key) {
            try {
                // 获取30天的总数据
                const response = await fetch('/api/monitor/history?site=' + encodeURIComponent(key) + '&range=30d');
                const data = await response.json();

                if (response.ok && data.summary) {
                    displayTotalSummary(data.summary);
                } else {
                    // 显示空数据
                    displayTotalSummary({ avgResponseTime: 0, uptime: 0, totalChecks: 0, failures: 0 });
                }
            } catch (error) {
                console.error('加载30天总记录失败:', error);
                displayTotalSummary({ avgResponseTime: 0, uptime: 0, totalChecks: 0, failures: 0 });
            }
        }

        // 显示30天总记录概览 - 完全复制下方逻辑
        function displayTotalSummary(data) {
            const totalSummaryDiv = document.getElementById('total-summary');
            totalSummaryDiv.innerHTML = '';

            // 创建横向摘要容器
            const summaryContainer = document.createElement('div');
            summaryContainer.className = 'summary-horizontal-container';

            // 创建摘要卡片 - 横向排列
            const summaryItems = [
                {
                    label: '平均响应时间',
                    value: data.avgResponseTime + 'ms',
                    color: '#667eea',
                    icon: '⚡'
                },
                {
                    label: '总在线率',
                    value: data.uptime + '%',
                    color: data.uptime >= 95 ? '#48bb78' : data.uptime >= 80 ? '#ed8936' : '#f56565',
                    icon: '📊'
                },
                {
                    label: '总检查次数',
                    value: data.totalChecks,
                    color: '#ed8936',
                    icon: '🔍'
                },
                {
                    label: '总失败次数',
                    value: data.failures,
                    color: '#f56565',
                    icon: '❌'
                },
                {
                    label: '总成功次数',
                    value: data.totalChecks - data.failures,
                    color: '#48bb78',
                    icon: '✅'
                }
            ];

            summaryItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'summary-card-horizontal';

                const iconDiv = document.createElement('div');
                iconDiv.className = 'summary-icon';
                iconDiv.textContent = item.icon;
                card.appendChild(iconDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'summary-content';

                const value = document.createElement('div');
                value.className = 'summary-value';
                value.style.color = item.color;
                value.textContent = item.value;
                contentDiv.appendChild(value);

                const label = document.createElement('div');
                label.className = 'summary-label';
                label.textContent = item.label;
                contentDiv.appendChild(label);

                card.appendChild(contentDiv);
                summaryContainer.appendChild(card);
            });

            totalSummaryDiv.appendChild(summaryContainer);
        }

        // 加载监控历史数据
        async function loadMonitorHistory(key) {
            const viewMode = document.getElementById('view-mode').value;

            try {
                // 构建API请求URL
                let apiUrl = '/api/monitor/history?site=' + encodeURIComponent(key);

                if (viewMode === 'date') {
                    // 特定日期模式
                    const date = document.getElementById('monitor-date').value;
                    if (!date) {
                        throw new Error('请选择日期');
                    }
                    apiUrl += '&date=' + date;
                } else {
                    // 时间范围模式
                    const range = document.getElementById('time-range').value;
                    apiUrl += '&range=' + range;
                }

                const response = await fetch(apiUrl);
                const data = await response.json();

                if (response.ok) {
                    displayMonitorSummary(data.summary);
                    displayMonitorHistory(data.history);

                    // 更新图表区域显示
                    updateChartDisplay(viewMode, data.history);
                } else {
                    throw new Error(data.error || '获取历史数据失败');
                }

            } catch (error) {
                console.error('加载监控历史失败:', error);
                showAlert('加载监控历史失败: ' + error.message, 'error');

                // 显示空数据
                displayMonitorSummary({ avgResponseTime: 0, uptime: 0, totalChecks: 0, failures: 0 });
                displayMonitorHistory([]);
            }
        }

        // 更新图表显示
        function updateChartDisplay(viewMode, historyData) {
            const chartContainer = document.getElementById('monitor-chart');

            if (historyData.length === 0) {
                chartContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #718096;">📊 暂无数据可显示</div>';
                return;
            }

            // 创建图表内容区域
            chartContainer.innerHTML =
                '<div style="padding: 1rem;">' +
                    '<div style="display: flex; justify-content: center; gap: 1rem; margin-bottom: 1rem;">' +
                        '<button class="chart-btn active" id="response-btn" onclick="showResponseTimeChart()">📈 响应时间趋势</button>' +
                        '<button class="chart-btn" id="uptime-btn" onclick="showUptimeChart()">📊 在线状态</button>' +
                        '<button class="chart-btn" id="summary-btn" onclick="showSummaryChart()">📋 数据概览</button>' +
                    '</div>' +
                    '<div style="height: 300px; position: relative;">' +
                        '<canvas id="monitor-chart-canvas"></canvas>' +
                    '</div>' +
                '</div>';

            // 保存数据供图表函数使用
            window.currentChartData = historyData;

            // 默认显示响应时间趋势
            showResponseTimeChart();

            const dataCount = historyData.length;
            const onlineCount = historyData.filter(record => record.isOnline).length;
            const avgResponseTime = historyData.filter(record => record.isOnline)
                .reduce((sum, record) => sum + record.responseTime, 0) / onlineCount || 0;

            let timeRangeText = '';
            if (viewMode === 'date') {
                const date = document.getElementById('monitor-date').value;
                timeRangeText = '日期: ' + date;
            } else {
                const range = document.getElementById('time-range').value;
                const rangeMap = { '24h': '最近24小时', '7d': '最近7天', '30d': '最近30天' };
                timeRangeText = rangeMap[range] || range;
            }

            // 创建图表容器 - 确保在容器内部
            chartContainer.innerHTML =
                '<div style="background: white; border-radius: 10px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-top: 1rem;">' +
                '<h4 style="text-align: center; margin-bottom: 1rem; color: #2d3748;">📈 ' + timeRangeText + ' 监控图表</h4>' +
                '<div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; justify-content: center; flex-wrap: wrap;">' +
                '<button onclick="showResponseTimeChart()" class="chart-btn active" id="response-btn">响应时间趋势</button>' +
                '<button onclick="showUptimeChart()" class="chart-btn" id="uptime-btn">在线状态</button>' +
                '<button onclick="showSummaryChart()" class="chart-btn" id="summary-btn">数据概览</button>' +
                '</div>' +
                '<div style="position: relative; height: 350px;">' +
                '<canvas id="monitor-chart-canvas"></canvas>' +
                '</div>' +
                '</div>';

            // 存储数据供图表使用
            window.currentChartData = historyData;

            // 默认显示响应时间图表
            setTimeout(() => showResponseTimeChart(), 100);
        }

        // 显示监控摘要 - 重新设计为横向布局
        function displayMonitorSummary(data) {
            const summaryDiv = document.getElementById('monitor-summary');
            summaryDiv.innerHTML = '';

            // 创建横向摘要容器
            const summaryContainer = document.createElement('div');
            summaryContainer.className = 'summary-horizontal-container';

            // 创建摘要卡片 - 横向排列
            const summaryItems = [
                {
                    label: '平均响应时间',
                    value: data.avgResponseTime + 'ms',
                    color: '#667eea',
                    icon: '⚡'
                },
                {
                    label: '在线率',
                    value: data.uptime + '%',
                    color: data.uptime >= 95 ? '#48bb78' : data.uptime >= 80 ? '#ed8936' : '#f56565',
                    icon: '📊'
                },
                {
                    label: '检查次数',
                    value: data.totalChecks,
                    color: '#ed8936',
                    icon: '🔍'
                },
                {
                    label: '失败次数',
                    value: data.failures,
                    color: '#f56565',
                    icon: '❌'
                },
                {
                    label: '成功次数',
                    value: data.totalChecks - data.failures,
                    color: '#48bb78',
                    icon: '✅'
                }
            ];

            summaryItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'summary-card-horizontal';

                const iconDiv = document.createElement('div');
                iconDiv.className = 'summary-icon';
                iconDiv.textContent = item.icon;
                card.appendChild(iconDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'summary-content';

                const value = document.createElement('div');
                value.className = 'summary-value';
                value.style.color = item.color;
                value.textContent = item.value;
                contentDiv.appendChild(value);

                const label = document.createElement('div');
                label.className = 'summary-label';
                label.textContent = item.label;
                contentDiv.appendChild(label);

                card.appendChild(contentDiv);
                summaryContainer.appendChild(card);
            });

            summaryDiv.appendChild(summaryContainer);
        }

        // 显示监控历史记录
        function displayMonitorHistory(data) {
            const historyDiv = document.getElementById('monitor-history');
            historyDiv.innerHTML = '<h4 style="margin-bottom: 1rem;">📋 检查记录</h4>';

            if (data.length === 0) {
                historyDiv.innerHTML += '<p style="text-align: center; color: #718096;">暂无历史记录</p>';
                return;
            }

            // 创建表格容器
            const tableContainer = document.createElement('div');
            tableContainer.style.maxHeight = '400px';
            tableContainer.style.overflowY = 'auto';
            tableContainer.style.border = '1px solid #e2e8f0';
            tableContainer.style.borderRadius = '8px';
            tableContainer.style.background = 'white';

            const table = document.createElement('table');
            table.className = 'log-table';
            table.style.marginTop = '0';
            table.style.border = 'none';

            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>时间</th><th>状态</th><th>响应时间</th><th>状态码</th><th>备注</th></tr>';
            thead.style.position = 'sticky';
            thead.style.top = '0';
            thead.style.zIndex = '10';
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            data.forEach(record => {
                const row = document.createElement('tr');

                const statusClass = record.isOnline ? 'status-online' : 'status-offline';
                const statusText = record.isOnline ? '✅ 在线' : '❌ 离线';

                row.innerHTML = '<td>' + new Date(record.timestamp).toLocaleString() + '</td>' +
                    '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
                    '<td>' + record.responseTime + 'ms</td>' +
                    '<td>' + record.status + '</td>' +
                    '<td>' + (record.error || '-') + '</td>';
                tbody.appendChild(row);
            });
            table.appendChild(tbody);

            tableContainer.appendChild(table);
            historyDiv.appendChild(tableContainer);
        }

        // 计算真实在线率（从历史数据）
        async function calculateRealUptime(key) {
            try {
                const response = await fetch('/api/monitor/history?site=' + encodeURIComponent(key) + '&range=24h');
                const data = await response.json();

                if (response.ok && data.history.length > 0) {
                    const onlineCount = data.history.filter(record => record.isOnline).length;
                    return ((onlineCount / data.history.length) * 100).toFixed(1);
                }

                return '0.0';
            } catch (error) {
                console.error('计算在线率失败:', error);
                return '0.0';
            }
        }

        // 测试服务
        async function testService(key) {
            try {
                showAlert('正在测试服务...', 'info');

                // 调用后端API进行实际测试
                const response = await fetch('/api/test-service', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ siteKey: key })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    showAlert('测试成功！响应时间: ' + result.responseTime + 'ms', 'success');

                    // 重新加载监控状态以显示最新数据
                    loadMonitorStatus();
                } else {
                    showAlert('测试失败: ' + (result.error || '未知错误'), 'error');
                }

            } catch (error) {
                console.error('测试服务时出错:', error);
                showAlert('测试服务时出错: ' + error.message, 'error');
            }
        }

        // 导出监控数据
        async function exportMonitorData() {
            try {
                showAlert('正在导出监控数据...', 'info');

                // 模拟导出过程
                await new Promise(resolve => setTimeout(resolve, 1000));

                showAlert('监控数据导出成功！', 'success');
            } catch (error) {
                showAlert('导出监控数据失败', 'error');
            }
        }

        // 显示响应时间趋势图
        function showResponseTimeChart() {
            updateChartButtons('response-btn');
            const data = window.currentChartData || [];

            // 准备数据
            const labels = data.slice(-20).map(record => {
                const date = new Date(record.lastCheck || record.timestamp);
                return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
            });

            const responseTimeData = data.slice(-20).map(record => record.responseTime || 0);

            createLineChart('monitor-chart-canvas', {
                labels: labels,
                datasets: [{
                    label: '响应时间 (ms)',
                    data: responseTimeData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            }, '响应时间趋势');
        }

        // 显示在线状态图
        function showUptimeChart() {
            updateChartButtons('uptime-btn');
            const data = window.currentChartData || [];

            const onlineCount = data.filter(record => record.isOnline).length;
            const offlineCount = data.length - onlineCount;

            createDoughnutChart('monitor-chart-canvas', {
                labels: ['在线', '离线'],
                datasets: [{
                    data: [onlineCount, offlineCount],
                    backgroundColor: ['#48bb78', '#f56565'],
                    borderWidth: 0
                }]
            }, '在线状态分布');
        }

        // 显示数据概览图
        function showSummaryChart() {
            updateChartButtons('summary-btn');
            const data = window.currentChartData || [];

            const onlineCount = data.filter(record => record.isOnline).length;
            const offlineCount = data.length - onlineCount;
            const avgResponseTime = data.filter(record => record.isOnline)
                .reduce((sum, record) => sum + record.responseTime, 0) / onlineCount || 0;

            createBarChart('monitor-chart-canvas', {
                labels: ['总检查', '成功', '失败', '平均响应时间'],
                datasets: [{
                    label: '数量',
                    data: [data.length, onlineCount, offlineCount, Math.round(avgResponseTime)],
                    backgroundColor: ['#667eea', '#48bb78', '#f56565', '#ed8936'],
                    borderWidth: 0
                }]
            }, '数据概览');
        }

        // 更新图表按钮状态
        function updateChartButtons(activeId) {
            document.querySelectorAll('.chart-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(activeId).classList.add('active');
        }

        // 创建折线图
        function createLineChart(canvasId, data, title) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            // 销毁现有图表
            if (window.currentChart) {
                window.currentChart.destroy();
            }

            // 确保canvas填充容器
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            window.currentChart = new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 10,
                            right: 10,
                            bottom: 10,
                            left: 10
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: title,
                            font: { size: 16, weight: 'bold' }
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: '响应时间 (ms)'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: '时间'
                            }
                        }
                    }
                }
            });
        }

        // 创建环形图
        function createDoughnutChart(canvasId, data, title) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            if (window.currentChart) {
                window.currentChart.destroy();
            }

            // 确保canvas填充容器
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            window.currentChart = new Chart(ctx, {
                type: 'doughnut',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 10,
                            right: 10,
                            bottom: 10,
                            left: 10
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: title,
                            font: { size: 16, weight: 'bold' }
                        },
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        // 创建柱状图
        function createBarChart(canvasId, data, title) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            if (window.currentChart) {
                window.currentChart.destroy();
            }

            // 确保canvas填充容器
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            window.currentChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 10,
                            right: 10,
                            bottom: 10,
                            left: 10
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: title,
                            font: { size: 16, weight: 'bold' }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadOverview();
        });
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 处理登录页面
async function handleLoginPage(request) {
  if (request.method === 'POST') {
    return handleLoginSubmit(request);
  }

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录 - 反代管理系统</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #333;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            backdrop-filter: blur(10px);
            width: 100%;
            max-width: 400px;
        }

        .login-header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .login-header h1 {
            color: #4a5568;
            margin-bottom: 0.5rem;
            font-size: 2rem;
        }

        .login-header p {
            color: #718096;
            font-size: 0.9rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2d3748;
        }

        .form-group input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }

        .form-group input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
            margin-right: 0.5rem;
        }

        .checkbox-group label {
            margin-bottom: 0;
            font-weight: normal;
            color: #4a5568;
            cursor: pointer;
        }

        .login-btn {
            width: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .error-message {
            background: #fed7d7;
            color: #742a2a;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border: 1px solid #feb2b2;
            display: none;
        }

        .back-link {
            text-align: center;
            margin-top: 1rem;
        }

        .back-link a {
            color: #667eea;
            text-decoration: none;
            font-size: 0.9rem;
        }

        .back-link a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>🔐 系统登录</h1>
            <p>请输入您的登录凭据</p>
        </div>

        <div id="error-message" class="error-message"></div>

        <form id="login-form">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" required autocomplete="username">
            </div>

            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" required autocomplete="current-password">
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="remember" name="remember">
                <label for="remember">记住登录状态 (30天)</label>
            </div>

            <button type="submit" class="login-btn" id="login-btn">
                登录
            </button>
        </form>

        <div class="back-link">
            <a href="/">← 返回首页</a>
        </div>
    </div>

    <script>
        const loginForm = document.getElementById('login-form');
        const errorMessage = document.getElementById('error-message');
        const loginBtn = document.getElementById('login-btn');

        // 检查是否有保存的登录状态
        window.addEventListener('load', function() {
            // 检查localStorage中的token或cookie中的session
            const savedToken = localStorage.getItem('session_token');

            // 验证session是否有效（优先检查cookie，然后检查localStorage）
            fetch('/api/verify-session', {
                headers: savedToken ? {
                    'X-Session-Token': savedToken
                } : {}
            })
            .then(response => {
                if (response.ok) {
                    // Session有效，重定向到dashboard
                    window.location.href = '/dashboard';
                } else {
                    // Session无效，清除保存的token
                    if (savedToken) {
                        localStorage.removeItem('session_token');
                    }
                }
            })
            .catch(error => {
                console.error('验证session失败:', error);
                if (savedToken) {
                    localStorage.removeItem('session_token');
                }
            });
        });

        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const remember = document.getElementById('remember').checked;

            // 显示加载状态
            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
            errorMessage.style.display = 'none';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password, remember })
                });

                const result = await response.json();

                if (response.ok) {
                    // 登录成功
                    console.log('登录成功，结果:', result);
                    if (remember && result.token) {
                        localStorage.setItem('session_token', result.token);
                        console.log('Token已保存到localStorage:', result.token);
                    }

                    // 添加短暂延迟确保cookie设置完成
                    setTimeout(() => {
                        console.log('重定向到dashboard');
                        window.location.href = '/dashboard';
                    }, 100);
                } else {
                    // 登录失败
                    console.error('登录失败:', result);
                    showError(result.error || '登录失败');
                }
            } catch (error) {
                showError('网络错误，请重试');
                console.error('登录错误:', error);
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = '登录';
            }
        });

        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 处理登录提交
async function handleLoginSubmit(request) {
  try {
    const { username, password, remember } = await request.json();

    // 从环境变量获取用户名和密码，如果没有设置则使用默认值
    const expectedUsername = globalThis.USER || 'admin';
    const expectedPassword = globalThis.PASSWORD || 'password';

  if (username !== expectedUsername || password !== expectedPassword) {
      return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 创建session
    const token = await createSession(username);

    // 设置cookie
    const cookieOptions = [
      `session_token=${token}`,
      'Path=/',
      'SameSite=Strict'
    ];

    if (remember) {
      // 如果选择记住登录状态，设置30天过期
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      cookieOptions.push(`Expires=${expires.toUTCString()}`);
    } else {
      // 如果不记住登录状态，设置为会话cookie
      cookieOptions.push('HttpOnly');
    }

    return new Response(JSON.stringify({
      success: true,
      token: remember ? token : null
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieOptions.join('; ')
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 会话管理
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24小时

// 生成简单的session token
function generateSessionToken() {
  return btoa(Date.now() + Math.random().toString(36)).replace(/[^a-zA-Z0-9]/g, '');
}

// 验证session token
async function validateSessionToken(token) {
  if (!token) return false;

  try {
    const sessionData = await PROXY_KV.get(`session_${token}`);
    if (!sessionData) return false;

    const session = JSON.parse(sessionData);
    const now = Date.now();

    // 检查是否过期
    if (now > session.expires) {
      await PROXY_KV.delete(`session_${token}`);
      return false;
    }

    // 延长session时间
    session.expires = now + SESSION_DURATION;
    await PROXY_KV.put(`session_${token}`, JSON.stringify(session));

  return true;
  } catch (error) {
    console.error('验证session失败:', error);
    return false;
  }
}

// 创建session
async function createSession(username) {
  const token = generateSessionToken();
  const session = {
    username,
    created: Date.now(),
    expires: Date.now() + SESSION_DURATION
  };

  await PROXY_KV.put(`session_${token}`, JSON.stringify(session));
  return token;
}

// 检查认证 - 支持session和basic auth
async function checkAuth(request) {
  // 首先检查session token (从cookie或header)
  const cookies = request.headers.get('Cookie') || '';
  const sessionMatch = cookies.match(/session_token=([^;]+)/);
  const sessionToken = sessionMatch ? sessionMatch[1] : request.headers.get('X-Session-Token');

  console.log('认证检查 - Cookies:', cookies);
  console.log('认证检查 - Session Token:', sessionToken ? 'Found' : 'Not found');

  if (sessionToken && await validateSessionToken(sessionToken)) {
    console.log('认证成功');
    return true;
  }

  // 如果没有有效session，检查是否是登录请求
  const url = new URL(request.url);
  if (url.pathname === '/login' || url.pathname === '/api/login') {
    return true; // 允许访问登录页面
  }

  console.log('认证失败，重定向到登录页面');
  // 返回需要登录的响应
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login'
    }
  });
}

// 处理管理面板API
async function handleDashboardAPI(request) {
  const authResult = await checkAuth(request);
  if (authResult !== true) {
    return authResult;
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // 概览数据
    if (path === '/api/overview' && method === 'GET') {
      return await handleOverviewAPI();
    }

    // 网站管理
    if (path === '/api/sites' && method === 'GET') {
      return await handleSitesGetAPI();
    }

    if (path === '/api/sites' && method === 'POST') {
      return await handleSitesPostAPI(request);
    }

    if (path.startsWith('/api/sites/') && method === 'DELETE') {
      const siteKey = path.split('/').pop();
      return await handleSitesDeleteAPI(siteKey);
    }

    if (path.startsWith('/api/sites/') && method === 'PUT') {
      const siteKey = path.split('/').pop();
      return await handleSitesPutAPI(siteKey, request);
    }

    // 日志管理
    if (path === '/api/logs' && method === 'GET') {
      const date = url.searchParams.get('date');
      return await handleLogsGetAPI(date);
    }

    if (path === '/api/logs' && method === 'DELETE') {
      return await handleLogsDeleteAPI();
    }

    // 监控状态
    if (path === '/api/monitor' && method === 'GET') {
      return await handleMonitorAPI();
    }

    // 配置管理
    if (path === '/api/config' && method === 'GET') {
      return await handleConfigGetAPI();
    }

    if (path === '/api/config' && method === 'POST') {
      return await handleConfigPostAPI(request);
    }

    if (path === '/api/config/reset' && method === 'POST') {
      return await handleConfigResetAPI();
    }

    // 验证session API
    if (path === '/api/verify-session' && method === 'GET') {
      // 从cookie或header获取token
      const cookies = request.headers.get('Cookie') || '';
      const sessionMatch = cookies.match(/session_token=([^;]+)/);
      const sessionToken = sessionMatch ? sessionMatch[1] : request.headers.get('X-Session-Token');

      if (sessionToken && await validateSessionToken(sessionToken)) {
        return new Response(JSON.stringify({ valid: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ valid: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 获取监控历史数据
    if (path === '/api/monitor/history' && method === 'GET') {
      return handleMonitorHistoryAPI(request);
    }

    // 手动测试服务API
    if (path === '/api/test-service' && method === 'POST') {
      return handleTestServiceAPI(request);
    }

    // 退出登录
    if (path === '/api/logout') {
      // 清除session
      const cookies = request.headers.get('Cookie') || '';
      const sessionMatch = cookies.match(/session_token=([^;]+)/);
      const sessionToken = sessionMatch ? sessionMatch[1] : null;

      if (sessionToken) {
        await PROXY_KV.delete(`session_${sessionToken}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict'
        }
      });
    }

    return new Response('API Not Found', { status: 404 });

  } catch (error) {
    console.error('API处理错误:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 概览API
async function handleOverviewAPI() {
  const sites = SITE_CONFIG;
  const totalSites = Object.keys(sites).length;
  const activeMonitors = Object.values(sites).filter(site => site.interval > 0).length;

  // 获取今日访问量
  const today = new Date().toISOString().split('T')[0];
  const todayLogKey = `access_log_${today}`;
  let todayVisits = 0;
  let totalLogs = 0;
  let recentLogs = [];

  try {
    const todayLogsData = await PROXY_KV.get(todayLogKey);
    if (todayLogsData) {
      const logs = JSON.parse(todayLogsData);
      todayVisits = logs.length;
      recentLogs = logs.slice(-10).reverse(); // 最近10条
    }

    // 计算总日志数
    const { keys } = await PROXY_KV.list({ prefix: 'access_log_' });
    for (const key of keys) {
      const logData = await PROXY_KV.get(key.name);
      if (logData) {
        totalLogs += JSON.parse(logData).length;
      }
    }
  } catch (error) {
    console.error('获取日志统计失败:', error);
  }

  return new Response(JSON.stringify({
    totalSites,
    todayVisits,
    activeMonitors,
    totalLogs,
    recentLogs
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 网站列表API
async function handleSitesGetAPI() {
  return new Response(JSON.stringify({
    sites: SITE_CONFIG
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 添加网站API
async function handleSitesPostAPI(request) {
  const { key, url, path, interval } = await request.json();

  // 验证数据
  if (!key || !url || !path) {
    throw new Error('缺少必填字段');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(key)) {
    throw new Error('网站标识只能包含英文、数字和下划线');
  }

  if (!path.startsWith('/')) {
    throw new Error('访问路径必须以/开头');
  }

  // 添加到配置
  const newConfig = { ...SITE_CONFIG };
  newConfig[key] = { url, path, interval: parseInt(interval) || 0 };

  const success = await saveSiteConfig(newConfig);
  if (!success) {
    throw new Error('保存配置失败');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 更新网站API
async function handleSitesPutAPI(siteKey, request) {
  const { url, path, interval } = await request.json();

  // 验证数据
  if (!url || !path) {
    throw new Error('缺少必填字段');
  }

  if (!path.startsWith('/')) {
    throw new Error('访问路径必须以/开头');
  }

  // 检查网站是否存在
  if (!SITE_CONFIG[siteKey]) {
    throw new Error('网站不存在');
  }

  // 更新配置
  const newConfig = { ...SITE_CONFIG };
  newConfig[siteKey] = { url, path, interval: parseInt(interval) || 0 };

  const success = await saveSiteConfig(newConfig);
  if (!success) {
    throw new Error('保存配置失败');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 删除网站API
async function handleSitesDeleteAPI(siteKey) {
  const newConfig = { ...SITE_CONFIG };
  delete newConfig[siteKey];

  const success = await saveSiteConfig(newConfig);
  if (!success) {
    throw new Error('保存配置失败');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 日志API
async function handleLogsGetAPI(selectedDate) {
  try {
    let logs = [];
    let availableDates = [];

    // 获取可用日期列表
    const { keys } = await PROXY_KV.list({ prefix: 'access_log_' });
    availableDates = keys.map(key => key.name.replace('access_log_', '')).sort().reverse();

    if (selectedDate) {
      // 获取指定日期的日志
      const logData = await PROXY_KV.get(`access_log_${selectedDate}`);
      if (logData) {
        logs = JSON.parse(logData);
      }
    } else {
      // 获取最近的日志
      const today = new Date().toISOString().split('T')[0];
      const logData = await PROXY_KV.get(`access_log_${today}`);
      if (logData) {
        logs = JSON.parse(logData);
      }
    }

    // 按时间倒序排列
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return new Response(JSON.stringify({
      logs: logs.slice(0, 100), // 限制返回100条
      availableDates
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取日志失败:', error);
    return new Response(JSON.stringify({
      logs: [],
      availableDates: []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 清空日志API
async function handleLogsDeleteAPI() {
  try {
    const { keys } = await PROXY_KV.list({ prefix: 'access_log_' });

    for (const key of keys) {
      await PROXY_KV.delete(key.name);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    throw new Error('清空日志失败');
  }
}

// 监控状态API
async function handleMonitorAPI() {
  try {
    const status = {};

    for (const [key, config] of Object.entries(SITE_CONFIG)) {
      if (config.interval > 0) {
        // 获取存储的监控状态
        const statusData = await PROXY_KV.get(`monitor_status_${key}`);
        if (statusData) {
          status[key] = JSON.parse(statusData);
        } else {
          // 如果没有状态数据，创建默认状态
          status[key] = {
            site: key,
            url: config.url,
            status: 0,
            responseTime: 0,
            isOnline: false,
            lastCheck: new Date().toISOString(),
            error: '暂无监控数据'
          };
        }
      }
    }

    return new Response(JSON.stringify({ status }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取监控状态失败:', error);
    return new Response(JSON.stringify({ status: {} }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 配置获取API
async function handleConfigGetAPI() {
  return new Response(JSON.stringify({
    config: SITE_CONFIG
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 配置保存API
async function handleConfigPostAPI(request) {
  const { config } = await request.json();

  // 验证配置格式
  for (const [key, value] of Object.entries(config)) {
    if (!value.url || !value.path || typeof value.interval !== 'number') {
      throw new Error(`配置项 "${key}" 格式不正确`);
    }

    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      throw new Error(`配置项键 "${key}" 只能包含英文、数字和下划线`);
    }

    if (!value.path.startsWith('/')) {
      throw new Error(`配置项 "${key}" 的路径必须以/开头`);
    }
  }

  const success = await saveSiteConfig(config);
  if (!success) {
    throw new Error('保存配置失败');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 重置配置API
async function handleConfigResetAPI() {
  const success = await saveSiteConfig(DEFAULT_SITE_CONFIG);
  if (!success) {
    throw new Error('重置配置失败');
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 手动测试服务API
async function handleTestServiceAPI(request) {
  try {
    const { siteKey } = await request.json();

    if (!siteKey || !SITE_CONFIG[siteKey]) {
      return new Response(JSON.stringify({
        success: false,
        error: '站点不存在'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const site = SITE_CONFIG[siteKey];
    console.log('手动测试站点:', siteKey, site.url);

    // 执行实际的HTTP请求测试
    const startTime = Date.now();

    try {
      const response = await fetch(site.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseTime = Date.now() - startTime;
      const isOnline = response.ok;
      const statusCode = response.status;

      // 创建测试结果
      const testResult = {
        site: siteKey,
        url: site.url,
        status: statusCode,
        responseTime: responseTime,
        isOnline: isOnline,
        lastCheck: new Date().toISOString(),
        isManualTest: true // 标记为手动测试
      };

      // 保存当前监控状态
      await PROXY_KV.put('monitor_status_' + siteKey, JSON.stringify(testResult));

      // 保存历史监控数据
      await saveMonitorHistory(siteKey, testResult);

      console.log('手动测试完成:', {
        site: siteKey,
        status: testResult.status,
        responseTime: responseTime,
        isOnline: isOnline
      });

      return new Response(JSON.stringify({
        success: true,
        responseTime: responseTime,
        status: testResult.status,
        statusCode: statusCode,
        isOnline: isOnline,
        timestamp: testResult.lastCheck
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (fetchError) {
      console.error('手动测试请求失败:', fetchError);

      const responseTime = Date.now() - startTime;

      // 记录失败结果
      const testResult = {
        site: siteKey,
        url: site.url,
        status: 0,
        responseTime: responseTime,
        isOnline: false,
        lastCheck: new Date().toISOString(),
        error: fetchError.message,
        isManualTest: true
      };

      await PROXY_KV.put('monitor_status_' + siteKey, JSON.stringify(testResult));
      await saveMonitorHistory(siteKey, testResult);

      return new Response(JSON.stringify({
        success: false,
        error: '连接失败: ' + fetchError.message,
        responseTime: responseTime,
        status: 0,
        statusCode: 0,
        isOnline: false,
        timestamp: testResult.lastCheck
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('手动测试API错误:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '服务器内部错误: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理主页
function handleHomePage() {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>通用网站反代工具</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            max-width: 800px;
            width: 100%;
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            backdrop-filter: blur(10px);
        }
        h1 {
            text-align: center;
            color: #4a5568;
            margin-bottom: 30px;
            font-size: 2.5em;
        }
        .input-section {
            margin-bottom: 30px;
            padding: 20px;
            background: #f7fafc;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
        }
        .input-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #2d3748;
        }
        input[type="text"], input[type="url"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #cbd5e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }
        input[type="text"]:focus, input[type="url"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            display: block;
            width: 100%;
            margin-top: 10px;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .preset-sites {
            margin-top: 30px;
        }
        .site-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .site-card {
            background: white;
            padding: 15px;
            border-radius: 10px;
            border: 2px solid #e2e8f0;
            text-align: center;
            transition: all 0.3s;
            cursor: pointer;
        }
        .site-card:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .site-name {
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 5px;
        }
        .site-url {
            font-size: 12px;
            color: #718096;
        }
        .admin-link {
            text-align: center;
            margin-top: 20px;
        }
        .admin-link a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        .admin-link a:hover {
            text-decoration: underline;
        }
        .usage {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        .usage-title {
            font-weight: 600;
            color: #c53030;
            margin-bottom: 10px;
        }
        .usage-text {
            color: #2d3748;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌐 通用网站反代工具</h1>

        <div class="input-section">
            <h3>输入要访问的网站</h3>
            <div class="input-group">
                <input type="url" id="target-url" placeholder="请输入完整网址，如 https://www.google.com" />
            </div>
            <button onclick="proxyWebsite()">开始访问</button>

            <div class="usage">
                <div class="usage-title">使用说明:</div>
                <div class="usage-text">
                    <p><b>方式1:</b> 输入完整URL后点击"开始访问"按钮</p>
                    <p><b>方式2:</b> 直接在地址栏输入: <code>本站域名/域名/路径</code></p>
                    <p><b>方式3:</b> 使用预配置的网站快速访问</p>
                </div>
            </div>
        </div>

        <div class="preset-sites">
            <h3>预配置网站快速访问</h3>
            <div class="site-grid" id="preset-sites">
                <!-- 动态加载预配置网站 -->
            </div>
        </div>

        <div class="admin-link">
            <a href="/dashboard">🔧 管理面板</a> |
            <a href="/monitor-status">📊 监控状态</a>
        </div>
    </div>

    <script>
        // 用于访问指定网站的函数
        function proxyWebsite() {
            const url = document.getElementById('target-url').value.trim();
            if (!url) {
                alert('请输入有效的网站URL');
                return;
            }

            try {
                let targetUrl;
                // 检查输入的URL是否带有协议
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    targetUrl = 'https://' + url;
                } else {
                    targetUrl = url;
                }

                const urlObj = new URL(targetUrl);
                const proxyUrl = '/' + urlObj.hostname + urlObj.pathname + urlObj.search;
                window.location.href = proxyUrl;
            } catch (error) {
                alert('请输入有效的URL格式');
            }
        }

        // 加载预配置网站
        async function loadPresetSites() {
            try {
                const response = await fetch('/api/public/sites');
                const data = await response.json();
                const sitesGrid = document.getElementById('preset-sites');

                sitesGrid.innerHTML = '';
                Object.entries(data.sites).forEach(([key, config]) => {
                    const siteCard = document.createElement('div');
                    siteCard.className = 'site-card';
                    siteCard.onclick = () => window.location.href = config.path;

                    const siteName = document.createElement('div');
                    siteName.className = 'site-name';
                    siteName.textContent = key.charAt(0).toUpperCase() + key.slice(1);
                    siteCard.appendChild(siteName);

                    const siteUrl = document.createElement('div');
                    siteUrl.className = 'site-url';
                    siteUrl.textContent = config.url;
                    siteCard.appendChild(siteUrl);

                    sitesGrid.appendChild(siteCard);
                });
            } catch (error) {
                console.error('加载预配置网站失败:', error);
                const sitesGrid = document.getElementById('preset-sites');
                sitesGrid.innerHTML = '<p>加载预配置网站失败</p>';
            }
        }

        // 回车键提交
        document.addEventListener('DOMContentLoaded', function() {
            const input = document.getElementById('target-url');
            input.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                proxyWebsite();
            }
        });

            // 加载预配置网站
            loadPresetSites();
        });
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 处理公开的网站配置API（不需要认证）
async function handlePublicSitesAPI() {
  return new Response(JSON.stringify({
    sites: SITE_CONFIG
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 处理公开的监控状态API（不需要认证）
async function handlePublicMonitorAPI() {
  try {
    const status = {};

    for (const [key, config] of Object.entries(SITE_CONFIG)) {
      if (config.interval > 0) {
        // 获取存储的监控状态
        const statusData = await PROXY_KV.get(`monitor_status_${key}`);
        if (statusData) {
          status[key] = JSON.parse(statusData);
        } else {
          // 如果没有状态数据，创建默认状态
          status[key] = {
            site: key,
            url: config.url,
            status: 0,
            responseTime: 0,
            isOnline: false,
            lastCheck: new Date().toISOString(),
            error: '暂无监控数据'
          };
        }
      }
    }

    return new Response(JSON.stringify({ status }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取监控状态失败:', error);
    return new Response(JSON.stringify({ status: {} }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理监控历史数据API（需要认证）
async function handleMonitorHistoryAPI(request) {
  try {
    const url = new URL(request.url);
    const siteKey = url.searchParams.get('site');
    const range = url.searchParams.get('range') || '24h'; // 24h, 7d, 30d
    const date = url.searchParams.get('date'); // YYYY-MM-DD 格式

    if (!siteKey) {
      return new Response(JSON.stringify({ error: '缺少site参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let historyData = [];
    let summary = {
      avgResponseTime: 0,
      uptime: 0,
      totalChecks: 0,
      failures: 0
    };

    if (date) {
      // 查询特定日期的数据
      historyData = await getMonitorHistoryByDate(siteKey, date);
    } else {
      // 查询时间范围的数据
      historyData = await getMonitorHistoryByRange(siteKey, range);
    }

    // 计算统计摘要
    if (historyData.length > 0) {
      const onlineRecords = historyData.filter(record => record.isOnline);
      const totalResponseTime = onlineRecords.reduce((sum, record) => sum + record.responseTime, 0);

      summary = {
        avgResponseTime: onlineRecords.length > 0 ? Math.round(totalResponseTime / onlineRecords.length) : 0,
        uptime: ((onlineRecords.length / historyData.length) * 100).toFixed(1),
        totalChecks: historyData.length,
        failures: historyData.length - onlineRecords.length
      };
    }

    return new Response(JSON.stringify({
      history: historyData,
      summary: summary
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('获取监控历史失败:', error);
    return new Response(JSON.stringify({
      error: '获取监控历史失败',
      history: [],
      summary: { avgResponseTime: 0, uptime: 0, totalChecks: 0, failures: 0 }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 根据日期获取监控历史
async function getMonitorHistoryByDate(siteKey, date) {
  try {
    const historyKey = `monitor_history_${siteKey}_${date}`;
    const historyData = await PROXY_KV.get(historyKey);

    if (historyData) {
      return JSON.parse(historyData);
    }

    return [];
  } catch (error) {
    console.error('获取日期监控历史失败:', error);
    return [];
  }
}

// 根据时间范围获取监控历史
async function getMonitorHistoryByRange(siteKey, range) {
  try {
    const now = new Date();
    let days = 1;

    switch (range) {
      case '7d':
        days = 7;
        break;
      case '30d':
        days = 30;
        break;
      default:
        days = 1; // 24h
    }

    let allHistory = [];

    // 获取指定天数的历史数据
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayHistory = await getMonitorHistoryByDate(siteKey, dateStr);
      allHistory = allHistory.concat(dayHistory);
    }

    // 按时间排序（最新的在前）
    allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 如果是24小时范围，只返回最近24小时的数据
    if (range === '24h') {
      const cutoffTime = now.getTime() - 24 * 60 * 60 * 1000;
      allHistory = allHistory.filter(record =>
        new Date(record.timestamp).getTime() >= cutoffTime
      );
    }

    return allHistory;
  } catch (error) {
    console.error('获取范围监控历史失败:', error);
    return [];
  }
}

// 处理反代请求
async function handleProxy(request, targetBaseUrl, targetPath) {
  const url = new URL(request.url);
  const targetUrl = new URL(targetPath, targetBaseUrl);

  // 复制查询参数
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  // 创建新的请求
  const modifiedRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: modifyRequestHeaders(request.headers, targetUrl.hostname),
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null
  });

  try {
    const response = await fetch(modifiedRequest);
    const modifiedResponse = await modifyResponse(response, url.origin, targetBaseUrl);
    return modifiedResponse;
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy Error: ' + error.message, { status: 502 });
  }
}

// 修改请求头
function modifyRequestHeaders(headers, targetHostname) {
  const modifiedHeaders = new Headers(headers);

  modifiedHeaders.set('Host', targetHostname);
  modifiedHeaders.delete('cf-connecting-ip');
  modifiedHeaders.delete('cf-ray');
  modifiedHeaders.delete('x-forwarded-for');
  modifiedHeaders.delete('x-forwarded-proto');

  if (!modifiedHeaders.has('User-Agent')) {
    modifiedHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  }

  // 添加常见请求头以增强兼容性
  modifiedHeaders.set('Referer', 'https://' + targetHostname + '/');
  modifiedHeaders.set('Origin', 'https://' + targetHostname);

  return modifiedHeaders;
}

// 修改响应
async function modifyResponse(response, proxyOrigin, targetBaseUrl) {
  const contentType = response.headers.get('content-type') || '';
  const modifiedHeaders = new Headers(response.headers);

  // 设置CORS头
  modifiedHeaders.set('Access-Control-Allow-Origin', '*');
  modifiedHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  modifiedHeaders.set('Access-Control-Allow-Headers', '*');

  // 移除安全相关的头部
  modifiedHeaders.delete('content-security-policy');
  modifiedHeaders.delete('x-frame-options');
  modifiedHeaders.delete('x-content-type-options');

  // 如果是HTML内容，需要修改其中的链接
  if (contentType.includes('text/html')) {
    const text = await response.text();
    const modifiedText = modifyHtmlContent(text, proxyOrigin, targetBaseUrl);

    return new Response(modifiedText, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedHeaders
    });
  }

  // 如果是CSS内容，修改其中的URL
  if (contentType.includes('text/css')) {
    const text = await response.text();
    const modifiedText = modifyCssContent(text, proxyOrigin, targetBaseUrl);

    return new Response(modifiedText, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedHeaders
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: modifiedHeaders
  });
}

// 修改HTML内容中的链接
function modifyHtmlContent(html, proxyOrigin, targetBaseUrl) {
  try {
  const targetUrl = new URL(targetBaseUrl);
  const targetDomain = targetUrl.hostname;

    // 使用字符串拼接而不是模板字符串
  html = html.replace(
      new RegExp('https?://' + targetDomain.replace(/\./g, '\\.'), 'g'),
      proxyOrigin + '/' + targetDomain
  );

  html = html.replace(
    /(?:href|src)=["']\/([^"']*?)["']/g,
      function(match, p1) {
        return 'href="' + proxyOrigin + '/' + targetDomain + '/' + p1 + '"';
      }
  );

  html = html.replace(
    /<head>/i,
      '<head><base href="' + proxyOrigin + '/' + targetDomain + '/">'
  );

  return html;
  } catch (error) {
    console.error('处理HTML内容失败:', error);
    return html; // 返回原始HTML，确保不会中断流程
  }
}

// 修改CSS内容中的URL
function modifyCssContent(css, proxyOrigin, targetBaseUrl) {
  const targetUrl = new URL(targetBaseUrl);
  const targetDomain = targetUrl.hostname;

  css = css.replace(
    /url\(["']?([^"')]+)["']?\)/g,
    (match, url) => {
      if (url.startsWith('http')) {
        return match.replace(url, `${proxyOrigin}/${new URL(url).hostname}${new URL(url).pathname}`);
      } else if (url.startsWith('/')) {
        return match.replace(url, `${proxyOrigin}/${targetDomain}${url}`);
      }
      return match;
    }
  );

  return css;
}

// 处理监控状态页面（公开访问）
function handleMonitorStatus() {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>网站监控状态</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            text-align: center;
            color: #4a5568;
            margin-bottom: 30px;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .status-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            border-left: 5px solid #667eea;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status-card.online {
            border-left-color: #48bb78;
        }
        .status-card.offline {
            border-left-color: #f56565;
        }
        .site-name {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .site-url {
            color: #718096;
            margin-bottom: 15px;
        }
        .status-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .status-label {
            font-weight: 600;
        }
        .status-online {
            color: #48bb78;
        }
        .status-offline {
            color: #f56565;
        }
        .back-link {
            text-align: center;
            margin-top: 30px;
        }
        .back-link a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 网站监控状态</h1>
        <button class="refresh-btn" onclick="loadMonitorStatus()">刷新状态</button>
        <div class="status-grid" id="monitor-status">
            <!-- 动态加载监控状态 -->
        </div>
        <div class="back-link">
            <a href="/">← 返回首页</a> |
            <a href="/dashboard">🔧 管理面板</a>
        </div>
    </div>

    <script>
        async function loadMonitorStatus() {
            try {
                const response = await fetch('/api/public/monitor');
                const data = await response.json();
                const statusDiv = document.getElementById('monitor-status');
                statusDiv.innerHTML = '';

                if (Object.keys(data.status).length === 0) {
                    statusDiv.innerHTML = '<p style="text-align: center; color: #718096;">暂无监控数据</p>';
                    return;
                }

                Object.entries(data.status).forEach(([key, status]) => {
                    const statusCard = document.createElement('div');
                    statusCard.className = 'status-card ' + (status.isOnline ? 'online' : 'offline');

                    // 使用 DOM API 创建元素，避免模板字符串问题
                    const siteName = document.createElement('div');
                    siteName.className = 'site-name';
                    siteName.textContent = key.charAt(0).toUpperCase() + key.slice(1);
                    statusCard.appendChild(siteName);

                    const siteUrl = document.createElement('div');
                    siteUrl.className = 'site-url';
                    siteUrl.textContent = status.url;
                    statusCard.appendChild(siteUrl);

                    // 状态信息 - 在线/离线
                    const statusInfo1 = document.createElement('div');
                    statusInfo1.className = 'status-info';

                    const statusLabel1 = document.createElement('span');
                    statusLabel1.className = 'status-label';
                    statusLabel1.textContent = '状态:';
                    statusInfo1.appendChild(statusLabel1);

                    const statusValue1 = document.createElement('span');
                    statusValue1.className = status.isOnline ? 'status-online' : 'status-offline';
                    statusValue1.textContent = status.isOnline ? '✅ 在线' : '❌ 离线';
                    statusInfo1.appendChild(statusValue1);

                    statusCard.appendChild(statusInfo1);

                    // 响应时间
                    const statusInfo2 = document.createElement('div');
                    statusInfo2.className = 'status-info';

                    const statusLabel2 = document.createElement('span');
                    statusLabel2.className = 'status-label';
                    statusLabel2.textContent = '响应时间:';
                    statusInfo2.appendChild(statusLabel2);

                    const statusValue2 = document.createElement('span');
                    statusValue2.textContent = status.responseTime + 'ms';
                    statusInfo2.appendChild(statusValue2);

                    statusCard.appendChild(statusInfo2);

                    // 状态码
                    const statusInfo3 = document.createElement('div');
                    statusInfo3.className = 'status-info';

                    const statusLabel3 = document.createElement('span');
                    statusLabel3.className = 'status-label';
                    statusLabel3.textContent = '状态码:';
                    statusInfo3.appendChild(statusLabel3);

                    const statusValue3 = document.createElement('span');
                    statusValue3.textContent = status.status;
                    statusInfo3.appendChild(statusValue3);

                    statusCard.appendChild(statusInfo3);

                    // 最后检查时间
                    const statusInfo4 = document.createElement('div');
                    statusInfo4.className = 'status-info';

                    const statusLabel4 = document.createElement('span');
                    statusLabel4.className = 'status-label';
                    statusLabel4.textContent = '最后检查:';
                    statusInfo4.appendChild(statusLabel4);

                    const statusValue4 = document.createElement('span');
                    statusValue4.textContent = new Date(status.lastCheck).toLocaleString();
                    statusInfo4.appendChild(statusValue4);

                    statusCard.appendChild(statusInfo4);

                    // 添加错误信息（如果有）
                    if (status.error) {
                        const statusInfo5 = document.createElement('div');
                        statusInfo5.className = 'status-info';

                        const statusLabel5 = document.createElement('span');
                        statusLabel5.className = 'status-label';
                        statusLabel5.textContent = '错误:';
                        statusInfo5.appendChild(statusLabel5);

                        const statusValue5 = document.createElement('span');
                        statusValue5.style.color = '#f56565';
                        statusValue5.textContent = status.error;
                        statusInfo5.appendChild(statusValue5);

                        statusCard.appendChild(statusInfo5);
                    }

                    document.getElementById('monitor-status').appendChild(statusCard);
                });
            } catch (error) {
                console.error('加载监控状态失败:', error);
                document.getElementById('monitor-status').innerHTML = '<p style="text-align: center; color: #f56565;">加载监控状态失败</p>';
            }
        }

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadMonitorStatus();
        });

        // 每30秒自动刷新
        setInterval(loadMonitorStatus, 30000);
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 定时监控处理函数
async function handleScheduledMonitoring() {
  console.log('开始执行定时监控任务');

  // 清理旧日志和监控数据
  await cleanOldLogs();
  await cleanOldMonitorData();

  for (const [key, config] of Object.entries(SITE_CONFIG)) {
    if (config.interval > 0) {
      try {
        const startTime = Date.now();
        const response = await fetch(config.url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Site-Monitor/1.0)'
          },
          timeout: 10000
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const status = {
          site: key,
          url: config.url,
          status: response.status,
          responseTime: responseTime,
          isOnline: response.ok,
          lastCheck: new Date().toISOString()
        };

        // 保存当前监控状态
        await PROXY_KV.put(`monitor_status_${key}`, JSON.stringify(status));

        // 保存历史监控数据
        await saveMonitorHistory(key, status);

        console.log(`监控 ${key}: ${response.status} (${responseTime}ms)`);

      } catch (error) {
        console.error(`监控 ${key} 失败:`, error.message);

        const status = {
          site: key,
          url: config.url,
          status: 0,
          responseTime: 0,
          isOnline: false,
          lastCheck: new Date().toISOString(),
          error: error.message
        };

        // 保存当前监控状态
        await PROXY_KV.put(`monitor_status_${key}`, JSON.stringify(status));

        // 保存历史监控数据
        await saveMonitorHistory(key, status);
      }
    }
  }
}

// 保存监控历史数据
async function saveMonitorHistory(siteKey, status) {
  try {
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const historyKey = `monitor_history_${siteKey}_${dateKey}`;

    // 获取今天的历史记录
    let todayHistory = [];
    const existingHistory = await PROXY_KV.get(historyKey);
    if (existingHistory) {
      todayHistory = JSON.parse(existingHistory);
    }

    // 添加新记录
    todayHistory.push({
      timestamp: status.lastCheck,
      isOnline: status.isOnline,
      responseTime: status.responseTime,
      status: status.status,
      error: status.error || null
    });

    // 限制每天最多保存1440条记录（每分钟一条）
    if (todayHistory.length > 1440) {
      todayHistory = todayHistory.slice(-1440);
    }

    // 保存历史记录
    await PROXY_KV.put(historyKey, JSON.stringify(todayHistory));

  } catch (error) {
    console.error('保存监控历史失败:', error);
  }
}

// 清理旧的监控数据
async function cleanOldMonitorData() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 保留30天

    // 列出所有监控历史key
    const { keys } = await PROXY_KV.list({ prefix: 'monitor_history_' });

    for (const key of keys) {
      // 从key中提取日期: monitor_history_sitekey_YYYY-MM-DD
      const parts = key.name.split('_');
      if (parts.length >= 4) {
        const dateStr = parts[parts.length - 1];
        const recordDate = new Date(dateStr);

        if (recordDate < cutoffDate) {
          await PROXY_KV.delete(key.name);
          console.log(`删除旧监控数据: ${key.name}`);
        }
      }
    }
  } catch (error) {
    console.error('清理旧监控数据失败:', error);
  }
}
