# 更新日志

## v2.0.0 - 2024-01-15

### 🎉 重大更新

#### 新增功能
- **Cloudflare Argo 隧道支持**
  - 支持临时隧道（零配置）
  - 支持固定隧道（Token 和 JSON 认证）
  - 自动域名提取和配置
  - 智能端口检测（PORT=0 启用 Argo 隧道）

- **智能系统检测**
  - 自动识别 Windows、Linux、macOS 系统
  - 支持 ARM 和 AMD64 架构检测
  - 差异化运行策略优化
  - 解决 Windows 下进程阻塞问题

- **部署信息上传功能**
  - 集成 xbin 粘贴板服务
  - 自动上传完整部署配置
  - 支持密码保护敏感信息
  - 自定义粘贴板 ID

- **哪吒监控集成**
  - 支持哪吒监控系统
  - 自动上报系统状态
  - 可选配置，不影响主功能

#### 技术改进
- **跨平台兼容性**
  - Windows: 使用 `spawn` 启动，避免进程阻塞
  - Linux: 使用 `nohup` 启动，支持架构自动识别
  - macOS: 使用类 Linux 策略

- **Docker 镜像优化**
  - 升级到 Node.js 20
  - 支持多架构构建（AMD64/ARM64）
  - 增强健康检查功能
  - 优化镜像体积和安全性

- **配置管理**
  - 环境变量自动生成（UUID、DOMAIN）
  - 智能默认值设置
  - 完善的配置验证

#### 环境变量更新
```bash
# 新增 Argo 隧道配置
ARGO_PORT=8001              # Argo 隧道内部端口
ARGO_DOMAIN=your-domain.com # 固定隧道域名
ARGO_AUTH=your-token        # 隧道认证

# 新增 xbin 配置
BINURL=https://xbin.pages.dev  # xbin 服务地址
BINPATH=my-config              # 自定义粘贴板 ID
BINPWD=secret123               # 密码保护

# 新增哪吒监控配置
NEZHA_SERVER=monitor.com    # 监控服务器
NEZHA_PORT=5555            # 监控端口
NEZHA_KEY=your-key         # 监控密钥
```

### 🔧 使用方式更新

#### Argo 隧道模式（推荐）
```bash
# 零配置启动
PORT=0 node app.js

# Docker 部署
docker run -d --restart=always \
  -e PORT=0 \
  -e ARGO_AUTH=your-token \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

#### 传统模式
```bash
# 本地启动
UUID=your-uuid DOMAIN=your-domain.com PORT=3000 node app.js

# Docker 部署
docker run -d --restart=always \
  -p 3000:3000 \
  -e UUID=your-uuid \
  -e DOMAIN=your-domain.com \
  -e PORT=3000 \
  --name vless-traditional \
  xcq0607/nodejs_vless:latest
```

### 📋 部署信息示例

启用 xbin 上传后，会自动生成如下格式的部署信息：

```markdown
# Cloudflare Vless 代理部署信息
部署时间: 2024/1/15 下午2:30:45
系统信息: win32 x64

## 基本配置
UUID: 89c13786-25aa-4520-b2e7-12cd60fb5202
端口: 0
域名: minority-extreme-thompson-elite.trycloudflare.com

## 访问地址
主页: https://minority-extreme-thompson-elite.trycloudflare.com/
订阅地址: https://minority-extreme-thompson-elite.trycloudflare.com/89c13786-25aa-4520-b2e7-12cd60fb5202
Base64订阅: https://minority-extreme-thompson-elite.trycloudflare.com/89c13786-25aa-4520-b2e7-12cd60fb5202?base64
配置界面: https://minority-extreme-thompson-elite.trycloudflare.com/89c13786-25aa-4520-b2e7-12cd60fb5202/select

## Argo 隧道信息
Argo 端口: 8001
使用临时隧道

## 节点名称
Vls-Argo
```

### 🐛 问题修复

- 修复 Windows 下 cloudflared 启动阻塞问题
- 修复进程清理不完整的问题
- 修复环境变量读取异常
- 优化错误处理和日志输出

### 📚 文档更新

- 更新 README.md，添加 Argo 隧道使用说明
- 新增 DOCKER_GUIDE.md Docker 部署指南
- 新增 SYSTEM_DETECTION.md 系统检测说明
- 新增 XBIN_UPLOAD.md xbin 上传功能说明

### ⚠️ 破坏性变更

- `PORT=0` 现在会启用 Argo 隧道模式而不是随机端口
- Docker 镜像现在默认使用非 root 用户运行
- 健康检查逻辑更新以支持 Argo 隧道模式

### 🔄 迁移指南

#### 从 v1.x 升级到 v2.0

1. **环境变量更新**：
   - 如果使用 `PORT=0`，现在会启用 Argo 隧道
   - 添加新的可选环境变量配置

2. **Docker 部署更新**：
   ```bash
   # 旧版本
   docker run -d -p 3000:3000 -e UUID=xxx -e DOMAIN=xxx xcq0607/nodejs_vless:v1

   # 新版本（Argo 隧道）
   docker run -d -e UUID=xxx -e PORT=0 xcq0607/nodejs_vless:latest

   # 新版本（传统模式）
   docker run -d -p 3000:3000 -e UUID=xxx -e DOMAIN=xxx -e PORT=3000 xcq0607/nodejs_vless:latest
   ```

3. **配置文件更新**：
   - 复制 `.env.example` 到 `.env`
   - 根据需要配置新的环境变量

### 🎯 下一步计划

- [ ] 支持更多 Cloudflare 隧道功能
- [ ] 添加 Web 管理界面
- [ ] 支持配置热重载
- [ ] 添加更多监控指标
- [ ] 支持集群部署

---

## v1.x.x - 历史版本

### v1.2.0 - 2024-01-01
- 添加多 API 整合功能
- 支持国家和地区 API 模式
- 添加 Base64 编码输出
- 优化代理 URL 构造界面

### v1.1.0 - 2023-12-15
- 添加正则表达式筛选功能
- 优化 API 数据更新机制
- 改进错误处理

### v1.0.0 - 2023-12-01
- 初始版本发布
- 基础 VLESS 代理功能
- Docker 支持
