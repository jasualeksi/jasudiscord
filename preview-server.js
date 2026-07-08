const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 8080;
const root = path.resolve(__dirname, "public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

http.createServer((request, response) => {
  let urlPath = decodeURIComponent(request.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  if (["/etusivu", "/discord", "/bannerit", "/logot", "/profiilikuvat", "/discord-komennot"].includes(urlPath.replace(/\/$/, ""))) {
    urlPath = "/index.html";
  }

  const file = path.resolve(root, `.${urlPath}`);

  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`Preview running on http://0.0.0.0:${port}`);
});
