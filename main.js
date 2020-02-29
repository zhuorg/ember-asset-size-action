import { getInput, setFailed } from '@actions/core';
import { exec } from '@actions/exec';
import { GitHub, context } from '@actions/github';
import path from 'path';

import {
  normaliseFingerprint,
  diffSizes,
  buildOutputText,
  getPullRequest,
  getAssetSizes,
} from './lib/helpers';

async function getActionInputs() {
  const workingDirectory = getInput('working-directory', { required: false });
  const usePrArtifacts = getInput('use-pr-artifacts', { required: false });
  const myToken = getInput('repo-token', { required: true });

  const cwd = path.join(process.cwd(), workingDirectory);

  return { myToken, cwd, usePrArtifacts };
}

async function diffAssets({ pullRequest, cwd, usePrArtifacts }) {
  const prAssets = await getAssetSizes({ cwd, build: !usePrArtifacts });

  await exec(`git checkout ${pullRequest.base.sha}`, { cwd });

  const masterAssets = await getAssetSizes({ cwd, build: true });

  const fileDiffs = diffSizes(
    normaliseFingerprint(masterAssets),
    normaliseFingerprint(prAssets),
  );


  return fileDiffs;
}

async function commentOnPR({ octokit, pullRequest, fileDiffs }) {
  const body = buildOutputText(fileDiffs);

  try {
    await octokit.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pullRequest.number,
      body,
    });
  } catch (e) {
    console.error(e);
    console.log(`Could not create a comment automatically. This could be because github does not allow writing from actions on a fork.

See https://github.community/t5/GitHub-Actions/Actions-not-working-correctly-for-forks/td-p/35545 for more information.`);

    console.log(`Copy and paste the following into a comment yourself if you want to still show the diff:

${body}`);
  }
}


export default async function run() {
  try {
    const { myToken, cwd, usePrArtifacts } = getActionInputs();

    const octokit = new GitHub(myToken);

    const pullRequest = await getPullRequest(context, octokit);
    const fileDiffs = await diffAssets({ pullRequest, cwd, usePrArtifacts });

    await commentOnPR({ octokit, pullRequest, fileDiffs });
  } catch (error) {
    console.error(error);

    setFailed(error.message);
  }
}
