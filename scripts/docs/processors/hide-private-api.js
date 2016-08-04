module.exports = function removePrivateApi() {
  return {
    name: 'remove-private-api',
    description: 'Prevent the private apis from being rendered',
    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      var publicDocs = [];
      docs.forEach(function(doc) {
        // doc.hidden, if set, will be '' which in JS is false
        // TIFU ~ Brendan Eich
        if (!doc.private && typeof doc.hidden === 'undefined') {
          publicDocs.push(doc);
          return doc;
        }
      });
      docs = publicDocs;
      return docs;
    }
  };
};
