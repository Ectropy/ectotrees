const path = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDev = argv.mode !== 'production';
  // In dev, point at local backend; in production, point at the live server.
  // Override either with ECTOTREES_API env var: API_BASE=https://your-host npm run build
  // In dev, point at the Vite dev server (port 5173) which already proxies
  // /api → localhost:3001 and /ws → ws://localhost:3001.
  // This avoids cross-origin issues since Vite has CORS enabled by default.
  // Override with ECTOTREES_API env var if needed.
  const apiBase = process.env.ECTOTREES_API
    ?? (isDev ? 'http://localhost:5173' : 'https://trees.ectropyarts.com');
  const wsBase = apiBase.replace(/^https?/, isDev ? 'ws' : 'wss');

  return {
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'main.js',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            // transpileOnly skips full type-checking during webpack build.
            // Run: npx tsc --noEmit  to type-check separately.
            options: { transpileOnly: true },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.data\.png$/,
          use: { loader: 'alt1/imagedata-loader' },
        },
        {
          test: /\.fontmeta\.json$/,
          use: { loader: 'alt1/font-loader' },
          type: 'javascript/auto',
        },
      ],
    },
    externals: {
      // These are Node-only deps used at build time by alt1 loaders — never bundled
      sharp: 'sharp',
      canvas: 'canvas',
      'electron/common': 'electron',
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.API_BASE': JSON.stringify(apiBase),
        'process.env.WS_BASE': JSON.stringify(wsBase),
      }),
    ],
    devtool: isDev ? 'inline-source-map' : false,
  };
};
