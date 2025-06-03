# Cloudflare 一键无交互 VLESS 代理脚本

基于 Node.js 的 VLESS 代理服务，支持 Cloudflare Argo 隧道、多 API 整合及智能代理 URL 构建功能。

## 🌟 功能特点

### 核心功能
- **Cloudflare Argo 隧道支持**：自动创建临时隧道或使用固定隧道
- **智能系统检测**：自动识别 Linux/Windows 系统并选择最优运行策略
- **多 API 整合模式**：自动获取最优节点
- **国家/地区 API 模式**：根据国家代码或地理区域选择节点
- **Base64 编码输出**：支持多种订阅格式
- **正则表达式筛选**：灵活的节点筛选功能
- **友好的代理 URL 构造界面**：可视化配置界面
- **自动定期更新**：每 10 分钟更新后端 API 数据

### 新增功能
- **跨平台兼容**：支持 Windows、Linux、macOS 系统
- **部署信息上传**：自动上传配置到 xbin 粘贴板服务
- **进程稳定性优化**：解决 Windows 下进程阻塞问题
- **密码保护**：支持密码保护敏感配置信息

## 🚀 快速部署

### 方法一：Cloudflare Argo 隧道部署（推荐）

#### 临时隧道模式（零配置）
```bash
# 下载并运行
git clone https://github.com/XCQ0607/nodejs_docker.git
cd nodejs_docker/nodejs
npm install
PORT=0 node app.js
```

#### 固定隧道模式
```bash
# 使用 Token 认证
ARGO_AUTH=your-tunnel-token PORT=0 node app.js

# 使用 JSON 认证文件
ARGO_AUTH=your-tunnel-json ARGO_DOMAIN=your-domain.com PORT=0 node app.js
```

### 方法二：传统部署

#### 一键部署脚本
```bash
bash <(curl -s https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/setup.sh) -u YOUR-UUID -d your-domain.com
```

#### 自定义端口部署
```bash
bash <(curl -s https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/setup.sh) -u YOUR-UUID -d your-domain.com -p 8080
```

### 方法三：Docker 部署

#### 1. 安装 Docker
```bash
curl -fsSL https://get.docker.com | sh
```

#### 2. 拉取最新镜像
```bash
docker pull xcq0607/nodejs_vless:latest
```

#### 3. 运行容器

**Argo 隧道模式（推荐）**
```bash
docker run -d --restart=always \
  -e UUID=your-uuid-here \
  -e PORT=0 \
  -e ARGO_AUTH=your-tunnel-token \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

**传统模式**
```bash
docker run -d --restart=always \
  -p 3000:3000 \
  -e UUID=your-uuid-here \
  -e DOMAIN=your-domain.com \
  -e PORT=3000 \
  --name vless-proxy \
  xcq0607/nodejs_vless:latest
```

## Docker镜像更新说明

最新版本的Docker镜像已经更新并上传至Docker Hub，主要改进包括：

- 升级到Node.js 20版本，提供更好的性能和更新的特性
- 增强了容器安全性，使用非root用户运行应用
- 添加了健康检查功能，便于监控容器状态
- 优化了缓存清理，减小了镜像体积

### 使用Docker镜像

```bash
# 拉取最新镜像
docker pull xcq0607/nodejs_vless:latest

# 运行容器
docker run -d -p 3000:3000 \
  -e UUID=您的UUID \
  -e DOMAIN=您的域名 \
  -e PORT=3000 \
  --name vless_proxy \
  xcq0607/nodejs_vless:latest
```

## 使用方法

### 基本URL格式

```
http://yourserver:port/UUID                  # 多API整合模式
http://yourserver:port/XX/UUID               # 国家API模式 (XX为两字母国家代码)
http://yourserver:port/Region/UUID           # 地区API模式 (Region为地区名称)
http://yourserver:port/UUID/select           # 代理URL构造界面
```

### URL参数

- `base64` - 输出Base64编码的结果
- `regex=true` - 启用正则表达式筛选

### 示例

```
http://yourserver:3000/test123               # 多API整合，返回所有节点
http://yourserver:3000/US/test123            # 返回美国节点
http://yourserver:3000/Asia%20Pacific/test123 # 返回亚太地区节点
http://yourserver:3000/Europe/test123?regex=true # 使用正则搜索欧洲地区节点
http://yourserver:3000/DE/test123?base64     # 返回德国节点，Base64编码
http://yourserver:3000/test123/select        # 打开代理URL构造界面
```

## 📋 环境变量配置

### 基础配置
| 变量名 | 必填 | 默认值 | 描述 |
| ------ | ---- | ------ | ---- |
| UUID | 否 | 自动生成 | 用户唯一标识 |
| DOMAIN | 否 | 自动获取 | 域名，用于 SNI 设置 |
| PORT | 否 | 3000 | 服务监听端口（设为 0 启用 Argo 隧道） |
| NAME | 否 | 主机名 | 节点名称 |

### Argo 隧道配置
| 变量名 | 必填 | 默认值 | 描述 |
| ------ | ---- | ------ | ---- |
| ARGO_PORT | 否 | 8001 | Argo 隧道内部端口 |
| ARGO_DOMAIN | 否 | - | 固定隧道域名 |
| ARGO_AUTH | 否 | - | 隧道认证（Token 或 JSON） |
| FILE_PATH | 否 | ./tmp | cloudflared 文件存储路径 |

### 哪吒监控配置（可选）
| 变量名 | 必填 | 默认值 | 描述 |
| ------ | ---- | ------ | ---- |
| NEZHA_SERVER | 否 | - | 哪吒监控服务器地址 |
| NEZHA_PORT | 否 | - | 哪吒监控端口 |
| NEZHA_KEY | 否 | - | 哪吒监控密钥 |

### xbin 粘贴板配置（可选）
| 变量名 | 必填 | 默认值 | 描述 |
| ------ | ---- | ------ | ---- |
| BINURL | 否 | - | xbin 服务地址（如：https://xbin.pages.dev） |
| BINPATH | 否 | 随机 | 自定义粘贴板 ID |
| BINPWD | 否 | - | 密码保护 |

## 🔧 使用示例

### Argo 隧道模式示例
```bash
# 临时隧道（零配置）
PORT=0 node app.js

# 固定隧道 + xbin 上传
ARGO_AUTH=your-token \
ARGO_DOMAIN=your-domain.com \
BINURL=https://xbin.pages.dev \
BINPATH=my-config \
BINPWD=secret123 \
PORT=0 node app.js
```

### Docker 完整示例
```bash
docker run -d --restart=always \
  -e UUID=89c13786-25aa-4520-b2e7-12cd60fb5202 \
  -e PORT=0 \
  -e ARGO_AUTH=your-tunnel-token \
  -e BINURL=https://xbin.pages.dev \
  -e BINPATH=my-vless-config \
  -e BINPWD=mypassword \
  -e NAME=MyVlessNode \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

## 📊 API 数据来源

- **全球优选 CloudFlare IP**：自动获取最快的 CF 节点
- **地区和国家特定 IP**：支持按地理位置筛选
- **自动更新机制**：每 10 分钟自动更新 API 数据
- **多源聚合**：整合多个 API 源确保可用性

## 🔍 系统检测功能

脚本会自动检测运行环境并选择最优策略：

- **Windows**：使用 `spawn` 启动 cloudflared，避免进程阻塞
- **Linux**：使用 `nohup` 启动，支持 ARM/AMD64 架构自动识别
- **macOS**：使用类 Linux 策略

## 📤 部署信息上传

配置 `BINURL` 后，脚本会自动上传部署信息到 xbin 粘贴板：

```
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
```

## ⚠️ 注意事项

### 安全建议
- **UUID 安全**：建议使用复杂的 UUID 提高安全性
- **密码保护**：使用 `BINPWD` 保护敏感配置信息
- **域名配置**：DOMAIN 参数用于 SNI，建议使用有效域名

### 网络要求
- **防火墙**：确保服务器防火墙已开放对应端口（传统模式）
- **Argo 隧道**：使用 Argo 隧道模式无需开放端口
- **网络访问**：需要能够访问 Cloudflare 和相关 API 服务

### 系统要求
- **Node.js**：建议使用 Node.js 18+ 版本
- **系统支持**：支持 Windows、Linux、macOS
- **架构支持**：支持 x64、ARM64 架构

## 📚 相关文档

- [Docker 部署指南](DOCKER_GUIDE.md) - 详细的 Docker 部署说明
- [系统检测功能](SYSTEM_DETECTION.md) - 跨平台兼容性说明
- [xbin 上传功能](XBIN_UPLOAD.md) - 部署信息上传功能
- [更新日志](CHANGELOG.md) - 版本更新记录

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 📄 许可证

MIT License

## 🔗 相关链接

- [GitHub 仓库](https://github.com/XCQ0607/nodejs_docker)
- [Docker Hub](https://hub.docker.com/r/xcq0607/nodejs_vless)
- [xbin 粘贴板服务](https://github.com/XCQ0607/xbin)
