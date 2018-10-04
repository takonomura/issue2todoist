const { createProbot } = require('probot');
const verify = require('@octokit/webhooks/verify');

const config = require('./config.json');

function buildProbot() {
  const probot = createProbot({
    id: config.id,
    cert: config.cert,
    secret: config.secret,
  });
  probot.load(app => {
    app.on('issues.opened', async ctx => {
      console.log('New issues received:');
      console.log(ctx.payload.issue.title);
      console.log(ctx.payload.issue.html_url);
    });
  });
  return probot;
}

exports.issue2todoist = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK\n');
    return;
  }

  const name = req.get('x-github-event');
  if (!name) {
    res.status(400).send('Header X-GitHub-Event is missing');
    return;
  }
  const id = req.get('x-github-delivery');
  if (!id) {
    res.status(400).send('Header X-GitHub-Delivery is missing');
    return;
  }
  const sig = req.get('x-hub-signature');
  if (!sig) {
    res.status(400).send('Header X-Hub-Signature is missing');
    return;
  }

  if (!verify(config.secret, req.body, sig)) {
    res.status(400).send('Invalid signature');
    return;
  }

  await buildProbot().receive({ name, id, payload: req.body });

  res.status(200).send('OK\n');
};
