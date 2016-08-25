var config = require('../../config.json');

module.exports = function jekyll(renderDocsProcessor) {
  return {
    name: 'jekyll',
    description: 'Create jekyll includes',
    $runAfter: ['paths-computed'],
    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      var currentVersion = renderDocsProcessor.extraData.version.current.name;
      var docsByName = [];

      docs.forEach(function(doc, i) {
        doc.featured = typeof doc.featured === 'string';

        if (doc.docType === 'interface' || doc.docType === 'type-alias') {
          docs[i].outputPath = config.docsDest + '/' + doc.name.toLowerCase();
          docs[i].outputPath += '/index.md';
        }

        if(! docs[i].outputPath) {
          return;
        }
        docs[i].outputPath = docs[i].outputPath.toLowerCase().replace('//','/');

        // shorten the path for components in their own dir IE deploy/Deploy
        var parts = [];
        var skip = ['..','ionic-platform-docs','content','api','client','index.md'];
        docs[i].outputPath.split('/').forEach(function(segment) {
          if(skip.indexOf(segment) !== -1) {
            return;
          }

          if ( parts.indexOf(segment) !== -1 && segment !== 'client') {
            docs[i].outputPath = docs[i].outputPath.replace(segment + '/', '');
          } else {
            parts.push(segment);
          }
        });

        // PushMessage is a unicorn
        if(docs[i].name === 'PushMessage') {
          docs[i].outputPath = docs[i].outputPath.replace('/push/', '/');
        }

        docsByName.push(docs[i].name);
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

      renderDocsProcessor.extraData.docsByName = docsByName;

      docs.push({
        docType: 'menu',
        id: 'menu',
        template: 'menu.template.html',
        outputPath: 'content/_includes/side_nav_js_api.html'
      });

      docs.push({
        docType: 'breadcrumbs',
        id: 'breadcrumbs',
        template: 'breadcrumbs.template.html',
        outputPath: 'content/_includes/breadcrumbs_js_api.html'
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
