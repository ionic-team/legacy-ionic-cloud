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

  it("should parse semantic versions", function() {
    expect(util.parseSemanticVersion(' 5  ')).toEqual({ 'major': 5 });
    expect(util.parseSemanticVersion('v5')).toEqual({ 'major': 5 });
    expect(util.parseSemanticVersion('5')).toEqual({ 'major': 5 });
    expect(util.parseSemanticVersion('1.0')).toEqual({ 'major': 1, 'minor': 0 });
    expect(util.parseSemanticVersion('1.0.5')).toEqual({ 'major': 1, 'minor': 0, 'patch': 5 });
    expect(util.parseSemanticVersion('1.0.5.600')).toEqual({ 'major': 1, 'minor': 0, 'patch': 5 });
    expect(util.parseSemanticVersion('1.0-beta.1')).toEqual({ 'major': 1, 'minor': 0 });
  });

  it("should reject invalid semantic versions", function() {
    expect(util.parseSemanticVersion.bind(util.parseSemanticVersion, 'asdf')).toThrowError("Invalid semantic version.");
    expect(util.parseSemanticVersion.bind(util.parseSemanticVersion, 'a0')).toThrowError("Invalid semantic version.");
  });

});
