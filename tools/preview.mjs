import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve("public");
http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.join(root, pathname);
  if (pathname.endsWith("/")) file = path.join(file, "index.html");
  fs.readFile(file, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
    response.setHeader("Content-Type", type);
    response.end(data);
  });
}).listen(4173, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:4173"));
