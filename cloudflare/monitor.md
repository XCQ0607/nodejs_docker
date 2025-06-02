# Cloudflare Worker 反代工具 (Reverse Proxy Tool) v2.0

一个功能强大的 Cloudflare Worker 反代工具，支持预配置网站反代、实时监控、访问日志记录和现代化管理面板。

## 功能概述

- **通用反代**: 支持反代任意网站，自动处理链接重写和资源替换
- **预配置管理**: 可配置常用网站的快速访问路径，支持在线编辑
- **实时监控**: 定时检测网站可用性和响应时间，支持手动测试
- **访问日志**: 记录所有访问请求的详细信息，支持按日期查看
- **现代化管理面板**: 美观的可视化界面，支持标签页切换
- **安全认证**: Session 基础的登录系统，支持记住登录状态
- **监控历史**: 保存30天监控数据，支持图表展示和时间范围筛选
- **数据持久化**: 使用 Cloudflare KV 存储配置、日志和监控数据
- **自动清理**: 自动删除超过30天的历史数据

## 部署指南

### 1. 创建 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 `Workers & Pages` 页面
3. 点击 `Create application` → `Create Worker`
4. 将项目代码复制到 Worker 编辑器中
5. 点击 `Save and Deploy`

### 2. 创建 KV 命名空间

1. 在 Cloudflare Dashboard 中进入 `Workers & Pages` → `KV`
2. 点击 `Create a namespace`
3. 命名空间名称设为: `PROXY_KV`
4. 创建完成后记录命名空间 ID

### 3. 绑定 KV 存储

1. 回到 Worker 页面
2. 点击 `Settings` → `Variables`
3. 在 `KV Namespace Bindings` 部分点击 `Add binding`
4. 设置如下:
   - Variable name: `PROXY_KV`
   - KV namespace: 选择刚创建的命名空间

### 4. 配置环境变量

在 `Environment Variables` 部分添加以下变量:

| 变量名 | 说明 | 示例值 | 必需 |
|--------|------|--------|------|
| `USER` | 管理面板用户名 | `admin` | 是 |
| `PASSWORD` | 管理面板密码 | `your_secure_password` | 是 |

### 5. 设置定时任务

要启用网站监控功能:

1. 在 Worker 设置页面点击 `Triggers` → `Cron Triggers`
2. 点击 `Add Cron Trigger`
3. 设置 Cron 表达式，例如:
   - `*/5 * * * *` (每5分钟执行一次)
   - `0 */1 * * *` (每小时执行一次)

## 使用说明

### 访问方式

- **主页**: `https://your-worker.your-subdomain.workers.dev/`
- **登录页面**: `https://your-worker.your-subdomain.workers.dev/login`
- **管理面板**: `https://your-worker.your-subdomain.workers.dev/dashboard` (需要登录)
- **监控状态**: `https://your-worker.your-subdomain.workers.dev/monitor-status` (公开访问)

### 反代使用

1. **预配置网站**: 直接访问配置的路径，如 `/google`
2. **通用反代**:
   - 在主页输入框输入目标网站URL
   - 或直接访问 `/域名/路径` 格式的URL
   - 例如: `/www.google.com/search?q=test`

### 管理面板功能

- **概览页面**: 显示网站统计、今日访问量、活跃监控数量等
- **网站管理**: 添加、编辑、删除网站配置，支持手动测试
- **访问日志**: 查看和筛选访问日志，支持按日期查看
- **监控状态**: 现代化卡片式界面，显示网站可用性和响应时间
- **配置编辑**: 直接编辑 JSON 格式配置，支持重置到默认配置

### 登录系统

- **现代化登录界面**: 美观的登录表单，支持记住登录状态
- **Session 管理**: 基于 token 的会话管理，支持自动延期
- **安全特性**:
  - 登录状态可选择记住30天
  - 自动清理过期会话
  - 支持安全退出

## 数据存储结构

本项目使用 Cloudflare KV 存储以下数据:

| 存储键格式 | 说明 | 数据保留期 |
|------------|------|------------|
| `site_config` | 网站配置信息 | 永久 |
| `access_log_YYYY-MM-DD` | 每日访问日志 | 30天 |
| `monitor_status_[site_key]` | 网站当前监控状态 | 永久 |
| `monitor_history_[site_key]_YYYY-MM-DD` | 网站监控历史数据 | 30天 |
| `session_[token]` | 用户登录会话 | 24小时或30天 |

## 配置说明

### 网站配置格式

```json
{
  "google": {
    "url": "https://www.google.com",
    "path": "/google",
    "interval": 5
  },
  "github": {
    "url": "https://github.com",
    "path": "/github",
    "interval": 10
  }
}
```

字段说明:
- `url`: 目标网站的完整URL
- `path`: 访问路径 (必须以 / 开头)
- `interval`: 监控间隔 (分钟，0表示不监控)

## 最新更新和修复

### v2.0 主要更新

1. **现代化登录系统**
   - ✅ 替换基本认证为 Session 基础的登录系统
   - ✅ 美观的登录界面，支持记住登录状态
   - ✅ 基于 token 的会话管理，更安全可靠

2. **监控系统增强**
   - ✅ 现代化卡片式监控界面
   - ✅ 支持监控历史数据保存和查看
   - ✅ 手动测试功能，实时查看网站状态
   - ✅ 自动清理30天以上的历史数据

3. **用户界面优化**
   - ✅ 移除开发模式测试代码，代码更简洁
   - ✅ 现代化的管理面板设计
   - ✅ 改进的错误处理和用户反馈

4. **安全性提升**
   - ✅ Session 管理替代基本认证
   - ✅ 自动会话延期和清理
   - ✅ 更好的认证状态检查

### 已修复的问题

1. **登录循环问题**
   - ✅ 修复了登录API路由冲突导致的无限重定向
   - ✅ 优化了Cookie设置策略
   - ✅ 改进了认证检查逻辑

2. **KV 存储检查**
   - ✅ 添加了 PROXY_KV 绑定检查
   - ✅ 改进了错误处理机制

3. **模板字符串问题**
   - ✅ 修复了监控页面的 JavaScript 语法错误
   - ✅ 使用更安全的 DOM 操作方法

## 技术特性

### 反代功能

1. **智能链接重写**: 自动处理 HTML、CSS、JavaScript 中的链接
2. **资源代理**: 支持图片、样式表、脚本等静态资源
3. **请求头处理**: 模拟真实浏览器请求，提高兼容性
4. **响应优化**: 智能处理不同类型的响应内容

### 监控系统

1. **实时检测**: 定时检查网站可用性和响应时间
2. **历史数据**: 保存30天监控历史，支持趋势分析
3. **手动测试**: 支持即时测试网站状态
4. **状态展示**: 现代化卡片界面，直观显示监控结果

### 数据管理

1. **自动清理**: 定期清理超过30天的历史数据
2. **配置备份**: 支持配置导出和重置功能
3. **日志轮换**: 按日期分割访问日志，便于管理
4. **存储优化**: 合理使用 KV 存储，避免达到限制

## 进阶定制

### 修改默认配置

编辑代码中的 `DEFAULT_SITE_CONFIG` 对象:

```javascript
const DEFAULT_SITE_CONFIG = {
  your_site: {
    url: 'https://your-website.com',
    path: '/your_path',
    interval: 5
  }
};
```

### 调整日志保留策略

修改 `cleanOldLogs()` 函数中的保留天数:

```javascript
cutoffDate.setDate(cutoffDate.getDate() - 15); // 改为你需要的天数
```

## 故障排除

### 常见问题

1. **无法登录管理面板**
   - 检查环境变量 `USER` 和 `PASSWORD` 是否设置
   - 确认使用正确的用户名密码
   - 清除浏览器缓存和 localStorage
   - 检查浏览器控制台是否有错误信息

2. **登录后无限刷新**
   - 确认 KV 命名空间正确绑定
   - 检查 Session 创建是否成功
   - 清除浏览器所有相关数据后重试

3. **配置无法保存**
   - 检查 KV 命名空间是否正确绑定
   - 确认 KV 命名空间有写入权限
   - 检查配置格式是否正确

4. **监控功能不工作**
   - 检查是否设置了 Cron Trigger
   - 确认站点配置中的监控间隔大于0
   - 查看 Worker 日志确认定时任务执行

5. **反代网站无法访问**
   - 检查目标网站是否可访问
   - 确认网站没有对 Cloudflare Workers 的限制
   - 检查网站是否有特殊的反爬虫机制

### 调试方法

1. **查看 Worker 日志**:
   - 在 Worker 页面点击 `Logs` → `Begin log stream`
   - 观察登录和认证相关的日志输出

2. **检查 KV 存储**:
   - 在 KV 页面查看存储的数据
   - 确认 `site_config` 和 `session_*` 键是否存在

3. **浏览器开发者工具**:
   - 检查网络请求和响应
   - 查看控制台错误信息
   - 检查 localStorage 和 Cookie 设置

4. **测试 API 接口**:
   - 直接访问 `/api/verify-session` 检查认证状态
   - 测试 `/api/overview` 等需要认证的接口

## 性能优化建议

1. **KV 存储优化**:
   - 合理设置数据过期时间
   - 避免频繁的小数据写入
   - 使用批量操作减少请求次数

2. **监控优化**:
   - 根据实际需要调整监控频率
   - 实现智能的监控间隔调整
   - 优化历史数据存储结构

3. **反代性能**:
   - 对静态资源实现缓存
   - 优化内容重写算法
   - 减少不必要的请求头处理

## 免责声明

本工具仅供学习和研究使用，请遵守相关法律法规和网站服务条款。使用本工具所产生的任何后果由使用者自行承担。