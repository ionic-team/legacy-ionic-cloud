module.exports = function collectInputsOutputs() {
  return {

    $runBefore: ['rendering-docs'],
    $process: function(docs) {
      docs.forEach(function(doc) {

        if (doc.members && doc.members.length) {
          var members = [];
          var inputs = [];
          var outputs = [];
          var properties = [];
          var methods = [];

          memberLoop:
          for (var i in doc.members) {

            // identify properties to differentiate from methods
            if (typeof doc.members[i].parameters == 'undefined') {
              doc.members[i].isProperty = true;
              properties.push(doc.members[i]);
            } else {
              methods.push(doc.members[i]);
            }

            if (doc.members[i].decorators && doc.members[i].decorators.length) {
              decoratorLoop:
              for (var ii in doc.members[i].decorators) {
                // decorators
              }
            }

            members.push(doc.members[i]);
          }

          // update doc with pruned members list and add inputs and outputs
          doc.members = members;
          doc.inputs = inputs;
          doc.outputs = outputs;
          doc.properties = properties;
          doc.methods = methods;
        }

        function parseMember(member) {
          member.type = member.content.substring(
            member.content.indexOf('{') + 1,
            member.content.indexOf('}')
          );
          member.description = member.content.substring(
            member.content.indexOf('}') + 1,
            member.content.length
          );
          return member;
        }
      });
    }
  };
};
