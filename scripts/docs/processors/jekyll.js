module.exports = function jekyll(renderDocsProcessor) {
  return {
    name: 'jekyll',
    description: 'Create jekyll includes',
    $runAfter: ['paths-computed'],
    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      var currentVersion = renderDocsProcessor.extraData.version.current.name;

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
                                    .replace('content/', '');

        if (docs[i].relativePath) {
          docs[i].relativePath = doc.relativePath
                                    .replace(process.cwd(), '');
        }
      });

      docs.push({
        docType: 'menu',
        id: 'menu',
        template: 'menu.template.html',
        outputPath: 'content/_includes/side_nav_js_api.html'
      });

      // returning docs will replace docs object in the next process
      return docs;
    }
  };
};
