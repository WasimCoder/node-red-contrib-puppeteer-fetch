# node-red-contrib-puppeteer-fetch

This package provides a Node-RED node for fetching web pages using Puppeteer. It is designed to automate browser tasks and extract data from websites efficiently.

## Features
- Fetch web pages using headless Chrome (Puppeteer)
- Automate browser actions (click, type, etc.)
- Extract HTML, text, or custom data
- Supports advanced Puppeteer options

## Installation

To install the package, run:

```sh
npm install node-red-contrib-puppeteer-fetch
```


## Usage

1. Start Node-RED:
   ```sh
   node-red
   ```
2. Open the Node-RED editor in your browser (usually at http://localhost:1880).
3. Drag the `puppeteer-fetch` node into your flow.
4. Configure the node with the required options. You can pass options via the node UI or dynamically via `msg.options`:

   **Basic Example:**
   ```json
   {
     "url": "https://example.com",
     "network": {
       "httpRequest": {
         "method": "GET",
         "customHeaders": { "User-Agent": "MyAgent" },
         "params": { "q": "search" },
         "followRedirects": true
       },
       "httpResponse": {
         "desiredStatusCodes": ["2xx", "3xx"],
         "verifyContent": "<title>Example Domain</title>"
       },
       "tls": {
         "enabled": false
       }
     },
     "browserOptions": {
       "screenshot": true,
       "preferredLanguage": "en-US"
     }
   }
   ```

   **Advanced Features:**
   - Supports GET, POST, PATCH, PUT, DELETE methods
   - Custom headers, query params, and POST body
   - TLS/SSL and client certificate options
   - Device emulation (viewport, orientation)
   - Authentication: Basic, OAuth, NTLM, Kerberos (OAuth supported, others are placeholders)
   - Download and response size limits
   - Screenshot capture (base64 JPEG)
   - Performance metrics and timings

5. Deploy your flow and trigger the node. The result will be in `msg.payload`.

**Example Node-RED Function to Use the Node:**
```javascript
msg.options = {
  url: "https://example.com",
  network: {
    httpRequest: { method: "GET" }
  }
};
return msg;
```

## Configuration


### Configuration Options

- **url**: Target URL to fetch (required)
- **network.httpRequest**: HTTP method, headers, params, POST body, redirect, HTTP version, download size limit
- **network.httpResponse**: Desired status codes, content verification, response size limit, show headers
- **network.tls**: Enable TLS, SSL version, client certificate
- **network.httpAuthentication**: Basic, OAuth, NTLM, Kerberos (OAuth supported)
- **browserOptions**: Chromium version, device emulation, screenshot, preferred language, geolocation, media stream
- **excludeElements**: Exclude domains or object URLs from response
- **pageLoadTiming**: Timeout and target view time

For advanced usage, refer to the Puppeteer documentation: https://pptr.dev/

## File Structure

- `puppeteer-fetch/puppeteer-fetch.js`: Main Node-RED node logic
- `puppeteer-fetch/puppeteer-fetch.html`: Node-RED node UI definition
- `.gitignore`: Standard ignore rules for Node.js, Puppeteer, and development
- `package.json`: Project metadata and dependencies

## Troubleshooting

- Ensure Chrome/Chromium is installed or let Puppeteer download it automatically.
- If you encounter issues, check the logs in Node-RED and verify your node configuration.
- For Windows users, make sure all dependencies are installed and paths are correct.

## Contributing

Pull requests and issues are welcome! Please follow standard Node-RED and Puppeteer best practices.

## License

MIT
