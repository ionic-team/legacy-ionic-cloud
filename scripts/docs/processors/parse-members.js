var fs = require('fs');

module.exports = function parseMembers() {
  return {
    name: 'parse-members',
    description: 'Remove member docs with @private tags or marked private, ' +
                 'and process them so themes can easily access necessary data',
    $runAfter: ['tags-parsed'],
    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      docs.forEach(function(doc) {
        if (doc.members) {
          doc.members = doc.members.filter(function(member) {
            return !member.tags.tagsByName.get('private') &&
                   !member.tags.tagsByName.get('hidden') // &&
                   // !isFileIfPrivate(doc, member, member.fileInfo.filePath,
                   //                  member.location.start.line);
          });
        }

        if (doc.statics) {
          doc.statics = doc.statics.filter(function(staticMethod) {
            return !staticMethod.tags.tagsByName.get('private') &&
                   !staticMethod.tags.tagsByName.get('hidden') // &&
                   // !isFileIfPrivate(staticMethod.fileInfo.filePath,
                   //                  staticMethod.location.start.line);
          });
        }

        doc.members = parseParams(doc.members);
        doc.statics = parseParams(doc.statics);
        doc.returns = parseReturns(doc);
      });

      return docs;
    }
  };
};

function parseReturns(doc) {
  doc.returns = doc.returns || {};
  doc.returns.type = doc.returns.type ? doc.returns.type.name : doc.returnType;
  return doc.returns;

}

function parseParams(members) {
  if (!members) {
    return null;
  }

  members.forEach(function(member) {
    member.cleanParams = [];
    if (!member.parameters) {
      return;
    }

    member.parameters.forEach(function(param) {
      var paramName = /([A-z]*)\??:\s[A-z]*/g.exec(param)[1];
      var paramType = /[A-z]*\??:\s([A-z]*)/g.exec(param)[1];
      var paramOptional = !!/[A-z]*(\??):\s[A-z]*/g.exec(param)[1].length;

      var i = getTagIndexByName(member, paramName);

      if (member.params && i > -1) {
        member.cleanParams.push({
          name: member.params[i].name ? member.params[i].name : paramName,
          type: member.params[i].type ? member.params[i].type.typeExpression : paramType,
          optional: member.params[i].optional ? member.params[i].optional : paramOptional,
          description: member.params[i].description
        });
      } else {
        member.cleanParams.push({
          name: paramName ? paramName : null,
          type: paramType ? paramType : null,
          optional: paramOptional ? paramOptional : null,
          description: null
        });
      }
    })
  });

  return members;

  function getTagIndexByName(member, name) {
    //console.log(member.name, name)
    if (typeof members.params === 'undefined') {
      return -1;
    }

    for (var i = 0; i < member.params.length; i++) {
      if(member.params[i].name === name) {
        return i;
      }
    }
    return -1;
  }
}

// dgeni is giving us the wrong line numbers?
// function isFileIfPrivate(doc, member, filename, lineNo, log) {
//   var data = fs.readFileSync(filename, 'utf8');
//   var lines = data.split('\n');

//   if (+lineNo > lines.length) {
//     throw new Error('File end reached without finding line');
//   }

//   return lines[+lineNo].indexOf('private ') != -1;
// }
