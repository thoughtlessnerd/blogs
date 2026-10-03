import { simpleGit } from 'simple-git';

export function createGitClient(repoRoot) {
  return simpleGit({ baseDir: repoRoot });
}

export async function commitAndPush(git, { files, message }) {
  await git.add(files);
  await git.commit(message);
  await git.push('origin', 'master');
}
