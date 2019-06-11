/**
 * Dummy webpack config for Jetbrains IDEs
 * @type {{resolve: {alias: {'@': string}}}}
 */
module.exports = {
  resolve: {
    alias: {
      "@": `${__dirname}/app/backend`,
      "~": `${__dirname}/app/backend`,
      "~config": `${__dirname}/config/config`
    }
  }
};
