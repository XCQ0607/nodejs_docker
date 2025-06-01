# Vless Node.js Docker 镜像

这个Docker镜像包含了一个基于Cloudflare的Vless代理Node.js应用。

## 镜像信息
- 镜像名称：`xcq0607/nodejs_vless:latest`
- Docker Hub地址：`https://hub.docker.com/r/xcq0607/nodejs_vless`

## 部署说明

在部署此镜像到您的平台时，请使用以下配置：

### 基本配置
- **应用名称**：选择任意名称（例如：vless-proxy）
- **镜像**：`xcq0607/nodejs_vless:latest`
- **镜像可见性**：公开

### 资源配置
- **用量**：固定（推荐）或可扩展
- **副本数**：1（需要时可增加）
- **CPU**：0.2核心（最低推荐）
- **内存**：256 MB（最低推荐）

### 网络配置
- **容器端口**：3000（必须与PORT环境变量匹配）
- **公开访问**：如果需要公开访问服务，请启用

### 环境变量
您需要设置以下环境变量：
- `UUID`：您的Vless代理UUID
- `PORT`：设置为3000（必须与暴露的端口匹配）
- `DOMAIN`：您的域名

可选环境变量：
- `NEZHA_SERVER`：哪吒服务器地址（可选）
- `NEZHA_PORT`：哪吒服务器端口（可选）
- `NEZHA_KEY`：哪吒密钥（可选）
- `NAME`：自定义名称（默认为主机名）

## 如何访问
部署后，您可以通过以下方式访问您的服务：
- 主服务：`https://您的域名/`
- Vless配置：`https://您的域名/您的UUID`
- Base64编码配置：`https://您的域名/您的UUID?base64` 或 `https://您的域名/您的UUID?b64`

## 使用方法
```bash
# 拉取镜像
docker pull xcq0607/nodejs_vless:latest

# 运行容器
docker run -d -p 3000:3000 \
  -e UUID=您的UUID \
  -e PORT=3000 \
  -e DOMAIN=您的域名 \
  --name vless-proxy \
  xcq0607/nodejs_vless:latest
``` 