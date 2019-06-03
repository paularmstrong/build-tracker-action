const path = require('path');
const { Toolkit } = require('actions-toolkit');

const tools = new Toolkit({
  event: ['pull_request.opened', 'pull_request.edited', 'push']
});

async function main() {
  const config = require(path.join(tools.workspace, tools.arguments.config));
  const { stdout } = await tools.runInWorkspace('bt-cli', ['upload-build', '--config', tools.arguments.config]);
  const { markdown } = JSON.parse(stdout);
  const body = `${markdown}

View this report at ${config.applicationUrl}
`;
  tools.github.pulls.createComment(tools.context.pull({ body: markdown }));
}

main().catch(err => {
  tools.log.fatal(err);
  tools.exit.failure('action failed');
});
