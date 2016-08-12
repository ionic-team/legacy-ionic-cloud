var config = require('../../config.json');

module.exports = function jekyll(renderDocsProcessor) {
  return {
    name: 'jekyll',
    description: 'Create jekyll includes',
    $runAfter: ['paths-computed'],
    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      var currentVersion = renderDocsProcessor.extraData.version.current.name;

      docs.forEach(function(doc, i) {
        if (docs[i].docType === 'interface') {
          docs[i].outputPath = config.docsDest + '/' + docs[i].name + '.html';
        }
      });

      // pretty up and sort the docs object for menu generation
      docs = docs.filter(function(doc) {
        return (!!doc.name && !!doc.outputPath) || doc.docType === 'index-page';
      });

      docs.sort(function(a, b) {
        textA = a.name ? a.name.toUpperCase() : '';
        textB = b.name ? b.name.toUpperCase() : '';
        return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
      });

      docs.forEach(function(doc, i) {
        docs[i].URL = doc.outputPath.replace('/index.md', '')
                                    .replace('/' + process.cwd() + '/src', '')
                                    .replace('//', '/')
                                    .replace('/ionic-platform-docs/', '/')
                                    .replace('content/', '');


        if (docs[i].fileInfo.relativePath) {
          docs[i].fileInfo.relativePath = doc.fileInfo.relativePath
                                    .replace(process.cwd(), '');
        }
      });

      renderDocsProcessor.extraData.interfaces = docs.filter(function(doc) {
        return doc.docType === 'interface';
      });

      renderDocsProcessor.extraData.classes = docs.filter(function(doc) {
        return doc.docType === 'class';
      });

      docs.push({
        docType: 'menu',
        id: 'menu',
        template: 'menu.template.html',
        outputPath: 'content/_includes/side_nav_js_api.html'
      });

      docs.push({
        docType: 'index',
        id: 'index',
        template: 'index.template.html',
        outputPath: 'content/_includes/client_api_index.html'
      });

      // returning docs will replace docs object in the next process
      return docs;
    }
  };
};
