const http = require("http")
const url = require("url")
const fs = require("fs")
const path = require("path")

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""

const server = http.createServer((req, res) => {
    if (path.normalize(decodeURI(req.url)) !== decodeURI(req.url)) {
        res.statusCode = 403;
        res.end();
        return;
    }
  const { method } = req
  const baseUrl =  "http://" + req.headers.host + contextPath;
  const reqUrl = new url.URL(req.url, baseUrl);
  const reqPath = reqUrl.pathname + reqUrl.search;
  const reqPathName = reqUrl.pathname;

  if (
    reqPathName.startsWith("/exec") ||
    reqPathName.startsWith("/settings") ||
    reqPathName.startsWith("/warnings") ||
    reqPathName.startsWith("/chk") ||
    reqPathName.startsWith("/imp") ||
    reqPathName.startsWith("/exp")
  ) {
    // proxy /exec requests to localhost:9000
    const options = {
      hostname: "localhost",
      port: 9000,
      path: contextPath + reqPath,
      method,
      headers: req.headers,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    })

    req.pipe(proxyReq, { end: true })
  } else if (
    reqPathName.startsWith("/userinfo")
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    // TODO: should be able to set the response from the test
    //  add something like /setUserInfo?info={sub: "jane doe", groups: ["bla"]}
    res.end(JSON.stringify({
      sub: "john doe",
      groups: ["group1", "group2"]
    }))
  } else {
    // serve static files from /dist folder
    const filePath = path.join(
      process.cwd(),
      "dist",
      ["", "/"].some((p) => reqPathName === p)
        ? "index.html"
        : reqPathName,
    )
    const fileStream = fs.createReadStream(filePath)

    fileStream.on("error", (err) => {
      if (err.code === "ENOENT") {
        res.statusCode = 404
        res.end(`File not found: ${reqPath}`)
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
