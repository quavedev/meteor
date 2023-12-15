/**
 * @fileoverview This rule checks the usage of syncronous MongoDB Methods on the Server which will stop working starting from Meteor 3.0 with the fiber removal
 * @author Renan Castro
 * @copyright 2016 Renan Castro. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const fs = require('fs');
const { Walker } = require('./helpers');
const { debug } = require('../../util/utilities');

const INVALID_FUNCTIONS = {
  findOne: { suggestion: 'findOneAsync' },
  insert: { suggestion: 'insertAsync' },
  update: { suggestion: 'updateAsync' },
  upsert: { suggestion: 'upsertAsync' },
  remove: { suggestion: 'removeAsync' },
  createIndex: {
    suggestion: 'createIndexAsync',
    skipForRawCollection: true,
    debug: true,
  },
  fetch: { suggestion: 'fetchAsync' },
  count: { suggestion: 'countAsync' }, // TODO we can go to the parent to check if it's also a call expression from a find function
};

const INVALID_FUNCTIONS_NAMES = Object.keys(INVALID_FUNCTIONS);

function hasRawCollectionInTheChain(node) {
  const previousFunction = node.object.callee;
  if (!previousFunction || previousFunction.type !== 'MemberExpression') {
    return false;
  }
  return previousFunction.property.name === 'rawCollection';
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect sync Meteor calls',
      recommended: true,
    },
    fixable: 'code',
  },
  create: context => {
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function createError({
      context,
      node,
      invalidFunction,
      invalidFunctionDefinition = '',
    }) {
      const error = {
        node: node.parent,
        message: `Should use Meteor async calls${
          invalidFunctionDefinition.suggestion
            ? ` use "${invalidFunctionDefinition.suggestion}"`
            : ''
        } instead of "${invalidFunction}"`,
      };
      context.report(error);
    }

    // ---------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------

    return {
      Program: function() {
        new Walker(context.cwd).walkApp(['server'], ({ path }) => {
          debug(`Processing file ${path}`);
        });
      },
      MemberExpression: function(node) {
        const walker = new Walker(context.cwd);
        const realPath = fs.realpathSync.native(context.physicalFilename);
        debug(
          'Checking if should evaluate realPath',
          realPath,
          context.physicalFilename,
          walker.cachedParsedFile
        );
        if (
          !Object.keys(walker.cachedParsedFile).length ||
          !(realPath in walker.cachedParsedFile)
        ) {
          return;
        }
        debug('Found a server file!!');
        // CallExpression means it's a function call so we don't throw an error for example for a property called count in an object but we do throw when it's a count() function call.
        if (
          node.property &&
          node.property.type === 'Identifier' &&
          node.object.type === 'CallExpression'
        ) {
          const invalidFunction = INVALID_FUNCTIONS_NAMES.find(
            ifn => ifn === node.property.name
          );
          const invalidFunctionDefinition =
            invalidFunction && INVALID_FUNCTIONS[invalidFunction];
          if (invalidFunctionDefinition) {
            if (invalidFunctionDefinition.debug) {
              debug(node);
            }
            if (
              invalidFunctionDefinition.skipForRawCollection &&
              hasRawCollectionInTheChain(node)
            ) {
              debug(`Skipping ${invalidFunction} to be considered error because it was used after rawCollection()`);
              return;
            }
            createError({
              context,
              node,
              invalidFunction,
              invalidFunctionDefinition,
            });
          }
        }
      },
    };
  },
};
