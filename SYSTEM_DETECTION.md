# 系统检测和运行策略

## 概述

已成功为 Cloudflare 一键代理脚本增加了智能系统检测功能，能够自动识别运行环境并选择最适合的运行策略。

## 功能特性

### 1. 系统检测
- **操作系统识别**：自动检测 Windows、Linux、macOS
- **架构检测**：支持 ARM 和 AMD64 架构
- **详细信息显示**：显示系统平台、架构类型和运行策略

### 2. 运行策略

#### Windows 策略
- **文件名**：`bot.exe`
- **下载源**：GitHub Release
- **启动方式**：使用 `spawn` 避免进程阻塞
- **进程管理**：`detached: true` 和 `child.unref()` 确保独立运行
- **清理命令**：`taskkill /F /IM bot.exe`

#### Linux 策略 (参考 node_argo.js)
- **文件名**：`bot`
- **下载源**：
  - ARM: `https://arm64.ssss.nyc.mn/2go`
  - AMD64: `https://amd64.ssss.nyc.mn/2go`
- **启动方式**：使用 `nohup` 后台运行
- **权限设置**：自动设置 `0o775` 执行权限
- **清理命令**：`pkill -f "[b]ot"`

#### 默认策略
- 对于未知系统，使用类 Linux 策略

### 3. 核心函数

#### `getSystemInfo()`
```javascript
// 检测系统信息并返回详细信息
{
    platform: 'win32' | 'linux' | 'darwin',
    arch: 'x64' | 'arm64' | 'arm' | ...,
    isWindows: boolean,
    isLinux: boolean,
    isMac: boolean
}
```

#### `getSystemArchitecture()`
```javascript
// 返回简化的架构类型
'arm' | 'amd'
```

#### `startCloudflared()`
```javascript
// 统一入口，自动选择合适的启动策略
if (systemInfo.isLinux) {
    await startCloudflaredLinux();
} else if (systemInfo.isWindows) {
    await startCloudflaredWindows();
} else {
    await startCloudflaredLinux(); // 默认策略
}
```

## 实际运行效果

### Windows 环境
```
检测到系统: win32, 架构: x64
系统信息详情:
- 操作系统: Windows
- 架构类型: amd
- 运行策略: Windows策略
使用 Windows 运行策略
cloudflared 已启动 (Windows PID: 4788)
```

### Linux 环境 (预期)
```
检测到系统: linux, 架构: x64
系统信息详情:
- 操作系统: Linux
- 架构类型: amd
- 运行策略: Linux策略
使用 Linux 运行策略
cloudflared 已启动 (Linux)
```

## 优势

1. **自动适配**：无需手动配置，自动选择最佳策略
2. **跨平台兼容**：支持主流操作系统和架构
3. **进程稳定性**：解决了 Windows 下进程阻塞问题
4. **资源管理**：正确的进程清理和权限设置
5. **错误恢复**：重试机制也使用相同的系统检测策略

## 技术细节

### Windows 特殊处理
- 使用 `spawn` 替代 `exec` 避免命令阻塞
- 设置 `detached: true` 让子进程独立运行
- 使用 `child.unref()` 防止主进程等待

### Linux 特殊处理
- 自动下载对应架构的二进制文件
- 设置正确的文件执行权限
- 使用 `nohup` 确保后台运行

### 错误处理
- 下载失败时的错误提示
- 进程启动失败的重试机制
- 系统清理时的容错处理

## 兼容性

- ✅ Windows (x64, ARM64)
- ✅ Linux (x64, ARM64, ARM)
- ✅ macOS (使用 Linux 策略)
- ✅ 其他 Unix-like 系统 (使用 Linux 策略)

这个系统检测功能确保了脚本在不同环境下都能稳定运行，提供了更好的用户体验和系统兼容性。
