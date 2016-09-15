var util = require('../dist/es5/util');

describe("util", function() {

  it("should test for invalid email addresses", function() {
    var invalidEmails = ["", "foo", "@foo.com", "foo@foo", "foo@.com", "foo@foo.", "foo@foo@foo.com", "foo @foo.com"];

    for (var i in invalidEmails) {
      expect(util.isValidEmail(invalidEmails[i])).toBe(false, invalidEmails[i] + ' is valid and it should not be');
    }
  });

  it("should test for valid email addresses", function() {
    var validEmails = ["a@a.a", "foo@foo.com", "foo+hi@foo.com"];

    for (var i in validEmails) {
      expect(util.isValidEmail(validEmails[i])).toBe(true, validEmails[i] + ' is invalid and it should not be');
    }
  });

});
