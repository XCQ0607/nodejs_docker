# xbin 粘贴板上传功能

## 概述

新增了将部署信息自动上传到 xbin 粘贴板服务的功能，方便用户保存和分享部署配置信息。

## 环境变量配置

在 `.env` 文件中添加以下可选配置：

```env
# xbin 粘贴板配置（可选）
BINURL=https://xbin.pages.dev
BINPATH=my-vless-config
BINPWD=secret123
```

### 配置说明

- **BINURL** (必需): xbin 服务的基础 URL
  - 示例: `https://xbin.pages.dev`
  - 如果不配置，将跳过上传功能

- **BINPATH** (可选): 自定义粘贴板 ID
  - 示例: `my-vless-config`
  - 如果不配置，系统将生成随机 ID

- **BINPWD** (可选): 密码保护
  - 示例: `secret123`
  - 如果不配置，粘贴板将不设密码保护

## 功能特性

### 1. 自动上传
- 服务器启动成功后自动上传部署信息
- 包含完整的配置和访问地址
- 支持 Argo 隧道和普通部署模式

### 2. 详细信息
上传的内容包括：
- 部署时间和系统信息
- UUID、端口、域名等基本配置
- 主页、订阅地址、配置界面等访问地址
- Argo 隧道相关信息
- 使用说明

### 3. 安全特性
- 支持密码保护
- 支持自定义 ID
- 错误处理和日志记录

## 使用示例

### 基本使用
```env
BINURL=https://xbin.pages.dev
```

### 完整配置
```env
BINURL=https://xbin.pages.dev
BINPATH=my-project-2024
BINPWD=mypassword123
```

## 运行日志

### 成功上传
```
正在上传部署信息到 xbin...
✅ 部署信息上传成功!
📋 粘贴板地址: https://xbin.pages.dev/my-project-2024
🔗 粘贴板ID: my-project-2024
🔒 密码保护: 已启用
📋 部署信息已上传到: https://xbin.pages.dev/my-project-2024
```

### 跳过上传
```
BINURL 未配置，跳过上传到 xbin
```

### 上传失败
```
❌ 上传到 xbin 失败: timeout of 10000ms exceeded
响应状态: 500
响应数据: {"error": "Internal server error"}
```

## 上传内容示例

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

## 使用说明
1. 复制订阅地址到你的代理客户端
2. 如需 Base64 格式，使用 Base64 订阅地址
3. 访问配置界面可以自定义选择地区和IP

---
生成时间: 2024-01-15T06:30:45.123Z
```

## API 接口

使用 xbin 的 REST API：

### 创建粘贴板
```bash
curl -X POST https://xbin.pages.dev/api/paste \
  -H "Content-Type: application/json" \
  -d '{
    "content": "部署信息内容",
    "customId": "my-paste",
    "password": "secret123"
  }'
```

### 获取粘贴板
```bash
curl https://xbin.pages.dev/api/paste/my-paste?password=secret123
```

## 错误处理

- **网络超时**: 10秒超时，自动重试
- **API 错误**: 记录详细错误信息
- **配置错误**: 跳过上传，不影响主程序运行

## 注意事项

1. **隐私保护**: 上传的信息包含 UUID 等敏感信息，建议使用密码保护
2. **网络依赖**: 需要能够访问 xbin 服务
3. **可选功能**: 不配置 BINURL 不会影响主程序功能
4. **自定义服务**: 可以使用自己部署的 xbin 服务

## 部署 xbin 服务

如果需要自己部署 xbin 服务：

1. 克隆项目: `git clone https://github.com/XCQ0607/xbin`
2. 部署到 Cloudflare Pages 或其他平台
3. 配置 BINURL 为你的服务地址

这个功能让用户可以方便地保存和分享部署配置，特别适合需要在多个设备或与他人分享配置的场景。
