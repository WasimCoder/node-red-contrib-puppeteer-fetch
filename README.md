# node-red-contrib-puppeteer-fetch

This package provides a Node-RED node for fetching web pages using Puppeteer. It is designed to automate browser tasks and extract data from websites efficiently.

## Features
- Fetch web pages using headless Chrome (Puppeteer)
- Automate browser actions (click, type, etc.)
- Extract HTML, text, or custom data
- Supports advanced Puppeteer options

## Installation

1. Clone the repository or download the package:
   ```sh
git clone https://github.com/WasimCoder/node-red-contrib-puppeteer-fetch.git
```
2. Navigate to the project directory:
   ```sh
cd node-red-contrib-puppeteer-fetch
```
3. Install dependencies:
   ```sh
npm install
```
4. Link the package to your Node-RED installation (optional for development):
   ```sh
npm link
cd ~/.node-red
npm link node-red-contrib-puppeteer-fetch
```

## Usage

1. Start Node-RED:
   ```sh
node-red
```
2. Open the Node-RED editor in your browser (usually at http://localhost:1880).
3. Drag the `puppeteer-fetch` node into your flow.
4. Configure the node:
   - **URL**: The web page to fetch.
   - **Actions**: (Optional) List of browser actions to perform.
   - **Output**: Choose what data to extract (HTML, text, etc.).
   - **Advanced**: Set Puppeteer options if needed.
5. Deploy your flow and trigger the node.

## Configuration

- The node can be configured via its UI in Node-RED.
- You may set environment variables in a `.env` file for custom Puppeteer settings.
- For advanced usage, refer to the Puppeteer documentation: https://pptr.dev/

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
