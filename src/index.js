const fs = require('fs');
const path = require('path');
const normalizePath = require('normalize-path');
const map = require('unist-util-map');
const queryString = require('query-string');
const fetch = require('node-fetch');

const DEFAULT_PROTOCOL = 'embedded-codesandbox://';
const DEFAULT_EMBED_OPTIONS = {
  view: 'preview',
  hidenavigation: 1,
};
const DEFAULT_GET_IFRAME = url =>
  `<iframe src="${url}" class="embedded-codesandbox" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>`;

const DEFAULT_IGNORED_FILES = [
  'node_modules',
  'package-lock.json',
  'yarn.lock'
];

module.exports = async (
  { markdownAST },
  {
    directory: rootDirectory,
    protocol = DEFAULT_PROTOCOL,
    embedOptions = DEFAULT_EMBED_OPTIONS,
    getIframe = DEFAULT_GET_IFRAME,
    ignoredFiles = DEFAULT_IGNORED_FILES,
  }
) => {
  if (!rootDirectory) {
    throw Error('Required option "directory" not specified');
  } else if (!fs.existsSync(rootDirectory)) {
    throw Error(`Cannot find directory "${rootDirectory}"`);
  } else if (!rootDirectory.endsWith('/')) {
    rootDirectory += '/';
  }

  const getDirectoryPath = url => {
    let directoryPath = url.replace(protocol, '');
    const fullPath = path.join(rootDirectory, directoryPath);
    return normalizePath(fullPath);
  };

  const getFileExist = (fileList, filename = 'package.json') => {
    const found = fileList.filter(name => name === filename);
    return found.length > null;
  };

  const getFilesList = directory => {
    let packageJsonFound = false;

    const getAllFiles = dirPath =>
      fs.readdirSync(dirPath).reduce((acc, file) => {
        if (ignoredFilesSet.has(file)) return acc;
        const relativePath = path.join(dirPath, file);
        const isDirectory = fs.statSync(relativePath).isDirectory();
        const additions = isDirectory
          ? getAllFiles(relativePath)
          : [relativePath.replace(`${directory}/`, '')];
        return [...acc, ...additions];
      }, []);

    const files = fs.readdirSync(directory);
    let ignoredFilesSet = new Set(ignoredFiles);
    if (getFileExist(files, '.ignoredfiles.js')) {
      const fullFilePath = path.resolve(directory, '.ignoredfiles.js');
      ignoredFilesSet = new Set([...require(fullFilePath), '.ignoredfiles.js']);
    }
    const folderFiles = getAllFiles(directory);

    // console.log('folderFiles', folderFiles);
    const sandboxFiles = folderFiles
      // we ignore the package.json file as it will
      // be handled separately
      .filter(file => file !== 'package.json')
      .map(file => {
        const fullFilePath = path.resolve(directory, file);
        let content = fs.readFileSync(fullFilePath, 'utf-8');
        if (content.includes('gatsby-dir')) {
          const relativeDir = directory.replace(`${process.cwd()}/static/`, 'https://blog.towavephone.com/')
          content = content.replace(/\/gatsby-dir/g, relativeDir);
        }
        return {
          name: file,
          content,
        };
      });

    let workingDir = directory;
    while (!packageJsonFound) {
      // first read all files in the folder and look
      // for a package.json there
      const files = fs.readdirSync(workingDir);
      const packageJson = getFileExist(files);
      if (packageJson) {
        const fullFilePath = path.resolve(workingDir, 'package.json');
        const content = fs.readFileSync(fullFilePath, 'utf-8');
        sandboxFiles.push({
          name: 'package.json',
          content,
        });
        packageJsonFound = true;
        // if root folder is reached, use a fallback default
        // value as content, to ensure the sandbox is always working
      } else if (path.resolve(workingDir) === path.resolve(rootDirectory)) {
        sandboxFiles.push({
          name: 'package.json',
          content: '{ "name": "example" }',
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
        content: '{ "template": "static" }',
      });
    }

    return sandboxFiles;
  };

  const createParams = files => {
    const filesObj = files.reduce((prev, current) => {
      // parse package.json first
      if (current.name === 'package.json') {
        prev[current.name] = { content: JSON.parse(current.content) };
      } else {
        prev[current.name] = { content: current.content };
      }
      return prev;
    }, {});
    const params = {
      files: filesObj,
    };

    return JSON.stringify(params);
  };

  const getUrlParts = url => {
    const splitUrl = url.split('?');
    return {
      base: splitUrl[0],
      query: queryString.parse(splitUrl[1]),
    };
  };

  const convertNodeToEmbedded = async (node, params, options = {}) => {
    delete node.children;
    delete node.position;
    delete node.title;
    delete node.url;

    // merge the overriding options with the plugin one
    const mergedOptions = { ...embedOptions, ...options };
    const encodedEmbedOptions = queryString.stringify(mergedOptions);

    const { sandbox_id } = await fetch(
      'https://codesandbox.io/api/v1/sandboxes/define?json=1',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: params,
      }
    ).then(x => x.json());

    const sandboxUrl = `https://codesandbox.io/embed/${sandbox_id}?${encodedEmbedOptions}`;
    const embedded = getIframe(sandboxUrl);
    node.type = 'html';
    node.value = embedded;

    return node;
  };

  const nodes = [];
  map(markdownAST, (node, index, parent) => {
    if (node.type === 'link' && node.url.startsWith(protocol)) {
      // split the url in base and query to allow user
      // to customise embedding options on a per-node basis
      const url = getUrlParts(node.url);
      // get all files in the folder and generate
      // the embeddeing parameters
      const dir = getDirectoryPath(url.base);
      const files = getFilesList(dir);
      const params = createParams(files);
      const currentNode = convertNodeToEmbedded(node, params, url.query);
      nodes.push(currentNode);
    }
    return node;
  });

  await Promise.all(nodes);

  return markdownAST;
};
