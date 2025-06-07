// Cloudflare Worker - 网络加速服务
// 环境变量: UUID, KEY, DOMAIN

// ==================== 配置区域 ====================
// 在这里直接定义变量，如果环境变量存在则优先使用环境变量
const DEFAULT_USER_ID = '2982f122-9649-40dc-bc15-fa3ec91d8921';
const DEFAULT_ACCESS_KEY = 'xcq0607';
const DEFAULT_HOSTNAME = 'run.waf.dpdns.org';
// ================================================

// @ts-ignore
import { connect } from "cloudflare:sockets";

// 全局变量
let clientId = '';
let authKey = '';
let serverHost = '';
let nodeData = [];
let lastRefreshTime = '';

const proxyIPs = ["ts.hpc.tw"];
const cn_hostnames = [''];

// 核心配置参数
const expire = 4102329600; // 2099-12-31
let enableTLS = 'true';
let path = '/?ed=2560';
let allowInsecure = '&allowInsecure=1';

let proxyIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
let proxyPort = proxyIP.match(/:(\d+)$/) ? proxyIP.match(/:(\d+)$/)[1] : '443';
const dohURL = "https://cloudflare-dns.com/dns-query";

// WebSocket 状态常量
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

export default {
  /**
   * @param {any} request
   * @param {{UUID: string, KEY: string, DOMAIN: string}} env
   * @param {any} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    try {
      // 初始化环境变量，优先使用环境变量，否则使用默认值
      clientId = env.UUID || DEFAULT_USER_ID;
      authKey = env.KEY || DEFAULT_ACCESS_KEY;
      serverHost = env.DOMAIN || DEFAULT_HOSTNAME;

      if (!clientId) {
        return new Response('请设置UUID环境变量或在代码中定义DEFAULT_USER_ID', {
          status: 404,
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
      }

      if (!serverHost) {
        return new Response('请设置DOMAIN环境变量或在代码中定义DEFAULT_HOSTNAME', {
          status: 404,
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
      }

      if (!isValidUUID(clientId)) {
        throw new Error("uuid is not valid");
      }

      // 处理代理IP设置
      const { proxyip } = env;
      const url = new URL(request.url);
      const pathname = url.pathname.toLowerCase();

      if (proxyip) {
        if (proxyip.includes(']:')) {
          let lastColonIndex = proxyip.lastIndexOf(':');
          proxyPort = proxyip.slice(lastColonIndex + 1);
          proxyIP = proxyip.slice(0, lastColonIndex);
        } else if (!proxyip.includes(']:') && !proxyip.includes(']')) {
          [proxyIP, proxyPort = '443'] = proxyip.split(':');
        } else {
          proxyPort = '443';
          proxyIP = proxyip;
        }
      } else {
        if (proxyIP.includes(']:')) {
          let lastColonIndex = proxyIP.lastIndexOf(':');
          proxyPort = proxyIP.slice(lastColonIndex + 1);
          proxyIP = proxyIP.slice(0, lastColonIndex);
        } else {
          const match = proxyIP.match(/^(.*?)(?::(\d+))?$/);
          proxyIP = match[1];
          let proxyPort = match[2] || '443';
          console.log("IP:", proxyIP, "Port:", proxyPort);
        }
      }
      console.log('ProxyIP:', proxyIP);
      console.log('ProxyPort:', proxyPort);

      // WebSocket升级处理（代理功能）
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        if(url.pathname.includes('/pyip=')) {
          const tmp_ip=url.pathname.split("=")[1];
          if(isValidIP(tmp_ip)) {
            proxyIP=tmp_ip;
            if (proxyIP.includes(']:')) {
              let lastColonIndex = proxyIP.lastIndexOf(':');
              proxyPort = proxyIP.slice(lastColonIndex + 1);
              proxyIP = proxyIP.slice(0, lastColonIndex);
            } else if (!proxyIP.includes(']:') && !proxyIP.includes(']')) {
              [proxyIP, proxyPort = '443'] = proxyIP.split(':');
            } else {
              proxyPort = '443';
            }
          }
        }
        return await nodeStreamHandler(request);
      }

      // 路由处理
      if (pathname === '/') {
        return handleHomePage();
      } else if (pathname === `/${clientId}` || (authKey && pathname === `/${authKey}`)) {
        return await handleSubscription(request, url);
      } else if (pathname === `/${clientId}/select` || (authKey && pathname === `/${authKey}/select`)) {
        return await handleSelectPage(request);
      } else if (pathname.match(/^\/[a-zA-Z]{2}\/[^\/]+$/)) {
        return await handleCountryAPI(request, url);
      } else if (pathname.match(/^\/bestip\/[^\/]+$/)) {
        return await handleBestIPAPI(request, url);
      } else if (pathname.match(/^\/([^\/]+)\/[^\/]+$/) && !pathname.includes('/select')) {
        return await handleRegionAPI(request, url);
      }

      // 默认处理
      if (cn_hostnames.includes('')) {
        return new Response(JSON.stringify(request.cf, null, 4), {
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
          },
        });
      }
      const randomHostname = cn_hostnames[Math.floor(Math.random() * cn_hostnames.length)];
      const newHeaders = new Headers(request.headers);
      newHeaders.set("cf-connecting-ip", "1.2.3.4");
      newHeaders.set("x-forwarded-for", "1.2.3.4");
      newHeaders.set("x-real-ip", "1.2.3.4");
      newHeaders.set("referer", "https://www.google.com/search?q=edtunnel");
      // Use fetch to proxy the request to 15 different domains
      const proxyUrl = "https://" + randomHostname + url.pathname + url.search;
      let modifiedRequest = new Request(proxyUrl, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "manual",
      });
      const proxyResponse = await fetch(modifiedRequest, { redirect: "manual" });
      // Check for 302 or 301 redirect status and return an error response
      if ([301, 302].includes(proxyResponse.status)) {
        return new Response(`Redirects to ${randomHostname} are not allowed.`, {
          status: 403,
          statusText: "Forbidden",
        });
      }
      // Return the response from the proxy server
      return proxyResponse;
    } catch (err) {
      /** @type {Error} */ let e = err;
      return new Response(e.toString());
    }
  },
};

// 首页处理
async function handleHomePage() {
  // 如果没有数据或数据过期（超过30分钟），则重新获取
  const now = Date.now();
  const lastUpdateTime = lastRefreshTime ? new Date(lastRefreshTime).getTime() : 0;
  const shouldRefresh = nodeData.length === 0 || (now - lastUpdateTime) > 30 * 60 * 1000; // 30分钟

  if (shouldRefresh) {
    try {
      console.log('正在获取节点数据...');
      nodeData = await fetchNodeData();
      lastRefreshTime = new Date().toLocaleString();
      console.log(`获取到 ${nodeData.length} 个节点`);
    } catch (error) {
      console.error('获取节点数据失败:', error.message);
    }
  }

  const totalNodes = nodeData.length + 12; // 加上固定的12个内置节点
  const statusText = nodeData.length > 0 ? '✅ 服务正常' : '⚠️ 数据获取中';

  return new Response(`🚀 网络加速服务 ${statusText}

📊 服务状态:
• 总节点数量: ${totalNodes}
• 优选节点数: ${nodeData.length}
• 内置节点数: 12
• 最后更新: ${lastRefreshTime || '未更新'}

🔗 访问格式:
• 订阅地址: ${serverHost}/USER_ID
• 配置工具: ${serverHost}/USER_ID/select
• 密钥访问: ${serverHost}/ACCESS_KEY/select
• Base64订阅: ${serverHost}/USER_ID?base64

📝 说明:
• USER_ID: 你的用户标识符
• ACCESS_KEY: 访问密钥（可选，用于简化访问）
• 当前域名: ${serverHost}

💡 提示: 首次访问可能需要几秒钟获取最新节点数据`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// 订阅处理
async function handleSubscription(request, url) {
  const isBase64 = url.searchParams.has('base64') || url.searchParams.has('b64');

  // 获取节点数据（如果没有数据或数据过期，则重新获取）
  const now = Date.now();
  const lastUpdateTime = lastRefreshTime ? new Date(lastRefreshTime).getTime() : 0;
  const shouldRefresh = nodeData.length === 0 || (now - lastUpdateTime) > 30 * 60 * 1000; // 30分钟

  if (shouldRefresh) {
    try {
      console.log('正在刷新节点数据...');
      nodeData = await fetchNodeData();
      lastRefreshTime = new Date().toLocaleString();
      console.log(`刷新完成，获取到 ${nodeData.length} 个节点`);
    } catch (error) {
      console.error('刷新节点数据失败:', error.message);
    }
  }

  // 构建服务器列表
  const serverList = [
    { domain: serverHost, name: `节点-Worker` },
    { domain: "104.16.0.0", name: `节点-CF1` },
    { domain: "104.17.0.0", name: `节点-CF2` },
    { domain: "104.18.0.0", name: `节点-CF3` },
    { domain: "cf.090227.xyz", name: "三网自适应分流优选" },
    { domain: "ct.090227.xyz", name: "电信优选" },
    { domain: "cmcc.090227.xyz", name: "移动优选" },
    { domain: "shopify.com", name: "优选域名-shopify" },
    { domain: "time.is", name: "优选域名-time" },
    { domain: "icook.hk", name: "优选域名-icook.hk" },
    { domain: "japan.com", name: "优选域名-japan" },
    { domain: "singapore.com", name: "优选域名-singapore" },
    { domain: "bestcf.onecf.eu.org", name: "第三方维护优选" },
    { domain: "cf.zhetengsha.eu.org", name: "第三方维护优选" },
    ...nodeData
  ];

  // 构建配置URL
  let configURL = serverList.map(item =>
    `vless://${clientId}@${item.domain}:443?encryption=none&security=tls&sni=${serverHost}&fp=randomized&type=ws&host=${serverHost}&path=${encodeURIComponent(path)}${allowInsecure}#${encodeURIComponent(item.name)}`
  ).join('\n');

  if (isBase64) {
    configURL = btoa(configURL);
  }

  return new Response(configURL, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// 获取节点数据
async function fetchNodeData() {
  const dataSourceList = [
    { url: 'https://ipdb.api.030101.xyz/?type=bestcf&country=true', namePrefix: '优选数据源(1-' },
    { url: 'https://addressesapi.090227.xyz/CloudFlareYes', namePrefix: '优选数据源(2-' },
    { url: 'https://addressesapi.090227.xyz/ip.164746.xyz', namePrefix: '优选数据源(3-' },
    { url: 'https://ipdb.api.030101.xyz/?type=bestproxy&country=true', namePrefix: '优选代理源(1-' }
  ];

  let allResults = [];

  for (const source of dataSourceList) {
    try {
      const response = await fetch(source.url, { timeout: 8000 });
      if (response.ok) {
        const data = await response.text();
        const ipList = data.trim().split(/[\r\n]+/);

        ipList.forEach((item, index) => {
          const ipParts = item.split('#');
          const ip = ipParts[0].trim();
          if (ip) {
            let name = `${source.namePrefix}${index + 1})`;
            if (ipParts.length > 1) {
              name += `-${ipParts[1]}`;
            }
            allResults.push({ domain: ip, name: name });
          }
        });
      }
    } catch (error) {
      console.error(`获取 ${source.url} 失败:`, error.message);
    }
  }

  return allResults;
}

// 处理国家API请求
async function handleCountryAPI(request, url) {
  const pathParts = url.pathname.split('/');
  const countryCode = pathParts[1].toUpperCase();
  const requestedId = pathParts[2];

  // 验证用户ID或访问密钥
  if (requestedId !== clientId && requestedId !== authKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  const isBase64 = url.searchParams.has('base64') || url.searchParams.has('b64');

  try {
    const ipData = await fetchCountryBestIP(countryCode);
    if (ipData.length === 0) {
      return new Response(`未找到国家代码 ${countryCode} 的数据`, { status: 404 });
    }

    let configURL = ipData.map(item =>
      `vless://${clientId}@${item.ip}:${item.port}?encryption=none&security=tls&sni=${serverHost}&fp=randomized&type=ws&host=${serverHost}&path=${encodeURIComponent(path)}${allowInsecure}#${encodeURIComponent(countryCode + '-' + item.ip + '-' + item.port)}`
    ).join('\n');

    if (isBase64) {
      configURL = btoa(configURL);
    }

    return new Response(configURL, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    return new Response(`获取国家 ${countryCode} 的数据失败: ${error.message}`, { status: 500 });
  }
}

// 处理全球最佳IP请求
async function handleBestIPAPI(request, url) {
  const pathParts = url.pathname.split('/');
  const requestedId = pathParts[2];

  // 验证用户ID或访问密钥
  if (requestedId !== clientId && requestedId !== authKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  const isBase64 = url.searchParams.has('base64') || url.searchParams.has('b64');

  try {
    const ipData = await fetchGlobalBestIP();
    if (ipData.length === 0) {
      return new Response('未找到全球最佳IP数据', { status: 404 });
    }

    let configURL = ipData.map(item => {
      const nodeName = `${item.ip}-${item.port}-${item.city || 'Unknown'}-${item.latency || 'Unknown'}`;
      return `vless://${clientId}@${item.ip}:${item.port}?encryption=none&security=${item.tls ? 'tls' : 'none'}&sni=${serverHost}&fp=randomized&type=ws&host=${serverHost}&path=${encodeURIComponent(path)}${allowInsecure}#${encodeURIComponent(nodeName)}`;
    }).join('\n');

    if (isBase64) {
      configURL = btoa(configURL);
    }

    return new Response(configURL, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    return new Response(`获取全球最佳IP数据失败: ${error.message}`, { status: 500 });
  }
}

// 处理地区API请求
async function handleRegionAPI(request, url) {
  const pathParts = url.pathname.split('/');
  const region = pathParts[1];
  const requestedId = pathParts[2];

  // 验证用户ID或访问密钥
  if (requestedId !== clientId && requestedId !== authKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  const isBase64 = url.searchParams.has('base64') || url.searchParams.has('b64');
  const useRegex = url.searchParams.has('regex');

  try {
    const ipData = await fetchRegionBestIP(region, useRegex);
    if (ipData.length === 0) {
      return new Response(`未找到地区 ${region} 的数据`, { status: 404 });
    }

    let configURL = ipData.map(item => {
      const nodeName = `${region}-${item.city || 'Unknown'}-${item.latency || 'Unknown'}`;
      return `vless://${clientId}@${item.ip}:${item.port}?encryption=none&security=${item.tls ? 'tls' : 'none'}&sni=${serverHost}&fp=randomized&type=ws&host=${serverHost}&path=${encodeURIComponent(path)}${allowInsecure}#${encodeURIComponent(nodeName)}`;
    }).join('\n');

    if (isBase64) {
      configURL = btoa(configURL);
    }

    return new Response(configURL, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    return new Response(`获取地区 ${region} 的数据失败: ${error.message}`, { status: 500 });
  }
}

// 获取特定国家最佳IP
async function fetchCountryBestIP(countryCode) {
  try {
    const url = `https://bestip.06151953.xyz/country/${countryCode}`;
    const response = await fetch(url, { timeout: 10000 });

    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
    return [];
  } catch (error) {
    console.error(`获取国家 ${countryCode} 的最佳IP数据失败:`, error.message);
    return [];
  }
}

// 获取全球最佳IP
async function fetchGlobalBestIP() {
  try {
    const url = 'https://bestip.06151953.xyz/bestip';
    const response = await fetch(url, { timeout: 10000 });

    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
    return [];
  } catch (error) {
    console.error('获取全球最佳IP数据失败:', error.message);
    return [];
  }
}

// 获取特定地区最佳IP
async function fetchRegionBestIP(region, useRegex) {
  try {
    let decodedRegion;
    try {
      decodedRegion = decodeURIComponent(region);
    } catch (e) {
      decodedRegion = region;
    }

    const encodedRegion = encodeURIComponent(decodedRegion);
    let url = `https://bestip.06151953.xyz/bestip/${encodedRegion}`;

    if (useRegex) {
      url += '?regex=true';
    }

    const response = await fetch(url, { timeout: 10000 });

    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
    return [];
  } catch (error) {
    console.error(`获取地区 ${region} 的最佳IP数据失败:`, error.message);
    return [];
  }
}

// 获取统计数据
async function fetchStatsData() {
  try {
    const url = 'https://bestip.06151953.xyz/api/stats';
    const response = await fetch(url, { timeout: 10000 });

    if (response.ok) {
      return await response.json();
    }
    return {};
  } catch (error) {
    console.error('获取统计数据失败:', error.message);
    return {};
  }
}

function isValidIP(ip) {
    var reg = /^[\s\S]*$/;
    return reg.test(ip);
}

/**
 *
 * @param {any} request
 */
async function nodeStreamHandler(request) {
  /** @type {any} */
  // @ts-ignore
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let address = "";
  let portWithRandomLog = "";
  const log = (/** @type {string} */ info, /** @type {string | undefined} */ event) => {
    console.log(`[${address}:${portWithRandomLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  /** @type {{ value: any | null }} */
  let remoteSocketWapper = {
    value: null,
  };
  let udpStreamWrite = null;
  let isDns = false;

  // ws --> remote
  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDns && udpStreamWrite) {
            return udpStreamWrite(chunk);
          }
          if (remoteSocketWapper.value) {
            const writer = remoteSocketWapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }



          const {
            hasError,
            message,
            portRemote = 443,
            addressRemote = "",
            rawDataIndex,
            cloudflareVersion = new Uint8Array([0, 0]),
            isUDP,
          } = await processcloudflareHeader(chunk, clientId);
          address = addressRemote;
          portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? "udp " : "tcp "} `;
          if (hasError) {
            // controller.error(message);
            throw new Error(message); // cf seems has bug, controller.error will not end stream
            // webSocket.close(1000, message);
            return;
          }
          // if UDP but port not DNS port, close it
          if (isUDP) {
            if (portRemote === 53) {
              isDns = true;
            } else {
              // controller.error('UDP proxy only enable for DNS which is port 53');
              throw new Error("UDP proxy only enable for DNS which is port 53"); // cf seems has bug, controller.error will not end stream
              return;
            }
          }
          // ["version", "附加信息长度 N"]
          const cloudflareResponseHeader = new Uint8Array([cloudflareVersion[0], 0]);
          const rawClientData = chunk.slice(rawDataIndex);

          // TODO: support udp here when cf runtime has udp support
          if (isDns) {
            const { write } = await handleUDPOutBound(webSocket, cloudflareResponseHeader, log);
            udpStreamWrite = write;
            udpStreamWrite(rawClientData);
            return;
          }
          handleTCPOutBound(
            remoteSocketWapper,
            addressRemote,
            portRemote,
            rawClientData,
            webSocket,
            cloudflareResponseHeader,
            log
          );
        },
        close() {
          log(`readableWebSocketStream is close`);
        },
        abort(reason) {
          log(`readableWebSocketStream is abort`, JSON.stringify(reason));
        },
      })
    )
    .catch((err) => {
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: client,
  });
}

/**
 * Checks if a given UUID is present in the API response.
 * @param {string} targetUuid The UUID to search for.
 * @returns {Promise<boolean>} A Promise that resolves to true if the UUID is present in the API response, false otherwise.
 */
async function checkUuidInApiResponse(targetUuid) {
  // Check if any of the environment variables are empty

  try {
    const apiResponse = await getApiResponse();
    if (!apiResponse) {
      return false;
    }
    const isUuidInResponse = apiResponse.users.some((user) => user.uuid === targetUuid);
    return isUuidInResponse;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
}

async function getApiResponse() {
	return { users: [] };
  }
/**
 * Handles outbound TCP connections.
 *
 * @param {any} remoteSocket
 * @param {string} addressRemote The remote address to connect to.
 * @param {number} portRemote The remote port to connect to.
 * @param {Uint8Array} rawClientData The raw client data to write.
 * @param {any} webSocket The WebSocket to pass the remote socket to.
 * @param {Uint8Array} cloudflareResponseHeader The cloudflare response header.
 * @param {function} log The logging function.
 * @returns {Promise<void>} The remote socket.
 */
async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  cloudflareResponseHeader,
  log
) {
  async function connectAndWrite(address, port) {
    if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(address)) address = `${atob('d3d3Lg==')}${address}${atob('LnNzbGlwLmlv')}`;
	/** @type {any} */
    const tcpSocket = connect({
      hostname: address,
      port: port,
    });
    remoteSocket.value = tcpSocket;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData); // first write, nomal is tls client hello
    writer.releaseLock();
    return tcpSocket;
  }

  // if the cf connect tcp socket have no incoming data, we retry to redirect ip
  async function retry() {
    const tcpSocket = await connectAndWrite(proxyIP || addressRemote, proxyPort || portRemote);
    // no matter retry success or not, close websocket
    tcpSocket.closed
      .catch((error) => {
        console.log("retry tcpSocket closed error", error);
      })
      .finally(() => {
        safeCloseWebSocket(webSocket);
      });
    remoteSocketToWS(tcpSocket, webSocket, cloudflareResponseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);

  // when remoteSocket is ready, pass to websocket
  // remote--> ws
  remoteSocketToWS(tcpSocket, webSocket, cloudflareResponseHeader, retry, log);
}

/**
 *
 * @param {any} webSocketServer
 * @param {string} earlyDataHeader for ws 0rtt
 * @param {(info: string)=> void} log for ws 0rtt
 */
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });

      // The event means that the client closed the client -> server stream.
      // However, the server -> client stream is still open until you call close() on the server side.
      // The WebSocket protocol says that a separate close message must be sent in each direction to fully close the socket.
      webSocketServer.addEventListener("close", () => {
        // client send close, need close server
        // if stream is cancel, skip controller.close
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      // for ws 0rtt
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    pull(controller) {
      // if ws can stop read if stream is full, we can implement backpressure
      // https://streams.spec.whatwg.org/#example-rs-push-backpressure
    },
    cancel(reason) {
      // 1. pipe WritableStream has error, this cancel will called, so ws handle server close into here
      // 2. if readableStream is cancel, all controller.close/enqueue need skip,
      // 3. but from testing controller.error still work even if readableStream is cancel
      if (readableStreamCancel) {
        return;
      }
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });

  return stream;
}

// https://xtls.github.io/development/protocols/cloudflare.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 *
 * @param { ArrayBuffer} cloudflareBuffer
 * @param {string} userID
 * @returns
 */
async function processcloudflareHeader(cloudflareBuffer, userID) {
  if (cloudflareBuffer.byteLength < 24) {
    return {
      hasError: true,
      message: "invalid data",
    };
  }
  const version = new Uint8Array(cloudflareBuffer.slice(0, 1));
  let isValidUser = false;
  let isUDP = false;
  const slicedBuffer = new Uint8Array(cloudflareBuffer.slice(1, 17));
  const slicedBufferString = stringify(slicedBuffer);

  const uuids = userID.includes(",") ? userID.split(",") : [userID];

  const checkUuidInApi = await checkUuidInApiResponse(slicedBufferString);
  isValidUser = uuids.some((userUuid) => checkUuidInApi || slicedBufferString === userUuid.trim());

  console.log(`checkUuidInApi: ${await checkUuidInApiResponse(slicedBufferString)}, userID: ${slicedBufferString}`);

  if (!isValidUser) {
    return {
      hasError: true,
      message: "invalid user",
    };
  }

  const optLength = new Uint8Array(cloudflareBuffer.slice(17, 18))[0];
  //skip opt for now

  const command = new Uint8Array(cloudflareBuffer.slice(18 + optLength, 18 + optLength + 1))[0];

  // 0x01 TCP
  // 0x02 UDP
  // 0x03 MUX
  if (command === 1) {
  } else if (command === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`,
    };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = cloudflareBuffer.slice(portIndex, portIndex + 2);
  // port is big-Endian in raw data etc 80 == 0x005d
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(cloudflareBuffer.slice(addressIndex, addressIndex + 1));

  // 1--> ipv4  addressLength =4
  // 2--> domain name addressLength=addressBuffer[1]
  // 3--> ipv6  addressLength =16
  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(cloudflareBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(cloudflareBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(cloudflareBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(cloudflareBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      // 2001:0db8:85a3:0000:0000:8a2e:0370:7334
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      // seems no need add [] for ipv6
      break;
    default:
      return {
        hasError: true,
        message: `invild  addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    cloudflareVersion: version,
    isUDP,
  };
}

/**
 *
 * @param {any} remoteSocket
 * @param {any} webSocket
 * @param {ArrayBuffer} cloudflareResponseHeader
 * @param {(() => Promise<void>) | null} retry
 * @param {*} log
 */
async function remoteSocketToWS(remoteSocket, webSocket, cloudflareResponseHeader, retry, log) {
  // remote--> ws
  let remoteChunkCount = 0;
  let chunks = [];
  /** @type {ArrayBuffer | null} */
  let cloudflareHeader = cloudflareResponseHeader;
  let hasIncomingData = false; // check if remoteSocket has incoming data
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        /**
         *
         * @param {Uint8Array} chunk
         * @param {*} controller
         */
        async write(chunk, controller) {
          hasIncomingData = true;
          // remoteChunkCount++;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error("webSocket.readyState is not open, maybe close");
          }
          if (cloudflareHeader) {
            webSocket.send(await new Blob([cloudflareHeader, chunk]).arrayBuffer());
            cloudflareHeader = null;
          } else {
            // seems no need rate limit this, CF seems fix this??..
            // if (remoteChunkCount > 20000) {
            // 	// cf one package is 4096 byte(4kb),  4096 * 20000 = 80M
            // 	await delay(1);
            // }
            webSocket.send(chunk);
          }
        },
        close() {
          log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
          // safeCloseWebSocket(webSocket); // no need server close websocket frist for some case will casue HTTP ERR_CONTENT_LENGTH_MISMATCH issue, client will send close event anyway.
        },
        abort(reason) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      })
    )
    .catch((error) => {
      console.error(`remoteSocketToWS has exception `, error.stack || error);
      safeCloseWebSocket(webSocket);
    });

  // seems is cf connect socket have error,
  // 1. Socket.closed will have error
  // 2. Socket.readable will be close without any data coming
  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}

/**
 *
 * @param {string} base64Str
 * @returns
 */
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    // go use modified Base64 for URL rfc4648 which js atob not support
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { error };
  }
}

/**
 * This is not real UUID validation
 * @param {string} uuid
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Normally, WebSocket will not has exceptions when close.
 * @param {any} socket
 */
function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}

const byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (
    byteToHex[arr[offset + 0]] +
    byteToHex[arr[offset + 1]] +
    byteToHex[arr[offset + 2]] +
    byteToHex[arr[offset + 3]] +
    "-" +
    byteToHex[arr[offset + 4]] +
    byteToHex[arr[offset + 5]] +
    "-" +
    byteToHex[arr[offset + 6]] +
    byteToHex[arr[offset + 7]] +
    "-" +
    byteToHex[arr[offset + 8]] +
    byteToHex[arr[offset + 9]] +
    "-" +
    byteToHex[arr[offset + 10]] +
    byteToHex[arr[offset + 11]] +
    byteToHex[arr[offset + 12]] +
    byteToHex[arr[offset + 13]] +
    byteToHex[arr[offset + 14]] +
    byteToHex[arr[offset + 15]]
  ).toLowerCase();
}
function stringify(arr, offset = 0) {
  const uuid = unsafeStringify(arr, offset);
  if (!isValidUUID(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}

/**
 *
 * @param {any} webSocket
 * @param {ArrayBuffer} cloudflareResponseHeader
 * @param {(string)=> void} log
 */
async function handleUDPOutBound(webSocket, cloudflareResponseHeader, log) {
  let iscloudflareHeaderSent = false;
  const transformStream = new TransformStream({
    start(controller) {},
    transform(chunk, controller) {
      // udp message 2 byte is the the length of udp data
      // TODO: this should have bug, beacsue maybe udp chunk can be in two websocket message
      for (let index = 0; index < chunk.byteLength; ) {
        const lengthBuffer = chunk.slice(index, index + 2);
        const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
        const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPakcetLength));
        index = index + 2 + udpPakcetLength;
        controller.enqueue(udpData);
      }
    },
    flush(controller) {},
  });

  // only handle dns udp for now
  transformStream.readable
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          const resp = await fetch(
            dohURL, // dns server url
            {
              method: "POST",
              headers: {
                "content-type": "application/dns-message",
              },
              body: chunk,
            }
          );
          const dnsQueryResult = await resp.arrayBuffer();
          const udpSize = dnsQueryResult.byteLength;
          // console.log([...new Uint8Array(dnsQueryResult)].map((x) => x.toString(16)));
          const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            log(`doh success and dns message length is ${udpSize}`);
            if (iscloudflareHeaderSent) {
              webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
            } else {
              webSocket.send(await new Blob([cloudflareResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
              iscloudflareHeaderSent = true;
            }
          }
        },
      })
    )

    .catch((error) => {
      log("dns udp has error" + error);
    });

  const writer = transformStream.writable.getWriter();

  return {
    /**
     *
     * @param {Uint8Array} chunk
     */
    write(chunk) {
      writer.write(chunk);
    },
  };
}

/**
 *
 * @param {string} userID
 * @param {string | null} hostName
 * @returns {string}
 */
function get\u0076\u006c\u0065\u0073\u0073Config(userID, hostName) {
  // 这个函数已被新的优选逻辑替代，保留用于兼容性
  const note = `网络加速服务\n当前代理IP: ${proxyIP}:${proxyPort}`;
  const ty = `https://${hostName}/${userID}`
  const cl = `https://${hostName}/${userID}`
  const sb = `https://${hostName}/${userID}`
  const pty = `https://${hostName}/${userID}`
  const pcl = `https://${hostName}/${userID}`
  const psb = `https://${hostName}/${userID}`

  // 简化的节点配置，现在使用动态优选数据
  const basicNodeConfig = `vless://${userID}@${hostName}:443?encryption=none&security=tls&sni=${hostName}&fp=randomized&type=ws&host=${hostName}&path=%2F%3Fed%3D2560#${hostName}`;
  const wkNodeShare = btoa(basicNodeConfig);
  const pgNodeShare = btoa(basicNodeConfig);


  const noteshow = note.replace(/\n/g, '<br>');
  const displayHtml = `
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
<style>
.limited-width {
    max-width: 200px;
    overflow: auto;
    word-wrap: break-word;
}
</style>
</head>
<script>
function copyToClipboard(text) {
  const input = document.createElement('textarea');
  input.style.position = 'fixed';
  input.style.opacity = 0;
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('Copy');
  document.body.removeChild(input);
  alert('已复制到剪贴板');
}
</script>
`;
if (hostName.includes("workers.dev")) {
return `
<br>
<br>
${displayHtml}
<body>
<div class="container">
    <div class="row">
        <div class="col-md-12">
            <h1>Cloudflare-workers/pages-\u0076\u006c\u0065\u0073\u0073代理脚本 V25.5.4</h1>
	    <hr>
            <p>${noteshow}</p>
            <hr>
	    <hr>
	    <hr>
            <br>
            <br>
            <h3>1：CF-workers-\u0076\u006c\u0065\u0073\u0073+ws节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">现已升级为优选节点服务</td>
						<td class="limited-width">${basicNodeConfig}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${basicNodeConfig}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：7个http端口可任意选择(80、8080、8880、2052、2082、2086、2095)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userID}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：/?ed=2560</li>
		<li>传输安全(TLS)：关闭</li>
            </ul>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
            <h3>2：CF-workers-\u0076\u006c\u0065\u0073\u0073+ws+tls节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">启用了TLS加密，<br>现已升级为优选节点服务</td>
						<td class="limited-width">${basicNodeConfig}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${basicNodeConfig}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：6个https端口可任意选择(443、8443、2053、2083、2087、2096)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userID}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：/?ed=2560</li>
                <li>传输安全(TLS)：开启</li>
                <li>跳过证书验证(allowlnsecure)：false</li>
			</ul>
			<hr>
			<hr>
			<hr>
			<br>
			<br>
			<h3>3：聚合通用、Clash-meta、Sing-box订阅链接如下：</h3>
			<hr>
			<p>注意：<br>1、默认每个订阅链接包含TLS+非TLS共13个端口节点<br>2、当前workers域名作为订阅链接，需通过代理进行订阅更新<br>3、如使用的客户端不支持分片功能，则TLS节点不可用</p>
			<hr>


			<table class="table">
					<thead>
						<tr>
							<th>聚合通用分享链接 (可直接导入客户端)：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${wkNodeShare}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>



			<table class="table">
					<thead>
						<tr>
							<th>聚合通用订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${ty}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${ty}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>

				<table class="table">
						<thead>
							<tr>
								<th>Clash-meta订阅链接：</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="limited-width">${cl}</td>
								<td><button class="btn btn-primary" onclick="copyToClipboard('${cl}')">点击复制链接</button></td>
							</tr>
						</tbody>
					</table>

					<table class="table">
					<thead>
						<tr>
							<th>Sing-box订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${sb}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${sb}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<br>
				<br>
        </div>
    </div>
</div>
</body>
`;
  } else {
    return `
<br>
<br>
${displayHtml}
<body>
<div class="container">
    <div class="row">
        <div class="col-md-12">
            <h1>Cloudflare-workers/pages-\u0076\u006c\u0065\u0073\u0073代理脚本 V25.5.4</h1>
			<hr>
            <p>${noteshow}</p>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
            <h3>1：CF-pages/workers/自定义域-\u0076\u006c\u0065\u0073\u0073+ws+tls节点</h3>
			<table class="table">
				<thead>
					<tr>
						<th>节点特色：</th>
						<th>单节点链接如下：</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="limited-width">启用了TLS加密，<br>现已升级为优选节点服务</td>
						<td class="limited-width">${basicNodeConfig}</td>
						<td><button class="btn btn-primary" onclick="copyToClipboard('${basicNodeConfig}')">点击复制链接</button></td>
					</tr>
				</tbody>
			</table>
            <h5>客户端参数如下：</h5>
            <ul>
                <li>客户端地址(address)：自定义的域名 或者 优选域名 或者 优选IP 或者 反代IP</li>
                <li>端口(port)：6个https端口可任意选择(443、8443、2053、2083、2087、2096)，或反代IP对应端口</li>
                <li>用户ID(uuid)：${userID}</li>
                <li>传输协议(network)：ws 或者 websocket</li>
                <li>伪装域名(host)：${hostName}</li>
                <li>路径(path)：/?ed=2560</li>
                <li>传输安全(TLS)：开启</li>
                <li>跳过证书验证(allowlnsecure)：false</li>
			</ul>
            <hr>
			<hr>
			<hr>
            <br>
            <br>
			<h3>2：聚合通用、Clash-meta、Sing-box订阅链接如下：</h3>
			<hr>
			<p>注意：以下订阅链接仅6个TLS端口节点</p>
			<hr>


			<table class="table">
					<thead>
						<tr>
							<th>聚合通用分享链接 (可直接导入客户端)：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${pgNodeShare}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>



			<table class="table">
					<thead>
						<tr>
							<th>聚合通用订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${pty}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${pty}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>

				<table class="table">
						<thead>
							<tr>
								<th>Clash-meta订阅链接：</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="limited-width">${pcl}</td>
								<td><button class="btn btn-primary" onclick="copyToClipboard('${pcl}')">点击复制链接</button></td>
							</tr>
						</tbody>
					</table>

					<table class="table">
					<thead>
						<tr>
							<th>Sing-box订阅链接：</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="limited-width">${psb}</td>
							<td><button class="btn btn-primary" onclick="copyToClipboard('${psb}')">点击复制链接</button></td>
						</tr>
					</tbody>
				</table>
				<br>
				<br>
        </div>
    </div>
</div>
</body>
`;
  }
}













// 处理select页面
async function handleSelectPage(request) {
    try {
        const statsData = await fetchStatsData();

        // 城市到国家代码映射
        const cityToCountryCode = {
            'Frankfurt': 'DE', 'Stockholm': 'SE', 'Amsterdam': 'NL', 'Paris': 'FR',
            'Seoul': 'KR', 'Los Angeles': 'US', 'Warsaw': 'PL', 'London': 'GB',
            'San Jose': 'US', 'Helsinki': 'FI', 'Tokyo': 'JP', 'Singapore': 'SG',
            'Hong Kong': 'HK', 'Riga': 'LV', 'Fukuoka': 'JP', 'Ashburn': 'US',
            'Istanbul': 'TR', 'Toronto': 'CA', 'Madrid': 'ES', 'Portland': 'US',
            'Zurich': 'CH', 'Düsseldorf': 'DE', 'Seattle': 'US', 'Osaka': 'JP',
            'Bucharest': 'RO', 'Sofia': 'BG', 'Moscow': 'RU', 'Vienna': 'AT',
            'Chicago': 'US', 'Sydney': 'AU', 'Mumbai': 'IN', 'Milan': 'IT',
            'Newark': 'US', 'Buffalo': 'US', 'Tel Aviv': 'IL', 'Dallas': 'US',
            'Copenhagen': 'DK', 'Montréal': 'CA', 'São Paulo': 'BR', 'Taipei': 'TW'
        };

        const regions = statsData.byRegion ? Object.keys(statsData.byRegion) : [];
        const cities = statsData.byCity ? Object.keys(statsData.byCity) : [];

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>网络加速配置工具</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #333; }
        .section { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .option-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        select, input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        select[multiple] { height: 150px; }
        .checkbox-label { font-weight: normal; display: flex; align-items: center; }
        .checkbox-label input { width: auto; margin-right: 8px; }
        button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background-color: #45a049; }
        .result { margin-top: 20px; padding: 15px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; }
        .result-link { word-break: break-all; color: #0066cc; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .tabs { display: flex; margin-bottom: 15px; border-bottom: 1px solid #ddd; }
        .tab { padding: 10px 15px; cursor: pointer; background-color: #f1f1f1; border: 1px solid #ddd; border-bottom: none; margin-right: 5px; border-top-left-radius: 4px; border-top-right-radius: 4px; }
        .tab.active { background-color: #fff; border-bottom: 1px solid #fff; margin-bottom: -1px; }
        .stats-info { margin-bottom: 20px; font-size: 14px; color: #666; }
        .copy-btn { background-color: #2196F3; margin-left: 10px; }
        .copy-btn:hover { background-color: #0b7dda; }
    </style>
</head>
<body>
    <div class="container">
        <h1>网络加速配置工具</h1>

        <div class="stats-info">
            <p>当前共有 ${statsData.total || 0} 个节点地址</p>
            <p>平均延迟: ${statsData.averageLatency ? statsData.averageLatency.toFixed(2) + 'ms' : '未知'}</p>
            <p>最后更新时间: ${statsData.lastUpdate || '未知'}</p>
        </div>

        <div class="tabs">
            <div class="tab active" data-tab="multi-api">多API整合模式</div>
            <div class="tab" data-tab="country-api">国家API模式</div>
            <div class="tab" data-tab="region-api">地区API模式</div>
        </div>

        <div class="tab-content active" id="multi-api">
            <div class="section">
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="multi-base64"> 使用Base64编码
                    </label>
                </div>
                <button onclick="generateMultiApiUrl()">生成URL</button>
                <div class="result" id="multi-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <a href="#" class="result-link" id="multi-api-link" target="_blank"></a>
                    <button class="copy-btn" onclick="copyToClipboard('multi-api-link')">复制</button>
                </div>
            </div>
        </div>

        <div class="tab-content" id="country-api">
            <div class="section">
                <div class="option-group">
                    <label for="country-select">选择国家:</label>
                    <select id="country-select" multiple>
                        ${cities.map(city => {
                            const code = cityToCountryCode[city] || '';
                            if (code) {
                                return `<option value="${code}">${city} (${code})</option>`;
                            }
                            return '';
                        }).filter(Boolean).join('')}
                    </select>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="country-base64"> 使用Base64编码
                    </label>
                </div>
                <button onclick="generateCountryApiUrl()">生成URL</button>
                <div class="result" id="country-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <div id="country-api-links"></div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="region-api">
            <div class="section">
                <div class="option-group">
                    <label for="region-select">选择地区:</label>
                    <select id="region-select">
                        ${regions.map(region => `<option value="${region}">${region}</option>`).join('')}
                    </select>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="region-base64"> 使用Base64编码
                    </label>
                </div>
                <div class="option-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="region-regex"> 启用正则搜索
                    </label>
                </div>
                <button onclick="generateRegionApiUrl()">生成URL</button>
                <div class="result" id="region-api-result" style="display:none;">
                    <p>生成的URL:</p>
                    <a href="#" class="result-link" id="region-api-link" target="_blank"></a>
                    <button class="copy-btn" onclick="copyToClipboard('region-api-link')">复制</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const USER_ID = '${clientId}';
        const ACCESS_KEY = '${authKey}';

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });

        function generateMultiApiUrl() {
            const useBase64 = document.getElementById('multi-base64').checked;
            const accessId = ACCESS_KEY || USER_ID;
            let url = window.location.origin + '/' + accessId;
            if (useBase64) url += '?base64';

            const resultDiv = document.getElementById('multi-api-result');
            const linkElem = document.getElementById('multi-api-link');
            linkElem.href = url;
            linkElem.textContent = url;
            resultDiv.style.display = 'block';
        }

        function generateCountryApiUrl() {
            const select = document.getElementById('country-select');
            const selectedCountries = Array.from(select.selectedOptions).map(option => option.value);
            const useBase64 = document.getElementById('country-base64').checked;
            const accessId = ACCESS_KEY || USER_ID;

            if (selectedCountries.length === 0) {
                alert('请至少选择一个国家');
                return;
            }

            const linksDiv = document.getElementById('country-api-links');
            linksDiv.innerHTML = '';

            selectedCountries.forEach(country => {
                let url = window.location.origin + '/' + country + '/' + accessId;
                if (useBase64) url += '?base64';

                const linkContainer = document.createElement('div');
                linkContainer.style.marginBottom = '10px';

                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.className = 'result-link';
                link.target = '_blank';

                const copyBtn = document.createElement('button');
                copyBtn.textContent = '复制';
                copyBtn.className = 'copy-btn';
                copyBtn.onclick = function() {
                    navigator.clipboard.writeText(url).then(() => alert('已复制到剪贴板'));
                };

                linkContainer.appendChild(link);
                linkContainer.appendChild(copyBtn);
                linksDiv.appendChild(linkContainer);
            });

            document.getElementById('country-api-result').style.display = 'block';
        }

        function generateRegionApiUrl() {
            const select = document.getElementById('region-select');
            const selectedRegion = select.value;
            const useBase64 = document.getElementById('region-base64').checked;
            const useRegex = document.getElementById('region-regex').checked;
            const accessId = ACCESS_KEY || USER_ID;

            if (!selectedRegion) {
                alert('请选择一个地区');
                return;
            }

            let url = window.location.origin + '/' + selectedRegion + '/' + accessId;
            const params = [];

            if (useBase64) params.push('base64');
            if (useRegex) params.push('regex=true');
            if (params.length > 0) url += '?' + params.join('&');

            const resultDiv = document.getElementById('region-api-result');
            const linkElem = document.getElementById('region-api-link');
            linkElem.href = url;
            linkElem.textContent = url;
            resultDiv.style.display = 'block';
        }

        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            navigator.clipboard.writeText(element.textContent).then(() => alert('已复制到剪贴板'));
        }
    </script>
</body>
</html>`;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    } catch (error) {
        return new Response('获取统计数据失败，无法生成URL构造界面', { status: 500 });
    }
}