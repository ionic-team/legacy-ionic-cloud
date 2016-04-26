var fs = require('fs');
var pkg = require('../package.json');

var src = {
  'es5': [
    'src/es5.js'
  ],

  'angular': [
    'src/core/angular.js',
    'src/analytics/angular.js',
    'src/auth/angular.js',
    'src/push/angular.js',
    'src/deploy/angular.js'
  ],

  'core': [
    'dist/es6/core/promise.js',
    'dist/es6/core/request.js',
    'dist/es6/core/events.js',
    'dist/es6/core/logger.js',
    'dist/es6/core/storage.js',
    'dist/es6/core/config.js',
    'dist/es6/core/data-types.js',
    'dist/es6/core/core.js',
    'dist/es6/core/user.js',
    'dist/es6/core/app.js',
    'dist/es6/core/index.js'
  ],

  'auth': [
    'dist/es6/auth/auth.js',
    'dist/es6/auth/index.js'
  ],

  'push': [
    'dist/es6/push/push-token.js',
    'dist/es6/push/push-message.js',
    'dist/es6/push/push-dev.js',
    'dist/es6/push/push.js',
    'dist/es6/push/index.js'
  ],

  'deploy': [
    'dist/es6/deploy/deploy.js',
    'dist/es6/deploy/index.js'
  ],

  'analytics': [
    'dist/es6/analytics/storage.js',
    'dist/es6/analytics/serializers.js',
    'dist/es6/analytics/analytics.js',
    'dist/es6/analytics/index.js'
  ],

  'util': [
    'dist/es6/util/util.js',
    'dist/es6/util/index.js'
  ]
};

module.exports = {
  banner:
    '/**\n' +
    ' * Ionic Core Module\n' +
    ' * Copyright 2016 Ionic http://ionicframework.com/\n' +
    ' * See LICENSE in this repository for license information\n' +
    ' */\n\n',

  dist: './dist',

  sourceFiles: {
    'core': src.core,
    'push': src.push,
    'deploy': src.deploy,
    'analytics': src.analytics,
    'util': src.util,
    'bundle': [].concat(
      src.core,
      src.auth,
      src.push,
      src.deploy,
      src.analytics,
      src.util,
      src.es5,
      src.angular
    ),
    'ts': ['src/**/*.ts'],
  },

  versionData: {
    version: pkg.version
  }
};
