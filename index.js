'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var fs = require('fs');
var path = require('path');
var LZString = require('lz-string');
var normalizePath = require('normalize-path');
var map = require('unist-util-map');
var queryString = require('query-string');
var fetch = require('node-fetch');

var DEFAULT_PROTOCOL = 'embedded-codesandbox://';
var DEFAULT_EMBED_OPTIONS = {
  view: 'preview',
  hidenavigation: 1
};
var DEFAULT_GET_IFRAME = function DEFAULT_GET_IFRAME(url) {
  return '<iframe src="' + url + '" class="embedded-codesandbox" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>';
};

var DEFAULT_IGNORED_FILES = ['node_modules', 'package-lock.json', 'yarn.lock'];

module.exports = function () {
  var _ref3 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(_ref, _ref2) {
    var markdownAST = _ref.markdownAST;
    var rootDirectory = _ref2.directory,
        _ref2$protocol = _ref2.protocol,
        protocol = _ref2$protocol === undefined ? DEFAULT_PROTOCOL : _ref2$protocol,
        _ref2$embedOptions = _ref2.embedOptions,
        embedOptions = _ref2$embedOptions === undefined ? DEFAULT_EMBED_OPTIONS : _ref2$embedOptions,
        _ref2$getIframe = _ref2.getIframe,
        getIframe = _ref2$getIframe === undefined ? DEFAULT_GET_IFRAME : _ref2$getIframe,
        _ref2$ignoredFiles = _ref2.ignoredFiles,
        ignoredFiles = _ref2$ignoredFiles === undefined ? DEFAULT_IGNORED_FILES : _ref2$ignoredFiles;
    var ignoredFilesSet, getDirectoryPath, getFileExist, getFilesList, createParams, getUrlParts, convertNodeToEmbedded, nodes;
    return regeneratorRuntime.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            if (rootDirectory) {
              _context2.next = 4;
              break;
            }

            throw Error('Required option "directory" not specified');

          case 4:
            if (fs.existsSync(rootDirectory)) {
              _context2.next = 8;
              break;
            }

            throw Error('Cannot find directory "' + rootDirectory + '"');

          case 8:
            if (!rootDirectory.endsWith('/')) {
              rootDirectory += '/';
            }

          case 9:
            ignoredFilesSet = new Set(ignoredFiles);

            getDirectoryPath = function getDirectoryPath(url) {
              var directoryPath = url.replace(protocol, '');
              var fullPath = path.join(rootDirectory, directoryPath);
              return normalizePath(fullPath);
            };

            getFileExist = function getFileExist(fileList) {
              var filename = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'package.json';

              var found = fileList.filter(function (name) {
                return name === filename;
              });
              return found.length > null;
            };

            getFilesList = function getFilesList(directory) {
              var packageJsonFound = false;

              var getAllFiles = function getAllFiles(dirPath) {
                return fs.readdirSync(dirPath).reduce(function (acc, file) {
                  if (ignoredFilesSet.has(file)) return acc;
                  var relativePath = path.join(dirPath, file);
                  var isDirectory = fs.statSync(relativePath).isDirectory();
                  var additions = isDirectory ? getAllFiles(relativePath) : [relativePath.replace(directory + '/', '')];
                  return [].concat(_toConsumableArray(acc), _toConsumableArray(additions));
                }, []);
              };

              var folderFiles = getAllFiles(directory);
              // console.log('folderFiles', folderFiles);
              var sandboxFiles = folderFiles
              // we ignore the package.json file as it will
              // be handled separately
              .filter(function (file) {
                return file !== 'package.json';
              }).map(function (file) {
                var fullFilePath = path.resolve(directory, file);
                var content = fs.readFileSync(fullFilePath, 'utf-8');
                return {
                  name: file,
                  content: content
                };
              });

              var workingDir = directory;
              while (!packageJsonFound) {
                // first read all files in the folder and look
                // for a package.json there
                var files = fs.readdirSync(workingDir);
                var packageJson = getFileExist(files);
                if (packageJson) {
                  var fullFilePath = path.resolve(workingDir, 'package.json');
                  var content = fs.readFileSync(fullFilePath, 'utf-8');
                  sandboxFiles.push({
                    name: 'package.json',
                    content: content
                  });
                  packageJsonFound = true;
                  // if root folder is reached, use a fallback default
                  // value as content, to ensure the sandbox is always working
                } else if (path.resolve(workingDir) === path.resolve(rootDirectory)) {
                  sandboxFiles.push({
                    name: 'package.json',
                    content: '{ "name": "example" }'
                  });
                  packageJsonFound = true;
                  // if not present, work up the folders
                } else {
                  workingDir = path.join(workingDir, '..');
                }
              }

              if (!getFileExist(folderFiles, 'sandbox.config.json')) {
                sandboxFiles.push({
                  name: 'sandbox.config.json',
                  content: '{ "template": "static" }'
                });
              }

              return sandboxFiles;
            };

            createParams = function createParams(files) {
              var filesObj = files.reduce(function (prev, current) {
                // parse package.json first
                if (current.name === 'package.json') {
                  prev[current.name] = { content: JSON.parse(current.content) };
                } else {
                  prev[current.name] = { content: current.content };
                }
                return prev;
              }, {});
              var params = {
                files: filesObj
              };

              return JSON.stringify(params);
            };

            getUrlParts = function getUrlParts(url) {
              var splitUrl = url.split('?');
              return {
                base: splitUrl[0],
                query: queryString.parse(splitUrl[1])
              };
            };

            convertNodeToEmbedded = function () {
              var _ref4 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(node, params) {
                var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

                var mergedOptions, encodedEmbedOptions, _ref5, sandbox_id, sandboxUrl, embedded;

                return regeneratorRuntime.wrap(function _callee$(_context) {
                  while (1) {
                    switch (_context.prev = _context.next) {
                      case 0:
                        delete node.children;
                        delete node.position;
                        delete node.title;
                        delete node.url;

                        // merge the overriding options with the plugin one
                        mergedOptions = _extends({}, embedOptions, options);
                        encodedEmbedOptions = queryString.stringify(mergedOptions);
                        _context.next = 8;
                        return fetch('https://codesandbox.io/api/v1/sandboxes/define?json=1', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json'
                          },
                          body: params
                        }).then(function (x) {
                          return x.json();
                        });

                      case 8:
                        _ref5 = _context.sent;
                        sandbox_id = _ref5.sandbox_id;
                        sandboxUrl = 'https://codesandbox.io/embed/' + sandbox_id + '?' + encodedEmbedOptions;
                        embedded = getIframe(sandboxUrl);

                        node.type = 'html';
                        node.value = embedded;

                        return _context.abrupt('return', node);

                      case 15:
                      case 'end':
                        return _context.stop();
                    }
                  }
                }, _callee, undefined);
              }));

              return function convertNodeToEmbedded(_x5, _x6) {
                return _ref4.apply(this, arguments);
              };
            }();

            nodes = [];

            map(markdownAST, function (node, index, parent) {
              if (node.type === 'link' && node.url.startsWith(protocol)) {
                // split the url in base and query to allow user
                // to customise embedding options on a per-node basis
                var url = getUrlParts(node.url);
                // get all files in the folder and generate
                // the embeddeing parameters
                var dir = getDirectoryPath(url.base);
                var files = getFilesList(dir);
                var params = createParams(files);
                var currentNode = convertNodeToEmbedded(node, params, url.query);
                nodes.push(currentNode);
              }
              return node;
            });

            _context2.next = 20;
            return Promise.all(nodes);

          case 20:
            return _context2.abrupt('return', markdownAST);

          case 21:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, undefined);
  }));

  return function (_x, _x2) {
    return _ref3.apply(this, arguments);
  };
}();