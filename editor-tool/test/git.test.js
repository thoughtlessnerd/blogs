import { describe, it, expect, vi } from 'vitest';
import { commitAndPush } from '../lib/git.js';

describe('commitAndPush', () => {
  it('adds, commits, and pushes to origin master', async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    };

    await commitAndPush(git, { files: ['a.md', 'b/'], message: 'Publish: a' });

    expect(git.add).toHaveBeenCalledWith(['a.md', 'b/']);
    expect(git.commit).toHaveBeenCalledWith('Publish: a');
    expect(git.push).toHaveBeenCalledWith('origin', 'master');
  });
});
