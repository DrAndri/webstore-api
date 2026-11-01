/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pages are prerendered where they can be, request time parts stream in
  // behind Suspense. See utils/stores.ts for the cached data.
  cacheComponents: true,
  partialPrefetching: true,
  // Loaded at runtime instead of bundled, node-cron spawns its own worker files
  serverExternalPackages: ['node-cron'],
  reactStrictMode: true,
  transpilePackages: [
    // antd & deps
    '@ant-design',
    '@rc-component',
    'antd',
    'rc-cascader',
    'rc-checkbox',
    'rc-collapse',
    'rc-dialog',
    'rc-drawer',
    'rc-dropdown',
    'rc-field-form',
    'rc-image',
    'rc-input',
    'rc-input-number',
    'rc-mentions',
    'rc-menu',
    'rc-motion',
    'rc-notification',
    'rc-pagination',
    'rc-picker',
    'rc-progress',
    'rc-rate',
    'rc-resize-observer',
    'rc-segmented',
    'rc-select',
    'rc-slider',
    'rc-steps',
    'rc-switch',
    'rc-table',
    'rc-tabs',
    'rc-textarea',
    'rc-tooltip',
    'rc-tree',
    'rc-tree-select',
    'rc-upload',
    'rc-util'
  ]
};

module.exports = nextConfig;
