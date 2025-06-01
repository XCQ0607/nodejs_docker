#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 版本信息
VERSION="1.0.0"

# 默认参数
DEFAULT_PORT=3000

# 读取命令行参数
UUID=""
DOMAIN=""
PORT=$DEFAULT_PORT

print_logo() {
    echo -e "${BLUE}=========================================================${NC}"
    echo -e "${GREEN}        Nodejs VLESS 代理服务 一键安装脚本             ${NC}"
    echo -e "${GREEN}                   版本: v$VERSION                     ${NC}"
    echo -e "${BLUE}=========================================================${NC}"
    echo ""
}

print_help() {
    echo -e "用法: $0 [选项]"
    echo -e ""
    echo -e "选项:"
    echo -e "  -u, --uuid UUID       设置UUID (必须)"
    echo -e "  -d, --domain DOMAIN   设置域名 (必须)"
    echo -e "  -p, --port PORT       设置端口 (默认: $DEFAULT_PORT)"
    echo -e "  -h, --help            显示帮助信息"
    echo -e ""
    echo -e "示例:"
    echo -e "  $0 -u your-uuid -d example.com"
    echo -e "  $0 -u your-uuid -d example.com -p 8080"
    echo -e ""
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}错误: 此脚本必须以root权限运行${NC}" 
        echo -e "请尝试使用 sudo 或以root用户运行此脚本"
        exit 1
    fi
}

# 解析命令行参数
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -u|--uuid) UUID="$2"; shift ;;
        -d|--domain) DOMAIN="$2"; shift ;;
        -p|--port) PORT="$2"; shift ;;
        -h|--help) print_help; exit 0 ;;
        *) echo -e "${RED}未知参数: $1${NC}"; print_help; exit 1 ;;
    esac
    shift
done

# 检查必需参数
check_required_params() {
    if [ -z "$UUID" ]; then
        echo -e "${RED}错误: 缺少UUID参数${NC}"
        echo -e "使用 -u 选项设置UUID"
        print_help
        exit 1
    fi
    
    if [ -z "$DOMAIN" ]; then
        echo -e "${RED}错误: 缺少域名参数${NC}"
        echo -e "使用 -d 选项设置域名"
        print_help
        exit 1
    fi
}

# 检查系统环境
check_system() {
    echo -e "${BLUE}[信息] 正在检查系统环境...${NC}"
    
    # 检查操作系统
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
        echo -e "  - 检测到操作系统: $OS $VER"
    else
        echo -e "${YELLOW}[警告] 无法确定操作系统类型，将尝试继续安装${NC}"
        OS="unknown"
    fi
    
    # 检查架构
    ARCH=$(uname -m)
    echo -e "  - 系统架构: $ARCH"
    
    # 检查内存
    MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
    echo -e "  - 可用内存: $MEM_TOTAL MB"
    
    if [ "$MEM_TOTAL" -lt 256 ]; then
        echo -e "${YELLOW}[警告] 系统内存低于推荐值 (256MB)${NC}"
    fi
}

# 安装必要的依赖
install_dependencies() {
    echo -e "${BLUE}[信息] 正在安装必要依赖...${NC}"
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y curl wget ca-certificates gnupg
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
        yum install -y curl wget ca-certificates
    elif [ "$OS" = "alpine" ]; then
        apk add --no-cache curl wget ca-certificates
    else
        echo -e "${YELLOW}[警告] 未知的操作系统，尝试使用通用方法安装依赖${NC}"
        # 尝试使用一个通用的包管理器
        if command -v apt-get &>/dev/null; then
            apt-get update
            apt-get install -y curl wget ca-certificates gnupg
        elif command -v yum &>/dev/null; then
            yum install -y curl wget ca-certificates
        elif command -v apk &>/dev/null; then
            apk add --no-cache curl wget ca-certificates
        else
            echo -e "${YELLOW}[警告] 无法安装依赖，请确保系统已安装curl和Docker${NC}"
        fi
    fi
}

# 安装Docker
install_docker() {
    echo -e "${BLUE}[信息] 正在检查Docker...${NC}"
    
    # 检查Docker是否已安装
    if command -v docker &>/dev/null; then
        echo -e "  ${GREEN}Docker已安装，版本:$(docker --version)${NC}"
    else
        echo -e "  Docker未安装，正在安装..."
        curl -fsSL https://get.docker.com | sh
        
        # 检查Docker是否安装成功
        if command -v docker &>/dev/null; then
            echo -e "  ${GREEN}Docker安装成功，版本:$(docker --version)${NC}"
        else
            echo -e "${RED}[错误] Docker安装失败，请手动安装Docker后重试${NC}"
            exit 1
        fi
    fi
    
    # 启动Docker服务
    systemctl enable docker || true
    systemctl start docker || true
}

# 拉取Docker镜像
pull_image() {
    echo -e "${BLUE}[信息] 正在拉取最新的Docker镜像...${NC}"
    docker pull xcq0607/nodejs_vless:latest
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}[错误] 拉取Docker镜像失败${NC}"
        exit 1
    else
        echo -e "${GREEN}  Docker镜像拉取成功${NC}"
    fi
}

# 启动容器
run_container() {
    echo -e "${BLUE}[信息] 正在启动容器...${NC}"
    
    # 检查是否已存在同名容器，如果有则删除
    if docker ps -a | grep -q "vless-proxy"; then
        echo -e "  检测到已存在的vless-proxy容器，正在停止并移除..."
        docker stop vless-proxy >/dev/null 2>&1
        docker rm vless-proxy >/dev/null 2>&1
    fi
    
    # 启动新容器
    docker run -d --restart=always \
      -p ${PORT}:3000 \
      -e UUID=${UUID} \
      -e DOMAIN=${DOMAIN} \
      -e PORT=3000 \
      --name vless-proxy \
      xcq0607/nodejs_vless:latest
      
    if [ $? -ne 0 ]; then
        echo -e "${RED}[错误] 启动容器失败${NC}"
        exit 1
    else
        echo -e "${GREEN}  容器启动成功${NC}"
    fi
}

# 开放防火墙端口
configure_firewall() {
    echo -e "${BLUE}[信息] 正在配置防火墙...${NC}"
    
    # 尝试使用ufw (Ubuntu/Debian)
    if command -v ufw &>/dev/null; then
        ufw allow ${PORT}/tcp
        echo -e "  已开放端口 ${PORT}/tcp (ufw)"
    
    # 尝试使用firewalld (CentOS/RHEL/Fedora)
    elif command -v firewall-cmd &>/dev/null; then
        firewall-cmd --permanent --add-port=${PORT}/tcp
        firewall-cmd --reload
        echo -e "  已开放端口 ${PORT}/tcp (firewalld)"
    
    # 尝试使用iptables
    elif command -v iptables &>/dev/null; then
        iptables -A INPUT -p tcp --dport ${PORT} -j ACCEPT
        echo -e "  已开放端口 ${PORT}/tcp (iptables)"
    else
        echo -e "${YELLOW}[警告] 无法配置防火墙，请手动确保端口 ${PORT} 已开放${NC}"
    fi
}

# 显示安装成功信息
print_success() {
    # 获取服务器公网IP
    SERVER_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
    
    echo -e "\n${GREEN}=====================================================${NC}"
    echo -e "${GREEN}          Nodejs VLESS 代理服务 安装成功!             ${NC}"
    echo -e "${GREEN}=====================================================${NC}"
    echo -e ""
    echo -e "${YELLOW}服务信息:${NC}"
    echo -e "  - 服务器IP: ${SERVER_IP}"
    echo -e "  - 服务端口: ${PORT}"
    echo -e "  - UUID: ${UUID}"
    echo -e "  - 域名: ${DOMAIN}"
    echo -e ""
    echo -e "${YELLOW}访问URLs:${NC}"
    echo -e "  - 多API整合模式: http://${SERVER_IP}:${PORT}/${UUID}"
    echo -e "  - URL构造界面: http://${SERVER_IP}:${PORT}/${UUID}/select"
    echo -e ""
    echo -e "${YELLOW}示例命令:${NC}"
    echo -e "  - 查看容器状态: docker ps"
    echo -e "  - 查看容器日志: docker logs vless-proxy"
    echo -e "  - 重启容器: docker restart vless-proxy"
    echo -e "  - 停止容器: docker stop vless-proxy"
    echo -e "  - 移除容器: docker rm vless-proxy"
    echo -e ""
    echo -e "${GREEN}=====================================================${NC}"
    echo -e ""
}

# 主函数
main() {
    print_logo
    check_root
    check_required_params
    check_system
    install_dependencies
    install_docker
    pull_image
    run_container
    configure_firewall
    print_success
}

# 执行主函数
main 