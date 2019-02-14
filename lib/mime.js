/**
 * author: Pieter Heyvaert (pheyvaer.heyvaert@ugent.be)
 * Ghent University - imec - IDLab
 */

/**
 * This code generates an map between extensions and the corresponding MIME types.
 */
var db = require('mime-db');
var types = Object.keys(db);
var extensionsMap = {};

types.forEach(function (type) {
  var extensions = db[type].extensions;

  if (extensions) {
    extensions.forEach(function (extension) {
      if (!extensionsMap[extension]) {
        extensionsMap[extension] = [];
      }

      extensionsMap[extension].push(type);
    });
  }
});

module.exports = {
  /**
   * This function returns an array with the MIME types of the given extension.
   * @param extension: the extension for which to look for MIME types.
   * @returns {*}: array of found MIME types.
   */
  getTypes: function (extension) {
    if (extensionsMap[extension]) {
      return extensionsMap[extension];
    }
    else {
      return [];
    }
  }
};
