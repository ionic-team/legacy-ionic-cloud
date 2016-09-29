/* eslint-env es6 */

import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';

export default {
  'entry': 'dist/esm/index.js',
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
    commonjs(),
    babel({
      'exclude': 'node_modules/**',
      'include': 'node_modules/rxjs/**' // must include rxjs -- see https://github.com/ReactiveX/rxjs/issues/1925
    })
  ]
};
