FROM node:20-slim

WORKDIR /app

# 直接安装需要的依赖，不依赖 package.json
RUN npm install axios@1.9.0 ws@8.14.2

# 复制应用代码
COPY app.js ./

# 创建tmp目录并复制预下载的 cloudflared 文件
RUN mkdir -p tmp

# 复制 Windows 版本的 cloudflared
COPY tmp/bot.exe tmp/

# 复制 Linux 版本的 cloudflared
COPY bot tmp/

# 设置 Linux 版本的执行权限
RUN chmod +x tmp/bot

# 暴露端口
EXPOSE 3000 8001

# 启动应用
CMD ["node", "app.js"]
