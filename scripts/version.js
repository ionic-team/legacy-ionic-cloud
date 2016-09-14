const pkg = require('../package.json');
const replace = require('replace-in-file');

replace({
  'files': 'dist/**/*.js',
  'replace': 'VERSION_STRING',
  'with': pkg.version
}).then((changedFiles) => {
  if (changedFiles.length > 0) {
    console.log('Versioned:', changedFiles.join(', '));
  } else {
    console.log('No files versioned. Did you build?');
  }
}).catch((err) => {
  throw err;
});
