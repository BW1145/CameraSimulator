import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

// Count both retained rigs and the assets actually requested for the initial view.
export async function subjectAssetBytes(directory, filename, initialView = 'center') {
  const source = await readFile(path.join(directory, filename));
  const subjects = JSON.parse(source);
  const all = new Set(), initial = new Set();
  for (const subject of subjects) {
    if (subject.environment) all.add(subject.environment);
    for (const rig of Object.values(subject.viewLighting ?? {})) {
      if (rig.environment) all.add(rig.environment);
    }
    const environment = subject.viewLighting?.[initialView]?.environment ?? subject.environment;
    if (environment) initial.add(environment);
  }
  const sizes = new Map();
  for (const file of all) sizes.set(file, (await stat(path.join(directory, file))).size);
  const count = files => source.length + [...files].reduce((sum, file) => sum + sizes.get(file), 0);
  return {subjectBytes: count(all), initialSubjectBytes: count(initial)};
}
