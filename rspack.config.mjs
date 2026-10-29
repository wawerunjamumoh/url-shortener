export default (defaultConfig) => ({
  ...defaultConfig,
  externals: [
    // Keep node-redis (and its @redis/* internals) as native Node runtime
    // imports. Bundling its CommonJS/Node streams graph can break EventEmitter
    // inheritance in the emitted Rspack bundle.
    ({ request }, callback) => {
      if (request === 'redis' || request?.startsWith('@redis/')) {
        return callback(null, `module ${request}`);
      }
      callback();
    },
    // Preserve Nest's defaults: these externalize all other node_modules and
    // handle Node built-ins such as node:crypto correctly for this ESM project.
    ...defaultConfig.externals,
  ],
});