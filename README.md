# Nodejs VLESS 代理服务

基于Node.js的VLESS代理服务，支持多API整合及智能代理URL构建功能。

## 功能特点

- 多API整合模式，自动获取最优节点
- 国家API模式，根据两字母国家代码选择节点
- 地区API模式，根据地理区域选择节点（支持Asia Pacific、North America等含空格地区）
- 可选的Base64编码输出
- 支持正则表达式筛选
- 友好的代理URL构造界面
- 自动定期更新后端API数据

## 快速部署

### 方法一：一键部署脚本（推荐）

```bash
bash <(curl -s https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/setup.sh) -u YOUR-UUID -d your-domain.com
```

或使用自定义端口:

```bash
bash <(curl -s https://raw.githubusercontent.com/XCQ0607/nodejs_docker/main/setup.sh) -u YOUR-UUID -d your-domain.com -p 8080
```

### 方法二：手动Docker部署

1. 安装Docker

```bash
curl -fsSL https://get.docker.com | sh
```

2. 拉取镜像

```bash
docker pull xcq0607/nodejs_vless:latest
```

3. 运行容器

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

## 环境变量

| 变量名 | 必填 | 默认值 | 描述              |
| ------ | ---- | ------ | ----------------- |
| UUID   | 是   | -      | 用户唯一标识      |
| DOMAIN | 是   | -      | 域名，用于SNI设置 |
| PORT   | 否   | 3000   | 服务监听端口      |

## API数据来源

- 全球优选CloudFlare IP
- 地区和国家特定IP
- 每10分钟自动更新API数据

## 注意事项

- 确保服务器防火墙已开放对应端口
- UUID可自定义，建议使用复杂字符串提高安全性
- DOMAIN参数用于SNI，建议使用有效域名
