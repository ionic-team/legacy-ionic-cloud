/* eslint-env node */

module.exports = function(config) {
  config.set({
    "browsers": ['PhantomJS'],
    "frameworks": ['browserify', 'jasmine'],
    "files": ['spec/**/*.js'],
    "preprocessors": {
      "spec/**/*.js": ['browserify']
    },
    "browserify": {
      "debug": true
    }
  });
};
