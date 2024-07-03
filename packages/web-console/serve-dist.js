const http = require("http")
const url = require("url")
const fs = require("fs")
const path = require("path")

const server = http.createServer((req, res) => {
  const { method } = req
  const urlData = url.parse(req.url)

  if (
    urlData.pathname.startsWith("/exec") ||
    urlData.pathname.startsWith("/settings")
  ) {
    // proxy /exec requests to localhost:9000
    const options = {
      hostname: "localhost",
      port: 9000,
      path: urlData.path,
      method,
      headers: req.headers,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    })

    req.pipe(proxyReq, { end: true })
  } else {
    // serve static files from /dist folder
    const filePath = path.join(
      process.cwd(),
      "packages",
      "web-console",
      "dist",
      ["", "/"].some((p) => urlData.pathname === p)
        ? "index.html"
        : urlData.pathname,
    )
    const fileStream = fs.createReadStream(filePath)

    fileStream.on("error", (err) => {
      if (err.code === "ENOENT") {
        res.statusCode = 404
        res.end(`File not found: ${urlData}`)
      } else {
        res.statusCode = 500
        res.end(`Server error: ${err}`)
      }
    })

    fileStream.pipe(res)
  }
})

const PORT = process.env.PORT || 9999
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
