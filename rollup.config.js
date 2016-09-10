/* eslint-env es6 */

'use strict';

import nodeResolve from 'rollup-plugin-node-resolve';
import multiEntry from 'rollup-plugin-multi-entry';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';

export default {
  'entry': ['dist/esm/index.js', 'src/es5.js', 'src/angular.js'],
  'dest': 'dist/bundle/ionic.cloud.js',
  'sourceMap': true,
  'format': 'iife',
  'moduleName': 'Ionic',
  'plugins': [
    nodeResolve({
      'browser': true,
      'module': true,
      'jsnext': true,
      'main': true
    }),
    multiEntry(),
    commonjs(),
    babel({
      'exclude': 'node_modules/**'
    })
  ]
};
