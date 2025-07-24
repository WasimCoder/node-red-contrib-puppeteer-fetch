module.exports = function(RED) {
  const puppeteer = require("puppeteer");
  const fs = require("fs");
  const path = require("path");

// Main class for fetching with Puppeteer
class PuppeteerFetcher {
  constructor(config = {}) {
    // Merge user config with defaults
    this.config = config;
    this.browser = null;
    this.page = null;
    this.responses = [];
    this.screenshotBase64 = null;
    this.startTime = null;
    this.requestCounter = 0;
    this.requestMap = new Map();
    this.downloadSizeLimit = this.config?.network?.httpRequest?.limitDownloadSizeKB * 1024;
    this.responseSizeLimit = this.config?.network?.httpResponse?.limitDownloadSizeKB * 1024;
  }


  // Launch Puppeteer browser and configure options
  async initializeBrowser() {
    const launchOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };

    // Set HTTP version
    if (this.config?.network?.httpRequest?.httpVersion === "HTTP 1.1") {
      launchOptions.args.push("--disable-http2");
    }

    // Set TLS/SSL options
    if (this.config?.network?.tls?.enabled) {
      switch (this.config?.network?.tls?.sslVersion) {
        case "TLSv1.0":
          launchOptions.args.push("--ssl-version-min=tls1");
          launchOptions.args.push("--ssl-version-max=tls1");
          break;
        case "TLSv1.1":
          launchOptions.args.push("--ssl-version-min=tls1.1");
          launchOptions.args.push("--ssl-version-max=tls1.1");
          break;
        case "TLSv1.2":
          launchOptions.args.push("--ssl-version-min=tls1.2");
          launchOptions.args.push("--ssl-version-max=tls1.2");
          break;
        case "TLSv1.3":
          launchOptions.args.push("--ssl-version-min=tls1.3");
          launchOptions.args.push("--ssl-version-max=tls1.3");
          break;
        case "SSLv3":
          launchOptions.args.push("--ssl-version-min=ssl3");
          launchOptions.args.push("--ssl-version-max=ssl3");
          break;
      }
      // Handle client certificate
      const cert = this.config?.network?.tls?.clientCertificate;
      if (cert && typeof cert === 'string' && cert.trim().length > 0) {
        let certPath = cert;
        // If not a file path, treat as PEM content
        if (!fs.existsSync(cert) || cert.includes('-----BEGIN CERTIFICATE-----')) {
          // Write PEM to temp file
          const tmpDir = require('os').tmpdir();
          certPath = path.join(tmpDir, `puppeteer-client-cert-${Date.now()}.pem`);
          fs.writeFileSync(certPath, cert);
        }
        launchOptions.args.push(`--client-certificate-file=${certPath}`);
      }
    }

    // Disable web security if not following redirects
    if (!this.config?.network?.httpRequest?.followRedirects) {
      launchOptions.args.push("--disable-web-security");
    }

    // Set Chromium version if specified
    if (this.config?.browserOptions?.chromiumVersion) {
      launchOptions.executablePath = puppeteer
        .executablePath()
        .replace(
          /puppeteer\/\.local-chromium/,
          `puppeteer/${this.config.browserOptions.chromiumVersion}`
        );
    }

    // Allow media stream if needed
    if (this.config?.browserOptions?.microphoneAndCamera === "allow") {
      launchOptions.args.push("--use-fake-ui-for-media-stream");
      launchOptions.args.push("--use-fake-device-for-media-stream");
    }

    // Allow geolocation if needed
    if (this.config?.browserOptions?.geolocation === "allow") {
      launchOptions.args.push("--enable-features=Geolocation");
    }

    // Launch browser and create new page
    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    await this.configurePage();
  }

  // Configure page settings and request interception
  async configurePage() {
    // Set preferred language header
    if (this.config?.browserOptions?.preferredLanguage) {
      await this.page.setExtraHTTPHeaders({
        "Accept-Language": this.config?.browserOptions?.preferredLanguage,
      });
    }

    // Set custom user agent
    if (this.config?.network?.httpRequest?.userAgent) {
      await this.page.setUserAgent(this.config.network.httpRequest.userAgent);
    }

    // Prepare headers object
    const headers = {};
    // Add custom headers
    if (this.config?.network?.httpRequest?.customHeaders) {
      Object.assign(headers, this.config.network.httpRequest.customHeaders);
    }

    // Add authentication headers if needed
    await this.configureAuthentication(headers);

    // Set all headers at once
    if (Object.keys(headers).length > 0) {
      await this.page.setExtraHTTPHeaders(headers);
    }

    // Set viewport for device emulation
    await this.page.setViewport({
      width: this.config?.network?.httpRequest?.deviceEmulation?.width || 1920,
      height: this.config?.network?.httpRequest?.deviceEmulation?.height || 1080,
      isLandscape:
        (this.config?.network?.httpRequest?.deviceEmulation?.orientation || "landscape") === "landscape",
    });

    // Enable request interception for POST and download limits
    await this.page.setRequestInterception(true);
    const mainUrl = this.config?.url;
    const applyToAll = this.config?.network?.httpRequest?.applyToAllRequests;
    this.page.on('request', (request) => {
      const requestOptions = {};
      let shouldApply = false;
      if (applyToAll) {
        shouldApply = true;
      } else {
        // Only apply to main navigation request
        try {
          const reqUrlObj = new URL(request.url());
          const mainUrlObj = new URL(mainUrl);
          if (reqUrlObj.hostname === mainUrlObj.hostname && reqUrlObj.pathname === mainUrlObj.pathname) {
            shouldApply = true;
          }
        } catch {}
      }

      // Apply download size limits for certain resource types
      if (this.downloadSizeLimit > 0) {
        const resourceType = request.resourceType();
        if (['image', 'media', 'font'].includes(resourceType)) {
          request.abort();
          return;
        }
      }

      if (shouldApply) {
        // Handle POST requests
        if (this.config?.network?.httpRequest?.method === 'POST') {
          requestOptions.method = 'POST';
          if (this.config?.network?.httpRequest?.postBody) {
            requestOptions.postData = JSON.stringify(this.config?.network?.httpRequest?.postBody);
          }
        }
        // Add custom headers
        if (this.config?.network?.httpRequest?.customHeaders) {
          requestOptions.headers = Object.assign({}, request.headers(), this.config?.network?.httpRequest?.customHeaders);
        }
        // Add params to URL if present
        if (this.config?.network?.httpRequest?.params && Object.keys(this.config?.network?.httpRequest?.params).length > 0) {
          const urlObj = new URL(request.url());
          for (const [key, value] of Object.entries(this.config?.network?.httpRequest?.params)) {
            urlObj.searchParams.set(key, value);
          }
          requestOptions.url = urlObj.toString();
        }
      }
      request.continue(requestOptions);
    });
  }

  // Configure authentication for the page
  async configureAuthentication(headers) {
    const authConfig = this.config?.network?.httpAuthentication;
    switch (authConfig?.scheme) {
      case "Basic":
        if (authConfig?.basic?.username && authConfig?.basic?.password) {
          await this.page.authenticate({
            username: authConfig?.basic?.username,
            password: authConfig?.basic?.password,
          });
        }
        break;
      case "NTLM":
        // NTLM authentication placeholder
        console.warn("NTLM authentication not fully implemented");
        break;
      case "OAuth":
        // OAuth authentication placeholder
        if (authConfig?.oauth?.authUrl) {
          await this.handleOAuthAuthentication(authConfig?.oauth, headers);
        }
        break;
      case "Kerberos":
        // Kerberos authentication placeholder
        console.warn("Kerberos authentication not fully implemented");
        break;
    }
  }

  // Handle OAuth authentication (simplified)
  async handleOAuthAuthentication(oauthConfig, headers) {
    try {
      // Handle Basic scheme headers if present
      if (oauthConfig?.initialScheme === "Basic" && oauthConfig?.headers) {
        Object.assign(headers, oauthConfig.headers);
      }

      // Complete OAuth flow: request token and inject into headers
      if (oauthConfig?.authUrl && oauthConfig?.requestMethod) {
        const fetch = require('node-fetch');
        const requestOptions = {
          method: oauthConfig.requestMethod,
          headers: oauthConfig.headers || {},
          body: oauthConfig.body || undefined
        };
        const response = await fetch(oauthConfig.authUrl, requestOptions);
        if (!response.ok) {
          throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
        }
        let token = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          // Extract token using tokenPath if provided
          if (oauthConfig.tokenPath) {
            // Support dot notation for nested tokenPath
            token = oauthConfig.tokenPath.split('.').reduce((obj, key) => obj && obj[key], data);
          } else {
            // Fallback: try common keys
            token = data.access_token || data.token || data.id_token;
          }
        } else {
          // Fallback: treat as text
          token = await response.text();
        }
        if (!token) {
          throw new Error('OAuth token not found in response');
        }
        // Inject token into headers (default: Bearer)
        const authHeader = oauthConfig.authHeaderName || 'Authorization';
        const scheme = oauthConfig.authScheme || 'Bearer';
        headers[authHeader] = `${scheme} ${token}`;
      }
    } catch (error) {
      console.warn(`OAuth authentication failed: ${error.message}`);
    }
  }

  // Take screenshot of the page
  async takeScreenshot() {
    if (!this.config?.browserOptions?.screenshot) return;
    try {
      const base64 = await this.page.screenshot({
        encoding: "base64",
        fullPage: true,
        type: "jpeg",
      });
      this.screenshotBase64 = "data:image/jpeg;base64," + base64;
    } catch (error) {
      console.warn(`Screenshot failed: ${error.message}`);
    }
  }

  // Setup request and response event handlers
  setupRequestAndResponseHandlers() {
    // Assign sequence numbers to requests
    this.page.on("request", (request) => {
      if (!this.requestMap.has(request)) {
        this.requestCounter += 1;
        this.requestMap.set(request, this.requestCounter);
      }
    });

    // Handle responses with filtering and verification
    this.page.on("response", async (response) => {
      try {
        const resourceUrl = response.url();
        // Skip excluded domains
        if (this.config?.excludeElements?.excludeDomainsOrObjectUrls?.some((domain) =>
            resourceUrl?.includes(domain))) {
          return;
        }
        // Check if status code is acceptable
        if (!this.isStatusCodeAcceptable(response.status())) {
          console.warn(`Status code ${response.status()} not in desired range`);
        //   return;
        }
        const responseData = await this.processResponse(response);
        // Verify content if pattern is specified
        if (this.config?.network?.httpResponse?.verifyContent && responseData.body) {
          const contentRegex = new RegExp(this.config?.network?.httpResponse?.verifyContent);
          if (!contentRegex.test(responseData.body)) {
            console.warn(`Content verification failed for ${resourceUrl}`);
            return;
          }
        }
        this.responses.push(responseData);
      } catch (error) {
        console.warn(`Error processing response: ${error.message}`);
      }
    });
  }

  // Check if status code matches desired patterns
  isStatusCodeAcceptable(statusCode) {
    let desiredCodes = this.config?.network?.httpResponse?.desiredStatusCodes;
    if (!Array.isArray(desiredCodes) || desiredCodes.length === 0) {
      return true
    }
    return desiredCodes.some(pattern => {
      if (pattern === "2xx") return statusCode >= 200 && statusCode < 300;
      if (pattern === "3xx") return statusCode >= 300 && statusCode < 400;
      if (pattern === "4xx") return statusCode >= 400 && statusCode < 500;
      if (pattern === "5xx") return statusCode >= 500 && statusCode < 600;
      return statusCode.toString() === pattern;
    });
  }

  // Process response and extract relevant data
  async processResponse(response) {
    const resourceUrl = response.url();
    const status = response.status();
    const statusText = response.statusText();
    const ok = response.ok();
    const headers = this.config?.network?.httpResponse?.showHttpHeadersInWaterfall
      ? response.headers()
      : {};
    const json = await response.json().then((value) => value).catch((err) => {});
    const rawTiming = response.timing() || {};
    const timing = this.parseTiming(rawTiming);
    const request = response.request();
    const method = request.method();
    const postData = request.postData();
    const resourceType = request.resourceType();
    const frame = request.frame();
    const frameUrl = frame ? await frame.url() : null;
    const remoteAddress = response.remoteAddress ? response.remoteAddress() : undefined;
    const securityDetails = response.securityDetails ? response.securityDetails() : undefined;
    let sequenceNumber = this.requestMap.get(request);
    if (sequenceNumber === undefined) {
      this.requestCounter += 1;
      sequenceNumber = this.requestCounter;
      this.requestMap.set(request, sequenceNumber);
    }
    let parentSequenceNumber = null;
    let body = null;
    try {
      const contentType = headers["content-type"] || "";
      if (contentType.includes("application/json") ||
          contentType.includes("text/html") ||
          contentType.includes("text/plain")) {
        body = await response.text();
        // Apply response size limit
        if (this.responseSizeLimit > 0 && body.length > this.responseSizeLimit) {
          body = body.substring(0, this.responseSizeLimit) + "... [truncated]";
        }
      }
    } catch (error) {
      console.warn(`Error getting body for ${resourceUrl}: ${error.message}`);
    }
    return {
      sequenceNumber,
      parentSequenceNumber,
      url: resourceUrl,
      status,
      statusText,
      ok,
      method,
      resourceType,
      response: json,
      frameUrl,
      headers,
      timing,
      postData,
      remoteAddress,
      securityDetails,
      body,
      initiatorType: null,
      startTime: rawTiming.requestTime || null,
    };
  }

  // Parse timing information from response
  parseTiming(rawTiming) {
    let timing = {
      requestTime: rawTiming.requestTime,
      dnsLookup:
        rawTiming.dnsEnd >= 0 && rawTiming.dnsStart >= 0
          ? rawTiming.dnsEnd - rawTiming.dnsStart
          : null,
      tcpConnection:
        rawTiming.connectEnd >= 0 && rawTiming.connectStart >= 0
          ? rawTiming.connectEnd - rawTiming.connectStart
          : null,
      sslHandshake:
        rawTiming.sslEnd >= 0 && rawTiming.sslStart >= 0
          ? rawTiming.sslEnd - rawTiming.sslStart
          : null,
      requestSent:
        rawTiming.sendEnd >= 0 && rawTiming.sendStart >= 0
          ? rawTiming.sendEnd - rawTiming.sendStart
          : null,
      waitingTTFB:
        rawTiming.receiveHeadersStart >= 0 && rawTiming.sendEnd >= 0
          ? rawTiming.receiveHeadersStart - rawTiming.sendEnd
          : null,
      contentDownload:
        rawTiming.receiveHeadersEnd >= 0 &&
        rawTiming.receiveHeadersStart >= 0
          ? rawTiming.receiveHeadersEnd - rawTiming.receiveHeadersStart
          : null,
      total:
        rawTiming.receiveHeadersEnd >= 0 && rawTiming.requestTime >= 0
          ? rawTiming.receiveHeadersEnd
          : null,
    };
    return timing;
  }

  // Build full URL with query parameters
  buildFullUrl() {
    try {
      const urlObj = new URL(this.config?.url);
      // Add query parameters
      if (this.config?.network?.httpRequest?.params) {
        for (const [key, value] of Object.entries(this.config.network.httpRequest.params)) {
          urlObj.searchParams.set(key, value);
        }
      }
      return urlObj.toString();
    } catch (error) {
      throw new Error(`Invalid URL format: ${this.config?.url}`);
    }
  }

  // Navigate to page and handle POST/GET
  async navigateToPage(fullUrl) {
    const navigationOptions = {
      waitUntil: "networkidle2",
      timeout: (this.config?.pageLoadTiming?.timeoutSeconds ?? 10) * 1000,
    };
    const method = this.config?.network?.httpRequest?.method?.toUpperCase();
    if (method === 'POST') {
      await this.page.goto('about:blank');
      await this.page.evaluate((url, postBody) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        if (postBody) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'data';
          input.value = postBody;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      }, fullUrl, this.config?.network?.httpRequest?.postBody);
    } else if (["PATCH", "PUT", "DELETE"].includes(method)) {
      await this.page.goto('about:blank');
      await this.page.evaluate(async (url, method, postBody, headers) => {
        // Use fetch for PATCH, PUT, DELETE
        const response = await fetch(url, {
          method,
          headers: Object.assign({
            'Content-Type': 'application/json'
          }, headers),
          body: postBody ? JSON.stringify(postBody) : undefined
        });
        window._customResponse = await response.text();
      }, fullUrl, method, this.config?.network?.httpRequest?.postBody, this.config?.network?.httpRequest?.customHeaders);
    } else {
      await this.page.goto(fullUrl, navigationOptions);
    }
    // Wait for target view time
    await new Promise((resolve) =>
      setTimeout(resolve, (this.config?.pageLoadTiming?.targetViewTimeSeconds ?? 10) * 1000)
    );
  }

  // Main fetch method
  async fetch() {
    this.startTime = Math.floor(Date.now() / 1000);
    const fullUrl = this.buildFullUrl();
    let pageLoadTime = null;
    let responseTime = null;
    let domLoadTime = null;
    let errorCount = 0;
    let performanceMetrics = null;
    try {
      await this.initializeBrowser();
      this.setupRequestAndResponseHandlers();
      // Get performance metrics before navigation
      await this.navigateToPage(fullUrl);
      performanceMetrics = await this.page.evaluate(() => {
        const [navigationEntry] = performance.getEntriesByType('navigation');
        const resourceEntries = performance.getEntriesByType('resource');
        return {
          navigation: navigationEntry ? {
            startTime: navigationEntry.startTime,
            duration: navigationEntry.duration,
            domComplete: navigationEntry.domComplete,
            domContentLoadedEventEnd: navigationEntry.domContentLoadedEventEnd,
            domContentLoadedEventStart: navigationEntry.domContentLoadedEventStart,
            domInteractive: navigationEntry.domInteractive,
            loadEventEnd: navigationEntry.loadEventEnd,
            loadEventStart: navigationEntry.loadEventStart,
            redirectCount: navigationEntry.redirectCount,
            type: navigationEntry.type,
            unloadEventStart: navigationEntry.unloadEventStart,
            unloadEventEnd: navigationEntry.unloadEventEnd,
          } : null,
          resourceStats: {
            count: resourceEntries.length,
            totalSize: resourceEntries.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
            totalDuration: resourceEntries.reduce((sum, entry) => sum + entry.duration, 0),
          },
          paintTiming: performance.getEntriesByType('paint').map(entry => ({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          })),
          memory: window.performance.memory ? {
            jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
            totalJSHeapSize: window.performance.memory.totalJSHeapSize,
            usedJSHeapSize: window.performance.memory.usedJSHeapSize,
          } : null,
        };
      });
      await this.takeScreenshot();
      // Sort responses by sequence number to maintain order
      this.responses.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      // Calculate error count
      errorCount = this.responses.filter(r => !r.ok).length;

      // Calculate timings if available
      if (performanceMetrics && performanceMetrics.navigation) {
        pageLoadTime = performanceMetrics.navigation.loadEventEnd - performanceMetrics.navigation.startTime;
        domLoadTime = performanceMetrics.navigation.domComplete - performanceMetrics.navigation.startTime;
        responseTime = performanceMetrics.navigation.responseEnd !== undefined ? (performanceMetrics.navigation.responseEnd - performanceMetrics.navigation.startTime) : null;
      }

      const result = {
        timestamp: this.startTime,
        data: this.responses,
        success: true,
        url: fullUrl,
        screenshot: this.screenshotBase64,
        page_load_time: pageLoadTime,
        response_time: responseTime,
        dom_load_time: domLoadTime,
        error_count: errorCount,
        // performanceMetrics,
      };
      this.removeNullValues(result);
      return result;
    } catch (error) {
      return {
        error: `Page load failed: ${error.message}`,
        success: false,
        url: fullUrl,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } finally {
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (error) {
          console.warn(`Error closing browser: ${error.message}`);
        }
      }
    }
  }

  // Remove null values and optionally empty strings from object
  removeNullValues(obj, keys, removeEmptystr) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.removeNullValues(item);
      }
    } else if (obj && typeof obj === "object") {
      for (const key in obj) {
        const item = obj[key];
        if (keys?.includes(key)) {
          Reflect.deleteProperty(obj, key);
          continue;
        }
        if (item === null || (removeEmptystr && item === "")) {
          Reflect.deleteProperty(obj, key);
        } else if (typeof item === "object") {
          this.removeNullValues(item);
        }
      }
    }
  }
}


  function PuppeteerFetchNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.on('input', async function(msg, send, done) {
      // Use msg.config or node config, fallback to DEFAULT_CONFIG
      let userConfig = msg.options || config || {};
      const fetcher = new PuppeteerFetcher(userConfig);
      try {
        const result = await fetcher.fetch();
        msg.payload = result;
        send(msg);
        if (done) done();
      } catch (error) {
        node.error(error, msg);
        if (done) done(error);
      }
    });
  }

  RED.nodes.registerType("puppeteer-fetch", PuppeteerFetchNode);
}
