// Single-file test loaders cannot resolve relative imports; this inlines app/app-storage.ts (and its ./deployment import).
import fs from 'node:fs';
import ts from 'typescript';
const url = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const deployment = url(fs.readFileSync('app/deployment.ts', 'utf8'));
export const storageURL = url(fs.readFileSync('app/app-storage.ts', 'utf8').replace('"./deployment"', JSON.stringify(deployment)));
export const inlineStorage = (source) => source.replaceAll("'./app-storage'", JSON.stringify(storageURL)).replaceAll('"./app-storage"', JSON.stringify(storageURL));
