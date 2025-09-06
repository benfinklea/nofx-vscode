import * as path from 'path';
import Mocha = require('mocha');
import glob = require('glob');

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname, './');

  return new Promise((resolve, reject) => {
    glob('**/*.test.js', { cwd: testsRoot }, (err: any, files: any) => {
      if (err) return reject(err);
      files.forEach((f: any) => mocha.addFile(path.resolve(testsRoot, f)));
      try { 
        mocha.run((failures: any) => failures ? reject(new Error(`${failures} tests failed`)) : resolve()); 
      }
      catch (err) { 
        reject(err); 
      }
    });
  });
}