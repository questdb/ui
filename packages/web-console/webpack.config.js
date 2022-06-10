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
const { CleanWebpackPlugin } = require("clean-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const Webpack = require("webpack")

const monacoConfig = require("./monaco.config")
require("dotenv").config()

const config = {
  port: 9999,
  backendUrl: "http://127.0.0.1:9000",
  assetPath: process.env.ASSET_PATH || "/",
  isProduction: process.env.NODE_ENV === "production",
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development"
}

const basePlugins = [
  new CleanWebpackPlugin(),
  new HtmlWebpackPlugin({
    template: "src/index.hbs",
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
    filename: "qdb.css",
  }),
  new Webpack.DefinePlugin({
    "process.env": {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    },
  }),
]

const devPlugins = [
  new ForkTsCheckerWebpackPlugin({
    eslint: {
      // @TODO
      enabled: false,
      files: "./src/**/*.ts[x]",
    },
  }),
  new CopyWebpackPlugin({
    patterns: [
      { from: "./assets/", to: "assets/" },
      ...monacoConfig.assetCopyPatterns,
      ...monacoConfig.sourceMapCopyPatterns,
    ],
  }),
]

const prodPlugins = [
  new CopyWebpackPlugin({
    patterns: [
      { from: "./assets/", to: "assets/" },
      ...monacoConfig.assetCopyPatterns,
    ],
  }),
]

const devLoaders = [
  {
    test: /\.(ts|js)x$/,
    exclude: /node_modules/,
    use: "stylelint-custom-processor-loader",
  },
]

module.exports = {
  devServer: {
    compress: true,
    host: "localhost",
    hot: false,
    port: config.port,
    proxy: {
      context: ["/imp", "/exp", "/exec", "/chk"],
      target: config.backendUrl,
    },
  },
  devtool: config.isProduction ? false : "eval-source-map",
  mode: config.isProduction ? "production" : "development",
  entry: "./src/index",
  output: {
    filename: "qdb.js",
    publicPath: config.assetPath,
    path: path.resolve(__dirname, "dist"),
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.(png|jpg|ttf|woff)$/,
        use: ["file-loader"],
      },
      {
        test: /\.hbs$/,
        loader: "handlebars-loader",
      },
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"],
      },
      ...(config.isProduction ? [] : devLoaders),
    ],
  },
  plugins: [
    ...basePlugins,
    ...(config.isProduction ? prodPlugins : devPlugins),
  ],
  stats: {
    all: false,
    chunks: true,
    env: true,
    errors: true,
    errorDetails: true,
  },
}
