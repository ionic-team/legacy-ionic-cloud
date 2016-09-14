var pkg = require('../package.json');
var replace = require('replace-in-file');

replace({
  'files': 'dist/**/*.js',
  'replace': 'VERSION_STRING',
  'with': pkg.version
}).then(function(changedFiles) {
  if (changedFiles.length > 0) {
    console.log('Versioned:', changedFiles.join(', '));
  } else {
    console.log('No files versioned. Did you build?');
  }
}).catch(function(err) {
  throw err;
});
