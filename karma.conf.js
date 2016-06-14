/* eslint-env node */

module.exports = function(config) {
  config.set({
    "browsers": ['PhantomJS'],
    "frameworks": ['browserify', 'jasmine'],
    "files": ['node_modules/es6-promise/dist/es6-promise.min.js', 'spec/**/*.js'],
    "preprocessors": {
      "spec/**/*.js": ['browserify']
    },
    "browserify": {
      "debug": true
    }
  });
};
