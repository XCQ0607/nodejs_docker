# Cloudflare KV 写入优化说明

## 问题描述

原始代码中存在大量频繁的 KV 写入操作，导致超出 Cloudflare KV 的每日写入限制（"KV put() limit exceeded for the day"）。

## 优化措施

### 1. 访问日志批量写入优化

**原问题：** 每次请求都会立即写入 KV 存储
**解决方案：** 
- 使用内存缓存收集日志
- 批量写入（50条或5分钟间隔）
- 跳过不重要的路径（API、静态资源等）

```javascript
// 优化前：每次请求都写入KV
await PROXY_KV.put(logKey, JSON.stringify(todayLogs));

// 优化后：批量写入
logCache.push(logEntry);
if (logCache.length >= LOG_BATCH_SIZE || timeExpired) {
  await flushLogsToKV();
}
```

### 2. Session 验证优化

**原问题：** 每次验证都会延长 session 时间并写入 KV
**解决方案：** 
- 只有在 session 即将过期时才续期
- 减少不必要的 KV 写入操作

```javascript
// 优化前：每次验证都续期
session.expires = now + SESSION_DURATION;
await PROXY_KV.put(`session_${token}`, JSON.stringify(session));

// 优化后：只在需要时续期
if (timeUntilExpiry < renewThreshold) {
  session.expires = now + SESSION_DURATION;
  await PROXY_KV.put(`session_${token}`, JSON.stringify(session));
}
```

### 3. 监控历史数据批量写入

**原问题：** 每次监控检查都立即写入历史数据
**解决方案：** 
- 使用 Map 缓存监控数据
- 批量写入（20条或10分钟间隔）

```javascript
// 优化前：每次都写入
await PROXY_KV.put(historyKey, JSON.stringify(todayHistory));

// 优化后：批量写入
monitorHistoryCache.set(cacheKey, cachedHistory);
if (totalCachedRecords >= MONITOR_BATCH_SIZE || timeExpired) {
  await flushMonitorHistoryToKV();
}
```

### 4. 强制缓存刷新机制

- 在定时任务结束时强制刷新所有缓存
- 在 Worker 关闭时强制刷新缓存
- 确保数据不会丢失

### 5. 登录API错误处理优化

**原问题：** JSON 解析失败时返回模糊的"请求格式错误"
**解决方案：** 
- 详细的请求验证
- 明确的错误信息
- 更好的错误处理

## 配置参数

```javascript
// 日志批量写入配置
const LOG_FLUSH_INTERVAL = 5 * 60 * 1000; // 5分钟
const LOG_BATCH_SIZE = 50; // 50条日志

// 监控数据批量写入配置
const MONITOR_FLUSH_INTERVAL = 10 * 60 * 1000; // 10分钟
const MONITOR_BATCH_SIZE = 20; // 20条记录

// Session 续期阈值
const renewThreshold = SESSION_DURATION * 0.5; // 剩余时间少于一半时续期
```

## 预期效果

1. **大幅减少 KV 写入次数**：从每次请求写入改为批量写入
2. **提高性能**：减少网络请求和 KV 操作延迟
3. **避免限制**：不再触发 KV 每日写入限制
4. **数据安全**：通过强制刷新机制确保数据不丢失
5. **更好的错误处理**：提供明确的错误信息

## 注意事项

1. 内存缓存会占用一定的 Worker 内存
2. 在高并发情况下，缓存大小可能需要调整
3. 定时任务执行时会强制刷新所有缓存
4. Worker 重启时未刷新的缓存数据会丢失（但影响很小）

## 监控建议

建议监控以下指标：
- KV 写入次数（应该大幅减少）
- 缓存刷新频率
- 内存使用情况
- 数据完整性
