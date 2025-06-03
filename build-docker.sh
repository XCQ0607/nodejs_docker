#!/bin/bash

# Docker 镜像构建和推送脚本
# 支持 Cloudflare Argo 隧道和系统检测功能

set -e

# 配置变量
DOCKER_USERNAME="xcq0607"
IMAGE_NAME="nodejs_vless"
VERSION="latest"
PLATFORM="linux/amd64,linux/arm64"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    log_success "Docker 已安装"
}

# 检查 Docker Buildx
check_buildx() {
    if ! docker buildx version &> /dev/null; then
        log_error "Docker Buildx 未安装，请升级 Docker 到最新版本"
        exit 1
    fi
    log_success "Docker Buildx 已安装"
}

# 创建 buildx builder
setup_builder() {
    log_info "设置 Docker Buildx builder..."
    
    # 创建新的 builder 实例
    docker buildx create --name multiarch-builder --use --bootstrap 2>/dev/null || true
    
    # 检查 builder 状态
    docker buildx inspect --bootstrap
    
    log_success "Builder 设置完成"
}

# 构建镜像
build_image() {
    log_info "开始构建 Docker 镜像..."
    log_info "平台: ${PLATFORM}"
    log_info "镜像: ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    
    # 构建多架构镜像
    docker buildx build \
        --platform ${PLATFORM} \
        --tag ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} \
        --tag ${DOCKER_USERNAME}/${IMAGE_NAME}:$(date +%Y%m%d) \
        --push \
        .
    
    log_success "镜像构建并推送完成"
}

# 测试镜像
test_image() {
    log_info "测试镜像..."
    
    # 拉取刚推送的镜像
    docker pull ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}
    
    # 运行测试容器
    log_info "启动测试容器..."
    docker run -d \
        --name test-vless \
        -e UUID=test-uuid \
        -e PORT=0 \
        -p 8001:8001 \
        ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}
    
    # 等待容器启动
    sleep 10
    
    # 检查容器状态
    if docker ps | grep -q test-vless; then
        log_success "容器启动成功"
    else
        log_error "容器启动失败"
        docker logs test-vless
        exit 1
    fi
    
    # 清理测试容器
    docker stop test-vless
    docker rm test-vless
    
    log_success "镜像测试通过"
}

# 显示使用说明
show_usage() {
    log_info "Docker 镜像构建完成！"
    echo ""
    echo "使用方法："
    echo ""
    echo "1. Argo 隧道模式（推荐）："
    echo "   docker run -d --restart=always \\"
    echo "     -e UUID=your-uuid \\"
    echo "     -e PORT=0 \\"
    echo "     -e ARGO_AUTH=your-token \\"
    echo "     --name vless-argo \\"
    echo "     ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    echo ""
    echo "2. 传统模式："
    echo "   docker run -d --restart=always \\"
    echo "     -p 3000:3000 \\"
    echo "     -e UUID=your-uuid \\"
    echo "     -e DOMAIN=your-domain.com \\"
    echo "     -e PORT=3000 \\"
    echo "     --name vless-proxy \\"
    echo "     ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    echo ""
    echo "3. 完整配置："
    echo "   docker run -d --restart=always \\"
    echo "     -e UUID=your-uuid \\"
    echo "     -e PORT=0 \\"
    echo "     -e ARGO_AUTH=your-token \\"
    echo "     -e BINURL=https://xbin.pages.dev \\"
    echo "     -e BINPATH=my-config \\"
    echo "     -e BINPWD=secret \\"
    echo "     -e NAME=MyNode \\"
    echo "     --name vless-full \\"
    echo "     ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
}

# 主函数
main() {
    log_info "开始构建 Cloudflare VLESS 代理 Docker 镜像"
    log_info "版本: ${VERSION}"
    log_info "支持架构: ${PLATFORM}"
    
    check_docker
    check_buildx
    setup_builder
    build_image
    test_image
    show_usage
    
    log_success "所有操作完成！"
}

# 处理命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -u|--username)
            DOCKER_USERNAME="$2"
            shift 2
            ;;
        --no-test)
            SKIP_TEST=true
            shift
            ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  -v, --version VERSION    设置镜像版本 (默认: latest)"
            echo "  -u, --username USERNAME 设置 Docker Hub 用户名 (默认: xcq0607)"
            echo "  --no-test               跳过镜像测试"
            echo "  -h, --help              显示帮助信息"
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            exit 1
            ;;
    esac
done

# 运行主函数
main
