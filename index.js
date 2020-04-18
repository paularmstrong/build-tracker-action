const { default: Comparator } = require('@build-tracker/comparator');
const fs = require('fs');
const path = require('path');
const { GitHub, context } = require('@actions/github');
const { debug, endGroup, getInput, setFailed, startGroup } = require('@actions/core');
const { createBuild, getConfig, uploadBuild } = require('@build-tracker/api-client');

function artifactFilter(row) {
  return row.some(
    (cell) =>
      cell.type === 'delta' &&
      (cell.failingBudgets.length || (cell.hashChanged && Object.values(cell.sizes).every((size) => size === 0)))
  );
}

async function getBooleanConfig(name) {
  const value = getInput(name);
  return /^(1|true|yes)$/.test(value);
}

async function run(octokit, context) {
  const { owner, repo } = context.issue;
  const {
    base: { sha: parentRevision },
    head: { ref: branch },
  } = context.payload.pull_request;

  startGroup('Getting config');
  const configLocation = getInput('BT_CLI_CONFIG');
  if (configLocation) {
    console.log('Will use config from', configLocation);
  }
  const config = await getConfig(configLocation);
  console.log('Got config', config);
  endGroup();

  startGroup('Constructing build');
  const build = await createBuild(config, { branch, parentRevision });
  console.log('build:', build);
  endGroup();

  startGroup('Uploading to Build Tracker');
  const authToken = getInput('BT_API_AUTH_TOKEN');
  const apiResponse = await uploadBuild(config, build, authToken);
  console.log('API response', apiResponse);
  endGroup();

  const commentConfig = getInput('BT_COMMENT');
  if (commentConfig !== false) {
    await maybeAddComment(config, octokit, context, apiResponse, commentConfig);
  }

  if (await getBooleanConfig('BT_FAIL_ON_ERROR')) {
    const summary = comparator.toSummary(false);
    if (summary.some((row) => row.startsWith('Error'))) {
      setFailed(summary);
    }
  }
}

function getCommentInfo(context) {
  return {
    ...context.repo,
    issue_number: context.issue.number,
  };
}

async function maybeAddComment(config, octokit, context, apiResponse, commentConfig) {
  startGroup('Updating comment');
  const comparator = Comparator.deserialize(apiResponse.comparatorData);

  const hasWarnings = comparator.warnings.length > 0 || comparator.unexpectedHashChanges.length > 0;
  const hasErrors = comparator.errors.length > 0;
  if ((commentConfig === 'errors' && !hasErrors) || (commentConfig === 'warnings' && !(hasWarnings || hasErrors))) {
    await maybeDeleteComment(config, octokit, context, apiResponse, commentConfig);
    return;
  }

  const revisions = comparator.builds.map((build) => build.getMetaValue('revision'));
  const collapseTable = await getBooleanConfig('BT_COMMENT_COLLAPSE_TABLE');
  const filterRows = await getBooleanConfig('BT_COMMENT_FILTER_TABLE_ROWS');

  const commentInfo = getCommentInfo(context);
  const comment = {
    ...commentInfo,
    body: `<!-- sentinel:build-tracker-action -->
${apiResponse.summary.join('  \n')}

${collapseTable ? `<details><summary>View table</summary>` : ''}

${comparator.toMarkdown({
  artifactFilter: filterRows ? artifactFilter : () => true,
})}

${collapseTable ? '</details>' : ''}

View on [<img src="https://buildtracker.dev/img/favicon.png" alt="" width="20" height="20" /> Build Tracker](${
      config.applicationUrl
    }/builds/${revisions.join('/')}?${revisions.map((r) => `comparedRevisions=${r}`).join('&')})`,
  };

  const commentId = await getPreviousComment(octokit, context);

  if (commentId) {
    try {
      console.log('Attempting to update comment', commentId);
      await octokit.issues.updateComment({
        ...context.repo,
        comment_id: commentId,
        body: comment.body,
      });
    } catch (e) {
      console.log('Error updating old comment', e.message);
      commentId = undefined;
    }
  }

  if (!commentId) {
    try {
      console.log('No previous comment found. Creating new comment');
      await octokit.issues.createComment(comment);
    } catch (e) {
      console.log('Error creating comment', e.message);
      console.log('Submitting PR review comment');
      try {
        const issue = context.issue || context.payload.pull_request;
        await octokit.pulls.createReview({
          owner: issue.owner,
          repo: issue.repo,
          pull_number: issue.number,
          event: 'COMMENT',
          body: comment.body,
        });
      } catch (e) {
        console.log('Error creating PR review', e.message);
      }
    }
  }
  console.log(comparator.toMarkdown());
  endGroup();
}

async function getPreviousComment(octokit, context) {
  const commentInfo = getCommentInfo(context);
  startGroup('Checking for previous comment');
  let commentId;
  try {
    const comments = (await octokit.issues.listComments(commentInfo)).data;
    for (let i = comments.length; i--; ) {
      const comment = comments[i];
      if (comment.body.includes('sentinel:build-tracker-action')) {
        commentId = comment.id;
        break;
      }
    }
  } catch (e) {
    console.log('Error reading comments', e.message);
  }

  return commentId;
  endGroup();
}

async function maybeDeleteComment(config, octokit, context, apiResponse, commentConfig) {
  const commentInfo = getCommentInfo(context);
  if (!commentInfo) {
    return;
  }

  startGroup('Deleting previous comment');
  await octokit.issues.deleteComment({
    ...context.repo,
    comment_id: commentId,
  });
  endGroup();
}

(async () => {
  try {
    const token = getInput('GITHUB_TOKEN', { required: true });
    const octokit = new GitHub(token);
    await run(octokit, context);
  } catch (e) {
    console.log(e.stack);
    setFailed(e.message);
  }
})();
