import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * A fixture for db-shards.test.ts (test matrix CI-04): vitest's own sequencer, except that shard 1 leaves out the
 * first file it was given. The test runs db-shards.ts with it and requires shardProblems() to name that file, so the
 * check that every file runs in exactly one shard is shown to fail when one does not.
 */
export default class DroppingSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const mine = await super.shard(files);
    return this.ctx.config.shard?.index === 1 ? mine.slice(1) : mine;
  }
}
