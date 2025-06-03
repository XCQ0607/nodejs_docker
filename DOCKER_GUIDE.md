# Docker 部署指南

## 🐳 Docker 镜像更新说明

最新版本的 Docker 镜像已经更新并支持以下新功能：

### 🆕 新增功能
- **Cloudflare Argo 隧道支持**：自动创建临时隧道或使用固定隧道
- **智能系统检测**：自动识别容器环境并优化运行策略
- **部署信息上传**：自动上传配置到 xbin 粘贴板服务
- **多架构支持**：支持 AMD64 和 ARM64 架构
- **增强健康检查**：支持 Argo 隧道模式的健康检查

### 🔧 技术改进
- 升级到 Node.js 20 版本
- 增强容器安全性（非 root 用户运行）
- 优化镜像体积和缓存策略
- 支持动态端口配置

## 🚀 快速开始

### 方法一：Docker Run（推荐）

#### Argo 隧道模式（零配置）
```bash
docker run -d --restart=always \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

#### Argo 隧道 + 固定域名
```bash
docker run -d --restart=always \
  -e UUID=your-uuid \
  -e PORT=0 \
  -e ARGO_AUTH=your-tunnel-token \
  -e ARGO_DOMAIN=your-domain.com \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

#### 传统模式
```bash
docker run -d --restart=always \
  -p 3000:3000 \
  -e UUID=your-uuid \
  -e DOMAIN=your-domain.com \
  -e PORT=3000 \
  --name vless-traditional \
  xcq0607/nodejs_vless:latest
```

### 方法二：Docker Compose

#### 1. 下载配置文件
```bash
wget https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/docker-compose.yml
wget https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/.env.docker
cp .env.docker .env
```

#### 2. 编辑环境变量
```bash
nano .env
```

#### 3. 启动服务

**Argo 隧道模式（默认）**
```bash
docker-compose up -d vless-argo
```

**传统模式**
```bash
docker-compose --profile traditional up -d vless-traditional
```

**完整功能模式**
```bash
docker-compose --profile full up -d vless-full
```

## 📋 环境变量详解

### 基础配置
```bash
UUID=your-uuid              # 用户标识（留空自动生成）
DOMAIN=your-domain.com       # 域名（传统模式必填）
PORT=0                       # 端口（0=Argo隧道，其他=传统模式）
NAME=VlessNode              # 节点名称
```

### Argo 隧道配置
```bash
ARGO_PORT=8001              # 内部端口
ARGO_AUTH=your-token        # 隧道认证
ARGO_DOMAIN=your-domain.com # 固定域名
```

### xbin 粘贴板配置
```bash
BINURL=https://xbin.pages.dev  # 服务地址
BINPATH=my-config              # 自定义ID
BINPWD=secret123               # 密码保护
```

### 哪吒监控配置
```bash
NEZHA_SERVER=monitor.com    # 监控服务器
NEZHA_PORT=5555            # 监控端口
NEZHA_KEY=your-key         # 监控密钥
```

## 🔍 使用场景

### 场景一：快速测试（零配置）
```bash
docker run -d --name test-vless xcq0607/nodejs_vless:latest
```
- 自动生成 UUID
- 使用临时 Argo 隧道
- 无需端口映射

### 场景二：生产环境（固定隧道）
```bash
docker run -d --restart=always \
  -e UUID=89c13786-25aa-4520-b2e7-12cd60fb5202 \
  -e PORT=0 \
  -e ARGO_AUTH=eyJhIjoiYWJjZGVmZ2hpams... \
  -e ARGO_DOMAIN=vless.example.com \
  -e BINURL=https://xbin.pages.dev \
  -e BINPATH=prod-vless-config \
  -e BINPWD=production-secret \
  -e NAME=ProductionNode \
  --name vless-prod \
  xcq0607/nodejs_vless:latest
```

### 场景三：传统部署（需要端口）
```bash
docker run -d --restart=always \
  -p 8080:8080 \
  -e UUID=your-uuid \
  -e DOMAIN=your-server.com \
  -e PORT=8080 \
  --name vless-traditional \
  xcq0607/nodejs_vless:latest
```

## 🔧 管理命令

### 查看日志
```bash
# 实时日志
docker logs -f vless-argo

# 最近100行日志
docker logs --tail 100 vless-argo
```

### 重启容器
```bash
docker restart vless-argo
```

### 更新镜像
```bash
# 停止容器
docker stop vless-argo

# 删除容器
docker rm vless-argo

# 拉取最新镜像
docker pull xcq0607/nodejs_vless:latest

# 重新运行
docker run -d --restart=always \
  -e UUID=your-uuid \
  --name vless-argo \
  xcq0607/nodejs_vless:latest
```

### 进入容器
```bash
docker exec -it vless-argo /bin/bash
```

## 🔍 故障排除

### 检查容器状态
```bash
docker ps -a | grep vless
```

### 检查健康状态
```bash
docker inspect vless-argo | grep Health -A 10
```

### 常见问题

#### 1. 容器启动失败
```bash
# 查看详细日志
docker logs vless-argo

# 检查环境变量
docker inspect vless-argo | grep Env -A 20
```

#### 2. Argo 隧道连接失败
- 检查网络连接
- 验证 ARGO_AUTH 格式
- 查看 cloudflared 日志

#### 3. 端口访问问题
- 确认端口映射正确
- 检查防火墙设置
- 验证 DOMAIN 配置

## 📊 监控和维护

### 资源使用情况
```bash
docker stats vless-argo
```

### 磁盘使用
```bash
docker system df
```

### 清理无用镜像
```bash
docker image prune -a
```

## 🔄 自动更新

### 使用 Watchtower 自动更新
```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600 \
  vless-argo
```

这个配置会每小时检查一次镜像更新，并自动重启容器。
