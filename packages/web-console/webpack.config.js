/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

const path = require("path")
const CopyWebpackPlugin = require("copy-webpack-plugin")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const Webpack = require("webpack")
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin")

const monacoConfig = require("./monaco.config")
require("dotenv").config()

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development"
}

const config = {
  port: 9999,
  backendUrl: "http://127.0.0.1:9000",
  isProduction: process.env.NODE_ENV === "production",
  contextPath: process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "",
}

module.exports = {
  entry: {
    qdb: "./src/index.tsx",
  },

  output: {
    filename: "[name].[chunkhash:5].js",
    publicPath: "auto",
    path: path.resolve(__dirname, "dist"),
  },

  watchOptions: {
    ignored: /[\\/]\.yarn[\\/]/,
  },

  cache: {
    type: "memory",
  },

  optimization: {
    splitChunks: {
      chunks: "all",
      hidePathInfo: true,
      name: "vendor",
      cacheGroups: {
        commons: {
          test: /[\\/]\.yarn[\\/]/,
          filename: "[name].[chunkhash:5].js",
        },
      },
    },
  },

  devServer: {
    host: "localhost",
    hot: true,
    port: config.port,
    proxy: [
      {
        context: [
          config.contextPath + "/imp", config.contextPath + "/exp", config.contextPath + "/exec",
          config.contextPath + "/chk", config.contextPath + "/settings", config.contextPath + "/warnings",
          config.contextPath + "/preferences"
        ],
        target: config.backendUrl,
      },
      {
        context: [ config.contextPath ],
        target: 'http://localhost:' + config.port,
        pathRewrite: path => {
          return path.startsWith(config.contextPath) ? path.substr(config.contextPath.length) : path;
        },
      },
    ],
    client: {
      overlay: false,
    },
  },

  devtool: config.isProduction ? false : "cheap-source-map",
  mode: config.isProduction ? "production" : "development",

  resolve: {
    alias: {
      'react/jsx-runtime': require.resolve('react/jsx-runtime.js'),
    },
    extensions: ['.tsx', '.ts', '.js'],
    symlinks: false,
  },

  module: {
    rules: [
      {
        test: /\.(png|jpg|ttf|woff)$/,
        use: ["file-loader"],
      },
      {
        test: /\.(ts|js)x?$/,
        include: path.resolve(__dirname, "src"),
        loader: "babel-loader",
        options: {
          plugins: [
            [
              "styled-components",
              {
                displayName: true,
                minify: false,
                pure: true,
                ssr: false,
              },
            ],
            !config.isProduction && require.resolve("react-refresh/babel"),
          ].filter(Boolean),

          presets: [
            [
              "@babel/preset-env",
              { targets: { node: "current" }, modules: false },
            ],
            "@babel/preset-react",
            "@babel/preset-typescript",
          ],
        },
      },

      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },

      {
        test: /\.s[ac]ss$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
      },

      !config.isProduction && {
        test: /\.(ts|js)x$/,
        include: path.resolve(__dirname, "src"),
        use: "stylelint-custom-processor-loader",
      },
    ].filter(Boolean),
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "src/index.html",
      minify: {
        minifyCSS: false,
        minifyJS: false,
        minifyURLs: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
      },
    }),

    new MiniCssExtractPlugin({
      filename: config.isProduction ? "[name].[chunkhash:5].css" : "[name].css",
    }),

    new Webpack.DefinePlugin({
      "process.env": {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
        COMMIT_HASH: JSON.stringify(process.env.COMMIT_HASH),
      },
    }),

    config.isProduction &&
      new CopyWebpackPlugin({
        patterns: [
          { from: "./assets/", to: "assets/" },
          { from: path.resolve(__dirname, "public"), to: "." },
          ...monacoConfig.assetCopyPatterns,
        ],
      }),

    !config.isProduction &&
      new ForkTsCheckerWebpackPlugin({
        eslint: {
          // @TODO
          enabled: false,
          files: "./src/**/*.ts[x]",
        },
      }),

    !config.isProduction &&
      new CopyWebpackPlugin({
        patterns: [
          { from: "./assets/", to: "assets/" },
          { from: path.resolve(__dirname, "public"), to: "." },
          ...monacoConfig.assetCopyPatterns,
          ...monacoConfig.sourceMapCopyPatterns,
        ],
      }),

    !config.isProduction && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),

  stats: {
    all: false,
    chunks: true,
    env: true,
    errors: true,
    errorDetails: true,
  },
}
