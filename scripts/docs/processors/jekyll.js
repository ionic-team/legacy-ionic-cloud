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
        if (doc.docType === 'interface' || doc.docType === 'type-alias') {
          docs[i].outputPath = config.docsDest + '/' + doc.name + '.md';
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
                                    .replace('.md', '.html')
                                    .replace('/ionic-platform-docs/', '/')
                                    .replace('content/', '');


        if (docs[i].fileInfo.relativePath) {
          docs[i].fileInfo.relativePath = doc.fileInfo.relativePath
                                    .replace(process.cwd(), '');
        }
      });

      renderDocsProcessor.extraData.classes = docs.filter(function(doc) {
        return doc.docType === 'class';
      });

      renderDocsProcessor.extraData.interfaces = docs.filter(function(doc) {
        return doc.docType === 'interface';
      });

      renderDocsProcessor.extraData.typeAliases = docs.filter(function(doc) {
        return doc.docType === 'type-alias';
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
